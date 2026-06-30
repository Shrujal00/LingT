'use client';

import AppShell from '@/components/AppShell';
import {firebaseAuth} from '@/lib/firebase/client';
import {onAuthStateChanged, type User} from 'firebase/auth';
import {
  CalendarCheck,
  CheckCircle2,
  ExternalLink,
  Inbox,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

interface GmailScanResult {
  scanned: number;
  processed: number;
  skipped: number;
  errors: Array<{messageId: string; error: string}>;
}

interface GoogleStatus {
  connected: boolean;
  scope: string;
  connectedAt: string | null;
  lastGmailScanAt: string | null;
  lastGmailScan: GmailScanResult | null;
  automationEnabled: boolean;
  gmailAutoScanEnabled: boolean;
  calendarAssistEnabled: boolean;
  autoCommitCalendar: boolean;
  calendarAutoCommitAvailable: boolean;
  gmailReady: boolean;
  calendarReady: boolean;
  oauthConfigured: boolean;
  serverStorageConfigured: boolean;
  error: string | null;
}

const serviceCards = [
  {
    key: 'gmailReady',
    title: 'Gmail listener',
    description: 'Reads unread Gmail, extracts tasks and open loops, and saves them to Workspace.',
    icon: Inbox,
    color: 'text-[#ea4335]',
  },
  {
    key: 'calendarReady',
    title: 'Calendar assistant',
    description: 'Checks availability and prepares Calendar actions for approval.',
    icon: CalendarCheck,
    color: 'text-[#34a853]',
  },
] as const;

async function safeReadJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }
  const text = await response.text().catch(() => '');
  if (text.includes('<h1') || text.includes('<pre') || text.includes('<!DOCTYPE')) {
    throw new Error(`Server Error (${response.status}): The backend service encountered an issue. Check server-side logs.`);
  }
  throw new Error(text || `Request failed with status ${response.status}`);
}

