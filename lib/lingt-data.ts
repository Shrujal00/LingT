import type {LucideIcon} from 'lucide-react';

export type TaskStatus = 'open' | 'scheduled' | 'done' | 'snoozed';
export type OpenLoopStatus = 'open' | 'resolved' | 'snoozed' | 'scheduled';
export type ReminderLevel = 'gentle' | 'urgent' | 'repeated' | 'alarm';

export interface WorkspaceCard {
  title: string;
  detail: string;
  icon: LucideIcon;
  tone: string;
}

export interface Task {
  id: string;
  title: string;
  reason: string;
  status: TaskStatus;
  priority: 'do_now' | 'schedule_today' | 'at_risk' | 'can_wait';
  due: string;
}

export interface OpenLoop {
  id: string;
  title: string;
  reason: string;
  action: string;
  status: OpenLoopStatus;
}

export interface Routine {
  id: string;
  name: string;
  schedule: string;
  detail: string;
  enabled: boolean;
}

export interface Habit {
  id: string;
  title: string;
  cadence: 'daily' | 'weekdays' | 'weekly';
  target: string;
  streak: number;
  status: 'active' | 'paused' | 'missed';
  recoverySuggestion?: string;
}

export interface MemoryItem {
  id: string;
  title: string;
  source: string;
  snippet: string;
}

export interface MeetingActionItem {
  id: string;
  text: string;
  approved: boolean;
  owner?: string;
  deadline?: string;
  nextStep?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface FeatureTile {
  name: string;
  value: string;
  icon: LucideIcon;
}

export const workspaceCards: WorkspaceCard[] = [];

export const tasks: Task[] = [];

export const openLoops: OpenLoop[] = [];

export const routines: Routine[] = [];

export const habits: Habit[] = [];

export const meetingActionItems: MeetingActionItem[] = [];

export const memories: MemoryItem[] = [];

export const featureTiles: FeatureTile[] = [];

export const calendarBlocks: Array<{id: string; time: string; title: string; status: string}> = [];

export const nextBestAction = null;

export const completionStats = {
  completed: tasks.filter((task) => task.status === 'done').length,
  total: tasks.length,
};

export function statusLabel(status: TaskStatus | OpenLoopStatus) {
  return status.replace('_', ' ');
}

export function openLoopCount(items = openLoops) {
  return items.filter((item) => item.status === 'open').length;
}
