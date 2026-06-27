import 'server-only';

import {HumanMessage, SystemMessage} from '@langchain/core/messages';
import {ChatGoogle} from '@langchain/google/node';
import {
  emailAutomationSchema,
  draftGenerationSchema,
  habitSuggestionSchema,
  memorySearchResultSchema,
  meetingCaptureSchema,
  productivityPlanSchema,
  reminderEscalationSchema,
  routineRunSchema,
  taskExtractionSchema,
  type DraftGeneration,
  type EmailAutomation,
  type HabitSuggestion,
  type MemorySearchResult,
  type MemorySource,
  type MeetingCapture,
  type ProductivityPlan,
  type ReminderEscalation,
  type RoutineRun,
  type TaskExtraction,
  type WorkspaceTaskInput,
} from './schemas';

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
}

function createGeminiModel() {
  const apiKey = getGoogleApiKey();
  if (!apiKey) return null;

  return new ChatGoogle({
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    platformType: process.env.GOOGLE_PLATFORM_TYPE === 'gcp' ? 'gcp' : undefined,
    maxRetries: 2,
  });
}

export async function extractWithGemini(message: string): Promise<TaskExtraction | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(taskExtractionSchema);

    return structuredModel.invoke([
      new SystemMessage(
        [
          'You are Ling, the lead agent in LingT.',
          'Extract productivity structure from the user message.',
          'Return concise, action-oriented output.',
          'For greetings, small talk, thanks, or general capability questions, return no tasks, no openLoops, no approvals, and no specialistAgents.',
          'Only create tasks or openLoops when the user gives an actual commitment, deadline, meeting notes, routine request, memory lookup, or drafting request.',
          'Do not invent exact dates. Use due="needs clarification" when vague.',
          'Calendar writes, push reminders, and external sending require approval.',
        ].join(' '),
      ),
      new HumanMessage(message),
    ]);
  } catch {
    return null;
  }
}

export async function extractMeetingWithGemini(transcript: string): Promise<MeetingCapture | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(meetingCaptureSchema);

    return structuredModel.invoke([
      new SystemMessage(
        [
          'You are the Meeting specialist in LingT, coordinated by Ling.',
          'Turn meeting notes or transcripts into useful productivity outputs.',
          'Return a concise summary, concrete decisions, action items, open loops, and one editable follow-up draft.',
          'Do not invent owners, dates, or decisions. Use owner="unassigned" and deadline="needs clarification" when unclear.',
          'Action items must be specific enough for a user to approve before saving.',
          'Open loops should capture unresolved questions, missing owners, or unclear deadlines.',
          'Do not write to calendar, email, reminders, or external systems.',
        ].join(' '),
      ),
      new HumanMessage(transcript),
    ]);
  } catch {
    return null;
  }
}

export function extractMeetingLocally(transcript: string): MeetingCapture {
  const normalized = transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = normalized[0] ?? transcript.trim();
  const summary =
    firstLine.length > 180
      ? `${firstLine.slice(0, 177)}...`
      : firstLine || 'Meeting notes captured for review.';

  return {
    summary,
    decisions: [],
    actionItems: [
      {
        title: 'Review meeting notes and confirm next actions',
        owner: 'unassigned',
        deadline: 'needs clarification',
        nextStep: 'Identify the owner, deadline, and first concrete step.',
        priority: 'schedule_today',
        confidence: 'low',
        needsClarification: true,
      },
    ],
    openLoops: [
      {
        title: 'Confirm owners and deadlines',
        reason: 'The local extractor needs Gemini or clearer notes to identify reliable assignments.',
        action: 'Review transcript',
      },
    ],
    followUpDraft:
      'Thanks for the discussion. I captured the notes and will confirm owners, deadlines, and next steps before anything is added to the workspace.',
  };
}

export interface EmailAutomationInput {
  subject: string;
  from: string;
  body: string;
  receivedAt?: string;
  timezone?: string;
}

function formatEmailInput(input: EmailAutomationInput) {
  return [
    `From: ${input.from || 'unknown'}`,
    `Subject: ${input.subject || 'No subject'}`,
    `Received: ${input.receivedAt || 'unknown'}`,
    `Timezone: ${input.timezone || 'unknown'}`,
    '',
    input.body,
  ].join('\n');
}

