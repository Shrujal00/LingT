'use client';

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {firestoreDb} from './client';
import type {MeetingCaptureResult, OrchestrationResult} from '@/lib/orchestration/schemas';
import type {
  DraftGeneration,
  HabitSuggestion,
  ProductivityPlan,
  ReminderEscalation,
  RoutineRun,
} from '@/lib/orchestration/schemas';
import {
  habits,
  meetingActionItems,
  openLoops,
  routines,
  tasks,
  type Habit,
  type MeetingActionItem,
  type OpenLoop,
  type OpenLoopStatus,
  type Routine,
  type Task,
  type TaskStatus,
} from '@/lib/lingt-data';

export interface UserWorkspace {
  tasks: Task[];
  openLoops: OpenLoop[];
  routines: Routine[];
  meetingActionItems: MeetingActionItem[];
  habits: Habit[];
}

const collectionNames = {
  tasks: 'tasks',
  openLoops: 'openLoops',
  routines: 'routines',
  meetingActionItems: 'meetingActionItems',
  habits: 'habits',
  plans: 'plans',
  reminders: 'reminders',
  drafts: 'drafts',
  conversations: 'conversations',
  messages: 'messages',
} as const;

function userQuery(collectionName: string, userId: string) {
  return query(collection(firestoreDb, collectionName), where('userId', '==', userId));
}

function seededDocId(userId: string, id: string) {
  return `${userId}-${id}`;
}

function isUserWorkspaceDoc(data: {source?: string}) {
  return (
    data.source === 'ling-chat' ||
    data.source === 'ling-meeting' ||
    data.source === 'ling-gmail' ||
    data.source === 'user'
  );
}

