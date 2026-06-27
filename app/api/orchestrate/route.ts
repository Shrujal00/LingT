import {NextResponse} from 'next/server';
import {runLingTOrchestration} from '@/lib/orchestration/graph';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return NextResponse.json({error: 'message is required'}, {status: 400});
  }

  const result = await runLingTOrchestration({
    message,
    timezone: typeof body?.timezone === 'string' ? body.timezone : undefined,
  });

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

