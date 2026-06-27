import {NextResponse} from 'next/server';
import {runGmailAutomation, type GmailWebhookPayload} from '@/lib/automation/email-agent';

function isAuthorized(request: Request) {
  const expected = process.env.GMAIL_WEBHOOK_SECRET;
  if (!expected) return false;

  return request.headers.get('x-lingt-webhook-secret') === expected;
}

function parsePayload(body: unknown): GmailWebhookPayload | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Partial<GmailWebhookPayload>;

  if (
    typeof value.userId !== 'string' ||
    typeof value.subject !== 'string' ||
    typeof value.from !== 'string' ||
    typeof value.body !== 'string'
  ) {
    return null;
  }

  return {
    userId: value.userId.trim(),
    messageId: typeof value.messageId === 'string' ? value.messageId : undefined,
    threadId: typeof value.threadId === 'string' ? value.threadId : undefined,
    subject: value.subject,
    from: value.from,
    receivedAt: typeof value.receivedAt === 'string' ? value.receivedAt : undefined,
    snippet: typeof value.snippet === 'string' ? value.snippet : undefined,
    body: value.body,
    timezone: typeof value.timezone === 'string' ? value.timezone : undefined,
    autoCommitCalendar: value.autoCommitCalendar === true,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({error: 'unauthorized'}, {status: 401});
  }

  const body = await request.json().catch(() => null);
  const payload = parsePayload(body);

  if (!payload) {
    return NextResponse.json(
      {error: 'userId, subject, from, and body are required'},
      {status: 400},
    );
  }

  const result = await runGmailAutomation(payload);

  return NextResponse.json(result, {
    headers: {'Cache-Control': 'no-store, max-age=0'},
  });
}
