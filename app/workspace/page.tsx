'use client';

import AppShell from '@/components/AppShell';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Loader2,
  ListChecks,
  Mic,
  Repeat,
  Search,
  Sparkles,
} from 'lucide-react';
import {useState} from 'react';
import ProductivitySuite from '@/components/ProductivitySuite';
import type {MeetingCaptureResult, MemorySearchResult} from '@/lib/orchestration/schemas';
import {
  calendarBlocks,
  statusLabel,
} from '@/lib/lingt-data';
import {useWorkspaceSync} from '@/hooks/use-workspace-sync';
import {saveApprovedMeetingAction} from '@/lib/firebase/workspace';

export default function WorkspacePage() {
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingResult, setMeetingResult] = useState<MeetingCaptureResult | null>(null);
  const [isExtractingMeeting, setIsExtractingMeeting] = useState(false);
  const [meetingError, setMeetingError] = useState('');
  const [meetingImportStatus, setMeetingImportStatus] = useState('');
  const [savingMeetingAction, setSavingMeetingAction] = useState('');
  const [savedMeetingActions, setSavedMeetingActions] = useState<string[]>([]);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResult, setMemoryResult] = useState<(MemorySearchResult & {runtime?: {source: 'gemini' | 'local-fallback'; sourceCount: number}}) | null>(null);
  const [isSearchingMemory, setIsSearchingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState('');
  const {
    user,
    loading,
    workspace,
    setOpenLoopStatus,
    toggleRoutine,
    approveAction,
    checkInHabit,
  } = useWorkspaceSync();
  const {tasks, openLoops, routines, meetingActionItems: actions, habits} = workspace;

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

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-brand">Workspace</p>
            <h1 className="mt-2 font-display text-4xl">Everything Ling is helping you finish.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {user
                ? loading
                  ? 'Syncing your Firestore workspace...'
                  : 'Synced to your Firebase account.'
                : 'Sign in to save tasks, open loops, routines, and meeting actions.'}
            </p>
          </div>
          <button className="w-fit rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
            New quick capture
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Tasks</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approved work Ling has moved out of chat.
                  </p>
                </div>
                <ListChecks className="h-5 w-5 text-brand" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {tasks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground md:col-span-2">
                    No saved tasks yet. Ask Ling in chat, then add the plan to your workspace.
                  </div>
                )}
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{task.reason}</div>
                      </div>
                      <span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] text-brand-deep">
                        {task.priority.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Due: {task.due}</span>
                      <span>{statusLabel(task.status)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <ProductivitySuite user={user} tasks={tasks} openLoops={openLoops} habits={habits} />

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Open loops</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Commitments that should not stay in your head.
                  </p>
                </div>
                <Bell className="h-5 w-5 text-danger" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {openLoops.map((loop) => (
                  <div key={loop.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{loop.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{loop.reason}</div>
                      </div>
                      <span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] text-brand-deep">
                        {statusLabel(loop.status)}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                        disabled={loop.status === 'resolved'}
                        onClick={() => setOpenLoopStatus(loop.id, 'resolved')}
                      >
                        Done
                      </button>
                      <button
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium"
                        onClick={() => setOpenLoopStatus(loop.id, 'scheduled')}
                      >
                        {loop.action}
                      </button>
                      <button
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted-foreground"
                        onClick={() => setOpenLoopStatus(loop.id, 'snoozed')}
                      >
                        Snooze
                      </button>
                    </div>
                  </div>
                ))}
                {openLoops.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground md:col-span-2">
                    No open loops yet. Add a plan from chat to start tracking unresolved commitments.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <Mic className="h-5 w-5 text-[#4285f4]" />
                    <h2 className="text-xl font-semibold">Meeting capture</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Paste transcript or notes, then approve extracted action items before they become tasks.
                  </p>
                </div>
                {meetingResult && (
                  <span className="w-fit rounded-full bg-brand-soft px-2 py-1 text-xs text-brand-deep">
                    {meetingResult.runtime.source === 'gemini' ? 'Gemini' : 'local fallback'}
                  </span>
                )}
                <button
                  type="button"
                  disabled={!user}
                  onClick={importCalendarMeetings}
                  className="w-fit rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Import calendar meetings
                </button>
              </div>

              <div className="mt-4 rounded-lg border border-border bg-background p-3">
                <textarea
                  value={meetingNotes}
                  onChange={(event) => setMeetingNotes(event.target.value)}
                  className="min-h-44 w-full resize-none bg-transparent text-sm leading-6 outline-none"
                  placeholder="Paste meeting notes or a transcript here..."
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Ling only saves items you approve. It will not send email, calendar events, or reminders.
                  </p>
                  <button
                    type="button"
                    disabled={!meetingNotes.trim() || isExtractingMeeting}
                    onClick={extractMeetingActions}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isExtractingMeeting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isExtractingMeeting ? 'Extracting...' : 'Extract actions'}
                  </button>
                </div>
              </div>

              {meetingError && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {meetingError}
                </div>
              )}
              {meetingImportStatus && (
                <div className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                  {meetingImportStatus}
                </div>
              )}

              {isExtractingMeeting && (
                <div className="mt-4 rounded-lg border border-dashed border-border bg-surface-muted p-4 text-sm text-muted-foreground">
                  Reading the notes, separating decisions from unresolved loops, and preparing an editable follow-up.
                </div>
              )}

              {!isExtractingMeeting && !meetingResult && (
                <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                  Meeting results will appear here after extraction.
                </div>
              )}

              {meetingResult && (
                <div className="mt-5 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold">Summary</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {meetingResult.summary}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold">Decisions</h3>
                      <div className="mt-2 space-y-2">
                        {meetingResult.decisions.length === 0 && (
                          <div className="rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
                            No explicit decisions found.
                          </div>
                        )}
                        {meetingResult.decisions.map((decision) => (
                          <div key={decision} className="rounded-lg border border-border bg-background p-3 text-sm">
                            {decision}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold">Open loops</h3>
                      <div className="mt-2 space-y-2">
                        {meetingResult.openLoops.length === 0 && (
                          <div className="rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
                            No unresolved loops found.
                          </div>
                        )}
                        {meetingResult.openLoops.map((loop) => (
                          <div key={`${loop.title}-${loop.action}`} className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                            <div className="text-sm font-medium">{loop.title}</div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {loop.reason} Next: {loop.action}.
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Action items</h3>
                    <div className="mt-2 space-y-3">
                      {meetingResult.actionItems.length === 0 && (
                        <div className="rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
                          No action items found.
                        </div>
                      )}
                      {meetingResult.actionItems.map((item, index) => {
                        const key = `${item.title}-${index}`;
                        const saved = savedMeetingActions.includes(key);

                        return (
                          <div key={key} className="rounded-lg border border-border bg-background p-4">
                            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                              <div>
                                <div className="font-medium">{item.title}</div>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span>Owner: {item.owner}</span>
                                  <span>Deadline: {item.deadline}</span>
                                  <span>Confidence: {item.confidence}</span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                  {item.nextStep}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={!user || saved || savingMeetingAction === key}
                                onClick={() => approveCapturedAction(key, item)}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-medium text-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {saved ? (
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                ) : savingMeetingAction === key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                {saved ? 'Approved' : savingMeetingAction === key ? 'Saving...' : 'Approve'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {!user && meetingResult.actionItems.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Sign in first to save approved action items.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Suggested follow-up</h3>
                    <div className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                      {meetingResult.followUpDraft}
                    </div>
                  </div>

                  <details className="w-fit text-xs text-muted-foreground">
                    <summary className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5">
                      Technical details
                    </summary>
                    <div className="mt-2 max-w-2xl rounded-lg border border-border bg-background p-3">
                      {meetingResult.agentActions.map((action) => (
                        <div key={`${action.agent}-${action.action}`} className="flex items-start justify-between gap-3">
                          <span>
                            <strong className="text-foreground">{action.agent}</strong>: {action.action}
                          </span>
                          {action.requiresApproval && <span className="shrink-0 text-brand">approval</span>}
                        </div>
                      ))}
                      <div className="mt-2 border-t border-border pt-2">
                        {meetingResult.graph.join(' -> ')}
                      </div>
                    </div>
                  </details>
                </div>
              )}

              <div className="mt-5 border-t border-border pt-5">
                <h3 className="text-sm font-semibold">Saved meeting actions</h3>
                <div className="mt-3 space-y-3">
                  {actions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                      No approved meeting actions yet.
                    </div>
                  )}
                  {actions.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-background p-3">
                      <div className="flex items-start gap-3 text-sm">
                        <CheckCircle2 className={item.approved ? 'mt-0.5 h-4 w-4 text-[#34a853]' : 'mt-0.5 h-4 w-4 text-brand'} />
                        <div>
                          <span className={item.approved ? 'text-muted-foreground line-through' : ''}>{item.text}</span>
                          {(item.owner || item.deadline) && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.owner ? `Owner: ${item.owner}` : ''}{item.owner && item.deadline ? ' - ' : ''}{item.deadline ? `Deadline: ${item.deadline}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-md bg-brand-soft px-2 py-1 text-xs text-brand-deep disabled:opacity-50"
                        disabled={item.approved}
                        onClick={() => approveAction(item.id)}
                      >
                        {item.approved ? 'Approved' : 'Approve'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Search className="h-5 w-5 text-[#8430ce]" />
                      <h2 className="text-xl font-semibold">Life Memory</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Ask Ling to recall saved tasks, meeting actions, Gmail summaries, and open loops.
                    </p>
                  </div>
                  {memoryResult?.runtime && (
                    <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-xs text-brand-deep">
                      {memoryResult.runtime.source === 'gemini' ? 'Gemini' : 'local'}
                    </span>
                  )}
                </div>

                <form
                  className="mt-4 flex gap-2 rounded-lg border border-border bg-background p-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    searchLifeMemory();
                  }}
                >
                  <input
                    value={memoryQuery}
                    onChange={(event) => setMemoryQuery(event.target.value)}
                    placeholder="What did I decide, promise, or need to follow up on?"
                    className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!user || !memoryQuery.trim() || isSearchingMemory}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSearchingMemory ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Search
                  </button>
                </form>

                {!user && (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
                    Sign in to search your saved context.
                  </div>
                )}

                {memoryError && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-danger">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {memoryError}
                  </div>
                )}

                {isSearchingMemory && (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
                    Searching saved workspace context...
                  </div>
                )}

                {!isSearchingMemory && !memoryResult && user && (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
                    No memory search yet. Ask about a decision, deadline, meeting action, or email follow-up.
                  </div>
                )}

                {memoryResult && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="text-sm font-medium">Answer</div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {memoryResult.answer}
                      </p>
                      <div className="mt-3 text-xs text-muted-foreground">
                        Next: {memoryResult.suggestedNextAction}
                      </div>
                    </div>

                    {memoryResult.sources.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
                        No source card matched this question.
                      </div>
                    )}

                    {memoryResult.sources.map((source) => (
                      <div key={`${source.type}-${source.id}`} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-3 text-sm font-medium">
                          <span>{source.title}</span>
                          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-1 text-[11px] text-muted-foreground">
                            {source.source}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{source.snippet}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#34a853]" />
                <h2 className="text-xl font-semibold">Habits</h2>
              </div>
              <div className="mt-4 space-y-3">
                {habits.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                    No habits yet. Use the habit builder in the Productivity suite.
                  </div>
                )}
                {habits.map((habit) => (
                  <div key={habit.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{habit.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {habit.cadence} - {habit.target}
                        </div>
                      </div>
                      <span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] text-brand-deep">
                        {habit.streak} streak
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => checkInHabit(habit.id, true)}
                        className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white"
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => checkInHabit(habit.id, false)}
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium"
                      >
                        Missed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-warm p-5">
              <div className="flex items-center gap-2">
                <Repeat className="h-5 w-5 text-[#34a853]" />
                <h2 className="text-xl font-semibold">Routines</h2>
              </div>
              <div className="mt-4 space-y-3">
                {routines.map((routine) => (
                  <div key={routine.name} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{routine.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{routine.schedule}</div>
                      </div>
                      <button
                        onClick={() => toggleRoutine(routine.id)}
                        className={routine.enabled ? 'rounded-full bg-brand px-2 py-1 text-[11px] text-white' : 'rounded-full bg-background px-2 py-1 text-[11px] text-muted-foreground'}
                      >
                        {routine.enabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-muted-foreground">{routine.detail}</p>
                  </div>
                ))}
                {routines.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">
                    No routines yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand" />
                <h2 className="text-xl font-semibold">Calendar plan</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                {calendarBlocks.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-background p-3 text-muted-foreground">
                    No calendar blocks suggested yet.
                  </div>
                )}
                {calendarBlocks.map((block) => (
                  <div key={block.id} className="rounded-lg bg-background p-3">
                    <div>{block.time} - {block.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{block.status}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-center gap-2 text-danger">
                <Bell className="h-5 w-5" />
                <h2 className="text-xl font-semibold">Escalation</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                If a critical task is ignored, Ling asks for done, snooze with reason, reschedule, or break down.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
