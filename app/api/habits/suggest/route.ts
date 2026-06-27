import {NextResponse} from 'next/server';
import {suggestHabitLocally, suggestHabitWithGemini} from '@/lib/orchestration/model';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    return NextResponse.json({error: 'prompt is required'}, {status: 400});
  }

  const geminiResult = await suggestHabitWithGemini(prompt);

  return NextResponse.json(
    {
      ...(geminiResult ?? suggestHabitLocally(prompt)),
      runtime: {source: geminiResult ? 'gemini' : 'local-fallback'},
    },
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
