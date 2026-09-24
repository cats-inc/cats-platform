import type { ChatState } from '../api/contracts.js';
import type { RuntimeProviderDiagnosticsPayload } from '../../../platform/runtime/client.js';
import type {
  ProviderAgentBoundedObservation, ProviderAgentToolDescriptor,
} from '../../../platform/orchestration/providerAgentDecision.js';
import type { SupervisedToolManifest, ToolResult } from '../../../platform/supervision/contracts.js';
import { DEFAULT_SUPERVISION_SCHEMA_VERSION } from '../../../platform/supervision/contracts.js';
import { evaluateToolSurface } from '../../../platform/supervision/toolRegistry.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import { isCatPartOfChatProduct } from '../shared/directMessageSelectors.js';
import { isDirectLaneChannel } from '../shared/channelTopology.js';
import { resolveChannelParticipantAssignments } from '../shared/channelParticipants.js';
import { resolveChannelCanonicalIdentity } from '../shared/channelCanonicalIdentity.js';
import { isOrchestratorKnowledgeChannel } from './orchestratorKnowledge.js';
import { resolveOrchestratorExecutionTarget } from './runtimeTargeting.js';
import { collaborationExecutionRevision } from './collaborationExecutionSurface.js';
import type { CollaborationExecutionSummary } from '../../work/state/collaborationRecords.js';

export const DISCOVER_COLLABORATION_CATS = 'chat.collaboration.discover_cats';
export const INSPECT_COLLABORATION_CONTEXT = 'chat.collaboration.inspect_context';
export const PREPARE_COLLABORATION = 'chat.collaboration.prepare';
export const COLLABORATION_TOOL_NAMES = [
  DISCOVER_COLLABORATION_CATS, INSPECT_COLLABORATION_CONTEXT, PREPARE_COLLABORATION,
] as const;

const TOOL_HINTS: Record<string, string[]> = {
  [DISCOVER_COLLABORATION_CATS]: [
    'Input: { query?: string (max 128), limit?: integer (1..16, default 8) }. No other fields.',
    'Searches active Chat Cats by declared name/role. Roles are not verified capabilities. No sessions start.',
  ],
  [INSPECT_COLLABORATION_CONTEXT]: [
    'Input: {}. Reads only the current server-bound conversation. No conversation ID override.',
  ],
  [PREPARE_COLLABORATION]: [
    'First call discover_cats and inspect_context. Input requires the revision returned by both reads.',
    'Input: { revision, implementerId, reviewerId, conversationIntent: "reuse_current" | "create", expectedOutput, missingInformation: string[], budget: { maxDurationMs, maxTokens } }. No other fields.',
    'IDs must be distinct discovered Cats. expectedOutput: 1..1000 characters. missingInformation: at most 3 questions of 200 characters each; [] if intent is known.',
    'If fewer than two suitable Cats exist, omit implementerId/reviewerId to report unavailable. Missing user intent belongs in missingInformation, never invented details.',
    'Budget: positive integers, duration <= 3600000 ms and tokens <= 100000. Suggested only, never admitted execution.',
    'Returns only a proposal: Chat origin, current goal/conversation context, review after actual implementation artifact/revision. No resource is created or started.',
  ],
};

export function collaborationToolManifests(): SupervisedToolManifest[] {
  return COLLABORATION_TOOL_NAMES.map((name) => ({
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION, name, manifestVersion: '1.0',
    description: name === DISCOVER_COLLABORATION_CATS
      ? 'Discover bounded eligible Cats for collaboration in the local owner Chat scope.'
      : name === INSPECT_COLLABORATION_CONTEXT
        ? 'Inspect the current authorized collaboration conversation without reading other conversations.'
        : 'Validate a collaboration proposal without changing conversations, membership or work.',
    sideEffect: 'none', preflight: 'available', blocking: 'blocking',
    cancellation: 'cooperative', approval: 'never', evidence: 'summary',
    failureCodes: ['E_SCHEMA_INVALID', 'E_TOOL_SCOPE_DENIED', 'E_PRECHECK_FAILED'],
    inputSchema: { id: `${name}.input`, version: '1.0', format: 'json_schema' },
    outputSchema: { id: `${name}.output`, version: '1.0', format: 'json_schema' },
  }));
}

