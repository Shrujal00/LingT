'use client';

import AppShell from '@/components/AppShell';
import {Send, Sparkles} from 'lucide-react';
import {useState} from 'react';

const starters = [
  'Plan my next 3 hours realistically.',
  'Turn these notes into tasks and open loops.',
];

export default function Home() {
  const [input, setInput] = useState('');

  function openChat(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    window.location.href = `/chat?msg=${encodeURIComponent(trimmed)}`;
  }

  return (
    <AppShell>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
        {/* Animated background decorative glow */}
        <div className="absolute top-1/4 left-1/2 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-soft/40 blur-3xl animate-lingt-drift" />
        
        <div className="w-full max-w-2xl">
          <div className="mb-8 flex justify-center animate-lingt-rise">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[conic-gradient(from_180deg,#4285f4,#34a853,#fbbc04,#ea4335,#4285f4)] shadow-md transition-transform duration-300 hover:rotate-12">
              <span className="rounded-full bg-white px-2 py-1 font-display text-xl text-brand select-none">L</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold tracking-wider uppercase text-brand animate-lingt-rise animation-delay-75">LingT</p>
            <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl animate-lingt-rise animation-delay-150">
              Turn life chaos into a rescue plan.
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground animate-lingt-rise animation-delay-225">
              Start with a deadline, a messy task list, meeting notes, or one thing you forgot.
            </p>
          </div>

          <form
            className="mt-8 flex gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm transition-all duration-300 focus-within:border-brand focus-within:shadow-[0_0_20px_rgba(26,115,232,0.15)] animate-lingt-scale-in animation-delay-300"
            onSubmit={(event) => {
              event.preventDefault();
              openChat(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Example: I have a project submission tomorrow and I need a plan..."
              className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="submit"
              aria-label="Start chat"
              className="rounded-xl bg-brand p-3 text-white transition-all duration-300 hover:bg-brand-deep hover:scale-[1.04] active:scale-[0.96]"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2 animate-lingt-scale-in animation-delay-375">
            {starters.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => openChat(starter)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.8 text-xs text-muted-foreground transition-all duration-300 hover:border-brand/40 hover:text-brand hover:-translate-y-0.5 hover:bg-brand-soft/10 active:scale-[0.97]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {starter}
              </button>
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
