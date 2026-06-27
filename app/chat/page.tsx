'use client';

import AppShell from '@/components/AppShell';
import {onAuthStateChanged, type User} from 'firebase/auth';
import {
  AlarmClock,
  Bot,
  Brain,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
  Mail,
  Send,
  Sparkles,
} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {OrchestrationResult} from '@/lib/orchestration/schemas';
import {firebaseAuth} from '@/lib/firebase/client';
import {saveGeneratedPlan} from '@/lib/firebase/workspace';

type Message = {
  id: string;
  role: 'user' | 'ling';
  text: string;
  cards?: Array<{title: string; detail: string; type: string}>;
  orchestration?: OrchestrationResult;
};

const starterMessages: Message[] = [
  {
    id: '1',
    role: 'ling',
    text: 'I am Ling. Tell me what is due, what you forgot, or what you need to prepare. I will turn it into a plan.',
  },
];

const suggestions = [
  'Rescue my next 3 hours',
  'Turn this meeting into tasks',
  'What is at risk today?',
];

const teamAgents = [
  {
    id: 'ling',
    name: 'Ling',
    role: 'Lead',
    icon: Bot,
    color: 'text-[#4285f4]',
    activeWhen: () => true,
  },
  {
    id: 'tara',
    name: 'Tara',
    role: 'Tasks',
    icon: ClipboardList,
    color: 'text-[#34a853]',
    activeWhen: (result?: OrchestrationResult) => Boolean(result?.tasks.length),
  },
  {
    id: 'mira',
    name: 'Mira',
    role: 'Memory',
    icon: Brain,
    color: 'text-[#8430ce]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(result?.agentActions.some((action) => /memory|context|decided/i.test(action.action))),
  },
  {
    id: 'cal',
    name: 'Cal',
    role: 'Calendar',
    icon: Calendar,
    color: 'text-[#34a853]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(result?.approvals.some((approval) => /calendar|schedule/i.test(approval))),
  },
  {
    id: 'nia',
    name: 'Nia',
    role: 'Meetings',
    icon: FileText,
    color: 'text-[#4285f4]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(result?.openLoops.some((loop) => /meeting|decide|confirm/i.test(`${loop.title} ${loop.reason}`))),
  },
  {
    id: 'dax',
    name: 'Dax',
    role: 'Drafts',
    icon: Mail,
    color: 'text-[#fbbc04]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(result?.approvals.some((approval) => /draft|email|reply/i.test(approval))),
  },
  {
    id: 'remy',
    name: 'Remy',
    role: 'Reminders',
    icon: AlarmClock,
    color: 'text-[#ea4335]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(result?.tasks.some((task) => task.priority === 'do_now' || task.priority === 'at_risk')),
  },
];