export function collaborationToolDescriptors(
  policy: ProviderAgentBoundedObservation['policy'],
): ProviderAgentToolDescriptor[] {
  if (policy.dials.autonomy === 'none') return [];
  return collaborationToolManifests().filter((manifest) => evaluateToolSurface(manifest, {
    parentToolScope: policy.parentToolScope ?? policy.dials.toolScope,
    policyToolScope: policy.dials.toolScope,
  }).allowed).map((manifest) => ({
    manifest, reason: 'Read and prepare collaboration; execution is unavailable in this phase.',
    inputHints: TOOL_HINTS[manifest.name],
  }));
}

export function isCollaborationTool(name: string): boolean {
  return (COLLABORATION_TOOL_NAMES as readonly string[]).includes(name);
}

export interface CollaborationCandidate {
  id: string;
  name: string;
  declaredRoles: string[];
  rolesTruncated: boolean;
  target: { provider: string | null; instance: string | null; model: string | null };
  configured: boolean;
  providerAvailability: 'ok' | 'degraded' | 'unavailable' | 'unknown';
  currentConversationLease: string;
  capabilityEvidence: 'declared_only';
}

export interface CollaborationProposal {
  status: 'prepared';
  revision: string;
  goal: string;
  goalTruncated: boolean;
  originSurface: 'chat';
  conversation: { intent: 'reuse_current' | 'create'; sourceConversationId: string };
  implementer: CollaborationCandidate;
  reviewer: CollaborationCandidate;
  contextScope: { goal: true; conversationId: string; otherConversations: false };
  expectedOutput: string;
  reviewDependsOn: 'verified_implementation_artifact_or_revision';
  budget: { maxDurationMs: number; maxTokens: number; admission: 'not_admitted' };
  execution: 'not_started';
  executionRevision?: string;
}

export type CollaborationPreparation = CollaborationProposal | {
  status: 'needs_input' | 'unavailable'; revision: string; reasons: string[];
};

export interface CollaborationReadReceipt {
  toolName: string;
  decisionId: string;
  result: ToolResult<unknown>;
}

export interface CollaborationReport {
  schemaVersion: 1;
  revision: string;
  status: 'prepared' | 'needs_input' | 'unavailable' | 'inspected' | 'stopped';
  preparation?: CollaborationPreparation;
  reason?: string;
  feedbackDelivered: boolean;
  receipts: CollaborationReadReceipt[];
  execution?: CollaborationExecutionSummary;
}

export interface CollaborationSnapshot {
  revision: string;
  executionRevision?: string;
  candidates: CollaborationCandidate[];
  context: {
    channelId: string; conversationId: string; originSurface: 'chat';
    topology: 'chat_channel'; status: string; workspaceConfigured: boolean;
    participantIds: string[]; participantsTruncated: boolean;
    routingStatus: string | null; workState: 'not_inspected';
  };
}

