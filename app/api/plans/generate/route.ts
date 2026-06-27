import {NextResponse} from 'next/server';
import {generatePlanLocally, generatePlanWithGemini} from '@/lib/orchestration/model';
import {workspaceTaskInputSchema} from '@/lib/orchestration/schemas';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tasks = Array.isArray(body?.tasks)
    ? body.tasks
        .flatMap((task: unknown) => {
          const result = workspaceTaskInputSchema.safeParse(task);
          return result.success ? [result.data] : [];
        })
    : [];
  const timezone = typeof body?.timezone === 'string' ? body.timezone : undefined;
  const geminiResult = await generatePlanWithGemini(tasks, timezone);

  return NextResponse.json(
    {
      ...(geminiResult ?? generatePlanLocally(tasks)),
      runtime: {source: geminiResult ? 'gemini' : 'local-fallback'},
    },
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
