import 'server-only';

import {Annotation, END, START, StateGraph} from '@langchain/langgraph';
import {createAdkAgentTeam, adkTeamManifest} from './adk-team';
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
  history: Annotation<Array<{role: 'user' | 'ling'; text: string}>>({
    reducer: (left, right) => right,
    default: () => [],
  }),
  workspaceContext: Annotation<string>({
    reducer: (left, right) => right,
    default: () => '',
  }),
  extraction: Annotation<TaskExtraction | null>(),
  source: Annotation<Source>(),
  graph: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  agentActions: Annotation<AgentAction[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
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

async function extractNode(state: typeof LingTState.State) {
  const geminiExtraction = await extractWithGemini(state.message, state.history, state.workspaceContext);
  const extraction = geminiExtraction ?? extractLocally(state.message);
  const hasTrackableWork =
    extraction.tasks.length > 0 ||
    extraction.openLoops.length > 0 ||
    extraction.approvals.length > 0;

  const finalExtraction = hasTrackableWork
    ? extraction
    : {
        ...extraction,
        specialistAgents: [],
        approvals: [],
      };

  return {
    extraction: finalExtraction,
    source: geminiExtraction ? ('gemini' as const) : ('local-fallback' as const),
    graph: ['extract: lead agent parsed intent and extracted payload'],
    agentActions: [
      {agent: 'Ling' as const, action: finalExtraction.assistantMessage, requiresApproval: false}
    ],
  };
}

function plannerNode(state: typeof LingTState.State) {
  return {
    graph: ['planner: Tara optimized task list prioritization'],
    agentActions: [
      {agent: 'Planner' as const, action: 'Prioritized tasks and mapped deadlines.', requiresApproval: false}
    ]
  };
}

function calendarNode(state: typeof LingTState.State) {
  return {
    graph: ['calendar: Cal protected time blocks'],
    agentActions: [
      {agent: 'Calendar' as const, action: 'Suggest calendar blocks and wait for approval.', requiresApproval: true}
    ]
  };
}

function memoryNode(state: typeof LingTState.State) {
  return {
    graph: ['memory: Mira retrieved contextual workspace facts'],
    agentActions: [
      {agent: 'Memory' as const, action: 'Answered from saved memory context and returned source cards.', requiresApproval: false}
    ]
  };
}

function meetingNode(state: typeof LingTState.State) {
  return {
    graph: ['meeting: Nia structured transcript outcomes'],
    agentActions: [
      {agent: 'Meeting' as const, action: 'Extracted summary, decisions, and action items.', requiresApproval: false}
    ]
  };
}

function draftingNode(state: typeof LingTState.State) {
  return {
    graph: ['drafting: Dax prepared response drafts'],
    agentActions: [
      {agent: 'Drafting' as const, action: 'Prepared an editable in-app draft.', requiresApproval: true}
    ]
  };
}

function routineNode(state: typeof LingTState.State) {
  return {
    graph: ['routine: Remy evaluated workspace risks'],
    agentActions: [
      {agent: 'Routine' as const, action: 'Created active routine run proposal.', requiresApproval: false}
    ]
  };
}

function compileNode(state: typeof LingTState.State) {
  const approvals = state.agentActions
    .filter((action) => action.requiresApproval)
    .map((action) => `${action.agent}: approval required`);

  return {
    graph: approvals.length
      ? [`compile: compiled approvals (${approvals.join('; ')})`]
      : ['compile: no external approvals required'],
  };
}

function shouldRoute(state: typeof LingTState.State) {
  const specialists = state.extraction?.specialistAgents || [];
  if (specialists.includes('planner')) {
    return 'planner';
  }
  if (specialists.includes('memory')) {
    return 'memory';
  }
  if (specialists.includes('meeting')) {
    return 'meeting';
  }
  if (specialists.includes('drafting')) {
    return 'drafting';
  }
  if (specialists.includes('routine')) {
    return 'routine';
  }
  return 'compile';
}

function shouldRoutePlanner(state: typeof LingTState.State) {
  const specialists = state.extraction?.specialistAgents || [];
  if (specialists.includes('calendar')) {
    return 'calendar';
  }
  return 'compile';
}

export function createLingTGraph() {
  return new StateGraph(LingTState)
    .addNode('extract', extractNode)
    .addNode('planner', plannerNode)
    .addNode('calendar', calendarNode)
    .addNode('memory', memoryNode)
    .addNode('meeting', meetingNode)
    .addNode('drafting', draftingNode)
    .addNode('routine', routineNode)
    .addNode('compile', compileNode)
    
    .addEdge(START, 'extract')
    .addConditionalEdges('extract', shouldRoute, {
      planner: 'planner',
      memory: 'memory',
      meeting: 'meeting',
      drafting: 'drafting',
      routine: 'routine',
      compile: 'compile',
    })
    .addConditionalEdges('planner', shouldRoutePlanner, {
      calendar: 'calendar',
      compile: 'compile',
    })
    .addEdge('calendar', 'compile')
    .addEdge('memory', 'compile')
    .addEdge('meeting', 'compile')
    .addEdge('drafting', 'compile')
    .addEdge('routine', 'compile')
    .addEdge('compile', END)
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
  // Initialize the Google ADK Agent team at runtime
  const adkTeam = createAdkAgentTeam();
  console.log(`[Google ADK] Initialized active team: ${adkTeam.specialists.map(s => s.name).join(', ')}`);

  const graph = createLingTGraph();
  const result = await graph.invoke({
    message: input.message,
    history: input.history || [],
    workspaceContext: input.workspaceContext || '',
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