/** Owner-scoped directory and current conversation only; no transcript/memory/secret projection. */
export function collaborationSnapshot(
  state: ChatState, channelId: string, observation: ProviderAgentBoundedObservation,
): CollaborationSnapshot | null {
  const channel = state.channels.find((entry) => entry.id === channelId);
  if (!channel || !isOrchestratorKnowledgeChannel(channel) || isDirectLaneChannel(channel)
    || channel.status === 'archived' || observation.actor.actorRef !== 'orchestrator') return null;
  const assignments = resolveChannelParticipantAssignments(channel)
    .filter((entry) => entry.status === 'active');
  const cats = state.cats.filter((cat) => cat.status === 'active' && isCatPartOfChatProduct(cat));
  const candidates = cats.map((cat): CollaborationCandidate => {
    const assignment = assignments.find((entry) => entry.sourceKind === 'cat' && entry.sourceRefId === cat.id);
    const target = assignment?.execution.target ?? cat.defaultExecutionTarget;
    return {
      id: cat.id, name: cat.name.slice(0, 128),
      declaredRoles: cat.roles.slice(0, 8).map((role) => role.slice(0, 80)),
      rolesTruncated: cat.roles.length > 8 || cat.roles.some((role) => role.length > 80),
      target: { provider: target.provider, instance: target.instance ?? null, model: target.model },
      configured: Boolean(target.provider), providerAvailability: 'unknown',
      currentConversationLease: assignment?.execution.lease.status ?? 'not_attached',
      capabilityEvidence: 'declared_only',
    };
  });
  const context: CollaborationSnapshot['context'] = {
    channelId, conversationId: resolveChannelCanonicalIdentity(state, channelId).conversationId,
    originSurface: 'chat', topology: 'chat_channel', status: channel.status,
    workspaceConfigured: Boolean(channel.repoPath || channel.chatCwd),
    participantIds: assignments.slice(0, 32).map((entry) => entry.participantId),
    participantsTruncated: assignments.length > 32,
    routingStatus: channel.roomRouting?.lastOutcome?.status ?? null,
    workState: 'not_inspected',
  };
  const revision = knowledgeDigest(JSON.stringify({
    owner: state.id, context, candidates,
    // Include non-displayed controls and all memberships to invalidate truncated projections too.
    cats: cats.map(({ id, defaultExecutionTarget, defaultModelSelection, roles }) =>
      ({ id, defaultExecutionTarget, defaultModelSelection, roles })),
    assignments, repoPath: channel.repoPath, chatCwd: channel.chatCwd,
    target: resolveOrchestratorExecutionTarget(state, channel),
    policy: observation.policy, capabilities: state.capabilities,
    goal: observation.goal, tools: observation.availableTools.map(({ manifest }) => manifest),
  }));
  return { revision, executionRevision: collaborationExecutionRevision(state, channelId), candidates, context };
}

function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.includes(key));
}
function textValue(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function positiveInteger(value: unknown, max: number): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= max;
}
function reject(message: string, code: 'E_SCHEMA_INVALID' | 'E_PRECHECK_FAILED' | 'E_TOOL_SCOPE_DENIED' = 'E_SCHEMA_INVALID'): ToolResult<never> {
  return { status: 'rejected', error: { code, message } };
}

function withAvailability(
  candidate: CollaborationCandidate, diagnostics?: RuntimeProviderDiagnosticsPayload,
): CollaborationCandidate {
  const match = diagnostics?.providers.find((entry) => entry.provider === candidate.target.provider
    && (candidate.target.instance ? entry.instance === candidate.target.instance : entry.defaultTarget));
  return { ...candidate, providerAvailability: match?.availability.status ?? 'unknown' };
}

