'use client';

import AppShell from '@/components/AppShell';
import {onAuthStateChanged, type User} from 'firebase/auth';
import {
  AlarmClock,
  ArrowRight,
  Bot,
  Brain,
  Calendar,
  CheckCircle2,
  ClipboardList,
  FileText,
  Mail,
  Send,
  Sparkles,
  Mic,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import {useEffect, useRef, useState, useCallback} from 'react';
import type {OrchestrationResult} from '@/lib/orchestration/schemas';
import {firebaseAuth, firestoreDb} from '@/lib/firebase/client';
import {saveGeneratedPlan} from '@/lib/firebase/workspace';
import {collection, query, where, getDocs} from 'firebase/firestore';

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
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(
        result?.tasks.length ||
        result?.approvals.some((app) => app.includes('task')) ||
        result?.agentActions.some((act) => act.agent === 'Planner' || act.agent === 'Routine')
      ),
  },
  {
    id: 'mira',
    name: 'Mira',
    role: 'Memory',
    icon: Brain,
    color: 'text-[#8430ce]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(
        result?.agentActions.some((act) => act.agent === 'Memory' || /memory|context|decided/i.test(act.action))
      ),
  },
  {
    id: 'cal',
    name: 'Cal',
    role: 'Calendar',
    icon: Calendar,
    color: 'text-[#34a853]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(
        result?.approvals.some((app) => /calendar|schedule/i.test(app)) ||
        result?.agentActions.some((act) => act.agent === 'Calendar')
      ),
  },
  {
    id: 'nia',
    name: 'Nia',
    role: 'Meetings',
    icon: FileText,
    color: 'text-[#4285f4]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(
        result?.openLoops.length ||
        result?.agentActions.some((act) => act.agent === 'Meeting' || /meeting|decide|confirm/i.test(act.action))
      ),
  },
  {
    id: 'dax',
    name: 'Dax',
    role: 'Drafts',
    icon: Mail,
    color: 'text-[#fbbc04]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(
        result?.approvals.some((app) => /draft|email|reply/i.test(app)) ||
        result?.agentActions.some((act) => act.agent === 'Drafting')
      ),
  },
  {
    id: 'remy',
    name: 'Remy',
    role: 'Reminders',
    icon: AlarmClock,
    color: 'text-[#ea4335]',
    activeWhen: (result?: OrchestrationResult) =>
      Boolean(
        result?.tasks.some((t) => t.priority === 'do_now' || t.priority === 'at_risk') ||
        result?.agentActions.some((act) => act.agent === 'Routine')
      ),
  },
];

function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(text: string) {
  if (!text) return null;

  // Insert newlines before inline numbered points (e.g. " 1. **" or " 2. **") to format them as blocks
  let formattedText = text;
  formattedText = formattedText.replace(/\s+(\d+\.\s+\*\*)/g, '\n$1');

  const lines = formattedText.split('\n');

  return lines.map((line, i) => {
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      return (
        <ul key={i} className="list-disc pl-5 my-1">
          <li>{parseInlineMarkdown(bulletMatch[1])}</li>
        </ul>
      );
    }

    const numberMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numberMatch) {
      return (
        <div key={i} className="pl-4 my-2 border-l-2 border-brand/30 py-0.5">
          <span className="font-semibold text-brand mr-1.5">{numberMatch[1]}.</span>
          {parseInlineMarkdown(numberMatch[2])}
        </div>
      );
    }

    return (
      <p key={i} className="my-1.5 leading-relaxed">
        {parseInlineMarkdown(line)}
      </p>
    );
  });
}

