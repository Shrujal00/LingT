'use client';

import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PenLine,
  Repeat,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import type {User} from 'firebase/auth';
import type {
  CalendarSuggestion,
  CalendarAction,
  DraftGeneration,
  HabitSuggestion,
  OrchestrationResult,
  ProductivityPlan,
  ReminderEscalation,
  RoutineRun,
  WorkspaceTaskInput,
} from '@/lib/orchestration/schemas';
import type {Habit, OpenLoop, Task} from '@/lib/lingt-data';
import {firebaseApp, getFirebaseVapidKey} from '@/lib/firebase/client';
import {
  saveDraftRecord,
  saveGeneratedPlan,
  saveGeneratedPlanRecord,
  saveHabitSuggestion,
  saveReminderRun,
  saveRoutineRun,
} from '@/lib/firebase/workspace';

type Source = 'ready' | 'gemini' | 'local-fallback';

interface ProductivitySuiteProps {
  user: User | null;
  tasks: Task[];
  openLoops: OpenLoop[];
  habits: Habit[];
}

function toWorkspaceTask(task: Task): WorkspaceTaskInput {
  return {
    id: task.id,
    title: task.title,
    reason: task.reason,
    due: task.due,
    priority: task.priority,
    status: task.status,
  };
}

function runtimeSource(value: unknown): Source {
  const source = (value as {runtime?: {source?: Source}} | null)?.runtime?.source;
  return source === 'gemini' || source === 'local-fallback' ? source : 'ready';
}

