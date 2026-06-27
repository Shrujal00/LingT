import {NextResponse} from 'next/server';
import {addServerDocument, getAuthenticatedUserId, hasFirebaseAdminConfig} from '@/lib/firebase/server';
import {listUpcomingCalendarEvents} from '@/lib/google/user';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const requestedUserId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const userId = await getAuthenticatedUserId(request, requestedUserId);

  if (!userId) {
    return NextResponse.json({error: 'userId is required'}, {status: 400});
  }

  if (!hasFirebaseAdminConfig()) {
    return NextResponse.json(
      {created: [], error: 'Firebase Admin credentials are required.'},
      {headers: {'Cache-Control': 'no-store, max-age=0'}},
    );
  }

  const events = await listUpcomingCalendarEvents(userId, 5);
  const created = [];

  for (const event of events.items ?? []) {
    const id = await addServerDocument('meetings', {
      userId,
      calendarEventId: event.id,
      title: event.summary || 'Untitled meeting',
      startedAt: event.start?.dateTime || event.start?.date || null,
      endedAt: event.end?.dateTime || event.end?.date || null,
      notes: '',
      transcript: '',
      decisions: [],
      actionItems: [],
      summary: event.description || '',
      source: 'google-calendar',
    });
    created.push({id, title: event.summary || 'Untitled meeting'});
  }

  return NextResponse.json(
    {created},
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