export async function analyzeEmailWithGemini(
  input: EmailAutomationInput,
): Promise<EmailAutomation | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(emailAutomationSchema);

    return structuredModel.invoke([
      new SystemMessage(
        [
          'You are Ling, the lead productivity agent in LingT, analyzing a Gmail message.',
          'Extract only commitments, deadlines, meeting requests, schedule changes, follow-ups, and open loops grounded in the email.',
          'Calendar actions must use ISO-like local datetime strings when the email contains enough timing detail.',
          'If timing is vague, do not create a calendar action; create an open loop asking for clarification.',
          'Set requiresApproval=true for calendar changes unless the email is an obvious accepted calendar update and automation is explicitly enabled elsewhere.',
          'Do not send email. Provide an editable draftReply only.',
          'Do not invent facts, attendees, or exact dates.',
        ].join(' '),
      ),
      new HumanMessage(formatEmailInput(input)),
    ]);
  } catch {
    return null;
  }
}

export function analyzeEmailLocally(input: EmailAutomationInput): EmailAutomation {
  const subject = input.subject.trim() || 'Incoming email';
  const body = input.body.toLowerCase();
  const urgent = /urgent|asap|today|tomorrow|deadline|due/.test(body);
  const meeting = /meeting|call|sync|calendar|schedule|reschedule/.test(body);

  return {
    summary: `${subject} from ${input.from || 'unknown sender'}. Review needed before Ling changes workspace or calendar.`,
    importance: urgent ? 'urgent' : meeting ? 'important' : 'normal',
    tasks: [
      {
        title: `Review email: ${subject}`,
        reason: urgent
          ? 'The email appears to mention urgent timing.'
          : 'Ling needs confirmation before acting on this email.',
        due: urgent ? 'soon' : 'needs clarification',
        priority: urgent ? 'do_now' : 'schedule_today',
        needsApproval: true,
      },
    ],
    openLoops: meeting
      ? [
          {
            title: `Confirm calendar action for ${subject}`,
            reason: 'The email mentions scheduling, but the local extractor could not safely identify exact time details.',
            action: 'Review email and approve any calendar change manually',
          },
        ]
      : [],
    calendarActions: [],
    draftReply:
      'Thanks for the update. I am reviewing the details and will confirm next steps before making calendar changes.',
    labels: urgent ? ['lingt-urgent'] : ['lingt-review'],
  };
}

export async function answerMemoryWithGemini(
  query: string,
  sources: MemorySource[],
): Promise<MemorySearchResult | null> {
  const model = createGeminiModel();
  if (!model || sources.length === 0) return null;

  try {
    const structuredModel = model.withStructuredOutput(memorySearchResultSchema);

    return structuredModel.invoke([
      new SystemMessage(
        [
          'You are the Memory specialist in LingT.',
          'Answer the user only from the provided app-owned source cards.',
          'Do not use outside knowledge or infer facts that are not present.',
          'If the sources do not answer the question, say LingT does not know yet.',
          'Return only sources that directly support the answer.',
          'Keep the answer concise and action-oriented.',
        ].join(' '),
      ),
      new HumanMessage(
        JSON.stringify({
          question: query,
          sources,
        }),
      ),
    ]);
  } catch {
    return null;
  }
}

export function answerMemoryLocally(query: string, sources: MemorySource[]): MemorySearchResult {
  const normalizedQuery = query.toLowerCase();
  const queryTerms = normalizedQuery
    .split(/\W+/)
    .filter((term) => term.length > 2);
  const scoredSources = sources
    .map((source) => {
      const haystack = `${source.title} ${source.snippet} ${source.source}`.toLowerCase();
      const score = queryTerms.reduce(
        (total, term) => total + (haystack.includes(term) ? 1 : 0),
        0,
      );

      return {source, score};
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((item) => item.source);

  if (scoredSources.length === 0) {
    return {
      answer: 'LingT does not know that yet from saved workspace context.',
      sources: [],
      suggestedNextAction: 'Capture it in chat, meeting notes, or Gmail so Ling can remember it next time.',
      confidence: 'low',
    };
  }

  const lead = scoredSources[0];

  return {
    answer: `The closest saved context is "${lead.title}". ${lead.snippet}`,
    sources: scoredSources,
    suggestedNextAction: 'Open the source item, confirm the detail, or ask Ling to turn it into the next action.',
    confidence: scoredSources.length > 1 ? 'medium' : 'low',
  };
}

function taskContext(tasks: WorkspaceTaskInput[]) {
  return tasks
    .map((task) => `${task.title} | ${task.priority} | due ${task.due} | ${task.status} | ${task.reason}`)
    .join('\n');
}

function sortedWork(tasks: WorkspaceTaskInput[]) {
  const rank = {
    do_now: 0,
    at_risk: 1,
    schedule_today: 2,
    can_wait: 3,
  };

  return [...tasks].sort((left, right) => rank[left.priority] - rank[right.priority]);
}

export async function generatePlanWithGemini(
  tasks: WorkspaceTaskInput[],
  timezone?: string,
): Promise<ProductivityPlan | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(productivityPlanSchema);
    return structuredModel.invoke([
      new SystemMessage(
        [
          'You are LingT Planner.',
          'Generate a realistic daily plan from saved tasks only.',
          'Do not invent tasks or hard calendar times.',
          'Use compact time labels such as "Next 25 min" or "Later today".',
          'Call out risks and pick one next best action.',
        ].join(' '),
      ),
      new HumanMessage(JSON.stringify({timezone, tasks})),
    ]);
  } catch {
    return null;
  }
}

