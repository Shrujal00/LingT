'use client';

import {firebaseAuth, googleProvider} from '@/lib/firebase/client';
import {saveUserProfile, type LingTProfile} from '@/lib/firebase/profile';
import {onAuthStateChanged, signInWithPopup, signOut, type User} from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock3,
  LogIn,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useMemo, useState} from 'react';

type JourneyStep = 'welcome' | 'identity' | 'mode' | 'preferences' | 'goal' | 'done';

const steps: JourneyStep[] = ['welcome', 'identity', 'mode', 'preferences', 'goal'];

const modes: Array<{id: LingTProfile['primaryMode']; label: string; detail: string}> = [
  {id: 'student', label: 'Student', detail: 'Assignments, exams, projects'},
  {id: 'professional', label: 'Professional', detail: 'Meetings, deadlines, follow-ups'},
  {id: 'founder', label: 'Founder', detail: 'Customers, product, operations'},
  {id: 'personal', label: 'Personal', detail: 'Life admin, habits, bills'},
];

const reminderStyles: Array<{id: LingTProfile['reminderStyle']; label: string; detail: string}> = [
  {id: 'gentle', label: 'Gentle', detail: 'Soft nudges when work is close'},
  {id: 'direct', label: 'Direct', detail: 'Clear next action and deadline risk'},
  {id: 'persistent', label: 'Persistent', detail: 'Escalate when something might slip'},
];

const focusWindows: Array<{id: LingTProfile['focusWindow']; label: string}> = [
  {id: 'morning', label: 'Morning'},
  {id: 'afternoon', label: 'Afternoon'},
  {id: 'evening', label: 'Evening'},
  {id: 'flexible', label: 'Flexible'},
];

