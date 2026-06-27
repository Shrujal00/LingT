import {NextResponse} from 'next/server';
import {getAuthenticatedUserId, hasFirebaseAdminConfig} from '@/lib/firebase/server';
import {getCalendarFreeBusy} from '@/lib/google/user';
import {suggestCalendarBlocksLocally} from '@/lib/orchestration/model';
import {workspaceTaskInputSchema} from '@/lib/orchestration/schemas';

function defaultRange() {
  const start = new Date();
  const end = new Date(start);
  end.setDate(start.getDate() + 2);

  return {start: start.toISOString(), end: end.toISOString()};
}

function overlaps(slotStart: Date, slotEnd: Date, busy: Array<{start: string; end: string}>) {
  return busy.some((block) => {
    const start = new Date(block.start);
    const end = new Date(block.end);
    return slotStart < end && slotEnd > start;
  });
}

function nextAvailableSlots(
  tasks: ReturnType<typeof suggestCalendarBlocksLocally>['proposedBlocks'],
  busy: Array<{start: string; end: string}>,
  timezone: string,
) {
  const slots = [];
  const cursor = new Date();
  cursor.setMinutes(cursor.getMinutes() + 30, 0, 0);

  for (const task of tasks) {
    let attempts = 0;
    let start = new Date(cursor);
    let end = new Date(start);
    end.setMinutes(start.getMinutes() + 45);

    while (attempts < 32 && overlaps(start, end, busy)) {
      start = new Date(start.getTime() + 30 * 60 * 1000);
      end = new Date(end.getTime() + 30 * 60 * 1000);
      attempts += 1;
    }

    slots.push({
      ...task,
      start: start.toISOString(),
      end: end.toISOString(),
      requiresApproval: true,
    });
    cursor.setTime(end.getTime() + 15 * 60 * 1000);
  }

  return slots.map((slot) => ({...slot, reason: `${slot.reason} Free/busy checked for ${timezone}.`}));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tasks = Array.isArray(body?.tasks)
    ? body.tasks
        .flatMap((task: unknown) => {
          const result = workspaceTaskInputSchema.safeParse(task);
          return result.success ? [result.data] : [];
        })
    : [];

  const timezone = typeof body?.timezone === 'string' ? body.timezone : 'UTC';
  const fallback = suggestCalendarBlocksLocally(tasks);
  const requestedUserId = typeof body?.userId === 'string' ? body.userId : '';
  const userId = await getAuthenticatedUserId(request, requestedUserId);

  if (!userId || !hasFirebaseAdminConfig()) {
    return NextResponse.json(
      {
        ...fallback,
        runtime: {source: 'local-fallback', calendar: 'not-connected'},
      },
      {headers: {'Cache-Control': 'no-store, max-age=0'}},
    );
  }

  try {
    const range = {
      start: typeof body?.dateRange?.start === 'string' ? body.dateRange.start : defaultRange().start,
      end: typeof body?.dateRange?.end === 'string' ? body.dateRange.end : defaultRange().end,
      timezone,
    };
    const freeBusy = await getCalendarFreeBusy(userId, range);
    const busy = freeBusy.calendars?.primary?.busy ?? [];

    return NextResponse.json(
      {
        ...fallback,
        proposedBlocks: nextAvailableSlots(fallback.proposedBlocks, busy, timezone),
        conflicts: [
          ...fallback.conflicts,
          ...busy.map((block) => `Busy: ${block.start} to ${block.end}`),
        ],
        runtime: {source: 'google-calendar', calendar: 'freebusy'},
      },
      {headers: {'Cache-Control': 'no-store, max-age=0'}},
    );
  } catch (error) {
    return NextResponse.json(
      {
        ...fallback,
        conflicts: [
          ...fallback.conflicts,
          error instanceof Error ? error.message : 'Calendar free/busy unavailable.',
        ],
        runtime: {source: 'local-fallback', calendar: 'unavailable'},
      },
      {headers: {'Cache-Control': 'no-store, max-age=0'}},
    );
  }
}
