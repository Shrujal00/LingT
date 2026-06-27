import {NextResponse} from 'next/server';
import {runMeetingCapture} from '@/lib/orchestration/graph';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';

  if (!transcript) {
    return NextResponse.json({error: 'transcript is required'}, {status: 400});
  }

  const result = await runMeetingCapture({
    transcript,
    timezone: typeof body?.timezone === 'string' ? body.timezone : undefined,
  });

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