export function generatePlanLocally(tasks: WorkspaceTaskInput[]): ProductivityPlan {
  const work = sortedWork(tasks).slice(0, 5);

  if (work.length === 0) {
    return {
      summary: 'No saved tasks are ready to plan yet.',
      blocks: [],
      risks: [],
      nextBestAction: 'Capture or approve a task first.',
    };
  }

  return {
    summary: `Plan ${work.length} saved item${work.length === 1 ? '' : 's'} by urgency and clarity.`,
    blocks: work.map((task, index) => ({
      title: task.title,
      time: index === 0 ? 'Next focus block' : index === 1 ? 'Later today' : 'When available',
      reason: task.reason || `Priority: ${task.priority.replace('_', ' ')}`,
      sourceTaskId: task.id,
    })),
    risks: work
      .filter((task) => task.priority === 'do_now' || task.priority === 'at_risk' || /clarification/i.test(task.due))
      .map((task) => `${task.title}: ${task.due}`),
    nextBestAction: work[0]?.title ?? 'Capture a task first.',
  };
}

export function suggestCalendarBlocksLocally(tasks: WorkspaceTaskInput[]) {
  const work = sortedWork(tasks).slice(0, 3);

  return {
    proposedBlocks: work.map((task, index) => ({
      title: `Focus: ${task.title}`,
      start: index === 0 ? 'next available 30 min' : index === 1 ? 'later today' : 'tomorrow',
      end: index === 0 ? 'after 30 min' : index === 1 ? 'after 45 min' : 'after 45 min',
      reason: task.reason || 'Suggested from task priority.',
      taskTitle: task.title,
      requiresApproval: true,
    })),
    conflicts: tasks.some((task) => task.due === 'needs clarification')
      ? ['Some tasks need clearer deadlines before calendar placement is reliable.']
      : [],
    confirmationRequired: true,
  };
}

export async function escalateReminderWithGemini(
  task: WorkspaceTaskInput,
): Promise<ReminderEscalation | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(reminderEscalationSchema);
    return structuredModel.invoke([
      new SystemMessage(
        [
          'You are LingT Reminder.',
          'Choose an escalation message for one saved task.',
          'Avoid guilt. Require a clear user response.',
        ].join(' '),
      ),
      new HumanMessage(JSON.stringify({task})),
    ]);
  } catch {
    return null;
  }
}

export function escalateReminderLocally(task: WorkspaceTaskInput): ReminderEscalation {
  const urgent = task.priority === 'do_now' || task.priority === 'at_risk';

  return {
    level: urgent ? 'urgent' : 'gentle',
    message: urgent
      ? `${task.title} may slip. Choose done, snooze with reason, reschedule, or break it down.`
      : `Do you want to keep ${task.title} on the plan, snooze it, or break it down?`,
    requiredAction: 'Pick one response before Ling escalates further.',
    options: ['done', 'snooze_with_reason', 'break_down', 'reschedule'],
  };
}

export async function suggestHabitWithGemini(prompt: string): Promise<HabitSuggestion | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(habitSuggestionSchema);
    return structuredModel.invoke([
      new SystemMessage(
        'Create one small habit from the user goal. Keep it measurable and recovery-friendly.',
      ),
      new HumanMessage(prompt),
    ]);
  } catch {
    return null;
  }
}

export function suggestHabitLocally(prompt: string): HabitSuggestion {
  const title = prompt.trim() || 'Daily reset';

  return {
    title: title.length > 64 ? title.slice(0, 61) + '...' : title,
    cadence: 'daily',
    target: 'One small check-in',
    reason: 'Small recurring actions are easier for Ling to track and recover.',
    recoverySuggestion: 'If missed, restart with a two-minute version instead of skipping the week.',
  };
}