export default function ProductivitySuite({user, tasks, openLoops, habits}: ProductivitySuiteProps) {
  const [quickCapture, setQuickCapture] = useState('');
  const [plan, setPlan] = useState<(ProductivityPlan & {runtime?: {source: Source}}) | null>(null);
  const [calendar, setCalendar] = useState<(CalendarSuggestion & {runtime?: {source: Source}}) | null>(null);
  const [reminder, setReminder] = useState<(ReminderEscalation & {runtime?: {source: Source}; taskId?: string}) | null>(null);
  const [habitPrompt, setHabitPrompt] = useState('');
  const [habit, setHabit] = useState<(HabitSuggestion & {runtime?: {source: Source}}) | null>(null);
  const [routineType, setRoutineType] = useState<RoutineRun['routineType']>('morning_briefing');
  const [routine, setRoutine] = useState<(RoutineRun & {runtime?: {source: Source}}) | null>(null);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draft, setDraft] = useState<(DraftGeneration & {runtime?: {source: Source}}) | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const workspaceTasks = useMemo(() => tasks.map(toWorkspaceTask), [tasks]);
  const topTask = workspaceTasks[0];

  async function authHeaders() {
    const token = await user?.getIdToken().catch(() => '');
    return {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    };
  }

  async function callApi<T>(id: string, url: string, body: Record<string, unknown>) {
    setError('');
    setSaved('');
    setBusy(id);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Ling could not complete this workflow yet.');
      }

      return (await response.json()) as T;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try again in a moment.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function runQuickCapture() {
    if (!quickCapture.trim()) return;

    const result = await callApi<OrchestrationResult>('quick', '/api/orchestrate', {
      message: quickCapture,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    if (result && user) {
      await saveGeneratedPlan(user.uid, result);
      setQuickCapture('');
      setSaved('Quick capture saved to workspace.');
    }
  }

  async function generatePlan() {
    const result = await callApi<ProductivityPlan & {runtime?: {source: Source}}>('plan', '/api/plans/generate', {
      tasks: workspaceTasks,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (result) setPlan(result);
  }

  async function savePlan() {
    if (!user || !plan) return;
    await saveGeneratedPlanRecord(user.uid, plan);
    setSaved('Plan saved as a draft.');
  }

  async function suggestCalendar() {
    const result = await callApi<CalendarSuggestion & {runtime?: {source: Source}}>('calendar', '/api/calendar/suggest', {
      userId: user?.uid,
      tasks: workspaceTasks,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (result) setCalendar(result);
  }

  async function commitCalendarBlock(block: CalendarSuggestion['proposedBlocks'][number]) {
    if (!user) return;
    const action: CalendarAction = {
      title: block.title,
      description: block.taskTitle,
      start: block.start,
      end: block.end,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      attendees: [],
      reason: block.reason,
      confidence: block.start.includes('T') && block.end.includes('T') ? 'high' : 'low',
      requiresApproval: false,
    };

    if (action.confidence !== 'high') {
      setError('Connect Google Calendar to get exact time blocks before committing.');
      return;
    }

    const response = await fetch('/api/calendar/commit', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({userId: user.uid, action}),
    });

    if (!response.ok) {
      setError('Calendar event could not be created.');
      return;
    }

    setSaved('Calendar event created.');
  }

  async function escalateReminder() {
    if (!topTask) {
      setError('Save a task before running reminder escalation.');
      return;
    }

    const result = await callApi<ReminderEscalation & {runtime?: {source: Source}}>('reminder', '/api/reminders/escalate', {
      task: topTask,
    });
    if (result) setReminder({...result, taskId: topTask.id});
  }

  async function saveReminder() {
    if (!user || !reminder?.taskId) return;
    await saveReminderRun(user.uid, reminder.taskId, reminder);
    setSaved('Reminder escalation saved.');
  }

  async function enableNotifications() {
    if (!user) return;
    if (!('Notification' in window)) {
      setError('This browser does not support notifications.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setError('Notification permission was not granted.');
      return;
    }

    let token = `permission:${user.uid}`;
    const vapidKey = getFirebaseVapidKey();

    if (vapidKey && 'serviceWorker' in navigator) {
      try {
        const [{getMessaging, getToken}, registration] = await Promise.all([
          import('firebase/messaging'),
          navigator.serviceWorker.register('/firebase-messaging-sw.js'),
        ]);
        token = await getToken(getMessaging(firebaseApp), {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
      } catch {
        token = `permission:${user.uid}`;
      }
    }

    const response = await fetch('/api/notifications/register', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        userId: user.uid,
        token,
        platform: 'web',
        permissionOnly: token.startsWith('permission:'),
      }),
    });
    const result = (await response.json()) as {registered?: boolean; error?: string};

    if (result.registered) {
      setSaved('Notification permission registered.');
    } else {
      setError(result.error || 'Notification permission saved locally, but token storage is not configured.');
    }
  }

  async function suggestHabit() {
    const prompt = habitPrompt.trim();
    if (!prompt) return;

    const result = await callApi<HabitSuggestion & {runtime?: {source: Source}}>('habit', '/api/habits/suggest', {
      prompt,
    });
    if (result) setHabit(result);
  }

  async function saveHabit() {
    if (!user || !habit) return;
    await saveHabitSuggestion(user.uid, habit);
    setHabitPrompt('');
    setSaved('Habit saved.');
  }

  async function runRoutine() {
    const result = await callApi<RoutineRun & {runtime?: {source: Source}}>('routine', '/api/routines/run', {
      routineType,
      tasks: workspaceTasks,
    });
    if (result) setRoutine(result);
  }

  async function saveRoutine() {
    if (!user || !routine) return;
    await saveRoutineRun(user.uid, routine);
    setSaved('Routine saved.');
  }

  async function generateDraft() {
    const prompt = draftPrompt.trim();
    if (!prompt && tasks.length === 0) return;

    const result = await callApi<DraftGeneration & {runtime?: {source: Source}}>('draft', '/api/drafts/generate', {
      type: 'follow_up_email',
      prompt,
      sources: tasks.slice(0, 3).map((task) => ({
        id: task.id,
        type: 'task',
        title: task.title,
        snippet: `${task.reason} Due: ${task.due}.`,
        source: 'Task',
      })),
    });
    if (result) setDraft(result);
  }

  async function saveDraft() {
    if (!user || !draft) return;
    await saveDraftRecord(user.uid, draft);
    setSaved('Draft saved.');
  }

  const openLoopTotal = openLoops.filter((loop) => loop.status === 'open').length;
  const urgentTask = tasks.find((task) => task.priority === 'do_now' || task.priority === 'at_risk') ?? tasks[0];
  const cockpitStats = [
    {
      label: 'Tasks captured',
      value: tasks.length,
      detail: tasks.length ? 'Ready for planning' : 'Start from chat',
    },
    {
      label: 'Open loops',
      value: openLoopTotal,
      detail: openLoopTotal ? 'Needs closure' : 'None waiting',
    },
    {
      label: 'Urgent item',
      value: urgentTask ? urgentTask.priority.replace('_', ' ') : 'None',
      detail: urgentTask?.title ?? 'No saved task yet',
    },
    {
      label: 'Google status',
      value: user ? 'Signed in' : 'Guest',
      detail: user ? 'Workspace sync on' : 'Sign in to save',
    },
  ];

  return (
    <div className="rounded-xl border border-brand/20 bg-surface p-5 shadow-sm animate-lingt-scale-in">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand" />
            <h2 className="text-xl font-semibold">Productivity Cockpit</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Manage your daily flow and saved tasks: generate a rescue plan, escalate reminders, or suggest calendar schedules.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {cockpitStats.map((stat, i) => {
          const delays = [
            'animation-delay-75',
            'animation-delay-150',
            'animation-delay-225',
            'animation-delay-300',
          ];
          return (
            <div 
              key={stat.label} 
              className={`rounded-lg border border-border bg-background p-3 transition-all duration-300 hover:border-brand/20 hover:-translate-y-0.5 hover:shadow-sm animate-lingt-rise ${delays[i] || 'animation-delay-75'}`}
            >
              <div className="text-xs text-muted-foreground">{stat.label}</div>
              <div className="mt-1 truncate text-lg font-semibold">{stat.value}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{stat.detail}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background p-3 transition-all duration-300 focus-within:border-brand/40 focus-within:shadow-[0_0_15px_rgba(26,115,232,0.08)]">
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={quickCapture}
            onChange={(event) => setQuickCapture(event.target.value)}
            placeholder="Quick capture a task, open loop, draft request, or habit..."
            className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={!user || !quickCapture.trim() || busy === 'quick'}
            onClick={runQuickCapture}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-all duration-300 hover:bg-brand-deep hover:scale-[1.03] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100"
          >
            {busy === 'quick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Save capture
          </button>
        </div>
      </div>

      {(error || saved || !user) && (
        <div className="mt-3 text-sm">
          {!user && <span className="text-muted-foreground">Sign in to save generated items.</span>}
          {error && <span className="text-danger">{error}</span>}
          {saved && <span className="text-success">{saved}</span>}
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-brand" />
              Daily plan
            </div>
            <button type="button" onClick={generatePlan} className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-deep">
              {busy === 'plan' ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {plan ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="leading-6 text-muted-foreground">{plan.summary}</p>
              {plan.blocks.map((block) => (
                <div key={`${block.title}-${block.time}`} className="rounded-md border border-border bg-surface p-2">
                  <div className="font-medium">{block.time}: {block.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{block.reason}</div>
                </div>
              ))}
              <button type="button" disabled={!user} onClick={savePlan} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium">
                Save plan
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Save chat tasks, then generate the rescue plan.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4 text-danger" />
              Reminder escalation
            </div>
            <button type="button" onClick={escalateReminder} className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-deep">
              {busy === 'reminder' ? 'Choosing...' : 'Escalate'}
            </button>
          </div>
          {reminder ? (
            <div className="mt-3 text-sm">
              <div className="rounded-md border border-border bg-surface p-2">
                <div className="font-medium">{reminder.level.replace(/_/g, ' ')}</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{reminder.message}</p>
              </div>
              <button type="button" disabled={!user} onClick={saveReminder} className="mt-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium">
                Save reminder
              </button>
              <button type="button" disabled={!user} onClick={enableNotifications} className="ml-2 mt-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium">
                Enable notifications
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Escalate the most urgent saved task into required responses.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-[#34a853]" />
              Calendar proposal
            </div>
            <button type="button" onClick={suggestCalendar} className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-deep">
              {busy === 'calendar' ? 'Suggesting...' : 'Suggest'}
            </button>
          </div>
          {calendar ? (
            <div className="mt-3 space-y-2 text-sm">
              {calendar.proposedBlocks.length === 0 && <p className="text-muted-foreground">No blocks to suggest yet.</p>}
              {calendar.proposedBlocks.map((block) => (
                <div key={`${block.title}-${block.start}`} className="rounded-md border border-border bg-surface p-2">
                  <div className="font-medium">{block.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{block.start} to {block.end}. {block.reason}</div>
                  <div className="mt-2 text-xs text-brand">Approval required before external Calendar write.</div>
                  <button
                    type="button"
                    disabled={!user}
                    onClick={() => commitCalendarBlock(block)}
                    className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium"
                  >
                    Approve event
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Suggest protected time blocks before any Calendar write.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-[#34a853]" />
            Habit builder
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={habitPrompt}
              onChange={(event) => setHabitPrompt(event.target.value)}
              placeholder="Goal or habit to track..."
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
            <button type="button" onClick={suggestHabit} className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-deep">
              {busy === 'habit' ? '...' : 'Suggest'}
            </button>
          </div>
          {habit && (
            <div className="mt-3 rounded-md border border-border bg-surface p-2 text-sm">
              <div className="font-medium">{habit.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{habit.cadence}: {habit.target}</div>
              <button type="button" disabled={!user} onClick={saveHabit} className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium">
                Save habit
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Repeat className="h-4 w-4 text-[#64748b]" />
              Proactive routine
            </div>
            <button type="button" onClick={runRoutine} className="rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-deep">
              {busy === 'routine' ? 'Running...' : 'Run'}
            </button>
          </div>
          <select
            value={routineType}
            onChange={(event) => setRoutineType(event.target.value as RoutineRun['routineType'])}
            className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none"
          >
            <option value="morning_briefing">Morning briefing</option>
            <option value="before_meeting_prep">Before-meeting prep</option>
            <option value="deadline_risk_scan">Deadline risk scan</option>
            <option value="end_of_day_recovery">End-of-day recovery</option>
            <option value="weekly_review">Weekly review</option>
          </select>
          {routine && (
            <div className="mt-3 rounded-md border border-border bg-surface p-2 text-sm">
              <p className="leading-6 text-muted-foreground">{routine.message}</p>
              <button type="button" disabled={!user} onClick={saveRoutine} className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium">
                Save routine
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PenLine className="h-4 w-4 text-[#fbbc04]" />
            Drafting studio
          </div>
          <textarea
            value={draftPrompt}
            onChange={(event) => setDraftPrompt(event.target.value)}
            placeholder="Draft a follow-up, extension request, recap, or study plan..."
            className="mt-3 min-h-24 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none"
          />
          <button type="button" onClick={generateDraft} className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-deep">
            {busy === 'draft' ? 'Drafting...' : 'Generate draft'}
          </button>
          {draft && (
            <div className="mt-3 rounded-md border border-border bg-surface p-2 text-sm">
              <div className="font-medium capitalize">{draft.title}</div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-muted-foreground">{draft.content}</pre>
              <button type="button" disabled={!user} onClick={saveDraft} className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium">
                Save draft
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
