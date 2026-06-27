import 'server-only';

import {queryServerDocuments} from '@/lib/firebase/server';
import {answerMemoryLocally, answerMemoryWithGemini} from '@/lib/orchestration/model';
import type {MemorySearchResult, MemorySource} from '@/lib/orchestration/schemas';

type AnyRecord = Record<string, unknown>;

function asText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function compact(parts: string[]) {
  return parts.filter(Boolean).join(' ');
}

function clip(value: string, max = 220) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function sourceCard(
  record: AnyRecord,
  type: MemorySource['type'],
  title: string,
  snippet: string,
  source: string,
): MemorySource {
  return {
    id: asText(record.id) || `${type}-${title}`,
    type,
    title: title || source,
    snippet: clip(snippet || 'No detail saved.'),
    source,
  };
}

async function collectSources(userId: string): Promise<MemorySource[]> {
  const [tasks, openLoops, meetingActions, emailAutomations, routines, habits, plans, reminders, drafts, messages] = await Promise.all([
    queryServerDocuments<AnyRecord>('tasks', userId, 40),
    queryServerDocuments<AnyRecord>('openLoops', userId, 40),
    queryServerDocuments<AnyRecord>('meetingActionItems', userId, 30),
    queryServerDocuments<AnyRecord>('emailAutomations', userId, 25),
    queryServerDocuments<AnyRecord>('routines', userId, 20),
    queryServerDocuments<AnyRecord>('habits', userId, 30),
    queryServerDocuments<AnyRecord>('plans', userId, 20),
    queryServerDocuments<AnyRecord>('reminders', userId, 20),
    queryServerDocuments<AnyRecord>('drafts', userId, 20),
    queryServerDocuments<AnyRecord>('messages', userId, 40),
  ]);

  return [
    ...tasks.map((task) =>
      sourceCard(
        task,
        'task',
        asText(task.title),
        compact([
          asText(task.reason),
          asText(task.due) ? `Due: ${asText(task.due)}.` : '',
          asText(task.status) ? `Status: ${asText(task.status)}.` : '',
        ]),
        'Task',
      ),
    ),
    ...openLoops.map((loop) =>
      sourceCard(
        loop,
        'openLoop',
        asText(loop.title),
        compact([
          asText(loop.reason),
          asText(loop.action) ? `Next: ${asText(loop.action)}.` : '',
          asText(loop.status) ? `Status: ${asText(loop.status)}.` : '',
        ]),
        'Open loop',
      ),
    ),
    ...meetingActions.map((action) =>
      sourceCard(
        action,
        'meetingAction',
        asText(action.text),
        compact([
          asText(action.owner) ? `Owner: ${asText(action.owner)}.` : '',
          asText(action.deadline) ? `Deadline: ${asText(action.deadline)}.` : '',
          asText(action.nextStep),
        ]),
        'Meeting action',
      ),
    ),
    ...emailAutomations.map((email) =>
      sourceCard(
        email,
        'email',
        asText(email.subject),
        compact([
          asText(email.from) ? `From: ${asText(email.from)}.` : '',
          asText(email.summary),
          asText(email.draftReply) ? `Draft: ${asText(email.draftReply)}` : '',
        ]),
        'Gmail agent',
      ),
    ),
    ...routines.map((routine) =>
      sourceCard(
        routine,
        'routine',
        asText(routine.name),
        compact([
          asText(routine.schedule) ? `Schedule: ${asText(routine.schedule)}.` : '',
          asText(routine.detail),
        ]),
        'Routine',
      ),
    ),
    ...habits.map((habit) =>
      sourceCard(
        habit,
        'habit',
        asText(habit.title),
        compact([
          asText(habit.cadence) ? `Cadence: ${asText(habit.cadence)}.` : '',
          asText(habit.target),
          asText(habit.recoverySuggestion),
        ]),
        'Habit',
      ),
    ),
    ...plans.map((plan) =>
      sourceCard(
        plan,
        'plan',
        asText(plan.summary) || 'Saved plan',
        compact([
          asText(plan.nextBestAction) ? `Next: ${asText(plan.nextBestAction)}.` : '',
          Array.isArray(plan.risks) ? `Risks: ${plan.risks.join(', ')}.` : '',
        ]),
        'Plan',
      ),
    ),
    ...reminders.map((reminder) =>
      sourceCard(
        reminder,
        'reminder',
        asText(reminder.message) || 'Reminder escalation',
        compact([
          asText(reminder.escalationLevel) ? `Level: ${asText(reminder.escalationLevel)}.` : '',
          asText(reminder.requiredAction),
        ]),
        'Reminder',
      ),
    ),
    ...drafts.map((draft) =>
      sourceCard(
        draft,
        'draft',
        asText(draft.title) || 'Saved draft',
        compact([
          asText(draft.content),
          asText(draft.nextAction) ? `Next: ${asText(draft.nextAction)}.` : '',
        ]),
        'Draft',
      ),
    ),
    ...messages.map((message) =>
      sourceCard(
        message,
        'message',
        asText(message.role) === 'user' ? 'You said' : 'Ling said',
        asText(message.content),
        'Chat',
      ),
    ),
  ].filter((source) => source.title || source.snippet);
}

export async function searchMemory(
  userId: string,
  query: string,
): Promise<MemorySearchResult & {runtime: {source: 'gemini' | 'local-fallback'; sourceCount: number}}> {
  const sources = await collectSources(userId);

  if (sources.length === 0) {
    return {
      answer: 'LingT does not have saved context to search yet.',
      sources: [],
      suggestedNextAction: 'Save a chat plan, approve meeting actions, or connect Gmail so Ling can build memory.',
      confidence: 'low',
      runtime: {
        source: 'local-fallback',
        sourceCount: 0,
      },
    };
  }

  const geminiResult = await answerMemoryWithGemini(query, sources);
  const result = geminiResult ?? answerMemoryLocally(query, sources);

  return {
    ...result,
    runtime: {
      source: geminiResult ? 'gemini' : 'local-fallback',
      sourceCount: sources.length,
    },
  };
}