export async function runRoutineWithGemini(
  routineType: RoutineRun['routineType'],
  tasks: WorkspaceTaskInput[],
): Promise<RoutineRun | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(routineRunSchema);
    return structuredModel.invoke([
      new SystemMessage(
        'Run a proactive LingT routine from saved tasks only. Keep it concise and action-oriented.',
      ),
      new HumanMessage(JSON.stringify({routineType, tasks})),
    ]);
  } catch {
    return null;
  }
}

export function runRoutineLocally(
  routineType: RoutineRun['routineType'],
  tasks: WorkspaceTaskInput[],
): RoutineRun {
  const work = sortedWork(tasks);
  const top = work[0];

  return {
    routineType,
    message: top
      ? `Routine check: start with ${top.title}.`
      : 'Routine check: no saved tasks are waiting yet.',
    workspaceCards: top
      ? [
          {
            title: top.title,
            detail: `${top.priority.replace('_', ' ')}. Due: ${top.due}.`,
          },
        ]
      : [],
    suggestedActions: top
      ? ['Start a focus block', 'Clarify missing details', 'Schedule the next step']
      : ['Capture a task', 'Paste meeting notes', 'Search memory'],
  };
}

export async function generateDraftWithGemini(
  draftType: string,
  prompt: string,
  sources: MemorySource[],
): Promise<DraftGeneration | null> {
  const model = createGeminiModel();
  if (!model) return null;

  try {
    const structuredModel = model.withStructuredOutput(draftGenerationSchema);
    return structuredModel.invoke([
      new SystemMessage(
        [
          'You are LingT Drafting.',
          'Write an editable in-app draft using only the user prompt and provided source cards.',
          'Do not send externally.',
          'If source context is weak, say what needs confirmation inside the draft.',
        ].join(' '),
      ),
      new HumanMessage(JSON.stringify({draftType, prompt, sources})),
    ]);
  } catch {
    return null;
  }
}

export function generateDraftLocally(
  draftType: string,
  prompt: string,
  sources: MemorySource[],
): DraftGeneration {
  const context = sources[0]?.snippet || 'I want to follow up with clear next steps.';

  return {
    title: draftType.replace(/_/g, ' '),
    content: `Hi,\n\nFollowing up on this: ${prompt || context}\n\nCurrent context: ${context}\n\nNext step: please confirm the owner, timing, and any blockers.\n\nThanks.`,
    sources: sources.slice(0, 3).map((source) => source.title),
    nextAction: 'Review and edit before sending anywhere outside LingT.',
  };
}

export function extractLocally(message: string): TaskExtraction {
  const lower = message.toLowerCase();
  const isGreeting = /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay|cool)[!. ]*$/i.test(message.trim());

  if (isGreeting) {
    return {
      assistantMessage:
        'Hi. Tell me what is due, what you need to plan, or what notes you want turned into tasks.',
      intent: 'unknown',
      tasks: [],
      openLoops: [],
      specialistAgents: [],
      approvals: [],
    };
  }

  const isMeeting = /meeting|transcript|notes|call/.test(lower);
  const isDraft = /draft|email|reply|message/.test(lower);
  const isCalendar = /calendar|schedule|block|time/.test(lower);
  const isRoutine = /routine|habit|daily|weekly|brief/.test(lower);
  const urgent = /tomorrow|today|tonight|urgent|deadline|due/.test(lower);

  const agents: TaskExtraction['specialistAgents'] = ['planner'];
  if (isMeeting) agents.push('meeting');
  if (isDraft) agents.push('drafting');
  if (isCalendar || urgent) agents.push('calendar');
  if (urgent) agents.push('reminder');
  if (isRoutine) agents.push('routine');
  agents.push('memory');

  const taskTitle = message.length > 74 ? `${message.slice(0, 71)}...` : message;

  return {
    assistantMessage:
      'I mapped this into LingT. I found the likely task, open loop, specialist agents, and approvals needed.',
    intent: isMeeting ? 'meeting_notes' : isDraft ? 'drafting' : isRoutine ? 'routine' : 'capture_task',
    tasks: [
      {
        title: taskTitle,
        reason: urgent ? 'The message mentions an urgent or near deadline.' : 'The message contains a commitment Ling should track.',
        due: urgent ? 'soon' : 'needs clarification',
        priority: urgent ? 'do_now' : 'schedule_today',
        needsApproval: isCalendar || urgent,
      },
    ],
    openLoops: [
      {
        title: 'Confirm deadline and next action',
        reason: 'Ling needs enough detail to plan accurately.',
        action: urgent ? 'Start focus block' : 'Add details',
      },
    ],
    specialistAgents: Array.from(new Set(agents)),
    approvals: isCalendar || urgent ? ['Approve calendar/reminder actions before execution'] : [],
  };
}
