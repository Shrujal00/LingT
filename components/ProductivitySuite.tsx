'use client';

import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Loader2,
  Mic,
  PenLine,
  Repeat,
  Search,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import {useState, useMemo, useEffect, useRef, useCallback} from 'react';
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
  MeetingCaptureResult,
  MemorySearchResult,
} from '@/lib/orchestration/schemas';
import type {
  Habit,
  OpenLoop,
  Task,
  Routine,
  MeetingActionItem,
  OpenLoopStatus,
  TaskStatus,
} from '@/lib/lingt-data';
import {statusLabel} from '@/lib/lingt-data';
import {firebaseApp, getFirebaseVapidKey} from '@/lib/firebase/client';
import {
  saveDraftRecord,
  saveGeneratedPlan,
  saveGeneratedPlanRecord,
  saveHabitSuggestion,
  saveReminderRun,
  saveRoutineRun,
  saveApprovedMeetingAction,
} from '@/lib/firebase/workspace';

type Source = 'ready' | 'gemini' | 'local-fallback';

interface ProductivitySuiteProps {
  user: User | null;
  tasks: Task[];
  openLoops: OpenLoop[];
  habits: Habit[];
  routines: Routine[];
  meetingActionItems: MeetingActionItem[];
  setOpenLoopStatus: (id: string, status: OpenLoopStatus) => Promise<void>;
  toggleRoutine: (id: string) => Promise<void>;
  approveAction: (id: string) => Promise<void>;
  checkInHabit: (id: string, done: boolean) => Promise<void>;
  setTaskStatus: (id: string, status: TaskStatus) => Promise<void>;
  loading: boolean;
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

function formatBlockTime(startStr: string, endStr: string): string {
  try {
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return `${startStr} to ${endStr}`;
    }

    const dateOptions: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    };

    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };

    const dateFormatted = startDate.toLocaleDateString('en-US', dateOptions);
    const startTimeFormatted = startDate.toLocaleTimeString('en-US', timeOptions);
    const endTimeFormatted = endDate.toLocaleTimeString('en-US', timeOptions);

    return `${dateFormatted} · ${startTimeFormatted} - ${endTimeFormatted}`;
  } catch {
    return `${startStr} to ${endStr}`;
  }
}

function checkTaskOverdue(dueStr: string, status: string): boolean {
  if (status === 'done' || status === 'snoozed') return false;
  try {
    const dueDate = new Date(dueStr);
    if (isNaN(dueDate.getTime())) {
      const parts = dueStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const endOfDay = new Date(year, month, day, 23, 59, 59);
        return new Date() > endOfDay;
      }
      return false;
    }
    return new Date() > dueDate;
  } catch {
    return false;
  }
}

