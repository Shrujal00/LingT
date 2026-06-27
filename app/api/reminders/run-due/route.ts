import {NextResponse} from 'next/server';
import {
  addServerDocument,
  getServerFirestore,
  hasFirebaseAdminConfig,
  sendNotificationToUser,
} from '@/lib/firebase/server';
import {escalateReminderLocally, escalateReminderWithGemini} from '@/lib/orchestration/model';
import type {WorkspaceTaskInput} from '@/lib/orchestration/schemas';

function isAuthorized(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('x-lingt-cron-secret') === secret;
}

function shouldEscalate(task: WorkspaceTaskInput) {
  const due = task.due.toLowerCase();
  return (
    task.status !== 'done' &&
    (task.priority === 'do_now' ||
      task.priority === 'at_risk' ||
      due.includes('today') ||
      due.includes('soon') ||
      due.includes('tomorrow'))
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({error: 'unauthorized'}, {status: 401});
  }

  if (!hasFirebaseAdminConfig()) {
    return NextResponse.json(
      {processed: 0, error: 'Firebase Admin credentials are required.'},
      {headers: {'Cache-Control': 'no-store, max-age=0'}},
    );
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  let query = getServerFirestore().collection('tasks').where('status', 'in', ['open', 'scheduled']);
  if (userId) query = query.where('userId', '==', userId);

  const snapshot = await query.limit(50).get();
  const tasks = snapshot.docs
    .map((doc) => doc.data() as WorkspaceTaskInput & {userId?: string})
    .filter((task) => task.userId && shouldEscalate(task));
  let processed = 0;
  let sent = 0;

  for (const task of tasks) {
    const reminder = (await escalateReminderWithGemini(task)) ?? escalateReminderLocally(task);
    await addServerDocument('reminders', {
      userId: task.userId,
      taskId: task.id,
      escalationLevel: reminder.level,
      message: reminder.message,
      requiredAction: reminder.requiredAction,
      options: reminder.options,
      status: 'sent',
      source: 'ling-reminder-daemon',
    });

    const result = await sendNotificationToUser(task.userId!, {
      title: 'LingT reminder',
      body: reminder.message,
    });
    sent += result.sent;
    processed += 1;
  }

  return NextResponse.json(
    {processed, notificationsSent: sent},
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
