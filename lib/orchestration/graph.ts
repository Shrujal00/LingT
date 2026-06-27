import 'server-only';

import {Annotation, END, START, StateGraph} from '@langchain/langgraph';
import {adkTeamManifest} from './adk-team';
import {
  extractLocally,
  extractMeetingLocally,
  extractMeetingWithGemini,
  extractWithGemini,
} from './model';
import type {
  AgentAction,
  MeetingCapture,
  MeetingCaptureRequest,
  MeetingCaptureResult,
  OrchestrationRequest,
  OrchestrationResult,
  TaskExtraction,
} from './schemas';

type Source = 'gemini' | 'local-fallback';

const LingTState = Annotation.Root({
  message: Annotation<string>(),
  extraction: Annotation<TaskExtraction | null>(),
  source: Annotation<Source>(),
  graph: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  agentActions: Annotation<AgentAction[]>(),
});

const MeetingCaptureState = Annotation.Root({
  transcript: Annotation<string>(),
  capture: Annotation<MeetingCapture | null>(),
  source: Annotation<Source>(),
  graph: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  agentActions: Annotation<AgentAction[]>(),
});

function toAgentActions(extraction: TaskExtraction): AgentAction[] {
  if (
    extraction.tasks.length === 0 &&
    extraction.openLoops.length === 0 &&
    extraction.approvals.length === 0
  ) {
    return [];
  }

  const actions: AgentAction[] = [
    {agent: 'Ling', action: extraction.assistantMessage, requiresApproval: false},
  ];

  for (const agent of extraction.specialistAgents) {
    const label = agent.charAt(0).toUpperCase() + agent.slice(1);
    actions.push({
      agent: label as AgentAction['agent'],
      action:
        agent === 'calendar'
          ? 'Suggest calendar blocks and wait for approval.'
          : agent === 'reminder'
            ? 'Prepare escalation options without sending until enabled.'
            : agent === 'meeting'
              ? 'Extract summary, decisions, and action items.'
              : agent === 'memory'
                ? 'Save/retrieve source-backed context.'
                : agent === 'drafting'
                  ? 'Prepare editable in-app draft.'
                  : agent === 'routine'
                    ? 'Create proactive routine proposal.'
                    : 'Prioritize and plan next actions.',
      requiresApproval: ['calendar', 'reminder', 'drafting'].includes(agent),
    });
  }

  return actions;
}

async function extractNode(state: typeof LingTState.State) {
  const geminiExtraction = await extractWithGemini(state.message);
  const extraction = geminiExtraction ?? extractLocally(state.message);
  const hasTrackableWork =
    extraction.tasks.length > 0 ||
    extraction.openLoops.length > 0 ||
    extraction.approvals.length > 0;

  return {
    extraction: hasTrackableWork
      ? extraction
      : {
          ...extraction,
          specialistAgents: [],
          approvals: [],
        },
    source: geminiExtraction ? ('gemini' as const) : ('local-fallback' as const),
    graph: ['extract: LangChain ChatGoogle + Gemini structured output'],
  };
}

function routeNode(state: typeof LingTState.State) {
  if (!state.extraction) {
    return {agentActions: [], graph: ['route: no extraction available']};
  }

  return {
    agentActions: toAgentActions(state.extraction),
    graph: [`route: Google ADK team manifest (${adkTeamManifest.team.join(', ')})`],
  };
}

function approvalNode(state: typeof LingTState.State) {
  const approvals = state.agentActions
    .filter((action) => action.requiresApproval)
    .map((action) => `${action.agent}: approval required`);

  return {
    graph: approvals.length
      ? [`approval: ${approvals.join('; ')}`]
      : ['approval: no external action approval needed'],
  };
}

export function createLingTGraph() {
  return new StateGraph(LingTState)
    .addNode('extract', extractNode)
    .addNode('route', routeNode)
    .addNode('approval', approvalNode)
    .addEdge(START, 'extract')
    .addEdge('extract', 'route')
    .addEdge('route', 'approval')
    .addEdge('approval', END)
    .compile();
}

async function meetingExtractNode(state: typeof MeetingCaptureState.State) {
  const geminiCapture = await extractMeetingWithGemini(state.transcript);

  return {
    capture: geminiCapture ?? extractMeetingLocally(state.transcript),
    source: geminiCapture ? ('gemini' as const) : ('local-fallback' as const),
    graph: ['meeting extract: LangChain ChatGoogle + Gemini structured output'],
  };
}

function meetingRouteNode(state: typeof MeetingCaptureState.State) {
  if (!state.capture) {
    return {agentActions: [], graph: ['meeting route: no capture available']};
  }

  const agentActions: AgentAction[] = [
    {
      agent: 'Meeting',
      action: `Extracted ${state.capture.actionItems.length} action item(s), ${state.capture.decisions.length} decision(s), and ${state.capture.openLoops.length} open loop(s).`,
      requiresApproval: false,
    },
    {
      agent: 'Drafting',
      action: 'Prepared an editable follow-up draft inside LingT only.',
      requiresApproval: true,
    },
  ];

  return {
    agentActions,
    graph: [`meeting route: Google ADK team manifest (${adkTeamManifest.team.join(', ')})`],
  };
}

function meetingApprovalNode(state: typeof MeetingCaptureState.State) {
  const actionCount = state.capture?.actionItems.length ?? 0;

  return {
    graph: [
      actionCount
        ? `meeting approval: ${actionCount} action item(s) awaiting individual user approval`
        : 'meeting approval: no action items to approve',
      'external writes: calendar, email, and reminders disabled',
    ],
  };
}

export function createMeetingCaptureGraph() {
  return new StateGraph(MeetingCaptureState)
    .addNode('extract', meetingExtractNode)
    .addNode('route', meetingRouteNode)
    .addNode('approval', meetingApprovalNode)
    .addEdge(START, 'extract')
    .addEdge('extract', 'route')
    .addEdge('route', 'approval')
    .addEdge('approval', END)
    .compile();
}

export async function runLingTOrchestration(input: OrchestrationRequest): Promise<OrchestrationResult> {
  const graph = createLingTGraph();
  const result = await graph.invoke({
    message: input.message,
    extraction: null,
    source: 'local-fallback',
    graph: ['start: LangGraph orchestration'],
    agentActions: [],
  });

  const extraction = result.extraction ?? extractLocally(input.message);

  return {
    ...extraction,
    graph: result.graph,
    agentActions: result.agentActions,
    runtime: {
      model: 'gemini',
      modelProvider: 'Google',
      modelAccess: 'LangChain ChatGoogle',
      workflow: 'LangGraph',
      agentRuntime: 'Google ADK',
      source: result.source,
    },
  };
}

export async function runMeetingCapture(input: MeetingCaptureRequest): Promise<MeetingCaptureResult> {
  const graph = createMeetingCaptureGraph();
  const result = await graph.invoke({
    transcript: input.transcript,
    capture: null,
    source: 'local-fallback',
    graph: ['start: LangGraph meeting capture'],
    agentActions: [],
  });

  const capture = result.capture ?? extractMeetingLocally(input.transcript);

  return {
    ...capture,
    graph: result.graph,
    agentActions: result.agentActions,
    runtime: {
      model: 'gemini',
      modelProvider: 'Google',
      modelAccess: 'LangChain ChatGoogle',
      workflow: 'LangGraph',
      agentRuntime: 'Google ADK',
      source: result.source,
    },
  };
}