export function executeCollaborationRead(input: {
  toolName: string; toolInput: unknown; snapshot: CollaborationSnapshot; goal: string;
  receipts: CollaborationReadReceipt[]; diagnostics?: RuntimeProviderDiagnosticsPayload;
}): ToolResult<unknown> {
  const { toolName, toolInput: value, snapshot } = input;
  if (toolName === INSPECT_COLLABORATION_CONTEXT) {
    if (!record(value, [])) return reject('inspect_context accepts only an empty object.');
    return { status: 'applied', result: { revision: snapshot.revision, ...snapshot.context } };
  }
  if (toolName === DISCOVER_COLLABORATION_CATS) {
    if (!record(value, ['query', 'limit'])
      || (value.query !== undefined && !textValue(value.query, 128))
      || (value.limit !== undefined && !positiveInteger(value.limit, 16))) {
      return reject('discover_cats requires an optional query <=128 characters and limit 1..16.');
    }
    const query = typeof value.query === 'string' ? value.query.toLocaleLowerCase() : '';
    const matches = snapshot.candidates.filter((cat) =>
      `${cat.name} ${cat.declaredRoles.join(' ')}`.toLocaleLowerCase().includes(query));
    const limit = typeof value.limit === 'number' ? value.limit : 8;
    const candidates: CollaborationCandidate[] = [];
    for (const match of matches.slice(0, limit)) {
      const candidate = withAvailability(match, input.diagnostics);
      // Bound the whole result, not only individual fields. Never truncate IDs or targets.
      if (JSON.stringify([...candidates, candidate]).length > 10_000) break;
      candidates.push(candidate);
    }
    return { status: 'applied', result: {
      revision: snapshot.revision, candidates, truncated: candidates.length < matches.length,
      availabilitySource: input.diagnostics ? 'runtime_light' : 'unavailable',
      executionAdmitted: false,
    } };
  }
  if (toolName !== PREPARE_COLLABORATION) return reject('Unknown collaboration operation.', 'E_TOOL_SCOPE_DENIED');
  if (!record(value, ['revision', 'implementerId', 'reviewerId', 'conversationIntent',
    'expectedOutput', 'missingInformation', 'budget'])
    || !textValue(value.revision, 128)
    || !['reuse_current', 'create'].includes(String(value.conversationIntent))
    || !textValue(value.expectedOutput, 1000)
    || !Array.isArray(value.missingInformation) || value.missingInformation.length > 3
    || !value.missingInformation.every((item) => textValue(item, 200))
    || !record(value.budget, ['maxDurationMs', 'maxTokens'])
    || !positiveInteger(value.budget.maxDurationMs, 3_600_000)
    || !positiveInteger(value.budget.maxTokens, 100_000)
    || (value.implementerId !== undefined && !textValue(value.implementerId, 120))
    || (value.reviewerId !== undefined && !textValue(value.reviewerId, 120))) {
    return reject('Invalid collaboration preparation input. Follow the current descriptor input hints.');
  }
  if (value.revision !== snapshot.revision) return reject('Stale collaboration revision. Read again.', 'E_PRECHECK_FAILED');
  const readResults = input.receipts.flatMap((receipt) => {
    if (receipt.result.status !== 'applied' || !receipt.result.result
      || typeof receipt.result.result !== 'object') return [];
    const result = receipt.result.result as Record<string, unknown>;
    return result.revision === snapshot.revision ? [{ toolName: receipt.toolName, result }] : [];
  });
  const discovery = readResults.filter((entry) => entry.toolName === DISCOVER_COLLABORATION_CATS);
  if (!discovery.length || !readResults.some((entry) => entry.toolName === INSPECT_COLLABORATION_CONTEXT)) {
    return reject('Discover Cats and inspect context at the current revision before preparing.', 'E_PRECHECK_FAILED');
  }
  if (value.missingInformation.length) return { status: 'applied', result: {
    status: 'needs_input', revision: snapshot.revision, reasons: value.missingInformation,
  } satisfies CollaborationPreparation };
  const discoveredIds = new Set(discovery.flatMap(({ result }) =>
    (result.candidates as CollaborationCandidate[]).map((cat) => cat.id)));
  const select = (id: unknown) => snapshot.candidates.find((cat) => cat.id === id && discoveredIds.has(cat.id));
  if (value.implementerId === undefined || value.reviewerId === undefined) {
    return { status: 'applied', result: {
      status: 'unavailable', revision: snapshot.revision,
      reasons: ['Two suitable, distinct discovered Cats have not been selected.'],
    } satisfies CollaborationPreparation };
  }
  const implementer = select(value.implementerId);
  const reviewer = select(value.reviewerId);
  if (!implementer || !reviewer || implementer.id === reviewer.id) {
    return reject('Select two distinct existing Cats from the current discovery result.', 'E_PRECHECK_FAILED');
  }
  const selected = [implementer, reviewer].map((cat) => withAvailability(cat, input.diagnostics));
  if (selected.some((cat) => !cat.configured || cat.providerAvailability === 'unavailable')) {
    return { status: 'applied', result: {
      status: 'unavailable', revision: snapshot.revision,
      reasons: ['A selected Cat has no configured execution target or its provider is unavailable.'],
    } satisfies CollaborationPreparation };
  }
  return { status: 'applied', result: {
    status: 'prepared', revision: snapshot.revision, goal: input.goal.slice(0, 2000),
    goalTruncated: input.goal.length > 2000, originSurface: 'chat',
    conversation: { intent: value.conversationIntent as 'reuse_current' | 'create',
      sourceConversationId: snapshot.context.conversationId },
    implementer: selected[0]!, reviewer: selected[1]!,
    contextScope: { goal: true, conversationId: snapshot.context.conversationId, otherConversations: false },
    expectedOutput: value.expectedOutput,
    reviewDependsOn: 'verified_implementation_artifact_or_revision',
    budget: { maxDurationMs: value.budget.maxDurationMs, maxTokens: value.budget.maxTokens,
      admission: 'not_admitted' }, execution: 'not_started',
    executionRevision: snapshot.executionRevision,
  } satisfies CollaborationProposal };
}
