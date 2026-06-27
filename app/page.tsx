'use client';

import AppShell from '@/components/AppShell';
import {Send, Sparkles} from 'lucide-react';
import {useState} from 'react';

const starters = [
  'I am close to missing a deadline. Help me recover.',
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
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="mb-8 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[conic-gradient(from_180deg,#4285f4,#34a853,#fbbc04,#ea4335,#4285f4)]">
              <span className="rounded-full bg-white px-2 py-1 font-display text-xl text-brand">L</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm font-medium text-brand">LingT</p>
            <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
              Tell Ling what might slip.
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
              Start with a deadline, a messy task list, meeting notes, or one thing you forgot.
            </p>
          </div>

          <form
            className="mt-8 flex gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              openChat(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Example: My demo is tomorrow and I am not ready..."
              className="min-w-0 flex-1 bg-transparent px-4 text-sm outline-none"
            />
            <button
              type="submit"
              aria-label="Start chat"
              className="rounded-xl bg-brand p-3 text-white transition hover:bg-brand-deep"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {starters.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => openChat(starter)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-brand hover:text-brand"
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