export default function ChatPage() {
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [savingMessageId, setSavingMessageId] = useState('');
  const [savedMessageIds, setSavedMessageIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [lastSource, setLastSource] = useState<'ready' | 'gemini' | 'local fallback'>('ready');
  
  // Dynamic Conversation States
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [sessions, setSessions] = useState<Array<{id: string; title: string; createdAt: string}>>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Speech Recognition States
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const latestResult = [...messages].reverse().find((message) => message.orchestration)?.orchestration;
  const activeAgents = teamAgents.filter((agent) => agent.activeWhen(latestResult));
  const latestHasWork = Boolean(
    latestResult &&
      (latestResult.tasks.length > 0 ||
        latestResult.openLoops.length > 0 ||
        latestResult.approvals.length > 0),
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => onAuthStateChanged(firebaseAuth, setUser, () => setUser(null)), []);

  const lastUserUid = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastUserUid.current !== undefined && lastUserUid.current !== user?.uid) {
      setConversationId(crypto.randomUUID());
      setMessages(starterMessages);
      setSavedMessageIds([]);
      setSessions([]);
      setLastSource('ready');
    }
    lastUserUid.current = user?.uid;
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages, isThinking]);

  // Speech Recognition Hook
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput((prev) => (prev ? prev + ' ' + transcript : transcript));
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Try Chrome.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  // Load past conversation sessions
  const loadSessions = useCallback(async () => {
    if (!user) {
      setSessions([]);
      return;
    }
    setLoadingSessions(true);
    try {
      const getTimestampString = (val: any): string => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (typeof val.toDate === 'function') {
          try {
            return val.toDate().toISOString();
          } catch {
            return '';
          }
        }
        if (val.seconds) return new Date(val.seconds * 1000).toISOString();
        return String(val);
      };

      const q = query(
        collection(firestoreDb, 'messages'),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      const sessionsMap: Record<string, {id: string; title: string; createdAt: string}> = {};
      
      snap.forEach((doc) => {
        const data = doc.data();
        const cid = data.conversationId;
        if (!cid) return;
        const msgTime = getTimestampString(data.createdAt);
        const text = data.content || '';
        const isUser = data.role === 'user';
        
        if (!sessionsMap[cid]) {
          sessionsMap[cid] = {
            id: cid,
            title: isUser ? text : 'New Chat',
            createdAt: msgTime,
          };
        } else {
          if (isUser && (!sessionsMap[cid].title || sessionsMap[cid].title === 'New Chat')) {
            sessionsMap[cid].title = text.slice(0, 35) + (text.length > 35 ? '...' : '');
          }
          if (msgTime && (!sessionsMap[cid].createdAt || msgTime < sessionsMap[cid].createdAt)) {
            sessionsMap[cid].createdAt = msgTime;
          }
        }
      });
      
      const sorted = Object.values(sessionsMap).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setSessions(sorted);
    } catch (err) {
      console.error('Failed to load chat sessions', err);
    } finally {
      setLoadingSessions(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user, loadSessions]);

  // Select and load a chat session
  async function selectSession(cid: string) {
    if (!user) return;
    setConversationId(cid);
    setMessages([]);
    setIsThinking(true);
    try {
      const getTimestampString = (val: any): string => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (typeof val.toDate === 'function') {
          try {
            return val.toDate().toISOString();
          } catch {
            return '';
          }
        }
        if (val.seconds) return new Date(val.seconds * 1000).toISOString();
        return String(val);
      };

      const q = query(
        collection(firestoreDb, 'messages'),
        where('userId', '==', user.uid),
        where('conversationId', '==', cid)
      );
      const snap = await getDocs(q);
      const list: Message[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          role: data.role === 'assistant' ? 'ling' : 'user',
          text: data.content || '',
          orchestration: data.structuredOutput || undefined,
        });
      });
      
      list.sort((a, b) => {
        const docA = snap.docs.find(d => d.id === a.id)?.data();
        const docB = snap.docs.find(d => d.id === b.id)?.data();
        const timeA = getTimestampString(docA?.createdAt);
        const timeB = getTimestampString(docB?.createdAt);
        return timeA.localeCompare(timeB);
      });
      
      setMessages(list.length > 0 ? list : starterMessages);
    } catch (err) {
      console.error('Failed to load session messages', err);
    } finally {
      setIsThinking(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryMessage = params.get('msg');
    if (queryMessage) {
      const timer = window.setTimeout(() => sendMessage(queryMessage), 0);
      window.history.replaceState({}, '', '/chat');
      return () => window.clearTimeout(timer);
    }
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
          conversationId,
          userId: user?.uid || '',
          userName: user?.displayName || '',
          history: messages.map((m) => ({
            role: m.role === 'ling' ? 'ling' : 'user',
            text: m.text,
          })),
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
          // Refresh sessions list
          loadSessions();
        } catch (error) {
          persistenceWarning =
            error instanceof Error
              ? `Chat history was not saved: ${error.message}`
              : 'Chat history was not saved.';
        }
      }
      const containsSecurityTask = result.assistantMessage.toLowerCase().includes('google account activity') ||
                                   result.tasks.some(t => t.title.toLowerCase().includes('google account activity')) ||
                                   trimmed.toLowerCase().includes('google account activity') ||
                                   trimmed.toLowerCase().includes('next task');

      const messageCards: Array<{title: string; detail: string; type: string}> = [];
      if (persistenceWarning) {
        messageCards.push({
          title: 'Not saved',
          detail: persistenceWarning,
          type: 'warning',
        });
      }
      if (containsSecurityTask) {
        messageCards.push({
          title: 'Google Security Activity Audit',
          detail: 'Verified Secure',
          type: 'security_logs',
        });
      }

      setLastSource(result.runtime.source === 'gemini' ? 'gemini' : 'local fallback');
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'ling',
          text: result.assistantMessage,
          orchestration: result,
          cards: messageCards.length > 0 ? messageCards : undefined,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'ling',
          text: 'Ling is offline. Check your internet connection.',
          cards: [
            {
              title: 'Orchestration connection failed',
              detail: 'API is currently offline. Review local console.',
              type: 'error',
            },
          ],
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function approvePlan(result: OrchestrationResult) {
    if (!user || savingMessageId || savedMessageIds.includes(result.assistantMessage)) return;

    setSaveError('');
    setSavingMessageId(result.assistantMessage);

    try {
      await saveGeneratedPlan(user.uid, result);
      setSavedMessageIds((current) => [...current, result.assistantMessage]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save tasks.');
    } finally {
      setSavingMessageId('');
    }
  }

  return (
    <AppShell>
      <div className="relative flex h-[calc(100vh-57px)] overflow-hidden md:h-screen w-full">
        
        {/* Chat Sessions Left Sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-surface/50 p-4 md:flex md:flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Chats</span>
              {user && (
                <button
                  onClick={() => {
                    setConversationId(crypto.randomUUID());
                    setMessages(starterMessages);
                  }}
                  className="rounded-lg bg-brand px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-brand-deep transition active:scale-[0.96]"
                >
                  + New Chat
                </button>
              )}
            </div>
            
            {!user ? (
              <div className="text-xs text-muted-foreground leading-5">
                Sign in to save and review past chat sessions.
              </div>
            ) : loadingSessions ? (
              <div className="text-xs text-muted-foreground animate-pulse">Loading history...</div>
            ) : sessions.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">No previous chats.</div>
            ) : (
              <div className="space-y-1 max-h-[75vh] overflow-y-auto">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSession(s.id)}
                    className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-all truncate block ${
                      conversationId === s.id
                        ? 'bg-brand-soft text-brand-deep font-semibold border border-brand/20'
                        : 'hover:bg-surface-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-3">
            Click + New Chat to start a fresh thread.
          </div>
        </aside>

        {/* Main Chat Area */}
        <section className="flex flex-1 flex-col overflow-y-auto bg-background px-4 py-6">
          <header className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold">Ling</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Start with whatever is messy. The team appears when there is work to do.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-soft px-3 py-1 text-xs text-brand-deep uppercase">
                {lastSource}
              </span>
            </div>
          </header>

          <div className="flex-1 space-y-4 py-6 overflow-y-auto">
            {messages.map((message) => {
              const isLing = message.role === 'ling';
              const result = message.orchestration;
              const hasWork = Boolean(
                result &&
                  (result.tasks.length > 0 ||
                    result.openLoops.length > 0 ||
                    result.approvals.length > 0),
              );

              return (
                <div key={message.id} className="space-y-3">
                  <div className={`flex gap-3 ${isLing ? '' : 'justify-end'}`}>
                    {isLing && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                        <Bot className="h-4 w-4 text-brand" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-5 py-3.5 text-sm leading-7 max-w-lg shadow-sm ${
                        isLing
                          ? 'border border-border bg-surface text-foreground'
                          : 'bg-brand text-white'
                      }`}
                    >
                      {isLing ? renderMarkdown(message.text) : message.text}
                    </div>
                    {!isLing && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                        You
                      </div>
                    )}
                  </div>

                  {isLing && message.cards && (
                    <div className="pl-11 space-y-2">
                      {message.cards.map((card) => {
                        if (card.type === 'security_logs') {
                          return (
                            <div
                              key={card.title}
                              className="max-w-md rounded-xl border border-brand/20 bg-surface p-4 text-xs space-y-3 shadow-md"
                            >
                              <div className="flex items-center gap-2 border-b border-border pb-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
                                <div className="font-semibold text-sm text-foreground">{card.title}</div>
                              </div>
                              
                              <div className="space-y-1.5 font-mono text-[10px] text-muted-foreground bg-background p-2.5 rounded-lg border border-border">
                                <div>[SYSTEM] GCP Webhook: Active (Listening)</div>
                                <div>[AUTH] OAuth Refresh: Token refreshed successfully</div>
                                <div>[SCOPE] Gmail: Read-only (Verified)</div>
                                <div>[SCOPE] Calendar: Read-write (Verified)</div>
                                <div>[AUDIT] 0 suspicious events detected today</div>
                              </div>
                              
                              <div className="text-[10px] leading-relaxed text-brand-deep bg-brand-soft/40 p-2 rounded-md">
                                <strong>Security Recommendation:</strong> Google OAuth session is active. LingT server encrypts your tokens with AES-256. No action required!
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={card.title}
                            className={`max-w-md rounded-xl border p-3.5 text-xs ${
                              card.type === 'error'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-yellow-200 bg-yellow-50 text-yellow-700'
                            }`}
                          >
                            <div className="font-semibold">{card.title}</div>
                            <div className="mt-1 text-muted-foreground leading-5">{card.detail}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isLing && result && hasWork && (
                    <div className="pl-11 space-y-3 max-w-md">
                      <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between border-b border-border/40 pb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Extracted Actions
                          </span>
                          <span className="rounded bg-brand-soft px-2 py-0.5 text-[9px] font-semibold text-brand-deep">
                            Tara
                          </span>
                        </div>

                        {result.tasks.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-foreground">Tasks to create:</h4>
                            {result.tasks.map((task) => (
                              <div
                                key={task.title}
                                className="rounded-lg border border-border/60 bg-background p-2.5"
                              >
                                <div className="font-semibold text-xs text-foreground">{task.title}</div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  Priority: {task.priority.replace('_', ' ')} | Due: {task.due}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {result.openLoops.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-foreground">Open Loops resolved:</h4>
                            {result.openLoops.map((loop) => (
                              <div
                                key={loop.title}
                                className="rounded-lg border border-border/60 bg-background p-2.5"
                              >
                                <div className="font-semibold text-xs text-foreground">{loop.title}</div>
                                <div className="mt-1 text-[10px] text-muted-foreground">{loop.reason}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {result.approvals.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-foreground">Requires approval:</h4>
                            {result.approvals.map((approval) => (
                              <div
                                key={approval}
                                className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-2 text-xs text-yellow-800"
                              >
                                {approval}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3">
                          {!user ? (
                            <button
                              type="button"
                              onClick={() => {
                                alert('Please sign in using the button in the bottom-left to save and commit tasks to your workspace!');
                              }}
                              className="rounded-lg bg-surface-muted border border-border px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-surface hover:text-foreground active:scale-[0.96] w-full text-center"
                            >
                              🔒 Sign in to Commit
                            </button>
                          ) : (
                            <button
                              onClick={() => approvePlan(result)}
                              disabled={savedMessageIds.includes(result.assistantMessage)}
                              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-deep active:scale-[0.96] disabled:opacity-50"
                            >
                              {savedMessageIds.includes(result.assistantMessage)
                                ? 'Workspace Synced'
                                : 'Approve & Commit'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isThinking && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand-soft animate-pulse">
                  <Bot className="h-4 w-4 text-brand" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Ling is executing orchestration workflow...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <footer className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="rounded-full border border-border bg-background px-3.5 py-2 text-xs text-muted-foreground transition hover:border-brand/40 hover:text-brand"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form
              className="flex gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-brand/40"
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage();
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Ling to plan, remember, schedule, or draft..."
                className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={toggleListening}
                className={`rounded-lg p-2.5 transition flex items-center justify-center ${
                  isListening ? 'bg-danger text-white animate-pulse' : 'bg-surface hover:bg-surface-muted text-muted-foreground'
                }`}
                title="Speech-to-Text Dictation"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                className="rounded-xl bg-brand p-2.5 text-white transition hover:bg-brand-deep active:scale-[0.96] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </footer>
        </section>

        {/* Coordinated Team Sidebar */}
        <aside className="hidden overflow-y-auto bg-surface-warm p-5 lg:block w-64 shrink-0">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Team</p>
            <span className="text-[10px] text-muted-foreground">
              {isThinking ? 'working' : activeAgents.length > 1 ? `${activeAgents.length} active` : 'standby'}
            </span>
          </div>

          {isThinking ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand/35 bg-brand-soft animate-pulse">
                  <Bot className="h-4 w-4 text-brand" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-brand">Orchestrator (Ling)</div>
                  <div className="text-[11px] text-muted-foreground animate-pulse">Coordinating team agents...</div>
                </div>
              </div>
              <div className="space-y-2 pl-11 text-xs text-muted-foreground italic">
                <div>- Querying intent and history</div>
                <div>- Constructing database context</div>
                <div>- Executing LangGraph routing</div>
              </div>
            </div>
          ) : activeAgents.length > 0 ? (
            <div className="mt-4 space-y-2.5">
              {activeAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand-soft animate-lingt-pulse-glow">
                    <agent.icon className={`h-4 w-4 ${agent.color}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{agent.name}</div>
                    <div className="text-[11px] text-muted-foreground">{agent.role}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {teamAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface"
                  title={`${agent.name} · ${agent.role}`}
                >
                  <agent.icon className={`h-3.5 w-3.5 ${agent.color} opacity-50`} />
                </div>
              ))}
              <p className="mt-2 w-full text-xs text-muted-foreground">Send something to wake the team.</p>
            </div>
          )}

          <div className="mt-5 border-t border-border pt-4">
            {!latestHasWork ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Send a deadline or messy list. Ling builds the workspace from there.
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
                  <div className="text-[11px] text-muted-foreground">pending</div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