export async function seedWorkspaceIfEmpty(userId: string) {
  const existing = await getDocs(userQuery(collectionNames.openLoops, userId));
  if (!existing.empty) return;

  await Promise.all([
    ...tasks.map((item) => {
      const id = seededDocId(userId, item.id);

      return setDoc(doc(firestoreDb, collectionNames.tasks, id), {
        ...item,
        id,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }),
    ...openLoops.map((item) => {
      const id = seededDocId(userId, item.id);

      return setDoc(doc(firestoreDb, collectionNames.openLoops, id), {
        ...item,
        id,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }),
    ...routines.map((item) => {
      const id = seededDocId(userId, item.id);

      return setDoc(doc(firestoreDb, collectionNames.routines, id), {
        ...item,
        id,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }),
    ...meetingActionItems.map((item) => {
      const id = seededDocId(userId, item.id);

      return setDoc(doc(firestoreDb, collectionNames.meetingActionItems, id), {
        ...item,
        id,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }),
    ...habits.map((item) => {
      const id = seededDocId(userId, item.id);

      return setDoc(doc(firestoreDb, collectionNames.habits, id), {
        ...item,
        id,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }),
  ]);
}

export function subscribeWorkspace(
  userId: string,
  onWorkspace: (workspace: Partial<UserWorkspace>) => void,
): Unsubscribe {
  const unsubscribers = [
    onSnapshot(userQuery(collectionNames.tasks, userId), (snapshot) => {
      onWorkspace({
        tasks: snapshot.docs
          .map((item) => item.data() as Task & {source?: string})
          .filter(isUserWorkspaceDoc),
      });
    }),
    onSnapshot(userQuery(collectionNames.openLoops, userId), (snapshot) => {
      onWorkspace({
        openLoops: snapshot.docs
          .map((item) => item.data() as OpenLoop & {source?: string})
          .filter(isUserWorkspaceDoc),
      });
    }),
    onSnapshot(userQuery(collectionNames.routines, userId), (snapshot) => {
      onWorkspace({
        routines: snapshot.docs
          .map((item) => item.data() as Routine & {source?: string})
          .filter(isUserWorkspaceDoc),
      });
    }),
    onSnapshot(userQuery(collectionNames.meetingActionItems, userId), (snapshot) => {
      onWorkspace({
        meetingActionItems: snapshot.docs
          .map((item) => item.data() as MeetingActionItem & {source?: string})
          .filter(isUserWorkspaceDoc),
      });
    }),
    onSnapshot(userQuery(collectionNames.habits, userId), (snapshot) => {
      onWorkspace({
        habits: snapshot.docs
          .map((item) => item.data() as Habit & {source?: string})
          .filter(isUserWorkspaceDoc),
      });
    }),
  ];

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function updateOpenLoopStatus(id: string, status: OpenLoopStatus) {
  await updateDoc(doc(firestoreDb, collectionNames.openLoops, id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateRoutineEnabled(id: string, enabled: boolean) {
  await updateDoc(doc(firestoreDb, collectionNames.routines, id), {
    enabled,
    updatedAt: serverTimestamp(),
  });
}

export async function approveMeetingAction(id: string) {
  await updateDoc(doc(firestoreDb, collectionNames.meetingActionItems, id), {
    approved: true,
    updatedAt: serverTimestamp(),
  });
}

export async function updateHabitCheckIn(id: string, completed: boolean, currentStreak: number) {
  await updateDoc(doc(firestoreDb, collectionNames.habits, id), {
    streak: completed ? currentStreak + 1 : 0,
    status: completed ? 'active' : 'missed',
    lastCheckInAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  await updateDoc(doc(firestoreDb, collectionNames.tasks, id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function saveGeneratedPlan(userId: string, result: OrchestrationResult) {
  const now = serverTimestamp();
  const taskWrites = result.tasks.map((task) => {
    const taskRef = doc(collection(firestoreDb, collectionNames.tasks));

    return setDoc(taskRef, {
      id: taskRef.id,
      userId,
      title: task.title,
      reason: task.reason,
      due: task.due,
      priority: task.priority,
      status: task.priority === 'do_now' ? 'open' : 'scheduled',
      source: 'ling-chat',
      needsApproval: task.needsApproval,
      createdAt: now,
      updatedAt: now,
    });
  });
  const openLoopWrites = result.openLoops.map((loop) => {
    const loopRef = doc(collection(firestoreDb, collectionNames.openLoops));

    return setDoc(loopRef, {
      id: loopRef.id,
      userId,
      title: loop.title,
      reason: loop.reason,
      action: loop.action,
      status: 'open',
      source: 'ling-chat',
      createdAt: now,
      updatedAt: now,
    });
  });

  await Promise.all([
    ...taskWrites,
    ...openLoopWrites,
  ]);
}

export async function saveApprovedMeetingAction(
  userId: string,
  item: MeetingCaptureResult['actionItems'][number],
) {
  const now = serverTimestamp();
  const taskRef = doc(collection(firestoreDb, collectionNames.tasks));
  const meetingActionRef = doc(collection(firestoreDb, collectionNames.meetingActionItems));
  const writes = [
    setDoc(taskRef, {
      id: taskRef.id,
      userId,
      title: item.title,
      reason:
        item.owner === 'unassigned'
          ? 'Extracted from meeting notes. Owner needs confirmation.'
          : `Extracted from meeting notes for ${item.owner}.`,
      due: item.deadline,
      priority: item.priority,
      status: item.priority === 'do_now' ? 'open' : 'scheduled',
      source: 'ling-meeting',
      needsApproval: false,
      createdAt: now,
      updatedAt: now,
    }),
    setDoc(meetingActionRef, {
      id: meetingActionRef.id,
      userId,
      text: item.title,
      owner: item.owner,
      deadline: item.deadline,
      nextStep: item.nextStep,
      confidence: item.confidence,
      approved: true,
      source: 'ling-meeting',
      createdAt: now,
      updatedAt: now,
    }),
  ];

  if (item.needsClarification) {
    const openLoopRef = doc(collection(firestoreDb, collectionNames.openLoops));
    writes.push(
      setDoc(openLoopRef, {
        id: openLoopRef.id,
        userId,
        title: `Clarify ${item.title}`,
        reason: 'This meeting action is missing an owner, deadline, or exact next step.',
        action: item.nextStep,
        status: 'open',
        source: 'ling-meeting',
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  await Promise.all(writes);
}

export async function saveGeneratedPlanRecord(userId: string, plan: ProductivityPlan) {
  const planRef = doc(collection(firestoreDb, collectionNames.plans));

  await setDoc(planRef, {
    id: planRef.id,
    userId,
    type: 'daily',
    summary: plan.summary,
    blocks: plan.blocks,
    risks: plan.risks,
    nextBestAction: plan.nextBestAction,
    status: 'draft',
    source: 'ling-plan',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveReminderRun(
  userId: string,
  taskId: string,
  reminder: ReminderEscalation,
) {
  const reminderRef = doc(collection(firestoreDb, collectionNames.reminders));

  await setDoc(reminderRef, {
    id: reminderRef.id,
    userId,
    taskId,
    escalationLevel: reminder.level,
    message: reminder.message,
    requiredAction: reminder.requiredAction,
    options: reminder.options,
    status: 'draft',
    source: 'ling-reminder',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveHabitSuggestion(userId: string, habit: HabitSuggestion) {
  const habitRef = doc(collection(firestoreDb, collectionNames.habits));

  await setDoc(habitRef, {
    id: habitRef.id,
    userId,
    title: habit.title,
    cadence: habit.cadence,
    target: habit.target,
    reason: habit.reason,
    recoverySuggestion: habit.recoverySuggestion,
    streak: 0,
    status: 'active',
    source: 'ling-chat',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveRoutineRun(userId: string, routine: RoutineRun) {
  const routineRef = doc(collection(firestoreDb, collectionNames.routines));

  await setDoc(routineRef, {
    id: routineRef.id,
    userId,
    name: routine.routineType.replace(/_/g, ' '),
    schedule: 'on demand',
    detail: routine.message,
    enabled: true,
    lastRun: routine,
    source: 'ling-chat',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveDraftRecord(userId: string, draft: DraftGeneration) {
  const draftRef = doc(collection(firestoreDb, collectionNames.drafts));

  await setDoc(draftRef, {
    id: draftRef.id,
    userId,
    type: draft.title,
    title: draft.title,
    content: draft.content,
    sources: draft.sources,
    nextAction: draft.nextAction,
    status: 'draft',
    source: 'ling-draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function saveChatTurn(
  userId: string,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
  structuredOutput?: OrchestrationResult,
) {
  const now = serverTimestamp();

  await setDoc(
    doc(firestoreDb, collectionNames.conversations, conversationId),
    {
      id: conversationId,
      userId,
      title: userMessage.slice(0, 72) || 'LingT chat',
      source: 'ling-chat',
      updatedAt: now,
      createdAt: now,
    },
    {merge: true},
  );

  const userMessageRef = doc(collection(firestoreDb, collectionNames.messages));
  const assistantMessageRef = doc(collection(firestoreDb, collectionNames.messages));

  await Promise.all([
    setDoc(userMessageRef, {
      id: userMessageRef.id,
      userId,
      conversationId,
      role: 'user',
      content: userMessage,
      source: 'ling-chat',
      createdAt: now,
    }),
    setDoc(assistantMessageRef, {
      id: assistantMessageRef.id,
      userId,
      conversationId,
      role: 'assistant',
      content: assistantMessage,
      structuredOutput: structuredOutput || null,
      source: 'ling-chat',
      createdAt: now,
    }),
  ]);
}
