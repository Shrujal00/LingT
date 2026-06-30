'use client';

import AppShell from '@/components/AppShell';
import { useWorkspaceSync } from '@/hooks/use-workspace-sync';
import ProductivitySuite from '@/components/ProductivitySuite';

export default function WorkspacePage() {
  const {
    user,
    loading,
    workspace,
    setOpenLoopStatus,
    toggleRoutine,
    approveAction,
    checkInHabit,
    setTaskStatus,
  } = useWorkspaceSync();

  const { tasks, openLoops, routines, meetingActionItems, habits } = workspace;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end border-b border-border/60 pb-5">
          <div>
            <p className="text-sm font-semibold text-brand">Workspace</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Everything Ling is helping you finish.</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {user
                ? loading
                  ? 'Syncing your Firestore workspace...'
                  : 'Synced to your Firebase account.'
                : 'Sign in to save tasks, open loops, routines, and meeting actions.'}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <ProductivitySuite
            user={user}
            tasks={tasks}
            openLoops={openLoops}
            habits={habits}
            routines={routines}
            meetingActionItems={meetingActionItems}
            setOpenLoopStatus={setOpenLoopStatus}
            toggleRoutine={toggleRoutine}
            approveAction={approveAction}
            checkInHabit={checkInHabit}
            setTaskStatus={setTaskStatus}
            loading={loading}
          />
        </div>
      </div>
    </AppShell>
  );
}