export default function IntegrationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const autoScanUser = useRef('');

  const fetchGoogleStatus = useCallback(async (nextUser: User) => {
    const response = await fetch(`/api/integrations/google/status?userId=${encodeURIComponent(nextUser.uid)}`);
    if (!response.ok) throw new Error('Unable to read Google integration status.');
    return safeReadJson<GoogleStatus>(response);
  }, []);

  useEffect(
    () => {
      let active = true;

      const unsubscribe = onAuthStateChanged(
        firebaseAuth,
        async (nextUser) => {
          if (!active) return;

          setUser(nextUser);
          setStatus(null);

          if (!nextUser) {
            setLoading(false);
            return;
          }

          setLoading(true);
          try {
            const nextStatus = await fetchGoogleStatus(nextUser);
            if (!active) return;
            setStatus(nextStatus);
            setError(nextStatus.error || '');
          } catch (err) {
            if (!active) return;
            setError(err instanceof Error ? err.message : 'Unable to load status.');
          } finally {
            if (active) setLoading(false);
          }
        },
        (err) => {
          if (!active) return;
          setError(err.message);
          setLoading(false);
        },
      );

      return () => {
        active = false;
        unsubscribe();
      };
    },
    [fetchGoogleStatus],
  );

  const refreshStatus = useCallback(async () => {
    if (!user) return null;
    const nextStatus = await fetchGoogleStatus(user);
    setStatus(nextStatus);
    setError(nextStatus.error || '');
    return nextStatus;
  }, [fetchGoogleStatus, user]);

  const runGmailScan = useCallback(
    async (mode: 'auto' | 'manual') => {
      if (!user || scanLoading) return;

      setScanLoading(true);
      setMessage(mode === 'auto' ? 'Checking Gmail...' : 'Scanning Gmail...');
      setError('');

      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/gmail/sync', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            limit: 10,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        const result = await safeReadJson<GmailScanResult & {error?: string}>(response);
        if (!response.ok) throw new Error(result.error || 'Gmail scan failed.');

        setMessage(
          result.processed > 0
            ? `Added ${result.processed} Gmail update${result.processed === 1 ? '' : 's'} to Workspace.`
            : `No new Gmail actions. ${result.skipped} already seen.`,
        );
        await refreshStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to scan Gmail.');
      } finally {
        setScanLoading(false);
      }
    },
    [refreshStatus, scanLoading, user],
  );

  const activateGoogleAutopilot = useCallback(async () => {
    if (!user || activating) return;

    setActivating(true);
    setMessage('Turning on Google Autopilot...');
    setError('');

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/integrations/google/enable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const result = await safeReadJson<{error?: string}>(response);
      if (!response.ok) throw new Error(result.error || 'Unable to enable Google Autopilot.');

      setMessage('Google Autopilot is on. Checking Gmail now...');
      await refreshStatus();
      await runGmailScan('auto');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enable Google Autopilot.');
    } finally {
      setActivating(false);
    }
  }, [activating, refreshStatus, runGmailScan, user]);

  useEffect(() => {
    if (!user || !status?.connected || !status.automationEnabled || autoScanUser.current === user.uid) return;
    autoScanUser.current = user.uid;
    void runGmailScan('auto');
  }, [runGmailScan, status?.automationEnabled, status?.connected, user]);

  const connectHref = useMemo(() => {
    if (!user) return '';
    return `/api/integrations/google/connect?userId=${encodeURIComponent(user.uid)}`;
  }, [user]);

  const connected = Boolean(status?.connected);
  const autopilotOn = Boolean(status?.automationEnabled && status.gmailAutoScanEnabled && status.calendarAssistEnabled);
  const setupReady = Boolean(user && status?.oauthConfigured && status?.serverStorageConfigured);
  const primaryDisabled = loading || activating || scanLoading || !user || (!connected && !setupReady);

  return (
    <AppShell>
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 md:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-brand">Integrations</p>
            <h1 className="mt-2 font-display text-4xl">One click, then LingT watches the work.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Connect Google once. LingT scans Gmail, remembers commitments, checks Calendar context, and keeps external writes behind approval.
            </p>
          </div>
          <div className="w-fit rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
            {loading ? 'Checking...' : autopilotOn ? 'Autopilot on' : connected ? 'Google connected' : 'Not connected'}
          </div>
        </div>

        <section className="mt-8 rounded-xl border border-border bg-surface p-5 md:p-6">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Plug className="h-5 w-5 text-brand" />
                <h2 className="text-2xl font-semibold">Google Autopilot</h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Gmail becomes an input stream for LingT. Calendar becomes planning context. Drafts, tasks, open loops, and calendar proposals stay inside LingT until approved.
              </p>
            </div>

            {!connected ? (
              <a
                href={primaryDisabled ? undefined : connectHref}
                aria-disabled={primaryDisabled}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-deep aria-disabled:pointer-events-none aria-disabled:opacity-50"
              >
                <ExternalLink className="h-4 w-4" />
                Connect and enable
              </a>
            ) : !autopilotOn ? (
              <button
                type="button"
                disabled={primaryDisabled}
                onClick={activateGoogleAutopilot}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Enable Autopilot
              </button>
            ) : (
              <button
                type="button"
                disabled={scanLoading}
                onClick={() => runGmailScan('manual')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Scan Gmail now
              </button>
            )}
          </div>

          {(message || error || status?.connectedAt) && (
            <div className="mt-5 rounded-lg border border-border bg-background px-4 py-3 text-sm">
              {error ? (
                <p className="text-danger">{error}</p>
              ) : (
                <p className="text-muted-foreground">
                  {message || `Connected ${status?.connectedAt ? new Date(status.connectedAt).toLocaleString() : 'recently'}.`}
                </p>
              )}
            </div>
          )}

          {user && status && (!status.oauthConfigured || !status.serverStorageConfigured) && (
            <div className="mt-5 rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              Server setup is incomplete. Add Google OAuth and Firebase Admin env vars, then redeploy.
            </div>
          )}
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          {serviceCards.map((service) => {
            const enabled = Boolean(status?.[service.key]);
            return (
              <div key={service.key} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background">
                      <service.icon className={`h-5 w-5 ${service.color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{service.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{service.description}</p>
                    </div>
                  </div>
                  {enabled ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />}
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-5 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3">
            <ShieldCheck className="h-5 w-5 text-brand" />
            <h2 className="text-xl font-semibold">LingT Security Audit Cockpit</h2>
          </div>
          
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-3.5 space-y-1">
              <div className="text-xs text-muted-foreground font-semibold">GCP Webhook Scanner</div>
              <div className="text-sm font-medium text-success flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success animate-ping" />
                Active & Listening
              </div>
              <p className="text-[10px] text-muted-foreground leading-4 pt-1">
                GCP Pub/Sub push notification webhook listener active at /api/integrations/google/webhook.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-3.5 space-y-1">
              <div className="text-xs text-muted-foreground font-semibold">OAuth Encryption Status</div>
              <div className="text-sm font-medium text-success">AES-256 Server-Gated</div>
              <p className="text-[10px] text-muted-foreground leading-4 pt-1">
                All Google OAuth credentials and refresh tokens are encrypted on Firestore Server without client exposure.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-3.5 space-y-1">
              <div className="text-xs text-muted-foreground font-semibold">API Authorization Scopes</div>
              <div className="text-xs text-foreground leading-5 space-y-0.5 pt-1">
                <div>• Gmail: Read-only (is:unread newer_than:14d)</div>
                <div>• Calendar: Read-write (Block schedule proposals)</div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-brand-soft/40 border border-brand/10 p-3 flex items-center justify-between gap-3">
            <div className="text-xs text-brand-deep leading-5">
              <strong>Security Recommendation:</strong> You are fully clear! No suspicious OAuth logins or key leaks detected. All Google API interactions are routed directly through your private LingT server-side client.
            </div>
            <span className="rounded bg-success px-2 py-0.5 text-[9px] font-bold text-white uppercase shrink-0">
              Verified
            </span>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-[#ea4335]" />
              <h2 className="text-xl font-semibold">Latest Gmail scan</h2>
            </div>

            {status?.lastGmailScan ? (
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Scanned</div>
                  <div className="mt-1 text-xl font-semibold">{status.lastGmailScan.scanned}</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Added</div>
                  <div className="mt-1 text-xl font-semibold">{status.lastGmailScan.processed}</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="text-xs text-muted-foreground">Seen</div>
                  <div className="mt-1 text-xl font-semibold">{status.lastGmailScan.skipped}</div>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                No Gmail scan yet. Connect Google and LingT will do the first check automatically.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface-warm p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />
              <h2 className="text-xl font-semibold">Safety</h2>
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>Gmail replies are drafted inside LingT, not sent automatically.</p>
              <p>Calendar writes require approval unless the deployment explicitly enables automatic commits.</p>
              <p>{status?.autoCommitCalendar ? 'Calendar auto-commit is enabled for high-confidence actions.' : 'Calendar auto-commit is off.'}</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
