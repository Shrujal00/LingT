import {NextResponse} from 'next/server';
import {commitCalendarAction} from '@/lib/automation/email-agent';
import {getAuthenticatedUserId} from '@/lib/firebase/server';
import {calendarActionSchema} from '@/lib/orchestration/schemas';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const userId = await getAuthenticatedUserId(request, requestedUserId);
  const parsedAction = calendarActionSchema.safeParse(body?.action);

  if (!userId || !parsedAction.success) {
    return NextResponse.json(
      {error: 'userId and a valid calendar action are required'},
      {status: 400},
    );
  }

  const event = await commitCalendarAction(userId, parsedAction.data);

  return NextResponse.json(event, {
    headers: {'Cache-Control': 'no-store, max-age=0'},
  });
}
