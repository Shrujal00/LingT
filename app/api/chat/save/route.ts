import {NextResponse} from 'next/server';
import {addServerDocument, hasFirebaseAdminConfig, setServerDocument, verifyBearerToken} from '@/lib/firebase/server';
import type {OrchestrationResult} from '@/lib/orchestration/schemas';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const decoded = await verifyBearerToken(request);
  const userId = decoded?.uid || '';
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
  const userMessage = typeof body?.userMessage === 'string' ? body.userMessage.trim() : '';
  const assistantMessage = typeof body?.assistantMessage === 'string' ? body.assistantMessage.trim() : '';
  const structuredOutput = body?.structuredOutput as OrchestrationResult | undefined;

  if (!userId) {
    return NextResponse.json({saved: false, error: 'Authentication is required'}, {status: 401});
  }

  if (!userId || !conversationId || !userMessage || !assistantMessage) {
    return NextResponse.json(
      {saved: false, error: 'conversationId, userMessage, and assistantMessage are required'},
      {status: 400},
    );
  }

  if (!hasFirebaseAdminConfig()) {
    return NextResponse.json(
      {saved: false, error: 'Firebase Admin credentials are required to save chat history.'},
      {status: 200, headers: {'Cache-Control': 'no-store, max-age=0'}},
    );
  }

  await setServerDocument('conversations', conversationId, {
    id: conversationId,
    userId,
    title: userMessage.slice(0, 72) || 'LingT chat',
    source: 'ling-chat',
    createdAt: new Date().toISOString(),
  });

  await Promise.all([
    addServerDocument('messages', {
      userId,
      conversationId,
      role: 'user',
      content: userMessage,
      source: 'ling-chat',
    }),
    addServerDocument('messages', {
      userId,
      conversationId,
      role: 'assistant',
      content: assistantMessage,
      structuredOutput: structuredOutput || null,
      source: 'ling-chat',
    }),
  ]);

  return NextResponse.json(
    {saved: true},
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
