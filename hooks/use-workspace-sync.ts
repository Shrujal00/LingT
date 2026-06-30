'use client';

import {onAuthStateChanged, type User} from 'firebase/auth';
import {useEffect, useState} from 'react';
import {firebaseAuth} from '@/lib/firebase/client';
import {
  approveMeetingAction,
  seedWorkspaceIfEmpty,
  subscribeWorkspace,
  updateHabitCheckIn,
  updateOpenLoopStatus,
  updateRoutineEnabled,
  updateTaskStatus,
  type UserWorkspace,
} from '@/lib/firebase/workspace';
import {
  habits,
  meetingActionItems,
  openLoops,
  routines,
  tasks,
  type OpenLoopStatus,
  type TaskStatus,
} from '@/lib/lingt-data';

export function useWorkspaceSync() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<UserWorkspace>({
    tasks,
    openLoops,
    routines,
    meetingActionItems,
    habits,
  });

  useEffect(() => {
    let unsubscribeWorkspace: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(
      firebaseAuth,
      async (nextUser) => {
        unsubscribeWorkspace?.();
        setUser(nextUser);

        if (!nextUser) {
          setWorkspace({tasks: [], openLoops: [], routines: [], meetingActionItems: [], habits: []});
          setLoading(false);
          return;
        }

        setLoading(true);
        await seedWorkspaceIfEmpty(nextUser.uid);
        unsubscribeWorkspace = subscribeWorkspace(nextUser.uid, (partial) => {
          setWorkspace((current) => ({...current, ...partial}));
          setLoading(false);
        });
      },
      () => {
        setLoading(false);
      },
    );

    return () => {
      unsubscribeWorkspace?.();
      unsubscribeAuth();
    };
  }, []);

  async function setOpenLoopStatus(id: string, status: OpenLoopStatus) {
    setWorkspace((current) => ({
      ...current,
      openLoops: current.openLoops.map((item) =>
        item.id === id ? {...item, status} : item,
      ),
    }));

    if (user) {
      await updateOpenLoopStatus(id, status);
    }
  }

  async function toggleRoutine(id: string) {
    const target = workspace.routines.find((item) => item.id === id);
    if (!target) return;

    setWorkspace((current) => ({
      ...current,
      routines: current.routines.map((item) =>
        item.id === id ? {...item, enabled: !item.enabled} : item,
      ),
    }));

    if (user) {
      await updateRoutineEnabled(id, !target.enabled);
    }
  }

  async function approveAction(id: string) {
    setWorkspace((current) => ({
      ...current,
      meetingActionItems: current.meetingActionItems.map((item) =>
        item.id === id ? {...item, approved: true} : item,
      ),
    }));

    if (user) {
      await approveMeetingAction(id);
    }
  }

  async function checkInHabit(id: string, completed: boolean) {
    const target = workspace.habits.find((item) => item.id === id);
    if (!target) return;

    setWorkspace((current) => ({
      ...current,
      habits: current.habits.map((item) =>
        item.id === id
          ? {
              ...item,
              streak: completed ? item.streak + 1 : 0,
              status: completed ? 'active' : 'missed',
            }
          : item,
      ),
    }));

    if (user) {
      await updateHabitCheckIn(id, completed, target.streak);
    }
  }

  async function setTaskStatus(id: string, status: TaskStatus) {
    setWorkspace((current) => ({
      ...current,
      tasks: current.tasks.map((item) =>
        item.id === id ? {...item, status} : item
      ),
    }));

    if (user) {
      await updateTaskStatus(id, status);
    }
  }

  return {
    user,
    loading,
    workspace,
    setOpenLoopStatus,
    toggleRoutine,
    approveAction,
    checkInHabit,
    setTaskStatus,
  };
}