function splitName(user: User | null) {
  const parts = (user?.displayName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

function Progress({activeStep}: {activeStep: JourneyStep}) {
  const activeIndex = Math.max(0, steps.indexOf(activeStep));

  return (
    <div className="flex items-center gap-2">
      {steps.map((item, index) => (
        <div
          key={item}
          className={
            index <= activeIndex
              ? 'h-1.5 flex-1 rounded-full bg-brand transition-all'
              : 'h-1.5 flex-1 rounded-full bg-surface-muted transition-all'
          }
        />
      ))}
    </div>
  );
}

function PreviewPanel({profile, activeStep}: {profile: LingTProfile; activeStep: JourneyStep}) {
  const displayName = profile.firstName || 'you';
  const focusLabel = focusWindows.find((item) => item.id === profile.focusWindow)?.label || 'Flexible';
  const reminderLabel = reminderStyles.find((item) => item.id === profile.reminderStyle)?.label || 'Direct';
  const modeLabel = modes.find((item) => item.id === profile.primaryMode)?.label || 'Professional';

  return (
    <aside className="relative hidden h-screen overflow-hidden border-l border-border bg-surface-warm p-8 lg:block">
      <div className="absolute inset-0">
        <div className="animate-lingt-drift absolute right-[-10%] top-[-6%] h-80 w-80 rounded-full bg-[#e8f0fe]" />
        <div className="animate-lingt-drift absolute bottom-[-8%] left-[-6%] h-72 w-72 rounded-full bg-[#fef7e0] [animation-delay:1.1s]" />
        <div className="animate-lingt-drift absolute bottom-28 right-24 h-56 w-56 rounded-full bg-[#e6f4ea] [animation-delay:2s]" />
      </div>

      <div className="relative mx-auto flex h-full max-w-xl flex-col justify-center">
        <div className="rounded-2xl border border-border bg-white/85 p-5 shadow-xl shadow-[#174ea6]/5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-brand">LingT setup</p>
              <h2 className="mt-1 font-display text-3xl">Tuned for {displayName}</h2>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[conic-gradient(from_180deg,#4285f4,#34a853,#fbbc04,#ea4335,#4285f4)]">
              <span className="rounded-md bg-white px-2 py-1 text-sm font-semibold text-brand">L</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {[
              {icon: Sparkles, title: 'Workflow', detail: modeLabel},
              {icon: Bell, title: 'Reminder style', detail: reminderLabel},
              {icon: Clock3, title: 'Focus window', detail: focusLabel},
              {icon: CalendarClock, title: 'Current pressure', detail: profile.topGoal || 'Waiting for your goal'},
            ].map((item, index) => (
              <div
                key={item.title}
                className="animate-lingt-rise rounded-xl border border-border bg-surface p-4"
                style={{animationDelay: `${index * 70}ms`}}
              >
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-5 w-5 text-brand" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="mt-1 truncate text-sm text-muted-foreground">{item.detail}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Journey</span>
              <span>{activeStep}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{width: `${((Math.max(0, steps.indexOf(activeStep)) + 1) / steps.length) * 100}%`}}
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<JourneyStep>('welcome');
  const [error, setError] = useState('');
  const defaultName = useMemo(() => splitName(user), [user]);
  const [profile, setProfile] = useState<LingTProfile>({
    firstName: '',
    lastName: '',
    heardFrom: '',
    aliases: '',
    primaryMode: 'professional',
    reminderStyle: 'direct',
    focusWindow: 'flexible',
    topGoal: '',
    onboardingComplete: true,
  });

  useEffect(() => {
    return onAuthStateChanged(
      firebaseAuth,
      (nextUser) => {
        setUser(nextUser);
        setLoading(false);
        if (nextUser) {
          const name = splitName(nextUser);
          setProfile((current) => ({
            ...current,
            firstName: current.firstName || name.firstName,
            lastName: current.lastName || name.lastName,
          }));
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, []);

  async function handleSignIn() {
    setError('');
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
      setStep('identity');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    }
  }

  function goNext() {
    setError('');

    if (step === 'welcome') {
      setStep('identity');
      return;
    }

    if (step === 'identity') {
      if (!profile.firstName.trim()) {
        setError('First name is required.');
        return;
      }
      setStep('mode');
      return;
    }

    if (step === 'mode') {
      setStep('preferences');
      return;
    }

    if (step === 'preferences') {
      setStep('goal');
    }
  }

  function goBack() {
    setError('');
    const index = steps.indexOf(step);
    if (index > 0) {
      setStep(steps[index - 1]);
    }
  }

  async function finish() {
    if (!user) {
      await handleSignIn();
      return;
    }

    if (!profile.firstName.trim()) {
      setStep('identity');
      setError('First name is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await saveUserProfile(user.uid, {
        ...profile,
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        aliases: profile.aliases.trim(),
        heardFrom: profile.heardFrom.trim(),
        topGoal: profile.topGoal.trim(),
        onboardingComplete: true,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save preferences.');
    } finally {
      setSaving(false);
    }
  }

  const activeIndex = Math.max(0, steps.indexOf(step));
  const actionLabel = step === 'goal' ? (saving ? 'Saving...' : 'Finish setup') : 'Continue';

  if (loading) {
    return (
      <main className="flex h-screen items-center justify-center overflow-hidden bg-background px-4">
        <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          Preparing LingT...
        </div>
      </main>
    );
  }

  if (step === 'done') {
    return (
      <main className="grid h-screen overflow-hidden bg-background lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)]">
        <section className="flex h-screen flex-col justify-between px-6 py-6 md:px-10">
          <button type="button" onClick={() => setStep('goal')} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="animate-lingt-rise max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Preferences saved
            </div>
            <h1 className="mt-5 font-display text-5xl leading-tight">Ling is ready.</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Start with one messy sentence. Ling will extract tasks, unresolved commitments, approvals, and the next best action.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-deep md:max-w-xl"
          >
            Start using LingT
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
        <PreviewPanel profile={profile} activeStep="goal" />
      </main>
    );
  }

  return (
    <main className="grid h-screen overflow-hidden bg-background lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)]">
      <section className="flex h-screen flex-col px-5 py-5 md:px-10 md:py-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[conic-gradient(from_180deg,#4285f4,#34a853,#fbbc04,#ea4335,#4285f4)] text-base font-semibold">
              <span className="rounded-md bg-white/95 px-1.5 py-0.5 text-brand">L</span>
            </div>
            <div>
              <div className="font-display text-2xl leading-none">LingT</div>
              <div className="mt-1 text-xs text-muted-foreground">Ling + agentic team</div>
            </div>
          </Link>
          <div className="hidden text-xs text-muted-foreground md:block">
            Step {activeIndex + 1} of {steps.length}
          </div>
        </div>

        <div className="mt-6">
          <Progress activeStep={step} />
        </div>

        <div className="flex min-h-0 flex-1 items-center">
          <div key={step} className="animate-lingt-rise w-full max-w-2xl">
            {step === 'welcome' && (
              <div>
                <p className="text-sm font-medium text-brand">Onboarding</p>
                <h1 className="mt-3 font-display text-5xl leading-tight">Set up Ling in a few focused steps.</h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                  We will tune how Ling plans, reminds, and structures your workspace. One screen at a time.
                </p>
                {!user && (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="mt-7 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium"
                  >
                    <LogIn className="h-4 w-4" />
                    Sign in with Google
                  </button>
                )}
              </div>
            )}

            {step === 'identity' && (
              <div>
                <p className="text-sm font-medium text-brand">Identity</p>
                <h1 className="mt-3 font-display text-4xl leading-tight">What should Ling call you?</h1>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    First name
                    <input
                      value={profile.firstName}
                      onChange={(event) => setProfile((current) => ({...current, firstName: event.target.value}))}
                      placeholder={defaultName.firstName || 'Enter first name'}
                      className="rounded-lg border border-border bg-surface px-3 py-3 text-sm outline-none transition focus:border-brand"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Last name
                    <input
                      value={profile.lastName}
                      onChange={(event) => setProfile((current) => ({...current, lastName: event.target.value}))}
                      placeholder={defaultName.lastName || 'Enter last name'}
                      className="rounded-lg border border-border bg-surface px-3 py-3 text-sm outline-none transition focus:border-brand"
                    />
                  </label>
                </div>
                <label className="mt-4 grid gap-2 text-sm font-medium">
                  Other names Ling should recognize
                  <input
                    value={profile.aliases}
                    onChange={(event) => setProfile((current) => ({...current, aliases: event.target.value}))}
                    placeholder="Handles, nicknames, alternate names"
                    className="rounded-lg border border-border bg-surface px-3 py-3 text-sm outline-none transition focus:border-brand"
                  />
                </label>
              </div>
            )}

            {step === 'mode' && (
              <div>
                <p className="text-sm font-medium text-brand">Workflow</p>
                <h1 className="mt-3 font-display text-4xl leading-tight">What should Ling optimize for first?</h1>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {modes.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setProfile((current) => ({...current, primaryMode: mode.id}))}
                      className={
                        profile.primaryMode === mode.id
                          ? 'rounded-xl border border-brand bg-brand-soft p-4 text-left shadow-sm'
                          : 'rounded-xl border border-border bg-surface p-4 text-left transition hover:border-brand'
                      }
                    >
                      <div className="text-sm font-medium">{mode.label}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{mode.detail}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'preferences' && (
              <div>
                <p className="text-sm font-medium text-brand">Reminders</p>
                <h1 className="mt-3 font-display text-4xl leading-tight">How should Ling help when work is at risk?</h1>
                <div className="mt-6 grid gap-3">
                  {reminderStyles.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setProfile((current) => ({...current, reminderStyle: style.id}))}
                      className={
                        profile.reminderStyle === style.id
                          ? 'rounded-xl border border-brand bg-brand-soft p-4 text-left shadow-sm'
                          : 'rounded-xl border border-border bg-surface p-4 text-left transition hover:border-brand'
                      }
                    >
                      <div className="text-sm font-medium">{style.label}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{style.detail}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-5">
                  <div className="text-sm font-medium">Best focus window</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {focusWindows.map((window) => (
                      <button
                        key={window.id}
                        type="button"
                        onClick={() => setProfile((current) => ({...current, focusWindow: window.id}))}
                        className={
                          profile.focusWindow === window.id
                            ? 'rounded-lg border border-brand bg-brand-soft px-3 py-2 text-sm font-medium'
                            : 'rounded-lg border border-border bg-surface px-3 py-2 text-sm'
                        }
                      >
                        {window.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 'goal' && (
              <div>
                <p className="text-sm font-medium text-brand">Context</p>
                <h1 className="mt-3 font-display text-4xl leading-tight">What is the main pressure right now?</h1>
                <textarea
                  value={profile.topGoal}
                  onChange={(event) => setProfile((current) => ({...current, topGoal: event.target.value}))}
                  placeholder="Example: final project submission, interviews, weekly client follow-ups..."
                  className="mt-6 min-h-32 w-full resize-none rounded-xl border border-border bg-surface px-4 py-4 text-sm leading-6 outline-none transition focus:border-brand"
                />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    How did you hear about LingT?
                    <select
                      value={profile.heardFrom}
                      onChange={(event) => setProfile((current) => ({...current, heardFrom: event.target.value}))}
                      className="rounded-lg border border-border bg-surface px-3 py-3 text-sm outline-none transition focus:border-brand"
                    >
                      <option value="">Select an option</option>
                      <option value="hackathon">Hackathon</option>
                      <option value="friend">Friend</option>
                      <option value="social">Social media</option>
                      <option value="search">Search</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3 border-t border-border pt-4">
          <div className="min-h-5 text-sm text-danger">{error}</div>
          <div className="flex shrink-0 items-center gap-2">
            {step !== 'welcome' && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={step === 'goal' ? finish : goNext}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-muted-foreground"
            >
              {actionLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {user && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground md:justify-start">
            <UserCircle className="h-3.5 w-3.5" />
            Signed in as {user.email}.
            <button type="button" onClick={() => signOut(firebaseAuth)} className="font-medium text-foreground">
              Switch account
            </button>
          </div>
        )}
      </section>

      <PreviewPanel profile={profile} activeStep={step} />
    </main>
  );
}
