import {NextResponse} from 'next/server';
import {listUpcomingCalendarEvents} from '@/lib/google/user';
import {verifyBearerToken} from '@/lib/firebase/server';

export async function POST(request: Request) {
  const decoded = await verifyBearerToken(request);
  const userId = decoded?.uid || '';

  if (!userId) {
    return NextResponse.json({error: 'Authentication is required'}, {status: 401});
  }

  try {
    const events = await listUpcomingCalendarEvents(userId, 10);
    const formattedBlocks = (events.items || []).map((event) => {
      const startStr = event.start?.dateTime || event.start?.date || '';
      const endStr = event.end?.dateTime || event.end?.date || '';
      
      let timeText = 'All Day';
      if (startStr.includes('T')) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        timeText = `${formatTime(start)} - ${formatTime(end)}`;
      }

      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        time: timeText,
        status: 'scheduled',
      };
    });

    return NextResponse.json(formattedBlocks, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Failed to list calendar events', error);
    return NextResponse.json({error: 'Unable to query calendar events.'}, {status: 500});
  }
}
