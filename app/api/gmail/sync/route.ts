import {NextResponse} from 'next/server';
import {getAuthenticatedUserId} from '@/lib/firebase/server';
import {listConnectedGoogleUsers, runConnectedGmailScan} from '@/lib/automation/gmail-sync';

function automationSecret() {
  return process.env.LINGT_AUTOMATION_SECRET || process.env.REMINDER_CRON_SECRET || process.env.GMAIL_WEBHOOK_SECRET || '';
}

function isCronAuthorized(request: Request) {
  const expected = automationSecret();
  return Boolean(expected && request.headers.get('x-lingt-automation-secret') === expected);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const userId = await getAuthenticatedUserId(request, typeof body.userId === 'string' ? body.userId : '');
  const cronAuthorized = isCronAuthorized(request);
  const limit = typeof body.limit === 'number' ? body.limit : 10;
  const timezone = typeof body.timezone === 'string' ? body.timezone : undefined;

  if (body.all === true) {
    if (!cronAuthorized) {
      return NextResponse.json({error: 'unauthorized'}, {status: 401});
    }

    const users = await listConnectedGoogleUsers();
    const results = await Promise.allSettled(
      users.map((item) => runConnectedGmailScan(item.userId, {limit, timezone})),
    );

    return NextResponse.json({
      users: users.length,
      results: results.map((item, index) => ({
        userId: users[index]?.userId,
        ok: item.status === 'fulfilled',
        result: item.status === 'fulfilled' ? item.value : undefined,
        error: item.status === 'rejected' ? String(item.reason) : undefined,
      })),
    });
  }

  if (!userId) {
    return NextResponse.json({error: 'Sign in or pass a valid automation secret.'}, {status: 401});
  }

  const result = await runConnectedGmailScan(userId, {
    limit,
    timezone,
    autoCommitCalendar: body.autoCommitCalendar === true,
  });

  return NextResponse.json(result, {
    headers: {'Cache-Control': 'no-store, max-age=0'},
  });
}
