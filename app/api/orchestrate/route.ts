import {NextResponse} from 'next/server';
import {runLingTOrchestration} from '@/lib/orchestration/graph';
import {getServerFirestore, hasFirebaseAdminConfig} from '@/lib/firebase/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return NextResponse.json({error: 'message is required'}, {status: 400});
  }

  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : '';
  const userName = typeof body?.userName === 'string' ? body.userName : '';

  let history: Array<{role: 'user' | 'ling'; text: string}> = [];
  if (Array.isArray(body?.history)) {
    history = body.history;
  }

  let workspaceContext = '';

  if (userId && hasFirebaseAdminConfig()) {
    try {
      const db = getServerFirestore();
      
      // 1. Fetch recent chat history from Firestore if not passed by client
      if (history.length === 0 && conversationId) {
        const messagesSnapshot = await db
          .collection('messages')
          .where('userId', '==', userId)
          .where('conversationId', '==', conversationId)
          .orderBy('createdAt', 'asc')
          .limit(10)
          .get();

        history = messagesSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            role: data.role === 'assistant' ? 'ling' : 'user',
            text: data.content || '',
          };
        });
      }

      // 2. Fetch live workspace context in parallel
      const [tasksSnap, loopsSnap, habitsSnap, routinesSnap] = await Promise.all([
        db.collection('tasks').where('userId', '==', userId).limit(15).get(),
        db.collection('openLoops').where('userId', '==', userId).limit(15).get(),
        db.collection('habits').where('userId', '==', userId).limit(15).get(),
        db.collection('routines').where('userId', '==', userId).limit(15).get(),
      ]);

      const tasksList = tasksSnap.docs.map(doc => doc.data());
      const loopsList = loopsSnap.docs.map(doc => doc.data());
      const habitsList = habitsSnap.docs.map(doc => doc.data());
      const routinesList = routinesSnap.docs.map(doc => doc.data());

      workspaceContext = [
        `User Profile Name: ${userName || 'Shrujal'}`,
        'User Workspace Live Context:',
        '- Tasks List: ' + JSON.stringify(tasksList.map(t => ({ title: t.title, priority: t.priority, status: t.status, due: t.due }))),
        '- Open Loops: ' + JSON.stringify(loopsList.map(l => ({ title: l.title, reason: l.reason, status: l.status }))),
        '- Habits: ' + JSON.stringify(habitsList.map(h => ({ title: h.title, streak: h.streak, status: h.status }))),
        '- Routines: ' + JSON.stringify(routinesList.map(r => ({ name: r.name, enabled: r.enabled }))),
      ].join('\n');
    } catch (e) {
      console.error('Failed to load workspace context from Firestore', e);
    }
  }

  const result = await runLingTOrchestration({
    message,
    history,
    workspaceContext,
    timezone: typeof body?.timezone === 'string' ? body.timezone : undefined,
  });

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
