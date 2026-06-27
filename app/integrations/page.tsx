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
  oauthConfigured: boolean;
  serverStorageConfigured: boolean;
  error: string | null;
}

export default function IntegrationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [error, setError] = useState('');
  const [scanMessage, setScanMessage] = useState('');
  const autoScanUser = useRef('');

  useEffect(
    () =>
      onAuthStateChanged(firebaseAuth, (nextUser) => {
        setUser(nextUser);
        if (!nextUser) {
          setStatus(null);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }),
    [],
  );

  const fetchGoogleStatus = useCallback(async (nextUser: User) => {
    const response = await fetch(`/api/integrations/google/status?userId=${encodeURIComponent(nextUser.uid)}`);
    if (!response.ok) throw new Error('Unable to read Google integration status.');
    return (await response.json()) as GoogleStatus;
  }, []);

  const applyGoogleStatus = useCallback((nextStatus: GoogleStatus) => {
    setStatus(nextStatus);
    setError(nextStatus.error || '');
  }, []);

  useEffect(() => {
    if (!user) return;

    fetchGoogleStatus(user)
      .then(applyGoogleStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load status.'))
      .finally(() => setLoading(false));
  }, [applyGoogleStatus, fetchGoogleStatus, user]);

  const runGmailScan = useCallback(
    async (mode: 'auto' | 'manual') => {
      if (!user || scanLoading) return;

      setScanLoading(true);
      setScanMessage(mode === 'auto' ? 'Checking Gmail...' : 'Scanning Gmail...');
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

        const result = (await response.json()) as GmailScanResult & {error?: string};
        if (!response.ok) throw new Error(result.error || 'Gmail scan failed.');

        setScanMessage(
          result.processed > 0
            ? `Added ${result.processed} Gmail update${result.processed === 1 ? '' : 's'}.`
            : `No new Gmail actions. ${result.skipped} already seen.`,
        );
        applyGoogleStatus(await fetchGoogleStatus(user));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to scan Gmail.');
      } finally {
        setScanLoading(false);
      }
    },
    [applyGoogleStatus, fetchGoogleStatus, scanLoading, user],
  );

  useEffect(() => {
    if (!user || !status?.connected || autoScanUser.current === user.uid) return;
    autoScanUser.current = user.uid;
    void runGmailScan('auto');
  }, [runGmailScan, status?.connected, user]);

  const connectHref = useMemo(() => {
    if (!user) return '';
    return `/api/integrations/google/connect?userId=${encodeURIComponent(user.uid)}`;
  }, [user]);
  const canConnect = Boolean(user && status?.oauthConfigured && status?.serverStorageConfigured);
  const connected = Boolean(status?.connected);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-brand">Integrations</p>
            <h1 className="mt-2 font-display text-4xl">Google works in the background.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Connect once. LingT can scan Gmail, extract commitments, and prepare Calendar actions through your approved Google access.
            </p>
          </div>
          <div className="w-fit rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
            {loading ? 'Checking...' : connected ? 'Google connected' : 'Not connected'}
          </div>
        </div>

        <section className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Plug className="h-5 w-5 text-brand" />
                  <h2 className="text-xl font-semibold">Google account</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Gmail read access and Calendar read/write access are granted through Google OAuth.
                </p>
              </div>
              {connected && <CheckCircle2 className="h-5 w-5 text-success" />}
            </div>

            {!user && (
              <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                Sign in first, then connect Google services.
              </div>
            )}

            {user && canConnect && (
              <a
                href={connectHref}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
              >
                <ExternalLink className="h-4 w-4" />
                {connected ? 'Reconnect Google' : 'Connect Google'}
              </a>
            )}

            {user && !canConnect && (
              <button
                type="button"
                disabled
                className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-muted-foreground px-4 py-2 text-sm font-medium text-white opacity-60"
              >
                <ExternalLink className="h-4 w-4" />
                Connect Google
              </button>
            )}

            {user && status && !status.oauthConfigured && (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                Google OAuth env vars are missing on the server.
              </div>
            )}

            {user && status && !status.serverStorageConfigured && (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                Firebase Admin credentials are missing on the server.
              </div>
            )}

            {status?.connectedAt && (
              <p className="mt-3 text-xs text-muted-foreground">
                Connected {new Date(status.connectedAt).toLocaleString()}.
              </p>
            )}
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-success" />
              <h2 className="text-xl font-semibold">Automation policy</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>Gmail scans write tasks and open loops into Firestore for the signed-in user.</p>
              <p>Calendar events are created only when automation is explicitly enabled and Gemini returns a high-confidence action.</p>
              <p>Email replies are drafted inside LingT. The app does not send Gmail replies.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 md:col-span-2">
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-[#ea4335]" />
                  <h2 className="text-xl font-semibold">Gmail automation</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  LingT scans unread Gmail through the connected Google account. No Apps Script is required.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!connected || scanLoading}
                    onClick={() => runGmailScan('manual')}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Scan now
                  </button>
                  <span className="text-sm text-muted-foreground">
                    {scanMessage || (status?.lastGmailScanAt ? `Last scan ${new Date(status.lastGmailScanAt).toLocaleString()}` : 'Waiting for Google connection.')}
                  </span>
                </div>

                {status?.lastGmailScan && (
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
                )}
              </div>

              <div className="rounded-lg border border-border bg-surface-warm p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarCheck className="h-4 w-4 text-[#34a853]" />
                  Calendar maintenance
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Approved actions use `/api/calendar/commit`. Fully automatic calendar writes stay behind the deployment flag.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
