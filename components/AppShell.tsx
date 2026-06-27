'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Home,
  ListChecks,
  Menu,
  MessageCircle,
  Mic,
  PenLine,
  Plug,
  Repeat,
  Search,
  X,
} from 'lucide-react';
import {useState} from 'react';
import {cn} from '@/lib/utils';
import AuthPanel from './AuthPanel';

interface AppShellProps {
  children: React.ReactNode;
}

const navigation = [
  {name: 'Home', href: '/', icon: Home},
  {name: 'Chat', href: '/chat', icon: MessageCircle},
  {name: 'Workspace', href: '/workspace', icon: ListChecks},
  {name: 'Integrations', href: '/integrations', icon: Plug},
];

const quickAreas = [
  {name: 'Mira', role: 'Memory', icon: Search, color: 'text-[#8430ce]'},
  {name: 'Rumi', role: 'Routines', icon: Repeat, color: 'text-[#64748b]'},
  {name: 'Nia', role: 'Meetings', icon: Mic, color: 'text-[#4285f4]'},
  {name: 'Dax', role: 'Drafts', icon: PenLine, color: 'text-[#fbbc04]'},
  {name: 'Cal', role: 'Calendar', icon: Calendar, color: 'text-[#34a853]'},
  {name: 'Remy', role: 'Reminders', icon: Bell, color: 'text-[#ea4335]'},
];

export default function AppShell({children}: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface/85 px-4 py-5 md:flex md:flex-col">
        <Link href="/" className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[conic-gradient(from_180deg,#4285f4,#34a853,#fbbc04,#ea4335,#4285f4)] text-base font-semibold">
            <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-brand">L</span>
          </div>
          <div>
            <div className="font-display text-2xl leading-none text-foreground">LingT</div>
            <div className="mt-1 text-xs text-muted-foreground">Ling + agentic team</div>
          </div>
        </Link>

        <nav className="mt-8 space-y-1">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition',
                  active
                    ? 'bg-brand-soft text-brand-deep'
                    : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8">
          <div className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            LingT team
          </div>
          <div className="mt-3 space-y-2">
            {quickAreas.map((area) => (
              <div key={area.name} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  <area.icon className={cn('h-4 w-4', area.color)} />
                </div>
                <div className="min-w-0">
                  <div className="font-medium leading-tight">{area.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{area.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto space-y-3">
          <AuthPanel />
          <div className="rounded-lg border border-border bg-surface-muted p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Firebase connected
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Google sign-in and Firestore persistence are active.
            </p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[conic-gradient(from_180deg,#4285f4,#34a853,#fbbc04,#ea4335,#4285f4)] text-sm font-semibold">
            <span className="rounded bg-white/95 px-1.5 py-0.5 text-brand">L</span>
          </div>
          <span className="font-display text-xl">LingT</span>
        </Link>
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setMobileOpen((open) => !open)}
          className="rounded-lg border border-border bg-surface p-2"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-x-3 top-16 z-50 rounded-xl border border-border bg-surface p-3 shadow-xl md:hidden">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm"
            >
              <item.icon className="h-4 w-4 text-brand" />
              {item.name}
            </Link>
          ))}
        </div>
      )}

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
