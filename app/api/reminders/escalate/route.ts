import {NextResponse} from 'next/server';
import {escalateReminderLocally, escalateReminderWithGemini} from '@/lib/orchestration/model';
import {workspaceTaskInputSchema} from '@/lib/orchestration/schemas';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedTask = workspaceTaskInputSchema.safeParse(body?.task);

  if (!parsedTask.success) {
    return NextResponse.json({error: 'task is required'}, {status: 400});
  }

  const geminiResult = await escalateReminderWithGemini(parsedTask.data);

  return NextResponse.json(
    {
      ...(geminiResult ?? escalateReminderLocally(parsedTask.data)),
      runtime: {source: geminiResult ? 'gemini' : 'local-fallback'},
    },
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