export default function ChatPage() {
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [savingMessageId, setSavingMessageId] = useState('');
  const [savedMessageIds, setSavedMessageIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [lastSource, setLastSource] = useState<'ready' | 'gemini' | 'local fallback'>('ready');
  const [conversationId] = useState(() => crypto.randomUUID());
  const latestResult = [...messages].reverse().find((message) => message.orchestration)?.orchestration;
  const activeAgents = teamAgents.filter((agent) => isThinking || agent.activeWhen(latestResult));
  const latestHasWork = Boolean(
    latestResult &&
      (latestResult.tasks.length > 0 ||
        latestResult.openLoops.length > 0 ||
        latestResult.approvals.length > 0),
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => onAuthStateChanged(firebaseAuth, setUser), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages, isThinking]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryMessage = params.get('msg');
    if (queryMessage) {
      const timer = window.setTimeout(() => sendMessage(queryMessage), 0);
      window.history.replaceState({}, '', '/chat');
      return () => window.clearTimeout(timer);
    }
    // The query param should only auto-send once on first page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    setMessages((current) => [
      ...current,
      {id: crypto.randomUUID(), role: 'user', text: trimmed},
    ]);
    setInput('');
    setIsThinking(true);

    try {
      const response = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: trimmed,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!response.ok) {
        throw new Error('Ling could not reach the orchestration service.');
      }

      const result = (await response.json()) as OrchestrationResult;
      let persistenceWarning = '';
      if (user) {
        try {
          const token = await user.getIdToken().catch(() => '');
          const saveResponse = await fetch('/api/chat/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? {Authorization: `Bearer ${token}`} : {}),
            },
            body: JSON.stringify({
              userId: user.uid,
              conversationId,
              userMessage: trimmed,
              assistantMessage: result.assistantMessage,
              structuredOutput: result,
            }),
          });
          const saveResult = (await saveResponse.json().catch(() => null)) as {saved?: boolean; error?: string} | null;
          if (!saveResponse.ok || !saveResult?.saved) {
            throw new Error(saveResult?.error || 'Unable to save chat history.');
          }
        } catch (error) {
          persistenceWarning =
            error instanceof Error
              ? `Chat history was not saved: ${error.message}`
              : 'Chat history was not saved.';
        }
      }
      setLastSource(result.runtime.source === 'gemini' ? 'gemini' : 'local fallback');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'ling',
          text: result.assistantMessage,
          orchestration: result,
          cards: persistenceWarning
            ? [
                {
                  title: 'Not saved',
                  detail: persistenceWarning,
                  type: 'warning',
                },
              ]
            : undefined,
        },
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Try again in a moment.';
      setLastSource('local fallback');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'ling',
          text: `I hit a problem while coordinating the T team. ${detail}`,
          cards: [
            {title: 'Recovery', detail: 'Your message stayed in chat. Send again after checking the API key or server logs.', type: 'error'},
          ],
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function addToWorkspace(message: Message) {
    if (!user || !message.orchestration || savingMessageId) return;

    setSaveError('');
    setSavingMessageId(message.id);

    try {
      await saveGeneratedPlan(user.uid, message.orchestration);
      setSavedMessageIds((current) => [...current, message.id]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save to workspace.');
    } finally {
      setSavingMessageId('');
    }
  }

  return (
    <AppShell>
      <div className="grid h-[calc(100vh-64px)] min-h-[720px] gap-0 md:h-screen lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col border-r border-border bg-background">
          <header className="border-b border-border bg-surface/80 px-4 py-4 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl">Ling</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start with whatever is messy. The team appears when there is work to do.
                </p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground md:flex">
                <span className={lastSource === 'gemini' ? 'h-2 w-2 rounded-full bg-success' : 'h-2 w-2 rounded-full bg-warning'} />
                {lastSource}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((message) => (
                <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start gap-3'}>
                  {message.role === 'ling' && (
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                      <Bot className="h-4 w-4 text-brand" />
                    </div>
                  )}
                  <div className={message.role === 'user' ? 'max-w-[84%]' : 'max-w-[88%]'}>
                    <div
                      className={
                        message.role === 'user'
                          ? 'rounded-xl bg-brand px-4 py-3 text-sm leading-6 text-white'
                          : 'rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-6'
                      }
                    >
                      <div className="mb-1 text-xs font-medium opacity-70">
                        {message.role === 'user' ? 'You' : 'Ling'}
                      </div>
                      {message.text}
                    </div>

                    {message.cards && (
                      <div className="mt-3 grid gap-2">
                        {message.cards.map((card) => (
                          <div key={card.title} className="rounded-lg border border-border bg-surface-muted p-3">
                            <div className="text-sm font-medium">{card.title}</div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">{card.detail}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {message.orchestration && (
                      <div className="mt-3 grid gap-2">
                        {message.orchestration.tasks.map((task) => (
                          <div key={`${message.id}-${task.title}`} className="rounded-lg border border-border bg-surface-muted p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium">{task.title}</div>
                              <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-[11px] text-brand-deep">
                                {task.priority.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {task.reason} Due: {task.due}.
                            </div>
                          </div>
                        ))}

                        {message.orchestration.openLoops.map((loop) => (
                          <div key={`${message.id}-${loop.title}`} className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                            <div className="text-sm font-medium">{loop.title}</div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {loop.reason} Next: {loop.action}.
                            </div>
                          </div>
                        ))}

                        {message.orchestration.approvals.length > 0 && (
                          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                            <div className="text-sm font-medium text-success">Needs approval</div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {message.orchestration.approvals.join(' ')}
                            </div>
                          </div>
                        )}

                        {(message.orchestration.tasks.length > 0 ||
                          message.orchestration.openLoops.length > 0 ||
                          message.orchestration.approvals.length > 0) && (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={!user || savingMessageId === message.id || savedMessageIds.includes(message.id)}
                                onClick={() => addToWorkspace(message)}
                                className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {savedMessageIds.includes(message.id) ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                  <Sparkles className="h-4 w-4" />
                                )}
                                {savedMessageIds.includes(message.id)
                                  ? 'Added to workspace'
                                  : savingMessageId === message.id
                                    ? 'Adding...'
                                    : 'Add to workspace'}
                              </button>
                              {!user && (
                                <span className="text-xs text-muted-foreground">
                                  Sign in first to save this plan.
                                </span>
                              )}
                              {saveError && <span className="text-xs text-danger">{saveError}</span>}
                            </div>

                            <details className="w-fit text-xs text-muted-foreground">
                              <summary className="cursor-pointer rounded-full border border-border bg-surface px-3 py-1.5">
                                Orchestration details
                              </summary>
                              <div className="mt-2 max-w-2xl rounded-lg border border-border bg-surface p-3">
                                {message.orchestration.agentActions.map((action) => (
                                  <div key={`${message.id}-${action.agent}-${action.action}`} className="flex items-start justify-between gap-3">
                                    <span>
                                      <strong className="text-foreground">{action.agent}</strong>: {action.action}
                                    </span>
                                    {action.requiresApproval && <span className="shrink-0 text-brand">approval</span>}
                                  </div>
                                ))}
                                <div className="mt-2 border-t border-border pt-2">
                                  {message.orchestration.graph.join(' -> ')}
                                </div>
                              </div>
                            </details>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start gap-3">
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                    <Bot className="h-4 w-4 text-brand" />
                  </div>
                  <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
                    <div>LingT team is working.</div>
                    <div className="mt-3 flex gap-2">
                      {teamAgents.slice(0, 5).map((agent) => (
                        <div
                          key={agent.id}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-brand/30 bg-brand-soft"
                          title={`${agent.name} - ${agent.role}`}
                        >
                          <agent.icon className={`h-4 w-4 ${agent.color}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="border-t border-border bg-surface px-4 py-4 md:px-6">
            <div className="mx-auto max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-brand hover:text-brand"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage();
                }}
                className="flex gap-2 rounded-xl border border-border bg-background p-2"
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask Ling to plan, remember, schedule, or draft..."
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                />
                <button className="rounded-lg bg-brand p-3 text-white" type="submit" aria-label="Send">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </section>

        <aside className="hidden overflow-y-auto bg-surface-warm p-5 lg:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">LingT team</p>
            <h2 className="mt-2 font-display text-2xl">Quiet until needed.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Agents wake up from the conversation and hand work back to Ling for approval.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {teamAgents.map((agent) => {
              const active = activeAgents.some((item) => item.id === agent.id);
              return (
                <div key={agent.id} className="flex items-center gap-3">
                  <div
                    className={
                      active
                        ? 'flex h-10 w-10 items-center justify-center rounded-full border border-brand/30 bg-brand-soft'
                        : 'flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface'
                    }
                  >
                    <agent.icon className={`h-4 w-4 ${agent.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{agent.name}</span>
                      <span className={active ? 'text-xs text-brand' : 'text-xs text-muted-foreground'}>
                        {active ? 'active' : 'idle'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{agent.role}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-border pt-5">
            {!latestHasWork ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Send a deadline, email, meeting note, or messy list. Ling will build the workspace from there.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xl font-semibold">{latestResult?.tasks.length ?? 0}</div>
                  <div className="text-[11px] text-muted-foreground">tasks</div>
                </div>
                <div>
                  <div className="text-xl font-semibold">{latestResult?.openLoops.length ?? 0}</div>
                  <div className="text-[11px] text-muted-foreground">loops</div>
                </div>
                <div>
                  <div className="text-xl font-semibold">{latestResult?.approvals.length ?? 0}</div>
                  <div className="text-[11px] text-muted-foreground">approvals</div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
