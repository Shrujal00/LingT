import {NextResponse} from 'next/server';
import {generateDraftLocally, generateDraftWithGemini} from '@/lib/orchestration/model';
import {memorySourceSchema} from '@/lib/orchestration/schemas';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const draftType = typeof body?.type === 'string' ? body.type : 'follow_up_email';
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  const sources = Array.isArray(body?.sources)
    ? body.sources
        .flatMap((source: unknown) => {
          const result = memorySourceSchema.safeParse(source);
          return result.success ? [result.data] : [];
        })
    : [];

  if (!prompt && sources.length === 0) {
    return NextResponse.json({error: 'prompt or sources are required'}, {status: 400});
  }

  const geminiResult = await generateDraftWithGemini(draftType, prompt, sources);

  return NextResponse.json(
    {
      ...(geminiResult ?? generateDraftLocally(draftType, prompt, sources)),
      runtime: {source: geminiResult ? 'gemini' : 'local-fallback'},
    },
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
