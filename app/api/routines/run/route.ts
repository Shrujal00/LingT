import {NextResponse} from 'next/server';
import {runRoutineLocally, runRoutineWithGemini} from '@/lib/orchestration/model';
import {routineRunSchema, workspaceTaskInputSchema, type RoutineRun} from '@/lib/orchestration/schemas';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const routineType = typeof body?.routineType === 'string' ? body.routineType : 'morning_briefing';
  const parsedRoutineType = routineRunSchema.shape.routineType.safeParse(routineType);
  const tasks = Array.isArray(body?.tasks)
    ? body.tasks
        .flatMap((task: unknown) => {
          const result = workspaceTaskInputSchema.safeParse(task);
          return result.success ? [result.data] : [];
        })
    : [];
  const type = (parsedRoutineType.success ? parsedRoutineType.data : 'morning_briefing') as RoutineRun['routineType'];
  const geminiResult = await runRoutineWithGemini(type, tasks);

  return NextResponse.json(
    {
      ...(geminiResult ?? runRoutineLocally(type, tasks)),
      runtime: {source: geminiResult ? 'gemini' : 'local-fallback'},
    },
    {headers: {'Cache-Control': 'no-store, max-age=0'}},
  );
}
