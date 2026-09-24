import type { ChatState, ChatMessageChoiceResponse } from '../api/contracts.js';
import type { SupervisedToolManifest } from '../../../platform/supervision/contracts.js';
import type { ProviderAgentToolDescriptor } from '../../../platform/orchestration/providerAgentDecision.js';
import { DEFAULT_SUPERVISION_SCHEMA_VERSION } from '../../../platform/supervision/contracts.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import { resolveChannelParticipantAssignments } from '../shared/channelParticipants.js';
import { resolveOrchestratorExecutionTarget } from './runtimeTargeting.js';
import type { CollaborationProposal, CollaborationReport } from './orchestratorCollaboration.js';

export const ACCEPT_COLLABORATION = 'execute_collaboration';
export const ENSURE_COLLABORATION_CONVERSATION = 'chat.collaboration.ensure_conversation';
export const ENSURE_COLLABORATION_PARTICIPANTS = 'chat.collaboration.ensure_participants';
export const REQUEST_COLLABORATION_ROLE = 'work.collaboration.request_role';
export const INSPECT_COLLABORATION_WORK = 'work.collaboration.inspect';
export const STOP_COLLABORATION_WORK = 'work.collaboration.stop';
export const EXECUTION_TOOL_NAMES = [ENSURE_COLLABORATION_CONVERSATION,
  ENSURE_COLLABORATION_PARTICIPANTS, REQUEST_COLLABORATION_ROLE,
  INSPECT_COLLABORATION_WORK, STOP_COLLABORATION_WORK] as const;
export const isCollaborationExecutionTool = (name: string) =>
  (EXECUTION_TOOL_NAMES as readonly string[]).includes(name);

/** Stable execution settings only; normal turn/lease/memory updates do not revoke a proposal. */
export function collaborationExecutionRevision(state: ChatState, channelId: string): string {
  const channel = state.channels.find((entry) => entry.id === channelId);
  if (!channel) return '';
  return knowledgeDigest(JSON.stringify({ owner: state.id, channel: {
    id: channel.id, origin: channel.originSurface, kind: channel.channelKind,
    status: channel.status === 'archived' ? 'archived' : 'active',
    repoPath: channel.repoPath, cwd: channel.chatCwd,
    continuityResetAt: channel.continuityResetAt,
    workspaceKind: channel.runtimeWorkspaceKind, workspaceAccess: channel.runtimeWorkspaceAccess,
    permissionMode: channel.runtimePermissionMode,
    target: resolveOrchestratorExecutionTarget(state, channel),
    participants: resolveChannelParticipantAssignments(channel).map((entry) => ({
      id: entry.participantId, status: entry.status, sourceRefId: entry.sourceRefId,
      target: entry.execution.target, modelSelection: entry.execution.modelSelection,
    })),
  }, capabilities: state.capabilities, cats: state.cats.map((cat) => ({
    id: cat.id, status: cat.status, products: cat.products, roles: cat.roles,
    target: cat.defaultExecutionTarget, modelSelection: cat.defaultModelSelection,
  })) }));
}
export interface CollaborationOwnerChoice {
  proposalMessageId: string; originalMessageId: string; originalGoalDigest: string;
  proposal: CollaborationProposal;
}
export function resolveCollaborationOwnerChoice(
  state: ChatState, channelId: string, response?: ChatMessageChoiceResponse | null,
): CollaborationOwnerChoice | null {
  if (response?.status !== 'submitted' || response.answers.length !== 1) return null;
  const answer = response.answers[0]!;
  if (answer.skipped || answer.customText?.trim() || answer.selectedOptionIds.length !== 1
    || answer.selectedOptionIds[0] !== ACCEPT_COLLABORATION) return null;
  const channel = state.channels.find((entry) => entry.id === channelId);
  const message = channel?.messages.find((entry) => entry.id === response.sourceMessageId);
  if (message?.senderKind !== 'orchestrator'
    || message.metadata.event !== 'orchestrator_collaboration_preparation'
    || !message.choices?.some((choice) => choice.question === answer.question
      && choice.options.some((option) => option.id === ACCEPT_COLLABORATION))) return null;
  const report = message.metadata.collaborationPreparation as CollaborationReport | undefined;
  const proposal = report?.preparation;
  if (report?.status !== 'prepared' || proposal?.status !== 'prepared'
    || !proposal.executionRevision || proposal.goalTruncated) return null;
  const original = channel?.messages.find((entry) => entry.id === message.metadata.sourceMessageId);
  if (original?.senderKind !== 'user' || original.body !== proposal.goal) return null;
  return { proposalMessageId: message.id, originalMessageId: original.id,
    originalGoalDigest: knowledgeDigest(original.body), proposal };
}
export function collaborationExecutionManifests(): SupervisedToolManifest[] {
  return EXECUTION_TOOL_NAMES.map((name) => ({ schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name, manifestVersion: '1.0', description: name === REQUEST_COLLABORATION_ROLE
      ? 'Queue one fixed role Run only; the host separately validates the owner grant before Runtime execution.'
      : name === INSPECT_COLLABORATION_WORK ? 'Inspect only the admitted collaboration intent.'
        : name === STOP_COLLABORATION_WORK ? 'Stop owned collaboration execution and preserve completed effects.'
          : 'Ensure an admitted conversation or its two selected participants through Chat delegates.',
    sideEffect: name === INSPECT_COLLABORATION_WORK ? 'none' : 'local_state',
    preflight: 'required', blocking: 'blocking', cancellation: 'cooperative',
    approval: 'policy', evidence: 'summary',
    failureCodes: ['E_SCHEMA_INVALID', 'E_TOOL_SCOPE_DENIED', 'E_PRECHECK_FAILED', 'E_BUDGET_EXCEEDED'],
    inputSchema: { id: `${name}.input`, version: '1.0', format: 'json_schema' },
    outputSchema: { id: `${name}.output`, version: '1.0', format: 'json_schema' },
  }));
}
export function collaborationExecutionDescriptors(): ProviderAgentToolDescriptor[] {
  return collaborationExecutionManifests().map((manifest) => ({ manifest,
    reason: 'Owner-confirmed proposal only. The server binds intent, targets, scope and budget.',
    inputHints: [manifest.name === REQUEST_COLLABORATION_ROLE
      ? 'Input: { role: "implementation" | "review" }. No other fields. Repeated calls return existing stage; they never start a new attempt.'
      : 'Input: {} only. No caller-supplied intent, Cat, conversation, task, run, path or grant.',
    'Sequence: ensure_conversation, ensure_participants, request_role implementation, request_role review, inspect. Queue accepted is not Runtime started; wait for the host inspection receipt. Stop on rejection or blocked work.',
    'A clean new commit verifies captured revision only. An attributed review verdict is not proof that tests passed.'],
  }));
}
