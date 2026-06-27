'use client';

import AppShell from '@/components/AppShell';
import {firebaseAuth} from '@/lib/firebase/client';
import {onAuthStateChanged, type User} from 'firebase/auth';
import {
  CalendarCheck,
  CheckCircle2,
  ExternalLink,
  Inbox,
  Plug,
  ShieldCheck,
} from 'lucide-react';
import {useEffect, useMemo, useState} from 'react';

interface GoogleStatus {
  connected: boolean;
  scope: string;
  connectedAt: string | null;
  oauthConfigured: boolean;
  serverStorageConfigured: boolean;
  error: string | null;
}

export default function IntegrationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://your-cloud-run-url'}/api/gmail/webhook`;

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

  useEffect(() => {
    if (!user) {
      return;
    }

    fetch(`/api/integrations/google/status?userId=${encodeURIComponent(user.uid)}`)
      .then((response) => {
        if (!response.ok) throw new Error('Unable to read Google integration status.');
        return response.json() as Promise<GoogleStatus>;
      })
      .then((nextStatus) => {
        setStatus(nextStatus);
        setError(nextStatus.error || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load status.'))
      .finally(() => setLoading(false));
  }, [user]);

  const connectHref = useMemo(() => {
    if (!user) return '';
    return `/api/integrations/google/connect?userId=${encodeURIComponent(user.uid)}`;
  }, [user]);
  const canConnect = Boolean(user && status?.oauthConfigured && status?.serverStorageConfigured);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-brand">Integrations</p>
            <h1 className="mt-2 font-display text-4xl">Connect Gmail and Calendar.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Ling can read approved Gmail context, extract commitments, and create Calendar changes only through connected Google access and explicit automation settings.
            </p>
          </div>
          <div className="w-fit rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
            {loading ? 'Checking...' : status?.connected ? 'Google connected' : 'Not connected'}
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
                  Grants LingT Gmail read access and Calendar read/write access through Google OAuth.
                </p>
              </div>
              {status?.connected && <CheckCircle2 className="h-5 w-5 text-success" />}
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
                {status?.connected ? 'Reconnect Google' : 'Connect Google'}
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
                Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` to `.env.local`, then restart the dev server.
              </div>
            )}

            {user && status && !status.serverStorageConfigured && (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                Add Firebase Admin credentials so the server can store Google refresh tokens without Firestore permission errors.
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
              <p>Gmail webhook writes tasks and open loops into Firestore for the signed-in user.</p>
              <p>Calendar events are created only when `LINGT_AUTOCOMMIT_CALENDAR=true`, the webhook payload allows it, and Gemini marks the action high confidence without approval required.</p>
              <p>Email replies are drafted inside LingT. The app does not send Gmail replies.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5 md:col-span-2">
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-[#ea4335]" />
                  <h2 className="text-xl font-semibold">Gmail trigger</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Use the Apps Script in `docs/apps-script/gmail-agent-trigger.js`. It polls unread mail, sends the email content to LingT, and labels processed threads.
                </p>
                <div className="mt-4 rounded-lg border border-border bg-background p-4 font-mono text-xs leading-6 text-muted-foreground">
                  <div>Webhook URL: {webhookUrl}</div>
                  <div>User ID: {user?.uid || 'sign in to view your uid'}</div>
                  <div>Header: x-lingt-webhook-secret</div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface-warm p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarCheck className="h-4 w-4 text-[#34a853]" />
                  Calendar maintenance
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Approved actions use `/api/calendar/commit`. Automatic commits are deliberately disabled unless the deployment opts in.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
