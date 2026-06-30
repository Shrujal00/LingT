'use client';

import AppShell from '@/components/AppShell';
import { useWorkspaceSync } from '@/hooks/use-workspace-sync';
import {
  Bot,
  Calendar,
  Database,
  Loader2,
  Mail,
  Mic,
  Plug,
  Repeat,
  Search,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';
import {useState, useEffect, useRef} from 'react';

export default function Home() {
  const {
    user,
    loading,
    workspace,
  } = useWorkspaceSync();

  const { tasks, openLoops, habits } = workspace;

  const [input, setInput] = useState('');
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [gmailStatus, setGmailStatus] = useState('');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryAnswer, setMemoryAnswer] = useState('');
  const [searchingMemory, setSearchingMemory] = useState(false);

  // Voice Speech recognition states
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Check Google integration status
  useEffect(() => {
    async function checkGoogleStatus() {
      if (!user) return;
      try {
        const response = await fetch(`/api/integrations/google/status?userId=${encodeURIComponent(user.uid)}`);
        if (response.ok) {
          const data = await response.json();
          setIsGoogleConnected(Boolean(data.connected));
        }
      } catch (err) {
        console.error('Failed to query google status', err);
      }
    }
    checkGoogleStatus();
  }, [user]);

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

  function openChat(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    window.location.href = `/chat?msg=${encodeURIComponent(trimmed)}`;
  }

  // Trigger Gmail Sync
  async function syncGmail() {
    if (!user || !isGoogleConnected) return;
    setSyncingGmail(true);
    setGmailStatus('Connecting to Gmail API...');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.uid }),
      });
      const data = await response.json();
      if (response.ok) {
        setGmailStatus(`Synced! Extracted ${data.extractedTasksCount ?? 0} task(s) and ${data.extractedLoopsCount ?? 0} open loop(s) from unread emails.`);
      } else {
        setGmailStatus(data.error || 'Failed to analyze inbox.');
      }
    } catch {
      setGmailStatus('Inbox analysis failed.');
    } finally {
      setSyncingGmail(false);
    }
  }

  // Quick Semantic Search
  async function searchMemory() {
    const query = memoryQuery.trim();
    if (!user || !query) return;
    setSearchingMemory(true);
    setMemoryAnswer('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/memory/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.uid, query }),
      });
      if (response.ok) {
        const data = await response.json();
        setMemoryAnswer(data.answer || 'No matching context found.');
      }
    } catch {
      setMemoryAnswer('Search failed.');
    } finally {
      setSearchingMemory(false);
    }
  }

  const activeLoops = openLoops.filter(l => l.status === 'open').length;

  const agentFleet = [
    { name: 'Ling', role: 'Lead Agent', desc: 'State Coordinator', status: 'Online', color: 'text-brand border-brand/20 bg-brand-soft' },
    { name: 'Tara', role: 'Task Ops', desc: 'Priority Mapping', status: 'Online', color: 'text-orange-500 border-orange-500/20 bg-orange-50' },
    { name: 'Cal', role: 'Calendar Guard', desc: 'Conflict Scan', status: isGoogleConnected ? 'Online' : 'Standby', color: 'text-[#34a853] border-[#34a853]/20 bg-green-50' },
    { name: 'Mira', role: 'Memory DB', desc: 'Semantic Query', status: 'Online', color: 'text-[#8430ce] border-[#8430ce]/20 bg-purple-50' },
    { name: 'Nia', role: 'Meeting Pro', desc: 'Action Extraction', status: 'Online', color: 'text-pink-500 border-pink-500/20 bg-pink-50' },
    { name: 'Dax', role: 'Drafting Studio', desc: 'Template Prep', status: 'Online', color: 'text-yellow-600 border-yellow-500/20 bg-yellow-50' },
    { name: 'Remy', role: 'Escalations', desc: 'Proactive Alert', status: 'Online', color: 'text-danger border-danger/20 bg-danger-soft' },
  ];

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 lg:px-8 space-y-8 animate-lingt-rise">
        
        {/* Cockpit Header with animated floating elements */}
        <div className="relative rounded-3xl border border-border/80 bg-surface/40 backdrop-blur-md p-6 md:p-8 overflow-hidden shadow-sm">
          <div className="absolute top-1/4 left-3/4 -z-10 h-64 w-64 rounded-full bg-brand-soft/20 blur-3xl animate-pulse" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-deep border border-brand/10">
                <Sparkles className="h-3.5 w-3.5" />
                Active Google ADK Agent Fleet
              </div>
              <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl text-foreground">
                AI Command Center
              </h1>
              <p className="max-w-xl text-sm text-muted-foreground leading-6">
                Welcome to your agentic headquarters. Dictate tasks, sync integrations, search memories, or check active agent status.
              </p>
            </div>

            {/* Quick Capture Input Box */}
            <div className="w-full max-w-md shrink-0">
              <form
                className="flex gap-2 rounded-2xl border border-border bg-background p-1.5 shadow-sm transition focus-within:border-brand/40 focus-within:shadow-[0_0_15px_rgba(26,115,232,0.1)]"
                onSubmit={(event) => {
                  event.preventDefault();
                  openChat(input);
                }}
              >
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Task, transcript, or memory check..."
                  className="min-w-0 flex-1 bg-transparent px-3 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`rounded-lg p-2.5 transition flex items-center justify-center ${
                    isListening ? 'bg-danger text-white animate-pulse' : 'bg-surface hover:bg-surface-muted text-muted-foreground'
                  }`}
                  title="Speech-to-Text Dictation"
                >
                  <Mic className="h-3.5 w-3.5" />
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand p-2.5 text-white transition hover:bg-brand-deep active:scale-[0.96]"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
              <p className="mt-1.5 text-[10px] text-muted-foreground text-center md:text-left">
                Type or dictate to route straight to the Chat companion.
              </p>
            </div>
          </div>
        </div>

        {/* Live Workspace Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border bg-surface/50 p-4 transition-all duration-300 hover:border-brand/30 hover:scale-[1.01]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Tasks</div>
            <div className="mt-1 text-2xl font-bold text-foreground">{loading ? <Loader2 className="h-6 w-6 animate-spin text-brand" /> : tasks.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">Synced in Firestore</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface/50 p-4 transition-all duration-300 hover:border-brand/30 hover:scale-[1.01]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open Loops</div>
            <div className="mt-1 text-2xl font-bold text-danger">{loading ? <Loader2 className="h-6 w-6 animate-spin text-brand" /> : activeLoops}</div>
            <div className="mt-1 text-xs text-muted-foreground">Unresolved emails/actions</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface/50 p-4 transition-all duration-300 hover:border-brand/30 hover:scale-[1.01]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Google Integration</div>
            <div className={`mt-1 text-sm font-bold flex items-center gap-1.5 ${isGoogleConnected ? 'text-success' : 'text-danger'}`}>
              <Plug className="h-4 w-4" />
              {isGoogleConnected ? 'Connected' : 'Disconnected'}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              {isGoogleConnected ? 'Calendar Sync Live' : <a href="/integrations" className="underline font-medium text-brand">Connect Account</a>}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface/50 p-4 transition-all duration-300 hover:border-brand/30 hover:scale-[1.01]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Autopilot Status</div>
            <div className="mt-1 text-sm font-bold text-brand flex items-center gap-1">
              <Bot className="h-4 w-4" />
              {user ? 'Monitoring' : 'Offline'}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">Background monitors enabled</div>
          </div>
        </div>

        {/* Coordinated Agent Fleet Grid */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Coordinated Agent Fleet (Google ADK)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {agentFleet.map((agent) => (
              <div key={agent.name} className="rounded-xl border border-border bg-surface p-3 text-center space-y-1.5 flex flex-col justify-between">
                <div className="flex justify-center">
                  <div className={`h-8 w-8 rounded-full border flex items-center justify-center font-bold text-xs ${agent.color}`}>
                    {agent.name[0]}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">{agent.name} ({agent.role})</div>
                  <div className="text-[10px] text-muted-foreground">{agent.desc}</div>
                </div>
                <div className="pt-1.5 border-t border-border/40">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    agent.status === 'Online' ? 'bg-success-soft text-success' : 'bg-surface-muted text-muted-foreground'
                  }`}>
                    {agent.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Autopilot Quick Actions Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Gmail Autopilot Scanner Panel */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-border/40 pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Gmail Inbox Scanner Autopilot</h3>
                <p className="text-[11px] text-muted-foreground">Query unread emails, extract commitments, and sync loops.</p>
              </div>
            </div>

            {!isGoogleConnected ? (
              <div className="rounded-xl border border-[#4285f4]/20 bg-[#4285f4]/5 p-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground leading-5">
                  Link your Gmail account to let Nia (Meeting Agent) run inbox auto-scanning.
                </p>
                <a
                  href="/integrations"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#4285f4] px-3.5 py-1.8 text-xs font-semibold text-white hover:bg-[#357ae8]"
                >
                  Connect Gmail Integration
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={syncingGmail}
                  onClick={syncGmail}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-xs font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50"
                >
                  {syncingGmail ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Repeat className="h-4.5 w-4.5" />}
                  Scan Gmail Inbox
                </button>
                {gmailStatus && (
                  <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground leading-5">
                    {gmailStatus}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Semantic Life Memory Panel */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-3 border-b border-border/40 pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8430ce]/10 text-[#8430ce]">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Life Memory Search</h3>
                <p className="text-[11px] text-muted-foreground">Run a quick semantic check against past notes, schedules, or updates.</p>
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                searchMemory();
              }}
              className="flex gap-2 rounded-xl border border-border bg-background p-2 transition focus-within:border-brand/40"
            >
              <input
                value={memoryQuery}
                onChange={(event) => setMemoryQuery(event.target.value)}
                placeholder="What did I promise or schedule?"
                className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"
              />
              <button
                type="submit"
                disabled={!user || !memoryQuery.trim() || searchingMemory}
                className="rounded-lg bg-brand px-3.5 py-1.8 text-xs font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50 shrink-0"
              >
                {searchingMemory ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </button>
            </form>

            {memoryAnswer && (
              <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground leading-5">
                <strong>Mira:</strong> {memoryAnswer}
              </div>
            )}
          </div>

        </div>

      </main>
    </AppShell>
  );
}