export default function ProductivitySuite({
  user,
  tasks,
  openLoops,
  habits,
  routines,
  meetingActionItems,
  setOpenLoopStatus,
  toggleRoutine,
  approveAction,
  checkInHabit,
  setTaskStatus,
  loading,
}: ProductivitySuiteProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'studio' | 'habits'>('tasks');

  // Cockpit & Capture States
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

  // Meeting Capture States
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingResult, setMeetingResult] = useState<MeetingCaptureResult | null>(null);
  const [isExtractingMeeting, setIsExtractingMeeting] = useState(false);
  const [meetingError, setMeetingError] = useState('');
  const [meetingImportStatus, setMeetingImportStatus] = useState('');
  const [savingMeetingAction, setSavingMeetingAction] = useState('');
  const [savedMeetingActions, setSavedMeetingActions] = useState<string[]>([]);

  // Life Memory States
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResult, setMemoryResult] = useState<(MemorySearchResult & {runtime?: {source: 'gemini' | 'local-fallback'; sourceCount: number}}) | null>(null);
  const [isSearchingMemory, setIsSearchingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState('');

  // Google Integration Status State
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);

  // Dynamic Calendar listing state
  const [calendarEvents, setCalendarEvents] = useState<Array<{id: string; time: string; title: string; status: string}>>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Speech-to-Text state for Meeting Capture
  const [isListeningMeeting, setIsListeningMeeting] = useState(false);
  const meetingRecognitionRef = useRef<any>(null);

  const workspaceTasks = useMemo(() => tasks.map(toWorkspaceTask), [tasks]);
  const topTask = workspaceTasks[0];

  async function authHeaders() {
    const token = await user?.getIdToken().catch(() => '');
    return {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    };
  }

  // Effect to check Google Integration status
  useEffect(() => {
    async function checkGoogleStatus() {
      if (!user) {
        setIsGoogleConnected(false);
        return;
      }
      try {
        const response = await fetch(`/api/integrations/google/status?userId=${encodeURIComponent(user.uid)}`);
        if (response.ok) {
          const data = await response.json();
          setIsGoogleConnected(Boolean(data.connected));
        }
      } catch (err) {
        console.error('Failed to check Google integration status', err);
      }
    }
    checkGoogleStatus();
  }, [user]);

  const fetchCalendarEvents = useCallback(async () => {
    if (!user || !isGoogleConnected) return;
    setLoadingCalendar(true);
    try {
      const response = await fetch('/api/calendar/list', {
        method: 'POST',
        headers: await authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setCalendarEvents(data);
      }
    } catch (err) {
      console.error('Failed to load calendar events', err);
    } finally {
      setLoadingCalendar(false);
    }
  }, [user, isGoogleConnected]);

  useEffect(() => {
    if (user && isGoogleConnected) {
      const timer = setTimeout(() => {
        fetchCalendarEvents();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, isGoogleConnected, fetchCalendarEvents]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListeningMeeting(true);
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          setMeetingNotes((prev) => (prev ? prev + '\n' + transcript : transcript));
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          setIsListeningMeeting(false);
        };

        recognition.onend = () => {
          setIsListeningMeeting(false);
        };

        meetingRecognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListeningMeeting = () => {
    if (!meetingRecognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (isListeningMeeting) {
      meetingRecognitionRef.current.stop();
    } else {
      meetingRecognitionRef.current.start();
    }
  };

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

  // API Call Handlers
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
    if (!isGoogleConnected) {
      setError('Please connect your Google Calendar in the Integrations tab first.');
      return;
    }
    const result = await callApi<CalendarSuggestion & {runtime?: {source: Source}}>('calendar', '/api/calendar/suggest', {
      userId: user?.uid,
      tasks: workspaceTasks,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (result) setCalendar(result);
  }

  async function commitCalendarBlock(block: CalendarSuggestion['proposedBlocks'][number]) {
    if (!user || !isGoogleConnected) return;
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
    fetchCalendarEvents();
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

  // Meeting Capture Handlers
  async function extractMeetingActions() {
    const transcript = meetingNotes.trim();
    if (!transcript || isExtractingMeeting) return;

    setMeetingError('');
    setIsExtractingMeeting(true);
    setMeetingResult(null);
    setSavedMeetingActions([]);

    try {
      const response = await fetch('/api/meetings/extract', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          transcript,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!response.ok) {
        throw new Error('Ling could not extract this meeting yet.');
      }

      setMeetingResult((await response.json()) as MeetingCaptureResult);
    } catch (error) {
      setMeetingError(error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setIsExtractingMeeting(false);
    }
  }

  async function approveCapturedAction(
    key: string,
    item: MeetingCaptureResult['actionItems'][number],
  ) {
    if (!user || savingMeetingAction || savedMeetingActions.includes(key)) return;

    setMeetingError('');
    setSavingMeetingAction(key);

    try {
      await saveApprovedMeetingAction(user.uid, item);
      setSavedMeetingActions((current) => [...current, key]);
    } catch (error) {
      setMeetingError(error instanceof Error ? error.message : 'Unable to save this action.');
    } finally {
      setSavingMeetingAction('');
    }
  }

  async function importCalendarMeetings() {
    if (!user) return;

    setMeetingError('');
    setMeetingImportStatus('Importing calendar meetings...');

    try {
      const token = await user.getIdToken().catch(() => '');
      const response = await fetch('/api/meetings/from-calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({userId: user.uid}),
      });
      const result = (await response.json()) as {created?: Array<{id: string; title: string}>; error?: string};

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Unable to import calendar meetings.');
      }

      setMeetingImportStatus(`${result.created?.length ?? 0} meeting note${result.created?.length === 1 ? '' : 's'} imported.`);
    } catch (error) {
      setMeetingError(error instanceof Error ? error.message : 'Unable to import calendar meetings.');
      setMeetingImportStatus('');
    }
  }

  // Memory Search Handler
  async function searchLifeMemory() {
    const query = memoryQuery.trim();
    if (!user || !query || isSearchingMemory) return;

    setMemoryError('');
    setIsSearchingMemory(true);

    try {
      const token = await user.getIdToken().catch(() => '');
      const response = await fetch('/api/memory/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({userId: user.uid, query}),
      });

      if (!response.ok) {
        throw new Error('Ling could not search memory yet.');
      }

      setMemoryResult(await response.json());
    } catch (error) {
      setMemoryError(error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setIsSearchingMemory(false);
    }
  }

  const openLoopTotal = openLoops.filter((loop) => loop.status === 'open').length;
  const urgentTask = tasks.find((task) => task.priority === 'do_now' || task.priority === 'at_risk') ?? tasks[0];
  
  const cockpitStats = [
    {
      label: 'Tasks Captured',
      value: tasks.length,
      detail: tasks.length ? 'Ready for planning' : 'Start in chat',
    },
    {
      label: 'Open Loops',
      value: openLoopTotal,
      detail: openLoopTotal ? 'Needs closure' : 'None waiting',
    },
    {
      label: 'Urgent Action',
      value: urgentTask ? urgentTask.priority.replace('_', ' ') : 'None',
      detail: urgentTask?.title ?? 'No tasks saved',
    },
    {
      label: 'Google Status',
      value: user && isGoogleConnected ? 'Connected' : 'Offline',
      detail: user && isGoogleConnected ? 'Autopilot active' : 'Connect Google account',
    },
  ];

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tasks', label: 'Tasks & Inbox', icon: ListTodo },
    { id: 'studio', label: 'AI Studio', icon: Sparkles },
    { id: 'habits', label: 'Habits & Routines', icon: Target },
  ];

  return (
    <div className="space-y-6">
      {/* Top Tab Bar Navigation */}
      <div className="flex justify-center border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-muted/70 p-1 border border-border/40 backdrop-blur-md">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setError('');
                  setSaved('');
                }}
                className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'bg-brand text-white shadow-lg shadow-brand/10 scale-[1.02]'
                    : 'text-muted-foreground hover:bg-surface hover:text-foreground active:scale-[0.98]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Notifications Banner */}
      {(error || saved || !user) && (
        <div className="mx-auto max-w-4xl rounded-lg border border-border bg-surface px-4 py-3 text-sm flex items-center justify-between shadow-sm animate-lingt-scale-in">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${error ? 'text-danger' : saved ? 'text-success' : 'text-brand'}`} />
            <span className="font-medium">
              {error ? error : saved ? saved : 'Sign in to sync your workspace automatically.'}
            </span>
          </div>
          <button 
            onClick={() => { setError(''); setSaved(''); }}
            className="text-xs text-muted-foreground hover:text-foreground font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Contents */}
      <div key={activeTab} className="animate-lingt-rise">
        
        {/* ==================== DASHBOARD TAB ==================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Cockpit Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {cockpitStats.map((stat, i) => {
                const delays = ['delay-75', 'delay-150', 'delay-225', 'delay-300'];
                return (
                  <div
                    key={stat.label}
                    className={`rounded-2xl border border-border/80 bg-surface/50 backdrop-blur-sm p-4 transition-all duration-300 hover:border-brand/30 hover:scale-[1.01] hover:shadow-md ${delays[i] || ''}`}
                  >
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</div>
                    <div className="mt-2 text-2xl font-bold truncate text-foreground">{stat.value}</div>
                    <div className="mt-1 text-xs text-muted-foreground leading-normal">{stat.detail}</div>
                  </div>
                );
              })}
            </div>

            {/* Quick Capture Input Box */}
            <div className="rounded-2xl border border-brand/10 bg-surface p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row items-center">
                <div className="relative w-full flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    value={quickCapture}
                    onChange={(event) => setQuickCapture(event.target.value)}
                    placeholder="Quick capture a task, open loop, draft request, or habit..."
                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:ring-1 focus:ring-brand/35"
                  />
                </div>
                <button
                  type="button"
                  disabled={!user || !quickCapture.trim() || busy === 'quick'}
                  onClick={runQuickCapture}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-brand-deep hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:scale-100 shrink-0"
                >
                  {busy === 'quick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Save capture
                </button>
              </div>
            </div>

            {/* Recommendations Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Daily Plan & Calendar suggestions */}
              <div className="space-y-6">
                {/* Daily Plan Card */}
                <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h3 className="text-lg font-semibold inline-flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-brand" />
                        Daily Rescue Plan
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">Staggered timeline generated for your day.</p>
                    </div>
                    <button
                      type="button"
                      disabled={tasks.length === 0 || busy === 'plan'}
                      onClick={generatePlan}
                      className="rounded-lg bg-brand-soft px-3.5 py-2 text-xs font-semibold text-brand-deep transition-all duration-200 hover:bg-brand/15 active:scale-[0.97] disabled:opacity-40"
                    >
                      {busy === 'plan' ? 'Generating...' : 'Generate'}
                    </button>
                  </div>
                  
                  {plan ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm leading-6 text-muted-foreground">{plan.summary}</p>
                      <div className="space-y-2">
                        {plan.blocks.map((block) => (
                          <div key={`${block.title}-${block.time}`} className="rounded-lg border border-border bg-background p-3">
                            <div className="font-semibold text-sm">{block.time}: {block.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground leading-5">{block.reason}</div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!user}
                        onClick={savePlan}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-brand/40 active:scale-[0.98]"
                      >
                        Save Plan
                      </button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground italic">Add tasks to your workspace first, then click generate to make a custom rescue plan.</p>
                  )}
                </div>

                {/* Calendar suggestions */}
                <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h3 className="text-lg font-semibold inline-flex items-center gap-2">
                        <CalendarClock className="h-5 w-5 text-[#34a853]" />
                        Calendar Proposals
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">Smart blocks to protect time in your calendar.</p>
                    </div>
                    {isGoogleConnected && (
                      <button
                        type="button"
                        onClick={suggestCalendar}
                        className="rounded-lg bg-brand-soft px-3.5 py-2 text-xs font-semibold text-brand-deep transition-all duration-200 hover:bg-brand/15 active:scale-[0.97]"
                      >
                        {busy === 'calendar' ? 'Suggesting...' : 'Suggest'}
                      </button>
                    )}
                  </div>

                  {!isGoogleConnected ? (
                    <div className="mt-4 rounded-xl border border-[#4285f4]/20 bg-[#4285f4]/5 p-4 text-center space-y-2.5">
                      <p className="text-xs text-muted-foreground leading-5">
                        Connect your Google Calendar in the Integrations tab to let Cal automatically check for conflicts and suggest protected study slots.
                      </p>
                      <a
                        href="/integrations"
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4285f4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#357ae8] transition active:scale-[0.97]"
                      >
                        Connect Google Calendar
                      </a>
                    </div>
                  ) : calendar ? (
                    <div className="mt-4 space-y-3">
                      {calendar.proposedBlocks.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No suggested blocks found for current tasks.</p>
                      )}
                      {calendar.proposedBlocks.map((block) => (
                        <div key={`${block.title}-${block.start}`} className="rounded-lg border border-border bg-background p-4 space-y-2">
                          <div className="font-semibold text-sm">{block.title}</div>
                          <div className="text-xs text-muted-foreground leading-5 font-semibold text-brand-deep">
                            {formatBlockTime(block.start, block.end)}
                          </div>
                          <div className="text-xs text-muted-foreground leading-relaxed">{block.reason}</div>
                          <div className="rounded-lg bg-brand-soft/40 px-3 py-1.5 text-xs text-brand-deep border border-brand/10">
                            <strong>Note:</strong> Double approval required before writing to Calendar.
                          </div>
                          <button
                            type="button"
                            disabled={!user}
                            onClick={() => commitCalendarBlock(block)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-deep"
                          >
                            Approve and Commit
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground italic">Click suggest to generate smart calendar block proposals for your active tasks.</p>
                  )}
                </div>
              </div>

              {/* Routines, Reminders & Escalations */}
              <div className="space-y-6">
                {/* Proactive Routine Card */}
                <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h3 className="text-lg font-semibold inline-flex items-center gap-2">
                        <Repeat className="h-5 w-5 text-[#8430ce]" />
                        Active Routine runs
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">Run proactive scanners on your schedule.</p>
                    </div>
                    <button
                      type="button"
                      onClick={runRoutine}
                      className="rounded-lg bg-brand-soft px-3.5 py-2 text-xs font-semibold text-brand-deep transition-all duration-200 hover:bg-brand/15 active:scale-[0.97]"
                    >
                      {busy === 'routine' ? 'Running...' : 'Run'}
                    </button>
                  </div>
                  
                  <div className="mt-4 space-y-3">
                    <select
                      value={routineType}
                      onChange={(event) => setRoutineType(event.target.value as RoutineRun['routineType'])}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                    >
                      <option value="morning_briefing">Morning Briefing</option>
                      <option value="before_meeting_prep">Before-meeting Prep</option>
                      <option value="deadline_risk_scan">Deadline Risk Scan</option>
                      <option value="end_of_day_recovery">End-of-day Recovery</option>
                      <option value="weekly_review">Weekly Review</option>
                    </select>

                    {routine ? (
                      <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                        <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{routine.message}</p>
                        <button
                          type="button"
                          disabled={!user}
                          onClick={saveRoutine}
                          className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:border-brand/40 active:scale-[0.98]"
                        >
                          Save Routine logs
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Select a routine style and click Run to start scanning your context.</p>
                    )}
                  </div>
                </div>

                {/* Reminder Escalation Card */}
                <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div>
                      <h3 className="text-lg font-semibold inline-flex items-center gap-2">
                        <Bell className="h-5 w-5 text-danger animate-pulse" />
                        Reminder Escalation
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">Test how alerts sound when work is ignored.</p>
                    </div>
                    <button
                      type="button"
                      onClick={escalateReminder}
                      className="rounded-lg bg-brand-soft px-3.5 py-2 text-xs font-semibold text-brand-deep transition-all duration-200 hover:bg-brand/15 active:scale-[0.97]"
                    >
                      {busy === 'reminder' ? 'Choosing...' : 'Escalate'}
                    </button>
                  </div>

                  {reminder ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-lg border border-border bg-background p-4 space-y-2">
                        <div className="font-semibold text-danger capitalize">Level: {reminder.level.replace(/_/g, ' ')}</div>
                        <p className="text-xs text-muted-foreground leading-5">{reminder.message}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!user}
                          onClick={saveReminder}
                          className="rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:border-brand/40"
                        >
                          Save Escalation
                        </button>
                        <button
                          type="button"
                          disabled={!user}
                          onClick={enableNotifications}
                          className="rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold hover:border-brand/40"
                        >
                          Enable Notifications
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground italic">Selects the top urgent task and simulates what notifications would trigger.</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ==================== TASKS & INBOX TAB ==================== */}
        {activeTab === 'tasks' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left Column: Tasks List */}
            <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-brand" />
                    Tasks
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Approved work items synced with chat.</p>
                </div>
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-deep">
                  {tasks.length} total
                </span>
              </div>

              {tasks.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-background/50 p-6 text-center text-sm text-muted-foreground">
                  No tasks saved. Type a task in chat and ask Ling to "add this to my tasks".
                </div>
              )}

              <div className="grid gap-3">
                {[...tasks]
                  .sort((a, b) => {
                    const weights = { do_now: 4, at_risk: 3, schedule_today: 2, can_wait: 1 };
                    const weightA = weights[a.priority as keyof typeof weights] || 0;
                    const weightB = weights[b.priority as keyof typeof weights] || 0;
                    return weightB - weightA;
                  })
                  .map((task, i) => {
                    const delays = ['delay-75', 'delay-150', 'delay-225', 'delay-300'];
                    const priorityStyles = {
                      do_now: 'bg-red-50 text-red-600 border-red-200',
                      at_risk: 'bg-orange-50 text-orange-600 border-orange-200',
                      schedule_today: 'bg-blue-50 text-blue-600 border-blue-200',
                      can_wait: 'bg-zinc-50 text-zinc-600 border-zinc-200',
                    };
                    const isUrgent = task.priority === 'do_now' || task.priority === 'at_risk';                     const isOverdue = checkTaskOverdue(task.due, task.status);
                    return (
                      <div
                        key={task.id}
                        className={`rounded-xl border transition-all duration-300 hover:scale-[1.01] hover:shadow-sm p-4 relative overflow-hidden ${
                          task.status === 'done'
                            ? 'border-border bg-surface-muted/40 opacity-75'
                            : task.priority === 'do_now'
                            ? 'border-red-200 bg-red-50/15 hover:border-red-300 border-l-4 border-l-red-500'
                            : task.priority === 'at_risk'
                            ? 'border-orange-200 bg-orange-50/15 hover:border-orange-300 border-l-4 border-l-orange-500'
                            : 'border-border bg-background hover:border-brand/30'
                        } ${delays[i] || ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            disabled={!user}
                            onClick={() => {
                              const nextStatus = task.status === 'done' ? 'open' : 'done';
                              setTaskStatus(task.id, nextStatus);
                            }}
                            className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border transition hover:bg-brand/10 ${
                              task.status === 'done'
                                ? 'border-brand bg-brand text-white'
                                : isOverdue
                                ? 'border-red-400 bg-red-50 text-red-500 hover:border-red-500'
                                : 'border-muted-foreground/30 bg-background hover:border-brand'
                            }`}
                          >
                            {task.status === 'done' && (
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold text-sm transition-all leading-snug ${
                              task.status === 'done'
                                ? 'text-muted-foreground line-through opacity-60'
                                : 'text-foreground'
                            }`}>
                              {task.title}
                            </h4>
                            <p className={`mt-1 text-xs transition-all leading-relaxed ${
                              task.status === 'done'
                                ? 'text-muted-foreground/60 line-through opacity-60'
                                : 'text-muted-foreground'
                            }`}>
                              {task.reason}
                            </p>
                          </div>

                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase shrink-0 ${
                            task.status === 'done'
                              ? 'bg-zinc-100 text-zinc-400 border-zinc-200'
                              : priorityStyles[task.priority] || ''
                          }`}>
                            {task.status === 'done' ? 'done' : task.priority.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="mt-3.5 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-2.5">
                          <span>Due: {task.due}</span>
                          <span className={`font-medium ${isOverdue ? 'text-red-600 font-bold' : 'text-foreground'}`}>
                            {isOverdue ? '🔴 Overdue' : statusLabel(task.status)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Right Column: Open Loops */}
            <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <Bell className="h-5 w-5 text-danger" />
                    Open Loops
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Commitments and unresolved email threads.</p>
                </div>
                <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
                  {openLoopTotal} open
                </span>
              </div>

              {openLoops.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-background/50 p-6 text-center text-sm text-muted-foreground">
                  No open loops. Ling will auto-detect unresolved commitments when you sync Gmail.
                </div>
              )}

              <div className="grid gap-3">
                {openLoops.map((loop, i) => {
                  const delays = ['delay-75', 'delay-150', 'delay-225', 'delay-300'];
                  return (
                    <div
                      key={loop.id}
                      className={`rounded-xl border border-border bg-background p-4 transition-all duration-300 hover:border-brand/30 hover:scale-[1.01] hover:shadow-sm ${delays[i] || ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-sm text-foreground">{loop.title}</h4>
                          <p className="mt-1 text-xs text-muted-foreground leading-5">{loop.reason}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          loop.status === 'resolved' 
                            ? 'bg-success-soft text-success border-success/20' 
                            : 'bg-warning-soft text-warning border-warning/20'
                        }`}>
                          {statusLabel(loop.status)}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-3">
                        <button
                          className="rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none"
                          disabled={loop.status === 'resolved'}
                          onClick={() => setOpenLoopStatus(loop.id, 'resolved')}
                        >
                          Resolve
                        </button>
                        <button
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold transition hover:bg-surface-muted active:scale-[0.96]"
                          onClick={() => setOpenLoopStatus(loop.id, 'scheduled')}
                        >
                          {loop.action}
                        </button>
                        <button
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-surface-muted hover:text-foreground active:scale-[0.96]"
                          onClick={() => setOpenLoopStatus(loop.id, 'snoozed')}
                        >
                          Snooze
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* ==================== AI STUDIO TAB ==================== */}
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left Column: Meeting Capture */}
            <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start border-b border-border/60 pb-3">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <Mic className="h-5 w-5 text-brand" />
                    Meeting Capture
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Extract summary, decisions, and action items.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {meetingResult && (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-deep">
                      {meetingResult.runtime.source}
                    </span>
                  )}
                  {isGoogleConnected && (
                    <button
                      type="button"
                      disabled={!user}
                      onClick={importCalendarMeetings}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold transition hover:border-brand/40 active:scale-[0.97] disabled:opacity-50"
                    >
                      Import Calendar Notes
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-3 transition focus-within:border-brand/40">
                <textarea
                  value={meetingNotes}
                  onChange={(event) => setMeetingNotes(event.target.value)}
                  className="min-h-36 w-full resize-none bg-transparent text-sm leading-6 outline-none"
                  placeholder="Paste raw transcript, markdown, or summary bullet points here..."
                />
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border/40 pt-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Ling only extracts actions. Items stay drafts until approved.
                    </p>
                    <button
                      type="button"
                      onClick={toggleListeningMeeting}
                      className={`rounded-lg p-2 transition-all duration-300 flex items-center justify-center ${
                        isListeningMeeting ? 'bg-danger text-white animate-pulse' : 'bg-surface hover:bg-surface-muted text-muted-foreground'
                      }`}
                      title={isListeningMeeting ? 'Stop listening' : 'Start listening'}
                    >
                      <Mic className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!meetingNotes.trim() || isExtractingMeeting}
                    onClick={extractMeetingActions}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-deep active:scale-[0.97] disabled:opacity-50"
                  >
                    {isExtractingMeeting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {isExtractingMeeting ? 'Extracting...' : 'Extract actions'}
                  </button>
                </div>
              </div>

              {meetingError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-danger">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {meetingError}
                </div>
              )}
              {meetingImportStatus && (
                <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                  {meetingImportStatus}
                </div>
              )}

              {/* Extraction Results */}
              {meetingResult && (
                <div className="space-y-4 pt-3 border-t border-border/60">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Summary</h4>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{meetingResult.summary}</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Decisions</h4>
                      <div className="mt-1.5 space-y-1">
                        {meetingResult.decisions.length === 0 && <div className="text-xs text-muted-foreground italic">None found.</div>}
                        {meetingResult.decisions.map((dec) => (
                          <div key={dec} className="rounded-lg border border-border/60 bg-background p-2 text-xs text-muted-foreground">{dec}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Open Loops</h4>
                      <div className="mt-1.5 space-y-1.5">
                        {meetingResult.openLoops.length === 0 && <div className="text-xs text-muted-foreground italic">None found.</div>}
                        {meetingResult.openLoops.map((loop) => (
                          <div key={`${loop.title}-${loop.action}`} className="rounded-lg border border-warning/30 bg-warning-soft/30 p-2.5">
                            <div className="text-xs font-semibold">{loop.title}</div>
                            <div className="mt-1 text-[10px] text-muted-foreground leading-4">{loop.reason} (Next: {loop.action})</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Extracted Action Items</h4>
                    <div className="mt-2 space-y-2">
                      {meetingResult.actionItems.length === 0 && <div className="text-xs text-muted-foreground italic">None found.</div>}
                      {meetingResult.actionItems.map((item, index) => {
                        const key = `${item.title}-${index}`;
                        const saved = savedMeetingActions.includes(key);
                        return (
                          <div key={key} className="rounded-lg border border-border bg-background p-3.5 flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="font-semibold text-xs text-foreground">{item.title}</div>
                              <div className="text-[10px] text-muted-foreground">Owner: {item.owner} | Due: {item.deadline} | Confidence: {item.confidence}</div>
                              <p className="text-[11px] text-muted-foreground leading-4">{item.nextStep}</p>
                            </div>
                            <button
                              type="button"
                              disabled={!user || saved || savingMeetingAction === key}
                              onClick={() => approveCapturedAction(key, item)}
                              className="rounded-lg bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-deep transition hover:bg-brand/15 disabled:opacity-50 shrink-0"
                            >
                              {saved ? 'Approved' : 'Approve'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Saved Meeting Actions List */}
              <div className="pt-4 border-t border-border/60">
                <h3 className="text-sm font-bold text-foreground">Approved Action Items</h3>
                <div className="mt-2.5 space-y-2">
                  {meetingActionItems.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-background/50 p-4 text-xs text-center text-muted-foreground">
                      No approved meeting action items yet.
                    </div>
                  )}
                  {meetingActionItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-xs">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${item.approved ? 'text-success' : 'text-brand'}`} />
                        <div>
                          <span className={item.approved ? 'line-through text-muted-foreground' : 'font-medium'}>{item.text}</span>
                          {(item.owner || item.deadline) && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              {item.owner ? `Owner: ${item.owner}` : ''}{item.owner && item.deadline ? ' | ' : ''}{item.deadline ? `Due: ${item.deadline}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={item.approved}
                        onClick={() => approveAction(item.id)}
                        className="rounded bg-brand-soft px-2.5 py-1 text-[10px] font-semibold text-brand-deep transition hover:bg-brand/15 disabled:opacity-50 shrink-0"
                      >
                        {item.approved ? 'Done' : 'Approve'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Life Memory & Drafting Studio */}
            <div className="space-y-6">
              {/* Life Memory Card */}
              <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <Search className="h-5 w-5 text-[#8430ce]" />
                    Life Memory
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Semantic search query across your entire workspace.</p>
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    searchLifeMemory();
                  }}
                  className="flex gap-2 rounded-xl border border-border bg-background p-2 transition focus-within:border-brand/40"
                >
                  <input
                    value={memoryQuery}
                    onChange={(event) => setMemoryQuery(event.target.value)}
                    placeholder="What did I decide, promise, or need to follow up on?"
                    className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!user || !memoryQuery.trim() || isSearchingMemory}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep active:scale-[0.96] disabled:opacity-50 shrink-0"
                  >
                    {isSearchingMemory ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    Search
                  </button>
                </form>

                {memoryResult && (
                  <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="rounded-xl border border-border bg-background p-3.5 space-y-1.5">
                      <div className="text-xs font-bold text-foreground">Answer</div>
                      <p className="text-xs leading-5 text-muted-foreground">{memoryResult.answer}</p>
                      {memoryResult.suggestedNextAction && (
                        <div className="text-[10px] text-brand-deep font-semibold bg-brand-soft/40 px-2 py-1 rounded inline-block border border-brand/5">
                          Suggested Next: {memoryResult.suggestedNextAction}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-foreground">Retrieved Context Sources</h4>
                      {memoryResult.sources.length === 0 && <div className="text-xs text-muted-foreground italic">No matching sources.</div>}
                      {memoryResult.sources.map((source) => (
                        <div key={`${source.type}-${source.id}`} className="rounded-lg border border-border bg-background p-3">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span>{source.title}</span>
                            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[9px] text-muted-foreground uppercase">{source.source}</span>
                          </div>
                          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{source.snippet}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Drafting Studio Card */}
              <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <PenLine className="h-5 w-5 text-[#fbbc04]" />
                    Drafting Studio
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Draft emails, extension requests, or follow-ups.</p>
                </div>

                <div className="space-y-3">
                  <textarea
                    value={draftPrompt}
                    onChange={(event) => setDraftPrompt(event.target.value)}
                    placeholder="Describe what you want to write (e.g. extension request to Prof)..."
                    className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-xs leading-5 outline-none transition focus:border-brand"
                  />
                  
                  <button
                    type="button"
                    onClick={generateDraft}
                    disabled={busy === 'draft' || (!draftPrompt.trim() && tasks.length === 0)}
                    className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-deep active:scale-[0.97] disabled:opacity-50"
                  >
                    {busy === 'draft' ? 'Drafting...' : 'Generate Draft'}
                  </button>

                  {draft && (
                    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                      <div className="text-xs font-bold text-foreground capitalize">{draft.title}</div>
                      <pre className="text-xs font-sans text-muted-foreground leading-5 whitespace-pre-wrap select-all">{draft.content}</pre>
                      <button
                        type="button"
                        disabled={!user}
                        onClick={saveDraft}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:border-brand/40 active:scale-[0.97]"
                      >
                        Save Draft
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ==================== HABITS & ROUTINES TAB ==================== */}
        {activeTab === 'habits' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left Column: Habits List & Builder */}
            <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <Target className="h-5 w-5 text-[#34a853]" />
                    Habit Board
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Track your daily and weekly habits.</p>
                </div>
                <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                  {habits.length} habits
                </span>
              </div>

              {/* Habits List */}
              <div className="space-y-3">
                {habits.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border bg-background/50 p-6 text-center text-sm text-muted-foreground">
                    No habits set up yet. Use the Habit Builder below to add a habit to your board.
                  </div>
                )}
                {habits.map((h) => (
                  <div key={h.id} className="rounded-xl border border-border bg-background p-4 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="font-semibold text-sm text-foreground">{h.title}</div>
                      <div className="text-xs text-muted-foreground">{h.cadence} | Target: {h.target}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success border border-success/15 shrink-0">
                        {h.streak} streak
                      </span>
                      <button
                        type="button"
                        onClick={() => checkInHabit(h.id, true)}
                        className="rounded bg-brand px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-brand-deep active:scale-[0.96]"
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => checkInHabit(h.id, false)}
                        className="rounded border border-border bg-surface px-2 py-1 text-[10px] font-semibold transition hover:bg-surface-muted active:scale-[0.96]"
                      >
                        Miss
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Habit Builder Tool */}
              <div className="border-t border-border/60 pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Habit Builder</h4>
                <div className="flex gap-2 rounded-xl border border-border bg-background p-2 transition focus-within:border-brand/40">
                  <input
                    value={habitPrompt}
                    onChange={(event) => setHabitPrompt(event.target.value)}
                    placeholder="Enter a habit goal (e.g. read 20 mins every morning)..."
                    className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={suggestHabit}
                    disabled={!habitPrompt.trim() || busy === 'habit'}
                    className="rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep active:scale-[0.97]"
                  >
                    Suggest
                  </button>
                </div>

                {habit && (
                  <div className="rounded-xl border border-border bg-background p-3.5 space-y-2">
                    <div className="font-semibold text-xs text-foreground">{habit.title}</div>
                    <div className="text-[10px] text-muted-foreground">{habit.reason || habit.cadence} | Target: {habit.target}</div>
                    <button
                      type="button"
                      disabled={!user}
                      onClick={saveHabit}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep"
                    >
                      Save to Habit Board
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Routines Configurations & Calendar Plan & Escalations */}
            <div className="space-y-6">
              
              {/* Routines Card */}
              <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <Repeat className="h-5 w-5 text-brand" />
                    Proactive Routines
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Toggle background automations and scanners.</p>
                </div>

                <div className="grid gap-3">
                  {routines.map((routine) => (
                    <div key={routine.id} className="rounded-xl border border-border bg-background p-4 flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-semibold text-xs text-foreground">{routine.name}</div>
                        <div className="text-[10px] text-muted-foreground">{routine.schedule}</div>
                        <p className="text-xs text-muted-foreground leading-5 pt-1">{routine.detail}</p>
                      </div>
                      <button
                        onClick={() => toggleRoutine(routine.id)}
                        className={`rounded-full px-3 py-1 text-[10px] font-bold border transition ${
                          routine.enabled
                            ? 'bg-brand text-white border-brand shadow-sm'
                            : 'bg-background text-muted-foreground border-border hover:bg-surface'
                        }`}
                      >
                        {routine.enabled ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                  {routines.length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground italic">No routines synced.</div>
                  )}
                </div>
              </div>

              {/* Calendar Plan Card */}
              <div className="rounded-2xl border border-border bg-surface p-5 md:p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="text-xl font-bold inline-flex items-center gap-2">
                    <CalendarClock className="h-5 w-5 text-[#34a853]" />
                    Calendar Plan
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Committed blocks scheduled in your external calendar.</p>
                </div>

                <div className="space-y-2.5">
                  {loadingCalendar && <div className="text-xs text-muted-foreground animate-pulse">Loading events...</div>}
                  
                  {!isGoogleConnected ? (
                    <div className="rounded-xl border border-dashed border-border bg-background/50 p-4 text-xs text-center text-muted-foreground">
                      Google account not connected. Go to the <a href="/integrations" className="text-brand underline font-medium">Integrations</a> tab to connect Google Calendar.
                    </div>
                  ) : calendarEvents.length === 0 && !loadingCalendar ? (
                    <div className="rounded-xl border border-dashed border-border bg-background/50 p-4 text-xs text-center text-muted-foreground">
                      No calendar blocks scheduled. Approve proposals on the Dashboard to add events.
                    </div>
                  ) : (
                    calendarEvents.map((block) => (
                      <div key={block.id} className="rounded-lg bg-background p-3 flex justify-between items-center text-xs border border-border">
                        <div>
                          <div className="font-semibold">{block.title}</div>
                          <div className="text-muted-foreground mt-0.5">{block.time}</div>
                        </div>
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[9px] font-semibold text-success uppercase">{block.status}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
