import 'server-only';

import {LlmAgent} from '@google/adk';

const globalInstruction =
  'LingT is a productivity agent team. Ling is the lead agent. Specialist agents plan, remember, schedule, remind, process meetings, draft content, and detect open loops. External writes require user approval.';

export function createAdkAgentTeam() {
  const ling = new LlmAgent({
    name: 'ling_lead',
    model: 'gemini-flash-latest',
    globalInstruction,
    instruction:
      'Coordinate the T team. Convert user intent into tasks, open loops, approvals, and next actions.',
  });

  const specialists = [
    new LlmAgent({name: 'planner_agent', model: 'gemini-flash-latest', instruction: 'Prioritize tasks and create realistic plans.'}),
    new LlmAgent({name: 'memory_agent', model: 'gemini-flash-latest', instruction: 'Answer from saved context and return source-backed memory cards.'}),
    new LlmAgent({name: 'calendar_agent', model: 'gemini-flash-latest', instruction: 'Suggest calendar blocks. Never write calendar events without approval.'}),
    new LlmAgent({name: 'reminder_agent', model: 'gemini-flash-latest', instruction: 'Choose reminder escalation levels and user-safe follow-up actions.'}),
    new LlmAgent({name: 'meeting_agent', model: 'gemini-flash-latest', instruction: 'Summarize notes and extract decisions and action items.'}),
    new LlmAgent({name: 'drafting_agent', model: 'gemini-flash-latest', instruction: 'Draft useful messages from context. Do not send externally.'}),
    new LlmAgent({name: 'routine_agent', model: 'gemini-flash-latest', instruction: 'Create proactive routines and briefings.'}),
  ];

  return {ling, specialists};
}

export const adkTeamManifest = {
  runtime: 'Google ADK',
  lead: 'Ling',
  team: ['Planner', 'Memory', 'Calendar', 'Reminder', 'Meeting', 'Drafting', 'Routine'],
  approvalPolicy: 'Calendar writes, reminder escalation, and external drafts require user approval.',
};

