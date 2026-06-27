import {z} from 'zod';

export const taskExtractionSchema = z.object({
  assistantMessage: z.string(),
  intent: z.enum(['capture_task', 'plan_day', 'memory_search', 'meeting_notes', 'drafting', 'routine', 'unknown']),
  tasks: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      due: z.string(),
      priority: z.enum(['do_now', 'schedule_today', 'at_risk', 'can_wait']),
      needsApproval: z.boolean(),
    }),
  ),
  openLoops: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      action: z.string(),
    }),
  ),
  specialistAgents: z.array(
    z.enum(['planner', 'memory', 'calendar', 'reminder', 'meeting', 'drafting', 'routine']),
  ),
  approvals: z.array(z.string()),
});

export type TaskExtraction = z.infer<typeof taskExtractionSchema>;

export const meetingCaptureSchema = z.object({
  summary: z.string(),
  decisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      title: z.string(),
      owner: z.string(),
      deadline: z.string(),
      nextStep: z.string(),
      priority: z.enum(['do_now', 'schedule_today', 'at_risk', 'can_wait']),
      confidence: z.enum(['high', 'medium', 'low']),
      needsClarification: z.boolean(),
    }),
  ),
  openLoops: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      action: z.string(),
    }),
  ),
  followUpDraft: z.string(),
});

export type MeetingCapture = z.infer<typeof meetingCaptureSchema>;

export const calendarActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  start: z.string(),
  end: z.string(),
  timezone: z.string(),
  attendees: z.array(z.string()),
  reason: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  requiresApproval: z.boolean(),
});

export const emailAutomationSchema = z.object({
  summary: z.string(),
  importance: z.enum(['urgent', 'important', 'normal', 'ignore']),
  tasks: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      due: z.string(),
      priority: z.enum(['do_now', 'schedule_today', 'at_risk', 'can_wait']),
      needsApproval: z.boolean(),
    }),
  ),
  openLoops: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      action: z.string(),
    }),
  ),
  calendarActions: z.array(calendarActionSchema),
  draftReply: z.string(),
  labels: z.array(z.string()),
});

export type CalendarAction = z.infer<typeof calendarActionSchema>;
export type EmailAutomation = z.infer<typeof emailAutomationSchema>;

export const memorySourceSchema = z.object({
  id: z.string(),
  type: z.enum(['task', 'openLoop', 'meetingAction', 'email', 'routine', 'habit', 'plan', 'reminder', 'draft', 'message']),
  title: z.string(),
  snippet: z.string(),
  source: z.string(),
});

export const memorySearchResultSchema = z.object({
  answer: z.string(),
  sources: z.array(memorySourceSchema),
  suggestedNextAction: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type MemorySource = z.infer<typeof memorySourceSchema>;
export type MemorySearchResult = z.infer<typeof memorySearchResultSchema>;

export const workspaceTaskInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  reason: z.string(),
  due: z.string(),
  priority: z.enum(['do_now', 'schedule_today', 'at_risk', 'can_wait']),
  status: z.string(),
});

export const productivityPlanSchema = z.object({
  summary: z.string(),
  blocks: z.array(
    z.object({
      title: z.string(),
      time: z.string(),
      reason: z.string(),
      sourceTaskId: z.string().optional(),
    }),
  ),
  risks: z.array(z.string()),
  nextBestAction: z.string(),
});

export const calendarSuggestionSchema = z.object({
  proposedBlocks: z.array(
    z.object({
      title: z.string(),
      start: z.string(),
      end: z.string(),
      reason: z.string(),
      taskTitle: z.string(),
      requiresApproval: z.boolean(),
    }),
  ),
  conflicts: z.array(z.string()),
  confirmationRequired: z.boolean(),
});

export const reminderEscalationSchema = z.object({
  level: z.enum(['gentle', 'urgent', 'repeated', 'in_app_alarm', 'break_down_prompt']),
  message: z.string(),
  requiredAction: z.string(),
  options: z.array(z.enum(['done', 'snooze_with_reason', 'break_down', 'reschedule'])),
});

export const habitSuggestionSchema = z.object({
  title: z.string(),
  cadence: z.enum(['daily', 'weekdays', 'weekly']),
  target: z.string(),
  reason: z.string(),
  recoverySuggestion: z.string(),
});

export const routineRunSchema = z.object({
  routineType: z.enum(['morning_briefing', 'before_meeting_prep', 'deadline_risk_scan', 'end_of_day_recovery', 'weekly_review']),
  message: z.string(),
  workspaceCards: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
    }),
  ),
  suggestedActions: z.array(z.string()),
});

export const draftGenerationSchema = z.object({
  title: z.string(),
  content: z.string(),
  sources: z.array(z.string()),
  nextAction: z.string(),
});

export type WorkspaceTaskInput = z.infer<typeof workspaceTaskInputSchema>;
export type ProductivityPlan = z.infer<typeof productivityPlanSchema>;
export type CalendarSuggestion = z.infer<typeof calendarSuggestionSchema>;
export type ReminderEscalation = z.infer<typeof reminderEscalationSchema>;
export type HabitSuggestion = z.infer<typeof habitSuggestionSchema>;
export type RoutineRun = z.infer<typeof routineRunSchema>;
export type DraftGeneration = z.infer<typeof draftGenerationSchema>;

export interface OrchestrationRequest {
  message: string;
  timezone?: string;
}

export interface MeetingCaptureRequest {
  transcript: string;
  timezone?: string;
}

export interface AgentAction {
  agent: 'Ling' | 'Planner' | 'Memory' | 'Calendar' | 'Reminder' | 'Meeting' | 'Drafting' | 'Routine';
  action: string;
  requiresApproval: boolean;
}

export interface OrchestrationResult extends TaskExtraction {
  graph: string[];
  agentActions: AgentAction[];
  runtime: {
    model: 'gemini';
    modelProvider: 'Google';
    modelAccess: 'LangChain ChatGoogle';
    workflow: 'LangGraph';
    agentRuntime: 'Google ADK';
    source: 'gemini' | 'local-fallback';
  };
}

export interface MeetingCaptureResult extends MeetingCapture {
  graph: string[];
  agentActions: AgentAction[];
  runtime: OrchestrationResult['runtime'];
}
