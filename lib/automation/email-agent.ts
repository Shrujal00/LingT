import 'server-only';

import {
  addServerDocument,
} from '@/lib/firebase/server';
import {createCalendarEvent} from '@/lib/google/user';
import {
  analyzeEmailLocally,
  analyzeEmailWithGemini,
  type EmailAutomationInput,
} from '@/lib/orchestration/model';
import type {CalendarAction, EmailAutomation} from '@/lib/orchestration/schemas';

export interface GmailWebhookPayload {
  userId: string;
  messageId?: string;
  threadId?: string;
  subject: string;
  from: string;
  receivedAt?: string;
  snippet?: string;
  body: string;
  timezone?: string;
  autoCommitCalendar?: boolean;
}

async function writeWorkspaceItems(userId: string, result: EmailAutomation, sourceId: string) {
  const taskWrites = result.tasks.map((task) =>
    addServerDocument('tasks', {
      userId,
      title: task.title,
      reason: task.reason,
      due: task.due,
      priority: task.priority,
      status: task.priority === 'do_now' ? 'open' : 'scheduled',
      source: 'ling-gmail',
      sourceId,
      needsApproval: task.needsApproval,
    }),
  );

  const loopWrites = result.openLoops.map((loop) =>
    addServerDocument('openLoops', {
      userId,
      title: loop.title,
      reason: loop.reason,
      action: loop.action,
      status: 'open',
      source: 'ling-gmail',
      sourceId,
    }),
  );

  await Promise.all([...taskWrites, ...loopWrites]);
}

function mayAutoCommitCalendar(payload: GmailWebhookPayload, action: CalendarAction) {
  return (
    process.env.LINGT_AUTOCOMMIT_CALENDAR === 'true' &&
    payload.autoCommitCalendar === true &&
    action.requiresApproval === false &&
    action.confidence === 'high'
  );
}

export async function runGmailAutomation(payload: GmailWebhookPayload) {
  const input: EmailAutomationInput = {
    subject: payload.subject,
    from: payload.from,
    body: payload.body || payload.snippet || '',
    receivedAt: payload.receivedAt,
    timezone: payload.timezone,
  };
  const geminiResult = await analyzeEmailWithGemini(input);
  const result = geminiResult ?? analyzeEmailLocally(input);
  const sourceId =
    payload.messageId ||
    `${payload.userId}-${Date.now()}-${payload.subject.slice(0, 24).replace(/\W+/g, '-')}`;
  const committedCalendarEvents: Array<{actionTitle: string; eventId: string; htmlLink?: string}> = [];

  await addServerDocument('emailAutomations', {
    userId: payload.userId,
    messageId: payload.messageId || null,
    threadId: payload.threadId || null,
    subject: payload.subject,
    from: payload.from,
    summary: result.summary,
    importance: result.importance,
    tasks: result.tasks,
    openLoops: result.openLoops,
    calendarActions: result.calendarActions,
    draftReply: result.draftReply,
    labels: result.labels,
    source: geminiResult ? 'gemini' : 'local-fallback',
  });

  await writeWorkspaceItems(payload.userId, result, sourceId);

  for (const action of result.calendarActions) {
    if (!mayAutoCommitCalendar(payload, action)) continue;
    const event = await createCalendarEvent(payload.userId, action);
    committedCalendarEvents.push({
      actionTitle: action.title,
      eventId: event.id,
      htmlLink: event.htmlLink,
    });
  }

  return {
    ...result,
    source: geminiResult ? 'gemini' : 'local-fallback',
    committedCalendarEvents,
    autoCommitEnabled: process.env.LINGT_AUTOCOMMIT_CALENDAR === 'true',
  };
}

export async function commitCalendarAction(userId: string, action: CalendarAction) {
  const event = await createCalendarEvent(userId, action);

  await addServerDocument('calendarEvents', {
    userId,
    googleEventId: event.id,
    htmlLink: event.htmlLink || null,
    action,
    source: 'ling-approved-calendar-action',
  });

  return event;
}
