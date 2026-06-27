'use client';

import {onAuthStateChanged, signInWithPopup, signOut, type User} from 'firebase/auth';
import {LogIn, LogOut, UserCircle} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import {firebaseAuth, googleProvider} from '@/lib/firebase/client';
import {hasCompletedOnboarding} from '@/lib/firebase/profile';

export default function AuthPanel() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  async function handleSignIn() {
    setError('');
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const complete = await hasCompletedOnboarding(result.user.uid);
      if (!complete) {
        router.push('/onboarding');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    }
  }

  async function handleSignOut() {
    setError('');
    await signOut(firebaseAuth);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-3 text-xs text-muted-foreground">
        Checking sign-in...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserCircle className="h-4 w-4 text-brand" />
          Not signed in
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Sign in with Google to prepare user-scoped tasks and memory.
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </button>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep">
          {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{user.displayName || 'Signed in'}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
      <Link
        href="/onboarding"
        className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium"
      >
        Preferences
      </Link>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
