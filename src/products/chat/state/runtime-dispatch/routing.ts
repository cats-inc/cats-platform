import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatChannelState,
  ChatMessage,
  ChatState,
  MessageOrigin,
  DirectSlashModePostureChangeMetadata,
  ProductIntentCommandMetadata,
  ProductIntentCommandSource,
  ProductIntentUserMessageMetadata,
  SendChannelMessageIdentity,
} from '../../api/contracts.js';
import { createCatActorId } from '../../../../core/actors.js';
import type { CatsCoreState } from '../../../../core/types.js';
import { resolveTransportBindingDirectLane } from '../../../../core/transportBindingDirectLane.js';
import {
  upsertCoreLane,
  upsertCoreSegment,
  upsertCoreTurn,
  upsertCoreWorkItem,
} from '../../../../core/model/index.js';
import type { ProviderAgentDecision } from '../../../../platform/orchestration/index.js';
import {
  resolveProviderCapabilityProfile,
  type ProviderCapabilityBootstrapConfig,
  type ProviderCapabilityBootstrapDiagnosticSink,
} from '../../../../platform/supervision/index.js';
import type {
  RoomRoutingGuardReason,
} from '../../../../shared/roomRouting.js';
import type { RuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import type {
  CompanionBoxStore,
} from '../companion-box/index.js';
import type { ChatStore } from '../store.js';
import type { CatsMemoryService } from '../../../../platform/memory/index.js';
import { bestEffortFlushRuntimeSessionMemory } from '../../../../platform/memory/runtimeMaintenance.js';
import type {
  RuntimeClient,
} from '../../../../platform/runtime/client.js';
import {
  appendMessage,
  requireChannel,
  resolveChannelCanonicalIdentity,
  setChannelPendingExecutionTarget,
  setChannelOrchestratorLease,
} from '../model/index.js';
import {
  sameProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import {
  createTranslator,
  messageKeys,
  parseMessageLocale,
  type MessageLocale,
} from '../../../../shared/i18n/index.js';
import { normalizeRuntimeDispatchRecoveryPolicy } from '../../../../shared/runtimeRecovery.js';
import {
  buildDirectLaneTransportBindingId,
  buildChatOwnerParticipantId,
} from '../../../../shared/chatCoreIds.js';
import {
  buildCanonicalChatUserMessage,
} from '../chatCoreInterop.js';
import { refreshDerivedMemoryLayers } from '../memoryLayers.js';
import {
  resolveNextPendingExecutionTarget,
} from '../pendingExecutionTarget.js';
import { isProviderDefaultChatChannel } from '../../shared/channelTopology.js';
import {
  type RuntimeTransportContext,
} from '../runtimeTargeting.js';
import { buildChatWorkIntakeSourceContext } from '../workIntakeSourceContext.js';
import {
  createWorkIntakeDelegate,
  proposeWorkItemSplit,
} from '../../../work/state/workIntakeDelegate.js';
import {
  createWorkTriageDelegate,
} from '../../../work/state/workTriageDelegate.js';
import {
  prepareWorkItemExecution,
} from '../../../work/state/workExecutionPreparationDelegate.js';
import {
  createWorkExecutionTaskDelegate,
} from '../../../work/state/workExecutionTaskDelegate.js';
import {
  createWorkExternalBindingDelegate,
} from '../../../work/state/workExternalBindingDelegate.js';
import {
  resolveWorkExecutionPreparationPhase,
} from '../../../work/shared/workExecutionPreparationPhase.js';
import {
  resolveWorkExternalBindingPhase,
} from '../../../work/shared/workExternalBindingPhase.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  WORK_ITEM_ASSIGN_PROJECT_TOOL,
  WORK_ITEM_PREPARE_EXECUTION_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  WORK_PROJECT_LOOKUP_TOOL,
  WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
  type WorkExternalLinkIssueResult,
  type WorkExternalUnlinkIssueResult,
  type WorkItemAssignProjectResult,
  type WorkItemExecutionPreparationProposal,
  type WorkItemCaptureInput,
  type WorkItemPrepareExecutionInput,
  type WorkItemProposeSplitInput,
  type WorkItemSourceRef,
  type WorkItemSplitCandidate,
  type WorkItemKind,
  type WorkItemPriorityHint,
  type WorkItemTriageStatus,
  type WorkItemUpdateResult,
  type WorkProjectCreateResult,
  type WorkProjectCreateStatus,
  type WorkProjectLookupProject,
} from '../../../work/shared/workToolSurface.js';
import {
  prepareDispatchTurn,
  prepareDispatchTurnForUserMessage,
  prepareDispatchTurnForExistingUserMessage,
} from './turn.js';
import {
  buildDeterministicRoutingPlanMessageMetadata,
  type DeterministicChatRoutingPlan,
} from './deterministicPlan.js';
import type {
  ChannelDispatchCancellationRegistry,
} from './cancellation.js';
import {
  materializeInFlightDispatchState,
  persistInFlightDispatchState,
} from './persistence.js';
import {
  finalizeDispatchTurn,
} from './finalize.js';
import { processDispatchQueue } from './loop.js';
import { mergeCompletedDispatchState } from './merge.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createWorkflowEvent,
  finalizeWorkflowTurn,
} from '../room-routing/workflow.js';
import { applyRoomRoutingSnapshot } from '../runtime-session/state.js';
import {
  resolveTargets,
} from '../room-routing/runtime.js';
import {
  resolveOrchestratorLeaseAttachment,
  resolvePrimaryParticipantExecutionAssignment,
} from '../../shared/channelParticipants.js';
import { parseProductIntentCommand } from '../../shared/productIntentCommands.js';
import {
  buildProductPresetIntentContext,
  type ProductPresetIntentContext,
  type ProductPresetIntentOriginSurface,
  type ProductPresetIntentPresetId,
  type ProductPresetIntentSourceProduct,
  type ProductPresetIntentTransport,
} from '../../shared/productPresetIntentContext.js';
import {
  buildProductIntentActiveAnchorMetadata,
  buildProductIntentIntakeMetadata,
  doesProductIntentActiveAnchorMatchSourceContextRef,
  type ProductIntentActiveAnchorMetadata,
  type ProductIntentActiveAnchorSourceContextRef,
  type ProductIntentIntakeCommandMetadata,
  type ProductIntentIntakeMetadata,
  type ProductIntentIntakeTargetProduct,
} from '../../shared/productIntentIntakeMetadata.js';
import {
  IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN,
  buildImplicitProductIntentCandidateMetadata,
  buildImplicitProductIntentTransitionMetadata,
  detectImplicitProductIntent,
  readImplicitProductIntentCandidateMetadata,
  shouldAppendImplicitProductIntentCandidateSegment,
  type ImplicitProductIntentCandidateMetadata,
  type ImplicitProductIntentCandidateTransitionMetadata,
  type ImplicitProductIntentTransport,
} from '../../shared/implicitProductIntent.js';
import {
  resolveEffectiveChatNaturalProductIntentMode,
  type ChatNaturalProductIntentMode,
} from '../../shared/naturalProductIntentMode.js';
import {
  CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY,
  CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
  CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME,
  CAT_PRODUCT_INTENT_PROPOSAL_TRANSITION_METADATA_KEY,
  buildCatProductIntentProposalCooldownResponse,
  buildCatProductIntentProposalDuplicateResponse,
  buildCatProductIntentProposalMetadata,
  buildCatProductIntentProposalTransitionMetadata,
  findCatProductIntentProposalTransition,
  hasRecentCatProductIntentProposalDecline,
  listExpiredCatProductIntentProposals,
  readCatProductIntentProposalMetadata,
  shouldAppendCatProductIntentProposal,
  validateCatProductIntentProposalToolCall,
  type CatProductIntentProposalMetadata,
  type CatProductIntentProposalRejectionReason,
} from '../../shared/catProductIntentProposal.js';
import {
  ClientMessageIdTooLongError,
  buildClientMessageFingerprint,
  normalizeClientMessageId,
  readPersistedClientMessageFingerprint,
  type ClientMessageIdentityFallbackReason,
  type ClientMessageIdSource,
} from '../../shared/clientMessageIdentity.js';

const WORK_INTAKE_PROPOSAL_METADATA_KEY = 'workIntakeProposal';
const WORK_INTAKE_PROPOSAL_TRANSITION_METADATA_KEY = 'workIntakeProposalTransition';
const WORK_INTAKE_PROPOSAL_METADATA_VERSION = 1;
const WORK_INTAKE_PROPOSAL_CAPTURE_OPTION_ID = 'capture_work_items';
const WORK_INTAKE_PROPOSAL_DECLINE_OPTION_ID = 'decline';
const WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_KEY = 'workExecutionPreparationProposal';
const WORK_EXECUTION_PREPARATION_TRANSITION_METADATA_KEY =
  'workExecutionPreparationTransition';
const WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION = 1;
const WORK_EXECUTION_PREPARATION_CREATE_TASKS_OPTION_ID = 'create_ready_execution_tasks';
const WORK_EXECUTION_PREPARATION_DECLINE_OPTION_ID = 'decline_execution_preparation';
const WORK_EXTERNAL_BINDING_RESULT_METADATA_KEY = 'workExternalBindingResult';
const WORK_EXTERNAL_BINDING_RESULT_METADATA_VERSION = 1;
const WORK_TRIAGE_LOOKUP_RESULT_METADATA_KEY = 'workTriageLookupResult';
const WORK_TRIAGE_LOOKUP_RESULT_METADATA_VERSION = 1;
const WORK_PROJECT_CREATE_RESULT_METADATA_KEY = 'workProjectCreateResult';
const WORK_PROJECT_CREATE_RESULT_METADATA_VERSION = 1;
const WORK_ITEM_UPDATE_RESULT_METADATA_KEY = 'workItemUpdateResult';
const WORK_ITEM_UPDATE_RESULT_METADATA_VERSION = 1;
const WORK_ITEM_ASSIGN_PROJECT_RESULT_METADATA_KEY = 'workItemAssignProjectResult';
const WORK_ITEM_ASSIGN_PROJECT_RESULT_METADATA_VERSION = 1;
const CHAT_WORK_ITEM_ID_PATTERN = /\bwork-item-[a-z0-9][a-z0-9_-]*\b/iu;
const CHAT_PROJECT_ID_PATTERN = /\bproject-[a-z0-9][a-z0-9_-]*\b/iu;
const CHAT_WORK_PROJECT_CREATE_CUE_PATTERN =
  /\b(create|add|new)\s+(a\s+)?project\b|\bproject\s+(create|add|new)\b|建立專案|新增專案/iu;
const CHAT_WORK_ITEM_UPDATE_CUE_PATTERN =
  /\b(update|change|edit|rename|mark|set)\b|修改|更新|改成|標記/iu;
const CHAT_WORK_ITEM_ASSIGN_PROJECT_CUE_PATTERN =
  /\b(assign|attach|move|add|put|link)\b|指派|分配|掛到|掛上|歸到|加入|移到/iu;
const WORK_EXECUTION_PREPARATION_VISIBLE_STATUSES = new Set([
  'draft',
  'planned',
  'ready',
  'blocked',
]);
const WORK_EXECUTION_PREPARATION_PROPOSAL_STATUSES = new Set([
  'draft',
  'planned',
  'ready',
  'blocked',
]);
const WORK_EXECUTION_PREPARATION_READINESS_VALUES = new Set([
  'ready',
  'needs_triage',
  'blocked',
]);
const MAX_WORK_EXECUTION_PREPARATION_VISIBLE_ITEMS = 20;

interface WorkIntakeProposalCandidateMetadata {
  tempId: string;
  title: string;
  summary: string | null;
  kind: WorkItemCaptureInput['kind'] | null;
  priority: WorkItemCaptureInput['priority'] | null;
  confidence: number;
  suggestedProjectTitle: string | null;
  openQuestions: string[];
}

interface WorkIntakeProposalMetadata {
  schemaVersion: typeof WORK_INTAKE_PROPOSAL_METADATA_VERSION;
  phase: 'intake';
  toolName: typeof WORK_ITEM_PROPOSE_SPLIT_TOOL;
  proposalId: string;
  decisionId: string;
  sourceMessageId: string;
  source: Omit<WorkItemSourceRef, 'sourceText'>;
  contextRefs: string[];
  candidates: WorkIntakeProposalCandidateMetadata[];
}

interface WorkIntakeProposalTransitionMetadata {
  schemaVersion: typeof WORK_INTAKE_PROPOSAL_METADATA_VERSION;
  phase: 'intake';
  proposalId: string;
  event: 'captured' | 'declined';
  sourceMessageId: string;
  proposalMessageId: string;
  idempotencyKey: string;
  capturedWorkItemIds: string[];
}

interface WorkExecutionPreparationProposalMetadata {
  schemaVersion: typeof WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION;
  phase: 'execution_preparation';
  toolName: typeof WORK_ITEM_PREPARE_EXECUTION_TOOL;
  proposalId: string;
  decisionId: string;
  sourceMessageId: string;
  scope: 'explicit_work_items' | 'visible_selection' | 'active_context';
  workItemIds: string[];
  proposals: WorkItemExecutionPreparationProposal[];
}

interface WorkExecutionPreparationCreatedTaskMetadata {
  workItemId: string;
  taskId: string;
  taskPath: string;
  created: boolean;
  linked: boolean;
}

interface WorkExecutionPreparationTransitionMetadata {
  schemaVersion: typeof WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION;
  phase: 'execution_preparation';
  proposalId: string;
  event: 'tasks_created' | 'declined';
  sourceMessageId: string;
  proposalMessageId: string;
  idempotencyKey: string;
  createdTasks: WorkExecutionPreparationCreatedTaskMetadata[];
  skippedWorkItemIds: string[];
}

interface WorkExternalBindingResultMetadata {
  schemaVersion: typeof WORK_EXTERNAL_BINDING_RESULT_METADATA_VERSION;
  phase: 'external_tracker_binding';
  toolName: typeof WORK_EXTERNAL_LINK_ISSUE_TOOL | typeof WORK_EXTERNAL_UNLINK_ISSUE_TOOL;
  decisionId: string;
  sourceMessageId: string;
  operation: 'link' | 'unlink';
  event: 'linked' | 'already_linked' | 'unlinked' | 'not_linked';
  localKind: 'project' | 'work_item';
  localId: string;
  provider: 'github' | 'gitlab' | 'gitea' | 'redmine' | 'bugzilla';
  externalType: 'issue' | 'project' | 'ticket';
  externalId: string;
  bindingCount: number;
}

interface WorkTriageLookupResultMetadata {
  schemaVersion: typeof WORK_TRIAGE_LOOKUP_RESULT_METADATA_VERSION;
  phase: 'triage';
  toolName: typeof WORK_PROJECT_LOOKUP_TOOL;
  decisionId: string;
  sourceMessageId: string;
  query: string | null;
  projects: WorkProjectLookupProject[];
}

interface WorkProjectCreateResultMetadata {
  schemaVersion: typeof WORK_PROJECT_CREATE_RESULT_METADATA_VERSION;
  phase: 'triage';
  toolName: typeof WORK_PROJECT_CREATE_TOOL;
  decisionId: string;
  sourceMessageId: string;
  projectId: string;
  title: string;
  status: WorkProjectCreateStatus;
  created: boolean;
}

interface WorkItemUpdateResultMetadata {
  schemaVersion: typeof WORK_ITEM_UPDATE_RESULT_METADATA_VERSION;
  phase: 'triage';
  toolName: typeof WORK_ITEM_UPDATE_TOOL;
  decisionId: string;
  sourceMessageId: string;
  workItemId: string;
  status: WorkItemTriageStatus;
  updated: boolean;
}

interface WorkItemAssignProjectResultMetadata {
  schemaVersion: typeof WORK_ITEM_ASSIGN_PROJECT_RESULT_METADATA_VERSION;
  phase: 'triage';
  toolName: typeof WORK_ITEM_ASSIGN_PROJECT_TOOL;
  decisionId: string;
  sourceMessageId: string;
  workItemId: string;
  projectId: string;
  assigned: boolean;
}

export type ProviderAgentDecisionRequester = (input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  observation: NonNullable<import('./turn.js').PreparedDispatchTurn['providerAgentObservation']>;
  runtimeClient: RuntimeClient;
  now: Date;
}) => Promise<ProviderAgentDecision | null>;

interface RouteChannelMessageOptions {
  transport?: RuntimeTransportContext;
  transportLocale?: string | null;
  transportBindingId?: string | null;
  companionStore?: CompanionBoxStore;
  memoryService?: CatsMemoryService;
  chatStore?: Pick<ChatStore, 'write' | 'readCore' | 'writeCore' | 'updateCore'>;
  latestState?: ChatState;
  runtimeRecovery?: Partial<RuntimeDispatchRecoveryPolicy>;
  chatStatePath?: string;
  runtimeDataDir?: string;
  cancellationRegistry?: ChannelDispatchCancellationRegistry;
  onStateWritten?: (channelId: string) => void;
  deterministicRoutingPlan?: DeterministicChatRoutingPlan | null;
  providerAgentDecisionRequester?: ProviderAgentDecisionRequester;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
  naturalProductIntentMode?: ChatNaturalProductIntentMode;
}

interface ClientMessageAppendPlan {
  kind: 'none' | 'append' | 'idempotent';
  existingMessage?: ChatMessage;
  appendIdentity?: {
    canonicalId?: string;
    clientMessageId: string;
    source: ClientMessageIdSource;
    fingerprint: string;
    reason?: ClientMessageIdentityFallbackReason;
  };
  messageIdentity?: SendChannelMessageIdentity;
}

function readMessageRetryMetadata(
  message: ChatMessage,
): SendChannelMessageInput['messageMetadata'] | undefined {
  const candidateMetadata = message.metadata ?? {};
  const recipientParticipantIds = Array.isArray(candidateMetadata.recipientParticipantIds)
    ? candidateMetadata.recipientParticipantIds.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      )
    : [];
  const workflowShape = candidateMetadata.workflowShape;
  const normalizedWorkflowShape =
    workflowShape === 'sequential'
      || workflowShape === 'concurrent'
      || workflowShape === 'converge'
      || workflowShape === 'parallel'
      ? workflowShape
      : null;

  if (recipientParticipantIds.length === 0 && !normalizedWorkflowShape) {
    return undefined;
  }

  return {
    ...(recipientParticipantIds.length > 0
      ? {
          recipientParticipantIds,
        }
      : {}),
    ...(normalizedWorkflowShape
      ? {
          workflowShape: normalizedWorkflowShape,
        }
      : {}),
  };
}

function resolveUserMessageOrigin(transport: RuntimeTransportContext | undefined): MessageOrigin {
  return transport === 'telegram' ? 'telegram' : 'web';
}

function resolveProductIntentCommandSource(
  transport: RuntimeTransportContext | undefined,
): ProductIntentCommandSource {
  if (transport === 'mobile') {
    return 'mobile';
  }
  return transport === 'telegram' ? 'telegram' : 'web';
}

function resolveImplicitProductIntentTransport(
  transport: RuntimeTransportContext | undefined,
): ImplicitProductIntentTransport {
  return transport === 'telegram' ? 'telegram' : 'web';
}

function isImplicitProductIntentDirectLane(channel: ChatChannelState): boolean {
  return channel.channelKind === 'direct_message'
    || channel.roomRouting?.mode === 'direct_message';
}

function resolveProductIntentCommandMetadata(
  body: string,
  source: ProductIntentCommandSource,
): ProductIntentCommandMetadata | null {
  const parsed = parseProductIntentCommand(body);
  if (!parsed || parsed.kind !== 'product_intent_command') {
    return null;
  }

  return {
    version: 1,
    source,
    command: parsed.command,
    posture: parsed.posture,
    targetProduct: parsed.targetProduct,
    argumentText: parsed.argumentText,
    rawCommandToken: parsed.rawCommandToken,
    botSuffix: parsed.botSuffix,
  };
}

function buildBaseUserMessageMetadata(input: {
  payload: SendChannelMessageInput;
  channelId: string;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
}): Record<string, unknown> {
  return {
    ...(input.payload.messageMetadata ?? {}),
    ...buildDeterministicRoutingPlanMessageMetadata(
      input.deterministicRoutingPlan?.channelId === input.channelId
        ? input.deterministicRoutingPlan
        : null,
    ),
    ...(input.transportBindingId ? { transportBindingId: input.transportBindingId } : {}),
    ...(input.payload.choiceResponse
      ? {
          event: 'choice_response',
          sourceMessageId: input.payload.choiceResponse.sourceMessageId,
        }
      : {}),
  };
}

function resolveClientMessageAppendPlan(input: {
  channel: ChatChannelState;
  payload: SendChannelMessageInput;
  senderName: string;
  metadata: Record<string, unknown>;
}): ClientMessageAppendPlan {
  const clientMessageId = normalizeClientMessageId(input.payload.clientMessageId);
  if (!clientMessageId.supplied || !clientMessageId.value) {
    return { kind: 'none' };
  }
  if (clientMessageId.tooLong) {
    throw new ClientMessageIdTooLongError();
  }

  const fingerprint = buildClientMessageFingerprint({
    senderName: input.senderName,
    body: input.payload.body,
    messageMetadata: input.metadata,
    choiceResponse: input.payload.choiceResponse,
  });
  const existingMessage = input.channel.messages.find((message) =>
    message.id === clientMessageId.value);

  if (clientMessageId.wellFormedV4Uuid && !existingMessage) {
    return {
      kind: 'append',
      appendIdentity: {
        canonicalId: clientMessageId.value,
        clientMessageId: clientMessageId.value,
        source: 'client',
        fingerprint,
      },
      messageIdentity: {
        source: 'client',
        canonicalMessageId: clientMessageId.value,
        clientMessageId: clientMessageId.value,
      },
    };
  }

  if (
    clientMessageId.wellFormedV4Uuid
    && existingMessage
    && existingMessage.senderKind === 'user'
    && readPersistedClientMessageFingerprint(existingMessage) === fingerprint
  ) {
    return {
      kind: 'idempotent',
      existingMessage,
      messageIdentity: {
        source: 'idempotent',
        canonicalMessageId: existingMessage.id,
        clientMessageId: clientMessageId.value,
      },
    };
  }

  const reason: ClientMessageIdentityFallbackReason = clientMessageId.wellFormedV4Uuid
    ? existingMessage?.senderKind === 'user'
      ? 'collision-equivalence-mismatch'
      : 'collision-foreign-sender'
    : 'invalid-uuid';
  if (clientMessageId.wellFormedV4Uuid) {
    console.warn('Client message id collision; falling back to server-generated id.', {
      feature: 'chat_client_message_id_collision',
      channelId: input.channel.id,
      clientMessageId: clientMessageId.value,
      reason,
      existingSenderKind: existingMessage?.senderKind ?? null,
    });
  }
  return {
    kind: 'append',
    appendIdentity: {
      clientMessageId: clientMessageId.value,
      source: 'server_fallback',
      fingerprint,
      reason,
    },
    messageIdentity: {
      source: 'server_fallback',
      canonicalMessageId: '',
      clientMessageId: clientMessageId.value,
      reason,
    },
  };
}

function buildFreshClientMessageIdentity(
  plan: ClientMessageAppendPlan,
  messageId: string,
): SendChannelMessageIdentity | undefined {
  if (!plan.messageIdentity) {
    return undefined;
  }

  return {
    ...plan.messageIdentity,
    canonicalMessageId: messageId,
  };
}

function readProductPostureChangeMetadata(
  value: unknown,
): DirectSlashModePostureChangeMetadata | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1
    || (
      record.posture !== 'chat'
      && record.posture !== 'work'
      && record.posture !== 'code'
    )
  ) {
    return null;
  }

  return record as unknown as DirectSlashModePostureChangeMetadata;
}

function resolvePreviousProductPosture(
  channel: ReturnType<typeof requireChannel>,
): DirectSlashModePostureChangeMetadata['posture'] | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    const postureChange = readProductPostureChangeMetadata(
      message.metadata.directSlashModePostureChange,
    );
    if (postureChange) {
      return postureChange.posture;
    }
  }
  return null;
}

interface ProductIntentAudienceResolution {
  accepted: boolean;
  audienceCatId: string | null;
  participantId: string | null;
  rejectionReason: 'non_direct_channel' | 'missing_direct_audience_cat' | null;
}

type ProductIntentAudienceAssignment = ChatChannelState['catAssignments'][number];

function pushUniqueProductIntentAudienceParticipantId(
  target: string[],
  participantId: string | null | undefined,
): void {
  const normalized = participantId?.trim();
  if (normalized && !target.includes(normalized)) {
    target.push(normalized);
  }
}

function resolvePrimaryProductIntentAudienceAssignment(
  channel: ReturnType<typeof requireChannel>,
  activeCatAssignments: ProductIntentAudienceAssignment[],
): ProductIntentAudienceAssignment | null {
  const defaultRecipientId = channel.roomRouting?.defaultRecipientId?.trim()
    || channel.recoverableDirectLaneCatId?.trim()
    || null;
  if (defaultRecipientId) {
    return activeCatAssignments.find((assignment) =>
      assignment.participantId === defaultRecipientId
      || assignment.catId === defaultRecipientId) ?? null;
  }
  return activeCatAssignments[0] ?? null;
}

function resolveProductIntentAddressedAudienceAssignment(input: {
  state?: ChatState;
  channel: ReturnType<typeof requireChannel>;
  channelId?: string;
  payload?: SendChannelMessageInput;
  deterministicRoutingPlan?: DeterministicChatRoutingPlan | null;
  productIntentCommand?: ProductIntentCommandMetadata | null;
  activeCatAssignments: ProductIntentAudienceAssignment[];
}): ProductIntentAudienceAssignment | null {
  if (input.productIntentCommand?.proposedByCatId) {
    const proposedByAssignment = input.activeCatAssignments.find((assignment) =>
      assignment.catId === input.productIntentCommand?.proposedByCatId) ?? null;
    if (proposedByAssignment) {
      return proposedByAssignment;
    }
  }

  const candidateParticipantIds: string[] = [];
  if (
    input.deterministicRoutingPlan
    && input.channelId
    && input.deterministicRoutingPlan.channelId === input.channelId
  ) {
    for (const target of input.deterministicRoutingPlan.routing.initialTargets) {
      if (target.participantKind === 'cat') {
        pushUniqueProductIntentAudienceParticipantId(
          candidateParticipantIds,
          target.participantId,
        );
      }
    }
  }

  const payloadRecipientIds = input.payload?.messageMetadata?.recipientParticipantIds;
  if (Array.isArray(payloadRecipientIds)) {
    for (const participantId of payloadRecipientIds) {
      pushUniqueProductIntentAudienceParticipantId(candidateParticipantIds, participantId);
    }
  }

  if (input.state && input.channelId && input.payload?.body) {
    const mentionedTargets = resolveTargets(input.state, input.channelId, input.payload.body, {
      allowDefaultTarget: false,
      explicitTrigger: 'explicit_mention',
    });
    for (const target of mentionedTargets.targets) {
      if (target.participantKind === 'cat') {
        pushUniqueProductIntentAudienceParticipantId(
          candidateParticipantIds,
          target.participantId,
        );
      }
    }
  }

  for (const participantId of candidateParticipantIds) {
    const assignment = input.activeCatAssignments.find((candidate) =>
      candidate.participantId === participantId) ?? null;
    if (assignment) {
      return assignment;
    }
  }

  return null;
}

function resolveProductIntentAudience(input: {
  state?: ChatState;
  channel: ReturnType<typeof requireChannel>;
  channelId?: string;
  payload?: SendChannelMessageInput;
  deterministicRoutingPlan?: DeterministicChatRoutingPlan | null;
  productIntentCommand?: ProductIntentCommandMetadata | null;
}): ProductIntentAudienceResolution {
  const { channel } = input;
  const activeCatAssignments = channel.catAssignments.filter((assignment) =>
    assignment.status === 'active');
  const isDirectLane = channel.channelKind === 'direct_message'
    || channel.roomRouting?.mode === 'direct_message';

  if (!isDirectLane) {
    if (activeCatAssignments.length < 1) {
      return {
        accepted: false,
        audienceCatId: null,
        participantId: null,
        rejectionReason: 'missing_direct_audience_cat',
      };
    }
    const addressedAssignment = resolveProductIntentAddressedAudienceAssignment({
      ...input,
      channel,
      activeCatAssignments,
    });
    const matchedAssignment = addressedAssignment
      ?? resolvePrimaryProductIntentAudienceAssignment(channel, activeCatAssignments);
    if (!matchedAssignment) {
      return {
        accepted: false,
        audienceCatId: null,
        participantId: null,
        rejectionReason: 'missing_direct_audience_cat',
      };
    }
    return {
      accepted: true,
      audienceCatId: matchedAssignment.catId,
      participantId: matchedAssignment.participantId,
      rejectionReason: null,
    };
  }

  if (activeCatAssignments.length !== 1) {
    return {
      accepted: false,
      audienceCatId: null,
      participantId: null,
      rejectionReason: 'missing_direct_audience_cat',
    };
  }

  const matchedAssignment = resolvePrimaryProductIntentAudienceAssignment(
    channel,
    activeCatAssignments,
  );
  if (!matchedAssignment) {
    return {
      accepted: false,
      audienceCatId: null,
      participantId: null,
      rejectionReason: 'missing_direct_audience_cat',
    };
  }

  return {
    accepted: true,
    audienceCatId: matchedAssignment.catId,
    participantId: matchedAssignment.participantId,
    rejectionReason: null,
  };
}

function resolveDirectAudienceCapabilityProfileKind(input: {
  channel: ReturnType<typeof requireChannel>;
  audience: ProductIntentAudienceResolution;
  assessedAt: string;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
}): DirectSlashModePostureChangeMetadata['capabilityProfileKind'] {
  if (!input.audience.accepted || !input.audience.participantId) {
    return null;
  }

  const assignment = resolvePrimaryParticipantExecutionAssignment(
    input.channel,
    input.audience.participantId,
  );
  const target = assignment?.execution.target ?? null;
  if (!target?.provider) {
    return 'unknown';
  }

  const capabilityProfile = resolveProviderCapabilityProfile(
    {
      provider: target.provider,
      instance: target.instance,
      model: target.model,
      modelSelection: assignment?.execution.modelSelection ?? null,
    },
    {
      assessedAt: input.assessedAt,
      bootstrapConfig: input.providerCapabilityBootstrapConfig,
    },
  );
  input.providerCapabilityBootstrapDiagnosticSink?.emitMany(capabilityProfile.diagnostics);
  return capabilityProfile.kind;
}

function buildProductPostureChangeMetadata(input: {
  channel: ReturnType<typeof requireChannel>;
  channelId: string;
  productIntentCommand: ProductIntentCommandMetadata;
  audience: ProductIntentAudienceResolution;
  capabilityProfileKind: DirectSlashModePostureChangeMetadata['capabilityProfileKind'];
}): DirectSlashModePostureChangeMetadata {
  const previousPosture = resolvePreviousProductPosture(input.channel);
  return {
    version: 1,
    command: input.productIntentCommand.command,
    previousPosture,
    posture: input.productIntentCommand.posture,
    targetProduct: input.productIntentCommand.targetProduct,
    changed: previousPosture !== input.productIntentCommand.posture,
    sourceTransport: input.productIntentCommand.source,
    sourceChannelId: input.channelId,
    audienceCatId: input.audience.audienceCatId,
    capabilityProfileKind: input.capabilityProfileKind,
  };
}

function resolveProductIntentCoreIds(userMessageId: string): {
  turnId: string;
  laneId: string;
  segmentId: string;
  workItemId: string;
} {
  return {
    turnId: `turn-product-intent-${userMessageId}`,
    laneId: `lane-product-intent-${userMessageId}`,
    segmentId: `segment-product-intent-${userMessageId}`,
    workItemId: `work-item-direct-intake-${userMessageId}`,
  };
}

function shouldCreateProductIntentWorkItemAnchor(input: {
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
  activeAnchorClear: DirectSlashModeClearMetadata | null;
}): boolean {
  return (
    input.productIntentCommand.command === 'work'
    || input.productIntentCommand.command === 'code'
  ) && (
    input.postureChange?.changed === true
    || input.activeAnchorClear?.clearReason === 'work_item_terminal'
    || input.activeAnchorClear?.clearReason === 'work_item_missing'
    || input.activeAnchorClear?.clearReason === 'anchor_superseded'
  )
    && input.postureChange?.capabilityProfileKind === 'strong_agent';
}

function shouldRequireHumanWorkItemGate(input: {
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
}): boolean {
  return (
    input.productIntentCommand.command === 'work'
    || input.productIntentCommand.command === 'code'
  ) && (
    input.postureChange?.capabilityProfileKind === 'weak_worker'
    || input.postureChange?.capabilityProfileKind === 'unknown'
  );
}

function normalizeWorkItemTitle(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

type ProductIntentTranslator = ReturnType<typeof createTranslator>;
const PRODUCT_INTENT_EMPTY_ARGUMENT_PROMPT = '(no slash-command argument provided)';

// Single sanctioned builder for product-intent user-message metadata.
// All product-intent paths (strong, weak, unknown, unsupported) MUST funnel
// through here so `productIntentCommand`, `productIntentLocale`, and
// `productIntentArgumentProvided` stay in lockstep — see SPEC-104 §FR-46
// and the `ProductIntentUserMessageMetadata` contract in `chat/api/contracts.ts`.
function buildProductIntentUserMessageMetadata(input: {
  productIntentCommand: ProductIntentCommandMetadata;
  locale: MessageLocale;
}): ProductIntentUserMessageMetadata {
  return {
    productIntentCommand: input.productIntentCommand,
    productIntentLocale: input.locale,
    productIntentArgumentProvided:
      input.productIntentCommand.argumentText.trim().length > 0,
  };
}

function resolveProductIntentMessageLocale(
  channel: ChatChannelState,
  transportLocale?: string | null,
): MessageLocale {
  const explicitLocale = parseMessageLocale(transportLocale)
    ?? parseMessageLocale(channel.language)
    ?? parseMessageLocale(channel.responseLanguage);
  if (explicitLocale) {
    return explicitLocale;
  }

  const languageHint = [
    transportLocale,
    channel.language,
    channel.responseLanguage,
  ].filter((candidate): candidate is string =>
    typeof candidate === 'string' && candidate.trim().length > 0)
    .join(' ')
    .toLowerCase();
  return languageHint.includes('zh')
    || languageHint.includes('chinese')
    || languageHint.includes('traditional')
    ? 'zh-TW'
    : 'en';
}

function resolveProductIntentTargetLabel(targetProduct: 'work' | 'code'): string {
  return targetProduct === 'code' ? 'Code' : 'Work';
}

interface DirectSlashModeActiveAnchorMetadata {
  workItemId: string;
  targetProduct: 'work' | 'code';
  establishedBySegmentId: string;
  establishedAt: string;
}

interface DirectSlashModeHumanGateMetadata {
  kind: 'human_gate_required';
  reason: 'direct_audience_not_strong';
  targetProduct: 'work' | 'code';
  capabilityProfileKind: 'weak_worker' | 'unknown';
  draftSummary: string;
  suggestedActions: Array<{
    kind: 'continue_clarifying' | 'open_work_items' | 'switch_cat';
    label: string;
    path?: string;
  }>;
}

interface DirectSlashModeClearMetadata {
  clearedActiveAnchor: DirectSlashModeActiveAnchorMetadata;
  clearReason:
    | 'chat_posture'
    | 'work_item_terminal'
    | 'work_item_missing'
    | 'anchor_superseded'
    | 'posture_changed';
}

function buildDirectSlashModeActiveAnchor(input: {
  workItemId: string;
  targetProduct: 'work' | 'code';
  segmentId: string;
  establishedAt: string;
}): DirectSlashModeActiveAnchorMetadata {
  return {
    workItemId: input.workItemId,
    targetProduct: input.targetProduct,
    establishedBySegmentId: input.segmentId,
    establishedAt: input.establishedAt,
  };
}

// Note: `ProductPresetIntentOriginSurface` also includes `'api'` and
// `ProductPresetIntentTransport` allows `null` per SPEC-107 §95/§99. Those
// variants are reserved for product-internal / server-side automation ingress
// that would resolve a preset context without a user-facing transport. No such
// caller exists in the current `ProductIntentCommandSource` union (`'web' |
// 'telegram' | 'mobile'`); when that ingress is added, extend
// `ProductIntentCommandSource` and map the new arm to `originSurface: 'api'`
// and `transport: null` here.
function resolveProductPresetIntentOriginSurface(
  source: ProductIntentCommandSource,
): ProductPresetIntentOriginSurface {
  if (source === 'mobile') {
    return 'mobile';
  }
  return source === 'telegram' ? 'telegram' : 'desktop';
}

function resolveProductPresetIntentTransport(
  source: ProductIntentCommandSource,
): ProductPresetIntentTransport {
  return source;
}

function resolveProductIntentIntakeTargetProduct(
  productIntentCommand: ProductIntentCommandMetadata,
): ProductIntentIntakeTargetProduct | null {
  return productIntentCommand.targetProduct === 'code'
    ? 'code'
    : productIntentCommand.targetProduct === 'work'
      ? 'work'
      : null;
}

function resolveProductPresetIntentSourceProduct(
  channel: ChatChannelState,
): ProductPresetIntentSourceProduct {
  if (channel.originSurface === 'code' || channel.originSurface === 'work') {
    return channel.originSurface;
  }
  return 'chat';
}

function resolveProductPresetIntentParallelGroup(
  state: Pick<ChatState, 'parallelChatGroups'>,
  channelId: string,
): ChatState['parallelChatGroups'][number] | null {
  return state.parallelChatGroups.find((group) =>
    group.status === 'active' && group.memberChannelIds.includes(channelId)) ?? null;
}

function resolveProductPresetIntentPresetId(input: {
  state: Pick<ChatState, 'parallelChatGroups'>;
  channel: ChatChannelState;
  channelId: string;
}): ProductPresetIntentPresetId {
  const sourceProduct = resolveProductPresetIntentSourceProduct(input.channel);
  if (
    input.channel.channelKind === 'direct_message'
    || input.channel.roomRouting?.mode === 'direct_message'
  ) {
    return 'direct';
  }

  const parallelGroup = resolveProductPresetIntentParallelGroup(input.state, input.channelId);
  if (parallelGroup) {
    if (sourceProduct === 'code') {
      return 'peer_code';
    }
    if (sourceProduct === 'work') {
      return 'parallel_work';
    }
    return 'parallel_chat';
  }

  const activeCatCount = input.channel.catAssignments.filter((assignment) =>
    assignment.status === 'active').length;
  if (sourceProduct === 'code') {
    return activeCatCount > 1 ? 'team_code' : 'new_code';
  }
  if (sourceProduct === 'work') {
    return activeCatCount > 1 ? 'team_work' : 'new_work';
  }
  return activeCatCount > 1 ? 'group_chat' : 'new_chat';
}

function buildProductPresetIntentContextForCommand(input: {
  state: ChatState;
  channelId: string;
  conversationId: string;
  turnId: string;
  segmentId: string;
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
}): ProductPresetIntentContext {
  return buildProductPresetIntentContextForSource({
    state: input.state,
    channelId: input.channelId,
    conversationId: input.conversationId,
    turnId: input.turnId,
    segmentId: input.segmentId,
    source: input.productIntentCommand.source,
    eligibleCats: input.postureChange?.audienceCatId
      && input.postureChange.capabilityProfileKind
      ? [
          {
            catId: input.postureChange.audienceCatId,
            actorId: createCatActorId(input.postureChange.audienceCatId),
            capabilityProfileKind: input.postureChange.capabilityProfileKind,
          },
        ]
      : [],
  });
}

function buildProductPresetIntentContextForSource(input: {
  state: ChatState;
  channelId: string;
  conversationId: string;
  turnId: string;
  segmentId: string;
  source: ProductIntentCommandSource;
  eligibleCats?: ProductPresetIntentContext['eligibleCats'];
}): ProductPresetIntentContext {
  const channel = requireChannel(input.state, input.channelId);
  const sourceProduct = resolveProductPresetIntentSourceProduct(channel);
  const presetId = resolveProductPresetIntentPresetId({
    state: input.state,
    channel,
    channelId: input.channelId,
  });
  const parallelGroup = resolveProductPresetIntentParallelGroup(input.state, input.channelId);
  // TODO(SPEC-107): when concurrent turn lane materialization ships for
  // group_chat / team_code / team_work, populate `laneId` here. Keep this in
  // sync with `buildProductIntentActiveAnchorSourceContextRefForChannel` so
  // read-time matches do not silently miss the writer's value.
  const source = parallelGroup
    ? {
        containerId: parallelGroup.id,
        branchId: input.channelId,
        conversationId: input.conversationId,
        turnId: input.turnId,
        segmentId: input.segmentId,
      }
    : {
        channelId: input.channelId,
        conversationId: input.conversationId,
        turnId: input.turnId,
        segmentId: input.segmentId,
      };

  return buildProductPresetIntentContext({
    sourceProduct,
    presetId,
    source,
    originSurface: resolveProductPresetIntentOriginSurface(input.source),
    transport: resolveProductPresetIntentTransport(input.source),
    eligibleCats: input.eligibleCats ?? [],
  });
}

// Builds the reader-side source-context-ref used by the active-anchor cache
// matcher. Must produce the same identity field set that
// `buildProductPresetIntentContextForSource` writes, so that
// `doesProductIntentActiveAnchorMatchSourceContextRef` returns true for valid
// follow-ups. When the writer above starts setting `laneId`, this builder must
// add it too — otherwise team/group concurrent-lane follow-ups will silently
// fail the match.
function buildProductIntentActiveAnchorSourceContextRefForChannel(input: {
  state: ChatState;
  channelId: string;
  conversationId: string;
}): ProductIntentActiveAnchorSourceContextRef {
  const channel = requireChannel(input.state, input.channelId);
  const sourceProduct = resolveProductPresetIntentSourceProduct(channel);
  const presetId = resolveProductPresetIntentPresetId({
    state: input.state,
    channel,
    channelId: input.channelId,
  });
  const parallelGroup = resolveProductPresetIntentParallelGroup(input.state, input.channelId);
  if (parallelGroup) {
    return {
      sourceProduct,
      presetId,
      containerId: parallelGroup.id,
      branchId: input.channelId,
      conversationId: input.conversationId,
    };
  }

  return {
    sourceProduct,
    presetId,
    channelId: input.channelId,
    conversationId: input.conversationId,
  };
}

function buildProductIntentIntakeCommandMetadata(
  productIntentCommand: ProductIntentCommandMetadata,
): ProductIntentIntakeCommandMetadata | null {
  const targetProduct = resolveProductIntentIntakeTargetProduct(productIntentCommand);
  if (!targetProduct) {
    return null;
  }

  if (productIntentCommand.sourceKind === 'cat_product_intent_proposal') {
    if (!productIntentCommand.originalProposalId || !productIntentCommand.originalMessageId) {
      return null;
    }
    return {
      sourceKind: 'cat_product_intent_proposal',
      name: targetProduct,
      argumentText: productIntentCommand.argumentText,
      rawCommandToken: CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
      proposalId: productIntentCommand.originalProposalId,
      originalMessageId: productIntentCommand.originalMessageId,
    };
  }

  if (productIntentCommand.sourceKind === 'implicit_confirmation') {
    if (!productIntentCommand.originalCandidateId || !productIntentCommand.originalMessageId) {
      return null;
    }
    return {
      sourceKind: 'implicit_confirmation',
      name: targetProduct,
      argumentText: productIntentCommand.argumentText,
      rawCommandToken: IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN,
      candidateId: productIntentCommand.originalCandidateId,
      originalMessageId: productIntentCommand.originalMessageId,
    };
  }

  if (productIntentCommand.sourceKind) {
    return null;
  }

  return {
    sourceKind: 'explicit_command',
    name: targetProduct,
    argumentText: productIntentCommand.argumentText,
    rawCommandToken: targetProduct === 'code' ? '/code' : '/work',
  };
}

function buildDirectProductIntentIntakeMetadata(input: {
  targetProduct: ProductIntentIntakeTargetProduct;
  sourceContext: ProductPresetIntentContext;
  productIntentCommand: ProductIntentCommandMetadata;
  goal: string;
  successCriteria: string[];
  outOfScope: string[];
  openQuestions: string[];
}): ProductIntentIntakeMetadata | null {
  const command = buildProductIntentIntakeCommandMetadata(input.productIntentCommand);
  if (!command) {
    return null;
  }

  return buildProductIntentIntakeMetadata({
    targetProduct: input.targetProduct,
    sourceContext: input.sourceContext,
    command,
    draft: {
      goal: input.goal,
      successCriteria: input.successCriteria,
      outOfScope: input.outOfScope,
      openQuestions: input.openQuestions,
      proposedNextAction: 'clarify',
    },
  });
}

function buildProductIntentActiveAnchorForDirectCommand(input: {
  activeAnchor: DirectSlashModeActiveAnchorMetadata;
  sourceContext: ProductPresetIntentContext;
}): ProductIntentActiveAnchorMetadata {
  return buildProductIntentActiveAnchorMetadata({
    workItemId: input.activeAnchor.workItemId,
    targetProduct: input.activeAnchor.targetProduct,
    sourceContext: input.sourceContext,
    establishedBySegmentId: input.activeAnchor.establishedBySegmentId,
    establishedAt: input.activeAnchor.establishedAt,
  });
}

function buildDirectSlashModeHumanGate(input: {
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
  translate: ProductIntentTranslator;
}): DirectSlashModeHumanGateMetadata | null {
  if (!shouldRequireHumanWorkItemGate(input)) {
    return null;
  }

  const capabilityProfileKind = input.postureChange?.capabilityProfileKind;
  if (capabilityProfileKind !== 'weak_worker' && capabilityProfileKind !== 'unknown') {
    return null;
  }

  const targetProduct = input.productIntentCommand.targetProduct === 'code' ? 'code' : 'work';
  const targetProductLabel = resolveProductIntentTargetLabel(targetProduct);

  return {
    kind: 'human_gate_required',
    reason: 'direct_audience_not_strong',
    targetProduct,
    capabilityProfileKind,
    draftSummary: input.productIntentCommand.argumentText
      || input.translate(
        messageKeys.chatProductIntentHumanGateDraftSummaryFallback,
        { targetProduct: targetProductLabel },
      ),
    suggestedActions: [
      {
        kind: 'continue_clarifying',
        label: input.translate(messageKeys.chatProductIntentHumanGateContinueClarifying),
      },
      {
        kind: 'open_work_items',
        label: input.translate(messageKeys.chatProductIntentHumanGateOpenWorkItems),
        path: '/work/work-items',
      },
      {
        kind: 'switch_cat',
        label: input.translate(messageKeys.chatProductIntentHumanGateSwitchCat),
      },
    ],
  };
}

function buildDirectSlashModeStateMetadata(input: {
  activeAnchor?: DirectSlashModeActiveAnchorMetadata | null;
  clear?: DirectSlashModeClearMetadata | null;
  humanGate: DirectSlashModeHumanGateMetadata | null;
}): Record<string, unknown> | null {
  if (input.activeAnchor === undefined && !input.clear && !input.humanGate) {
    return null;
  }

  return {
    ...(input.activeAnchor !== undefined ? { activeAnchor: input.activeAnchor } : {}),
    ...(input.clear
      ? {
          clearedActiveAnchor: input.clear.clearedActiveAnchor,
          clearReason: input.clear.clearReason,
        }
      : {}),
    ...(input.humanGate ? { humanGate: input.humanGate } : {}),
  };
}

function buildProductIntentStateMetadata(input: {
  activeAnchor?: ProductIntentActiveAnchorMetadata | null;
}): Record<string, unknown> | null {
  if (input.activeAnchor === undefined) {
    return null;
  }

  return {
    activeAnchor: input.activeAnchor,
  };
}

function buildDirectSlashModeHumanGateChoices(
  humanGate: DirectSlashModeHumanGateMetadata | null,
  translate: ProductIntentTranslator,
): ChatMessage['choices'] {
  if (!humanGate) {
    return undefined;
  }

  return [
    {
      question: translate(messageKeys.chatProductIntentHumanGateQuestion),
      options: humanGate.suggestedActions.map((action) => ({
        id: action.kind,
        label: action.label,
        ...(action.kind === 'open_work_items'
          ? { description: action.path ?? '/work/work-items', style: 'primary' as const }
          : { style: 'secondary' as const }),
      })),
      allowSkip: true,
    },
  ];
}

function describeImplicitProductIntentCandidate(
  candidate: ImplicitProductIntentCandidateMetadata,
  translate: ProductIntentTranslator,
): string {
  const targetProductLabel = resolveProductIntentTargetLabel(candidate.candidate.targetProduct);
  return translate(
    candidate.candidate.targetProduct === 'code'
      ? messageKeys.chatImplicitProductIntentSuggestionCode
      : messageKeys.chatImplicitProductIntentSuggestionWork,
    { targetProduct: targetProductLabel },
  );
}

function buildImplicitProductIntentCandidateChoices(
  candidate: ImplicitProductIntentCandidateMetadata,
  translate: ProductIntentTranslator,
): ChatMessage['choices'] {
  const targetProduct = candidate.candidate.targetProduct;
  const targetProductLabel = resolveProductIntentTargetLabel(targetProduct);
  return [
    {
      question: translate(
        messageKeys.chatImplicitProductIntentQuestion,
        { targetProduct: targetProductLabel },
      ),
      options: [
        {
          id: targetProduct === 'code' ? 'confirm_code' : 'confirm_work',
          label: translate(
            targetProduct === 'code'
              ? messageKeys.chatImplicitProductIntentConfirmCode
              : messageKeys.chatImplicitProductIntentConfirmWork,
          ),
          style: 'primary',
        },
        {
          id: 'decline',
          label: translate(messageKeys.chatImplicitProductIntentDecline),
          style: 'secondary',
        },
      ],
    },
  ];
}

function describeCatProductIntentProposal(
  proposal: CatProductIntentProposalMetadata,
): string {
  return proposal.proposal.summary;
}

function buildCatProductIntentProposalChoices(
  proposal: CatProductIntentProposalMetadata,
  translate: ProductIntentTranslator,
): ChatMessage['choices'] {
  const targetProduct = proposal.proposal.targetProduct;
  const targetProductLabel = resolveProductIntentTargetLabel(targetProduct);
  return [
    {
      question: translate(
        messageKeys.chatImplicitProductIntentQuestion,
        { targetProduct: targetProductLabel },
      ),
      allowSkip: true,
      options: [
        {
          id: targetProduct === 'code' ? 'confirm_code' : 'confirm_work',
          label: translate(
            targetProduct === 'code'
              ? messageKeys.chatImplicitProductIntentConfirmCode
              : messageKeys.chatImplicitProductIntentConfirmWork,
          ),
          style: 'primary',
        },
        {
          id: 'decline',
          label: translate(messageKeys.chatImplicitProductIntentDecline),
          style: 'secondary',
        },
      ],
    },
  ];
}

function describeCatProductIntentProposalTransition(
  transition: ReturnType<typeof buildCatProductIntentProposalTransitionMetadata>,
  translate: ProductIntentTranslator,
): string {
  if (transition.event === 'declined') {
    return translate(messageKeys.chatImplicitProductIntentDeclined);
  }
  if (transition.event === 'expired') {
    return translate(messageKeys.chatImplicitProductIntentExpired);
  }

  return translate(
    transition.targetProduct === 'code'
      ? messageKeys.chatImplicitProductIntentConfirmedCode
      : messageKeys.chatImplicitProductIntentConfirmedWork,
  );
}

function appendCatProductIntentProposalTransitionSidecar(input: {
  state: ChatState;
  channelId: string;
  proposal: CatProductIntentProposalMetadata;
  proposalMessageId?: string;
  originalMessage?: ChatMessage;
  event: 'confirmed' | 'declined' | 'expired';
  locale: MessageLocale;
  now: Date;
}): { state: ChatState; transitionMessage: ChatMessage } {
  const transition = buildCatProductIntentProposalTransitionMetadata({
    proposal: input.proposal,
    event: input.event,
    originalMessageBody: input.originalMessage?.body,
  });
  const translate = createTranslator(input.locale);
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats',
      body: describeCatProductIntentProposalTransition(transition, translate),
    },
    input.now,
    {
      metadata: {
        event: `cat_product_intent_proposal_${input.event}`,
        sourceMessageId: input.proposal.source.messageId,
        sourceProposalMessageId: input.proposalMessageId,
        [CAT_PRODUCT_INTENT_PROPOSAL_TRANSITION_METADATA_KEY]: transition,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    transitionMessage: append.message,
  };
}

function expireCatProductIntentProposalSidecars(input: {
  state: ChatState;
  channelId: string;
  locale: MessageLocale;
  now: Date;
  expireAll?: boolean;
}): ChatState {
  const channel = requireChannel(input.state, input.channelId);
  return listExpiredCatProductIntentProposals({
    messages: channel.messages,
    now: input.now,
    expireAll: input.expireAll,
  }).reduce((state, proposal) =>
    appendCatProductIntentProposalTransitionSidecar({
      state,
      channelId: input.channelId,
      proposal,
      event: 'expired',
      locale: input.locale,
      now: input.now,
    }).state, input.state);
}

function appendCatProductIntentProposalSidecar(input: {
  state: ChatState;
  channel: ChatChannelState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  effectiveMode: ChatNaturalProductIntentMode;
  capabilityProfileKind: DirectSlashModePostureChangeMetadata['capabilityProfileKind'];
  audienceCatId: string | null;
  locale: MessageLocale;
  now: Date;
  transport: RuntimeTransportContext | undefined;
}): { state: ChatState; proposalMessage: ChatMessage | null } {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || input.providerAgentDecision.toolName !== CAT_PRODUCT_INTENT_PROPOSAL_TOOL_NAME
  ) {
    return { state: input.state, proposalMessage: null };
  }
  const validation = validateCatProductIntentProposalToolCall({
    toolInput: input.providerAgentDecision.input,
    effectiveMode: input.effectiveMode,
    capabilityProfileKind: input.capabilityProfileKind,
    sourceMessage: {
      id: input.userMessage.id,
      channelId: input.userMessage.channelId,
      senderKind: input.userMessage.senderKind,
    },
    channelId: input.channelId,
    cooldownActive: hasRecentCatProductIntentProposalDecline({
      messages: input.channel.messages,
      now: input.now,
    }),
  });
  if (!validation.accepted) {
    warnCatProductIntentProposalToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      reason: validation.reason,
      errors: validation.errors,
      response: validation.reason === 'cooldown_active'
        ? buildCatProductIntentProposalCooldownResponse()
        : null,
    });
    return { state: input.state, proposalMessage: null };
  }
  if (!input.audienceCatId) {
    warnCatProductIntentProposalToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      reason: 'missing_audience_cat',
      errors: [],
      response: null,
    });
    return { state: input.state, proposalMessage: null };
  }

  const { conversationId } = resolveChannelCanonicalIdentity(input.state, input.channelId);
  const proposal = buildCatProductIntentProposalMetadata({
    messageId: input.userMessage.id,
    channelId: input.channelId,
    conversationId,
    transport: resolveImplicitProductIntentTransport(input.transport),
    catId: input.audienceCatId,
    actorId: createCatActorId(input.audienceCatId),
    targetProduct: validation.toolInput.targetProduct,
    title: validation.toolInput.title,
    summary: validation.toolInput.summary,
    rationale: validation.toolInput.rationale,
    suggestedNextQuestion: validation.toolInput.suggestedNextQuestion,
    now: input.now,
  });
  if (!shouldAppendCatProductIntentProposal({
    messages: input.channel.messages,
    proposalId: proposal.proposalId,
  })) {
    warnCatProductIntentProposalToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      reason: 'duplicate_proposal',
      errors: [],
      response: buildCatProductIntentProposalDuplicateResponse(proposal.proposalId),
    });
    return { state: input.state, proposalMessage: null };
  }

  const stateWithPriorOpenProposalsExpired = expireCatProductIntentProposalSidecars({
    state: input.state,
    channelId: input.channelId,
    locale: input.locale,
    now: input.now,
    expireAll: true,
  });
  const translate = createTranslator(input.locale);
  const append = appendMessage(
    stateWithPriorOpenProposalsExpired,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats',
      body: describeCatProductIntentProposal(proposal),
    },
    input.now,
    {
      metadata: {
        event: 'cat_product_intent_proposal_created',
        sourceMessageId: input.userMessage.id,
        [CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY]: proposal,
      },
      choices: buildCatProductIntentProposalChoices(proposal, translate),
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    proposalMessage: append.message,
  };
}

function appendWorkIntakeProposalSidecar(input: {
  state: ChatState;
  channel: ChatChannelState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  now: Date;
  transport: RuntimeTransportContext | undefined;
  transportBindingId?: string | null;
}): { state: ChatState; proposalMessage: ChatMessage | null } {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || input.providerAgentDecision.toolName !== WORK_ITEM_PROPOSE_SPLIT_TOOL
  ) {
    return { state: input.state, proposalMessage: null };
  }
  if (hasWorkIntakeProposalSidecar({
    channel: input.channel,
    sourceMessageId: input.userMessage.id,
    decisionId: input.providerAgentDecision.decisionId,
  })) {
    return { state: input.state, proposalMessage: null };
  }

  const sourceContext = buildChatWorkIntakeSourceContext({
    state: input.state,
    channelId: input.channelId,
    message: input.userMessage,
    transport: input.transport,
    transportBindingId: input.transportBindingId,
  });
  const toolInput = {
    ...readToolInputRecord(input.providerAgentDecision.input),
    source: sourceContext.sourceRef,
  } as WorkItemProposeSplitInput;
  const result = proposeWorkItemSplit(toolInput);

  if (result.status !== 'applied') {
    warnWorkIntakeProposalToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
      details: result.status === 'rejected' ? result.error.details : result.summary,
    });
    return { state: input.state, proposalMessage: null };
  }
  const proposalId = buildWorkIntakeProposalId({
    sourceMessageId: input.userMessage.id,
    decisionId: input.providerAgentDecision.decisionId,
  });
  const candidates = result.result.candidates.map<WorkIntakeProposalCandidateMetadata>(
    (candidate) => ({
      tempId: candidate.tempId,
      title: candidate.title,
      summary: candidate.summary ?? null,
      kind: candidate.kind ?? null,
      priority: candidate.priority ?? null,
      confidence: candidate.confidence,
      suggestedProjectTitle: candidate.suggestedProjectTitle ?? null,
      openQuestions: candidate.openQuestions ?? [],
    }),
  );

  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkIntakeProposalCandidates(result.result.candidates),
    },
    input.now,
    {
      choices: buildWorkIntakeProposalChoices(candidates),
      metadata: {
        event: 'work_intake_proposal_created',
        sourceMessageId: input.userMessage.id,
        [WORK_INTAKE_PROPOSAL_METADATA_KEY]: {
          schemaVersion: WORK_INTAKE_PROPOSAL_METADATA_VERSION,
          phase: 'intake',
          toolName: WORK_ITEM_PROPOSE_SPLIT_TOOL,
          proposalId,
          decisionId: input.providerAgentDecision.decisionId,
          sourceMessageId: input.userMessage.id,
          source: stripSourceText(result.result.sourceRef),
          contextRefs: sourceContext.contextRefs,
          candidates,
        } satisfies WorkIntakeProposalMetadata,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    proposalMessage: append.message,
  };
}

function appendWorkExecutionPreparationProposalSidecar(input: {
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  core: CatsCoreState | null | undefined;
  now: Date;
}): { state: ChatState; proposalMessage: ChatMessage | null } {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || input.providerAgentDecision.toolName !== WORK_ITEM_PREPARE_EXECUTION_TOOL
  ) {
    return { state: input.state, proposalMessage: null };
  }
  if (!input.core) {
    warnWorkExecutionPreparationProposalIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_core_state',
    });
    return { state: input.state, proposalMessage: null };
  }

  const phase = resolveWorkExecutionPreparationPhase({
    rawText: input.userMessage.body,
    addressedBossCat: isBossCatAddressedByChannel(input.state, input.channelId),
    activeWorkItemIds: readActiveWorkItemIdsFromMessage(input.userMessage),
    visibleWorkItemIds: resolveVisibleWorkItemIdsForExecutionPreparation({
      state: input.state,
      channelId: input.channelId,
      core: input.core,
    }),
  });
  if (phase.kind !== 'matched' || phase.workItemRefs.length === 0) {
    warnWorkExecutionPreparationProposalIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: phase.reasonCode,
    });
    return { state: input.state, proposalMessage: null };
  }

  const requestedInput = readToolInputRecord(input.providerAgentDecision.input);
  const executionGoal = readOptionalString(requestedInput.executionGoal);
  const maxItems = readOptionalNumber(requestedInput.maxItems);
  const toolInput: WorkItemPrepareExecutionInput = {
    workItemIds: phase.workItemRefs,
    ...(executionGoal ? { executionGoal } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
  };
  const result = prepareWorkItemExecution(input.core, toolInput);
  if (result.status !== 'applied') {
    warnWorkExecutionPreparationProposalIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
      details: result.status === 'rejected' ? result.error.details : result.summary,
    });
    return { state: input.state, proposalMessage: null };
  }

  const proposalId = [
    'work-execution-preparation-proposal',
    input.userMessage.id,
    input.providerAgentDecision.decisionId,
  ].join(':');
  const metadata: WorkExecutionPreparationProposalMetadata = {
    schemaVersion: WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION,
    phase: 'execution_preparation',
    toolName: WORK_ITEM_PREPARE_EXECUTION_TOOL,
    proposalId,
    decisionId: input.providerAgentDecision.decisionId,
    sourceMessageId: input.userMessage.id,
    scope: phase.scope,
    workItemIds: phase.workItemRefs,
    proposals: result.result.proposals,
  };
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkExecutionPreparationProposals(result.result.proposals),
    },
    input.now,
    {
      choices: buildWorkExecutionPreparationProposalChoices(result.result.proposals),
      metadata: {
        event: 'work_execution_preparation_proposed',
        sourceMessageId: input.userMessage.id,
        [WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_KEY]: metadata,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    proposalMessage: append.message,
  };
}

async function appendWorkExternalBindingResultSidecar(input: {
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore' | 'updateCore'>;
  now: Date;
}): Promise<{ state: ChatState; resultMessage: ChatMessage | null }> {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || (
      input.providerAgentDecision.toolName !== WORK_EXTERNAL_LINK_ISSUE_TOOL
      && input.providerAgentDecision.toolName !== WORK_EXTERNAL_UNLINK_ISSUE_TOOL
    )
  ) {
    return { state: input.state, resultMessage: null };
  }
  if (!input.chatStore) {
    warnWorkExternalBindingToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_core_store',
    });
    return { state: input.state, resultMessage: null };
  }

  const phase = resolveWorkExternalBindingPhase({
    rawText: input.userMessage.body,
  });
  if (phase.kind !== 'matched') {
    warnWorkExternalBindingToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: phase.reasonCode,
    });
    return { state: input.state, resultMessage: null };
  }

  const expectedToolName = phase.operation === 'link'
    ? WORK_EXTERNAL_LINK_ISSUE_TOOL
    : WORK_EXTERNAL_UNLINK_ISSUE_TOOL;
  if (input.providerAgentDecision.toolName !== expectedToolName) {
    warnWorkExternalBindingToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'tool_request_operation_mismatch',
      details: {
        expectedToolName,
        requestedToolName: input.providerAgentDecision.toolName,
      },
    });
    return { state: input.state, resultMessage: null };
  }

  const core = await input.chatStore.readCore();
  const delegate = createWorkExternalBindingDelegate({
    coreStore: input.chatStore,
    now: () => input.now,
  });
  const requestedInput = readToolInputRecord(input.providerAgentDecision.input);
  const note = readOptionalString(requestedInput.note);
  const actorRef = core.ownerProfile.actorId;
  const actionId = [
    input.userMessage.id,
    input.providerAgentDecision.decisionId,
    input.providerAgentDecision.toolName,
  ].join(':');
  const runId = `chat:${input.channelId}`;
  const provider = phase.external.provider;
  const externalId = phase.external.externalId;
  if (!provider || !externalId) {
    warnWorkExternalBindingToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'unsupported_external_tracker_url',
    });
    return { state: input.state, resultMessage: null };
  }
  const externalType = phase.external.externalType ?? 'issue';
  const result = phase.operation === 'link'
    ? await delegate.linkIssue(
        {
          localKind: phase.localKind,
          localId: phase.localId,
          provider,
          externalType,
          externalId,
          externalUrl: phase.externalUrl,
          ...(note ? { note } : {}),
        },
        {
          actorRef,
          actionId,
          runId,
        },
      )
    : await delegate.unlinkIssue(
        {
          localKind: phase.localKind,
          localId: phase.localId,
          provider,
          externalType,
          externalId,
          ...(note ? { note } : {}),
        },
        {
          actorRef,
          actionId,
          runId,
        },
      );

  if (result.status !== 'applied') {
    warnWorkExternalBindingToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
      details: result.status === 'rejected' ? result.error.details : result.summary,
    });
    return { state: input.state, resultMessage: null };
  }

  const metadata = buildWorkExternalBindingResultMetadata({
    decisionId: input.providerAgentDecision.decisionId,
    sourceMessageId: input.userMessage.id,
    toolName: input.providerAgentDecision.toolName,
    operation: phase.operation,
    result: result.result,
  });
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkExternalBindingResult(metadata),
    },
    input.now,
    {
      metadata: {
        event: 'work_external_binding_result',
        sourceMessageId: input.userMessage.id,
        [WORK_EXTERNAL_BINDING_RESULT_METADATA_KEY]: metadata,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    resultMessage: append.message,
  };
}

async function appendWorkTriageLookupResultSidecar(input: {
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore' | 'updateCore'>;
  now: Date;
}): Promise<{ state: ChatState; resultMessage: ChatMessage | null }> {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || input.providerAgentDecision.toolName !== WORK_PROJECT_LOOKUP_TOOL
  ) {
    return { state: input.state, resultMessage: null };
  }
  if (!input.chatStore) {
    warnWorkTriageLookupToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_core_store',
    });
    return { state: input.state, resultMessage: null };
  }

  const requestedInput = readToolInputRecord(input.providerAgentDecision.input);
  const query = readOptionalString(requestedInput.query) ?? null;
  const limit = readOptionalNumber(requestedInput.limit);
  const delegate = createWorkTriageDelegate({
    coreStore: input.chatStore,
    now: () => input.now,
  });
  const result = await delegate.lookupProjects({
    ...(query ? { query } : {}),
    ...(limit !== undefined ? { limit } : { limit: 5 }),
  });
  if (result.status !== 'applied') {
    warnWorkTriageLookupToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
      details: result.status === 'rejected' ? result.error.details : result.summary,
    });
    return { state: input.state, resultMessage: null };
  }

  const metadata: WorkTriageLookupResultMetadata = {
    schemaVersion: WORK_TRIAGE_LOOKUP_RESULT_METADATA_VERSION,
    phase: 'triage',
    toolName: WORK_PROJECT_LOOKUP_TOOL,
    decisionId: input.providerAgentDecision.decisionId,
    sourceMessageId: input.userMessage.id,
    query,
    projects: result.result.projects,
  };
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkTriageLookupResult(metadata),
    },
    input.now,
    {
      metadata: {
        event: 'work_triage_lookup_result',
        sourceMessageId: input.userMessage.id,
        [WORK_TRIAGE_LOOKUP_RESULT_METADATA_KEY]: metadata,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    resultMessage: append.message,
  };
}

async function appendWorkProjectCreateResultSidecar(input: {
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore' | 'updateCore'>;
  now: Date;
}): Promise<{ state: ChatState; resultMessage: ChatMessage | null }> {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || input.providerAgentDecision.toolName !== WORK_PROJECT_CREATE_TOOL
  ) {
    return { state: input.state, resultMessage: null };
  }
  if (!input.chatStore) {
    warnWorkProjectCreateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_core_store',
    });
    return { state: input.state, resultMessage: null };
  }
  if (!hasProjectCreateCue(input.userMessage.body)) {
    warnWorkProjectCreateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_project_create_cue',
    });
    return { state: input.state, resultMessage: null };
  }

  const core = await input.chatStore.readCore();
  const requestedInput = readToolInputRecord(input.providerAgentDecision.input);
  const title = readOptionalString(requestedInput.title);
  if (!title) {
    warnWorkProjectCreateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_project_title',
    });
    return { state: input.state, resultMessage: null };
  }

  const { conversationId } = resolveChannelCanonicalIdentity(input.state, input.channelId);
  const summary = readOptionalString(requestedInput.summary);
  const repoPath = readOptionalString(requestedInput.repoPath);
  const status = isWorkProjectCreateStatus(requestedInput.status)
    ? requestedInput.status
    : undefined;
  const delegate = createWorkTriageDelegate({
    coreStore: input.chatStore,
    now: () => input.now,
  });
  const result = await delegate.createProject(
    {
      title,
      primaryConversationId: conversationId,
      ...(summary ? { summary } : {}),
      ...(status ? { status } : {}),
      ...(repoPath ? { repoPath } : {}),
    },
    {
      actorRef: core.ownerProfile.actorId,
      actionId: [
        input.userMessage.id,
        input.providerAgentDecision.decisionId,
        WORK_PROJECT_CREATE_TOOL,
      ].join(':'),
      runId: `chat:${input.channelId}`,
    },
  );
  if (result.status !== 'applied') {
    warnWorkProjectCreateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
      details: result.status === 'rejected' ? result.error.details : result.summary,
    });
    return { state: input.state, resultMessage: null };
  }

  const metadata = buildWorkProjectCreateResultMetadata({
    decisionId: input.providerAgentDecision.decisionId,
    sourceMessageId: input.userMessage.id,
    title,
    result: result.result,
  });
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkProjectCreateResult(metadata),
    },
    input.now,
    {
      metadata: {
        event: 'work_project_create_result',
        sourceMessageId: input.userMessage.id,
        [WORK_PROJECT_CREATE_RESULT_METADATA_KEY]: metadata,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    resultMessage: append.message,
  };
}

async function appendWorkItemUpdateResultSidecar(input: {
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore' | 'updateCore'>;
  now: Date;
}): Promise<{ state: ChatState; resultMessage: ChatMessage | null }> {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || input.providerAgentDecision.toolName !== WORK_ITEM_UPDATE_TOOL
  ) {
    return { state: input.state, resultMessage: null };
  }
  if (!input.chatStore) {
    warnWorkItemUpdateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_core_store',
    });
    return { state: input.state, resultMessage: null };
  }

  const workItemId = extractWorkItemIdFromUpdateText(input.userMessage.body);
  if (!workItemId) {
    warnWorkItemUpdateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_local_work_ref_or_update_cue',
    });
    return { state: input.state, resultMessage: null };
  }

  const core = await input.chatStore.readCore();
  const requestedInput = readToolInputRecord(input.providerAgentDecision.input);
  const title = readOptionalString(requestedInput.title);
  const summary = readOptionalString(requestedInput.summary);
  const status = isWorkItemTriageStatus(requestedInput.status)
    ? requestedInput.status
    : undefined;
  const kind = isWorkItemKind(requestedInput.kind) ? requestedInput.kind : undefined;
  const priority = isWorkItemPriorityHint(requestedInput.priority)
    ? requestedInput.priority
    : undefined;
  const assignmentHint = readOptionalString(requestedInput.assignmentHint);
  const openQuestions = readStringArray(requestedInput.openQuestions);
  if (
    !title
    && !summary
    && !status
    && !kind
    && !priority
    && !assignmentHint
    && openQuestions.length === 0
  ) {
    warnWorkItemUpdateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_update_fields',
    });
    return { state: input.state, resultMessage: null };
  }

  const delegate = createWorkTriageDelegate({
    coreStore: input.chatStore,
    now: () => input.now,
  });
  const result = await delegate.updateWorkItem(
    {
      workItemId,
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(priority ? { priority } : {}),
      ...(assignmentHint ? { assignmentHint } : {}),
      ...(openQuestions.length > 0 ? { openQuestions } : {}),
    },
    {
      actorRef: core.ownerProfile.actorId,
      actionId: [
        input.userMessage.id,
        input.providerAgentDecision.decisionId,
        WORK_ITEM_UPDATE_TOOL,
      ].join(':'),
      runId: `chat:${input.channelId}`,
    },
  );
  if (result.status !== 'applied') {
    warnWorkItemUpdateToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
      details: result.status === 'rejected' ? result.error.details : result.summary,
    });
    return { state: input.state, resultMessage: null };
  }

  const metadata = buildWorkItemUpdateResultMetadata({
    decisionId: input.providerAgentDecision.decisionId,
    sourceMessageId: input.userMessage.id,
    result: result.result,
  });
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkItemUpdateResult(metadata),
    },
    input.now,
    {
      metadata: {
        event: 'work_item_update_result',
        sourceMessageId: input.userMessage.id,
        [WORK_ITEM_UPDATE_RESULT_METADATA_KEY]: metadata,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    resultMessage: append.message,
  };
}

async function appendWorkItemAssignProjectResultSidecar(input: {
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore' | 'updateCore'>;
  now: Date;
}): Promise<{ state: ChatState; resultMessage: ChatMessage | null }> {
  if (
    input.providerAgentDecision?.kind !== 'tool_request'
    || input.providerAgentDecision.toolName !== WORK_ITEM_ASSIGN_PROJECT_TOOL
  ) {
    return { state: input.state, resultMessage: null };
  }
  if (!input.chatStore) {
    warnWorkItemAssignProjectToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_core_store',
    });
    return { state: input.state, resultMessage: null };
  }

  const assignmentRefs = extractWorkItemAssignProjectRefsFromText(input.userMessage.body);
  if (!assignmentRefs) {
    warnWorkItemAssignProjectToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: 'missing_local_work_or_project_ref_or_assign_cue',
    });
    return { state: input.state, resultMessage: null };
  }

  const core = await input.chatStore.readCore();
  const requestedInput = readToolInputRecord(input.providerAgentDecision.input);
  const note = readOptionalString(requestedInput.note);
  const delegate = createWorkTriageDelegate({
    coreStore: input.chatStore,
    now: () => input.now,
  });
  const result = await delegate.assignWorkItemProject(
    {
      workItemId: assignmentRefs.workItemId,
      projectId: assignmentRefs.projectId,
      ...(note ? { note } : {}),
    },
    {
      actorRef: core.ownerProfile.actorId,
      actionId: [
        input.userMessage.id,
        input.providerAgentDecision.decisionId,
        WORK_ITEM_ASSIGN_PROJECT_TOOL,
      ].join(':'),
      runId: `chat:${input.channelId}`,
    },
  );
  if (result.status !== 'applied') {
    warnWorkItemAssignProjectToolCallIgnored({
      channelId: input.channelId,
      messageId: input.userMessage.id,
      decisionId: input.providerAgentDecision.decisionId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
      details: result.status === 'rejected' ? result.error.details : result.summary,
    });
    return { state: input.state, resultMessage: null };
  }

  const metadata = buildWorkItemAssignProjectResultMetadata({
    decisionId: input.providerAgentDecision.decisionId,
    sourceMessageId: input.userMessage.id,
    result: result.result,
  });
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkItemAssignProjectResult(metadata),
    },
    input.now,
    {
      metadata: {
        event: 'work_item_assign_project_result',
        sourceMessageId: input.userMessage.id,
        [WORK_ITEM_ASSIGN_PROJECT_RESULT_METADATA_KEY]: metadata,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    resultMessage: append.message,
  };
}

function buildWorkIntakeProposalId(input: {
  sourceMessageId: string;
  decisionId: string;
}): string {
  return `work-intake-proposal:${input.sourceMessageId}:${input.decisionId}`;
}

function buildWorkIntakeProposalChoices(
  candidates: WorkIntakeProposalCandidateMetadata[],
): ChatMessage['choices'] {
  if (candidates.length === 0) {
    return undefined;
  }

  return [
    {
      question: 'Capture these Work Items?',
      allowSkip: true,
      options: [
        {
          id: WORK_INTAKE_PROPOSAL_CAPTURE_OPTION_ID,
          label: 'Capture Work Items',
          style: 'primary',
        },
        {
          id: WORK_INTAKE_PROPOSAL_DECLINE_OPTION_ID,
          label: 'Ignore',
          style: 'secondary',
        },
      ],
    },
  ];
}

function readWorkIntakeProposalMetadata(value: unknown): WorkIntakeProposalMetadata | null {
  const record = readToolInputRecord(value);
  const source = readToolInputRecord(record.source);
  const candidates = Array.isArray(record.candidates)
    ? record.candidates.map(readWorkIntakeProposalCandidateMetadata)
    : [];
  if (
    record.schemaVersion !== WORK_INTAKE_PROPOSAL_METADATA_VERSION
    || record.phase !== 'intake'
    || record.toolName !== WORK_ITEM_PROPOSE_SPLIT_TOOL
    || typeof record.proposalId !== 'string'
    || typeof record.decisionId !== 'string'
    || typeof record.sourceMessageId !== 'string'
    || (source.surface !== 'chat' && source.surface !== 'telegram')
    || candidates.some((candidate) => candidate === null)
  ) {
    return null;
  }

  return {
    schemaVersion: WORK_INTAKE_PROPOSAL_METADATA_VERSION,
    phase: 'intake',
    toolName: WORK_ITEM_PROPOSE_SPLIT_TOOL,
    proposalId: record.proposalId,
    decisionId: record.decisionId,
    sourceMessageId: record.sourceMessageId,
    source: {
      surface: source.surface,
      conversationId: readOptionalString(source.conversationId),
      channelId: readOptionalString(source.channelId),
      transportBindingId: readOptionalString(source.transportBindingId),
      sourceMessageId: readOptionalString(source.sourceMessageId),
    },
    contextRefs: Array.isArray(record.contextRefs)
      ? record.contextRefs.filter((ref): ref is string => typeof ref === 'string')
      : [],
    candidates: candidates.filter((candidate): candidate is WorkIntakeProposalCandidateMetadata =>
      candidate !== null),
  };
}

function readWorkIntakeProposalCandidateMetadata(
  value: unknown,
): WorkIntakeProposalCandidateMetadata | null {
  const record = readToolInputRecord(value);
  if (
    typeof record.tempId !== 'string'
    || typeof record.title !== 'string'
    || typeof record.confidence !== 'number'
  ) {
    return null;
  }

  return {
    tempId: record.tempId,
    title: record.title,
    summary: readNullableString(record.summary),
    kind: readNullableString(record.kind) as WorkIntakeProposalCandidateMetadata['kind'],
    priority: readNullableString(record.priority) as WorkIntakeProposalCandidateMetadata['priority'],
    confidence: record.confidence,
    suggestedProjectTitle: readNullableString(record.suggestedProjectTitle),
    openQuestions: Array.isArray(record.openQuestions)
      ? record.openQuestions.filter((question): question is string => typeof question === 'string')
      : [],
  };
}

function hasWorkIntakeProposalSidecar(input: {
  channel: ChatChannelState;
  sourceMessageId: string;
  decisionId: string;
}): boolean {
  return input.channel.messages.some((message) => {
    const metadata = readToolInputRecord(
      message.metadata[WORK_INTAKE_PROPOSAL_METADATA_KEY],
    );
    return message.metadata.event === 'work_intake_proposal_created'
      && message.metadata.sourceMessageId === input.sourceMessageId
      && metadata.decisionId === input.decisionId;
  });
}

function describeWorkIntakeProposalCandidates(candidates: WorkItemSplitCandidate[]): string {
  if (candidates.length === 0) {
    return 'No Work Items were proposed from this message.';
  }

  return [
    'Proposed Work Items:',
    ...candidates.map((candidate, index) => `${index + 1}. ${candidate.title}`),
  ].join('\n');
}

function describeWorkExecutionPreparationProposals(
  proposals: WorkItemExecutionPreparationProposal[],
): string {
  if (proposals.length === 0) {
    return 'No execution preparation proposals were created.';
  }

  return [
    'Execution preparation proposals:',
    ...proposals.map((proposal, index) => {
      const details = [
        `${index + 1}. ${proposal.title} (${proposal.readiness})`,
        `   Task: ${proposal.proposedTaskTitle}`,
        proposal.blockers.length > 0
          ? `   Blockers: ${proposal.blockers.join('; ')}`
          : null,
        proposal.openQuestions.length > 0
          ? `   Questions: ${proposal.openQuestions.join('; ')}`
          : null,
      ].filter((line): line is string => Boolean(line));
      return details.join('\n');
    }),
  ].join('\n');
}

function buildWorkExecutionPreparationProposalChoices(
  proposals: WorkItemExecutionPreparationProposal[],
): ChatMessage['choices'] {
  if (proposals.length === 0) {
    return undefined;
  }

  const readyCount = proposals.filter((proposal) => proposal.readiness === 'ready').length;
  return [
    {
      question: 'Create execution Tasks?',
      allowSkip: true,
      options: [
        {
          id: WORK_EXECUTION_PREPARATION_CREATE_TASKS_OPTION_ID,
          label: readyCount === proposals.length ? 'Create Tasks' : 'Create Ready Tasks',
          description: readyCount > 0
            ? `${readyCount} ready Work Item${readyCount === 1 ? '' : 's'} will become `
              + 'pending approval Tasks.'
            : 'No ready Work Items will be converted yet.',
          style: 'primary',
        },
        {
          id: WORK_EXECUTION_PREPARATION_DECLINE_OPTION_ID,
          label: 'Not now',
          style: 'secondary',
        },
      ],
    },
  ];
}

function readWorkExecutionPreparationProposalMetadata(
  value: unknown,
): WorkExecutionPreparationProposalMetadata | null {
  const record = readToolInputRecord(value);
  const proposals = Array.isArray(record.proposals)
    ? record.proposals.map(readWorkExecutionPreparationProposal)
    : [];
  const workItemIds = Array.isArray(record.workItemIds)
    ? record.workItemIds.filter((workItemId): workItemId is string =>
      typeof workItemId === 'string' && workItemId.trim().length > 0)
    : [];

  if (
    record.schemaVersion !== WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION
    || record.phase !== 'execution_preparation'
    || record.toolName !== WORK_ITEM_PREPARE_EXECUTION_TOOL
    || typeof record.proposalId !== 'string'
    || typeof record.decisionId !== 'string'
    || typeof record.sourceMessageId !== 'string'
    || !isWorkExecutionPreparationScope(record.scope)
    || workItemIds.length === 0
    || proposals.some((proposal) => proposal === null)
  ) {
    return null;
  }

  return {
    schemaVersion: WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION,
    phase: 'execution_preparation',
    toolName: WORK_ITEM_PREPARE_EXECUTION_TOOL,
    proposalId: record.proposalId,
    decisionId: record.decisionId,
    sourceMessageId: record.sourceMessageId,
    scope: record.scope,
    workItemIds,
    proposals: proposals.filter((proposal): proposal is WorkItemExecutionPreparationProposal =>
      proposal !== null),
  };
}

function readWorkExecutionPreparationProposal(
  value: unknown,
): WorkItemExecutionPreparationProposal | null {
  const record = readToolInputRecord(value);
  if (
    typeof record.workItemId !== 'string'
    || typeof record.title !== 'string'
    || !isWorkExecutionPreparationProposalStatus(record.status)
    || !isWorkExecutionPreparationReadiness(record.readiness)
    || typeof record.proposedTaskTitle !== 'string'
    || typeof record.proposedTaskSummary !== 'string'
  ) {
    return null;
  }

  return {
    workItemId: record.workItemId,
    title: record.title,
    status: record.status,
    ...(typeof record.projectId === 'string' && record.projectId.trim().length > 0
      ? { projectId: record.projectId }
      : {}),
    readiness: record.readiness,
    proposedTaskTitle: record.proposedTaskTitle,
    proposedTaskSummary: record.proposedTaskSummary,
    openQuestions: readStringArray(record.openQuestions),
    blockers: readStringArray(record.blockers),
  };
}

function isWorkExecutionPreparationScope(
  value: unknown,
): value is WorkExecutionPreparationProposalMetadata['scope'] {
  return value === 'explicit_work_items'
    || value === 'visible_selection'
    || value === 'active_context';
}

function isWorkExecutionPreparationProposalStatus(value: unknown): value is WorkItemTriageStatus {
  return typeof value === 'string' && WORK_EXECUTION_PREPARATION_PROPOSAL_STATUSES.has(value);
}

function isWorkExecutionPreparationReadiness(
  value: unknown,
): value is WorkItemExecutionPreparationProposal['readiness'] {
  return typeof value === 'string' && WORK_EXECUTION_PREPARATION_READINESS_VALUES.has(value);
}

function stripSourceText(sourceRef: WorkItemSourceRef): Omit<WorkItemSourceRef, 'sourceText'> {
  const { sourceText: _sourceText, ...safeSourceRef } = sourceRef;
  return safeSourceRef;
}

function readToolInputRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    : [];
}

function resolveVisibleWorkItemIdsForExecutionPreparation(input: {
  state: ChatState;
  channelId: string;
  core: CatsCoreState;
}): string[] {
  const { conversationId } = resolveChannelCanonicalIdentity(input.state, input.channelId);
  return input.core.workItems
    .filter((workItem) =>
      workItem.conversationId === conversationId
      && WORK_EXECUTION_PREPARATION_VISIBLE_STATUSES.has(workItem.status)
      && workItem.taskId === null)
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
    .slice(0, MAX_WORK_EXECUTION_PREPARATION_VISIBLE_ITEMS)
    .map((workItem) => workItem.id);
}

function isBossCatAddressedByChannel(state: ChatState, channelId: string): boolean {
  const bossCatId = state.bossCatId?.trim();
  if (!bossCatId) {
    return false;
  }

  const channel = requireChannel(state, channelId);
  const defaultRecipientId = channel.roomRouting?.defaultRecipientId?.trim()
    || channel.recoverableDirectLaneCatId?.trim()
    || null;
  if (defaultRecipientId === bossCatId) {
    return true;
  }

  return channel.catAssignments.some((assignment) =>
    assignment.status === 'active'
    && assignment.catId === bossCatId
    && assignment.participantId === defaultRecipientId);
}

function readActiveWorkItemIdsFromMessage(message: ChatMessage): string[] {
  return uniqueNonEmptyStrings([
    readWorkItemIdFromMetadataRef(message.metadata.directSlashModeIntakeRef),
    readWorkItemIdFromMetadataRef(message.metadata.productIntentIntakeRef),
  ]);
}

function readWorkItemIdFromMetadataRef(value: unknown): string | null {
  const record = readToolInputRecord(value);
  const workItemId = record.workItemId;
  if (typeof workItemId !== 'string') {
    return null;
  }

  const normalized = workItemId.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function warnWorkExecutionPreparationProposalIgnored(input: {
  channelId: string;
  messageId: string;
  decisionId: string;
  reason: string;
  details?: unknown;
}): void {
  console.warn('Work execution preparation proposal tool call ignored.', {
    feature: 'work_execution_preparation_proposal',
    channelId: input.channelId,
    messageId: input.messageId,
    decisionId: input.decisionId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  });
}

function warnWorkExternalBindingToolCallIgnored(input: {
  channelId: string;
  messageId: string;
  decisionId: string;
  reason: string;
  details?: unknown;
}): void {
  console.warn('Work external binding tool call ignored.', {
    feature: 'work_external_binding',
    channelId: input.channelId,
    messageId: input.messageId,
    decisionId: input.decisionId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  });
}

function warnWorkTriageLookupToolCallIgnored(input: {
  channelId: string;
  messageId: string;
  decisionId: string;
  reason: string;
  details?: unknown;
}): void {
  console.warn('Work triage lookup tool call ignored.', {
    feature: 'work_triage_lookup',
    channelId: input.channelId,
    messageId: input.messageId,
    decisionId: input.decisionId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  });
}

function warnWorkProjectCreateToolCallIgnored(input: {
  channelId: string;
  messageId: string;
  decisionId: string;
  reason: string;
  details?: unknown;
}): void {
  console.warn('Work project create tool call ignored.', {
    feature: 'work_project_create',
    channelId: input.channelId,
    messageId: input.messageId,
    decisionId: input.decisionId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  });
}

function warnWorkItemUpdateToolCallIgnored(input: {
  channelId: string;
  messageId: string;
  decisionId: string;
  reason: string;
  details?: unknown;
}): void {
  console.warn('Work item update tool call ignored.', {
    feature: 'work_item_update',
    channelId: input.channelId,
    messageId: input.messageId,
    decisionId: input.decisionId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  });
}

function warnWorkItemAssignProjectToolCallIgnored(input: {
  channelId: string;
  messageId: string;
  decisionId: string;
  reason: string;
  details?: unknown;
}): void {
  console.warn('Work item project assignment tool call ignored.', {
    feature: 'work_item_assign_project',
    channelId: input.channelId,
    messageId: input.messageId,
    decisionId: input.decisionId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  });
}

function buildWorkExternalBindingResultMetadata(input: {
  decisionId: string;
  sourceMessageId: string;
  toolName: typeof WORK_EXTERNAL_LINK_ISSUE_TOOL | typeof WORK_EXTERNAL_UNLINK_ISSUE_TOOL;
  operation: 'link' | 'unlink';
  result: WorkExternalLinkIssueResult | WorkExternalUnlinkIssueResult;
}): WorkExternalBindingResultMetadata {
  const linked = 'linked' in input.result ? input.result.linked : undefined;
  const unlinked = 'unlinked' in input.result ? input.result.unlinked : undefined;
  return {
    schemaVersion: WORK_EXTERNAL_BINDING_RESULT_METADATA_VERSION,
    phase: 'external_tracker_binding',
    toolName: input.toolName,
    decisionId: input.decisionId,
    sourceMessageId: input.sourceMessageId,
    operation: input.operation,
    event: input.operation === 'link'
      ? linked ? 'linked' : 'already_linked'
      : unlinked ? 'unlinked' : 'not_linked',
    localKind: input.result.localKind,
    localId: input.result.localId,
    provider: input.result.provider,
    externalType: input.result.externalType,
    externalId: input.result.externalId,
    bindingCount: input.result.bindingCount,
  };
}

function buildWorkItemUpdateResultMetadata(input: {
  decisionId: string;
  sourceMessageId: string;
  result: WorkItemUpdateResult;
}): WorkItemUpdateResultMetadata {
  return {
    schemaVersion: WORK_ITEM_UPDATE_RESULT_METADATA_VERSION,
    phase: 'triage',
    toolName: WORK_ITEM_UPDATE_TOOL,
    decisionId: input.decisionId,
    sourceMessageId: input.sourceMessageId,
    workItemId: input.result.workItemId,
    status: input.result.status,
    updated: input.result.updated,
  };
}

function buildWorkItemAssignProjectResultMetadata(input: {
  decisionId: string;
  sourceMessageId: string;
  result: WorkItemAssignProjectResult;
}): WorkItemAssignProjectResultMetadata {
  return {
    schemaVersion: WORK_ITEM_ASSIGN_PROJECT_RESULT_METADATA_VERSION,
    phase: 'triage',
    toolName: WORK_ITEM_ASSIGN_PROJECT_TOOL,
    decisionId: input.decisionId,
    sourceMessageId: input.sourceMessageId,
    workItemId: input.result.workItemId,
    projectId: input.result.projectId,
    assigned: input.result.assigned,
  };
}

function buildWorkProjectCreateResultMetadata(input: {
  decisionId: string;
  sourceMessageId: string;
  title: string;
  result: WorkProjectCreateResult;
}): WorkProjectCreateResultMetadata {
  return {
    schemaVersion: WORK_PROJECT_CREATE_RESULT_METADATA_VERSION,
    phase: 'triage',
    toolName: WORK_PROJECT_CREATE_TOOL,
    decisionId: input.decisionId,
    sourceMessageId: input.sourceMessageId,
    projectId: input.result.projectId,
    title: input.title,
    status: input.result.status,
    created: input.result.created,
  };
}

function describeWorkExternalBindingResult(
  metadata: WorkExternalBindingResultMetadata,
): string {
  const localLabel = metadata.localKind === 'work_item' ? 'Work Item' : 'Project';
  const externalLabel = `${metadata.provider} ${metadata.externalType} ${metadata.externalId}`;
  if (metadata.event === 'linked') {
    return `Linked ${externalLabel} to ${localLabel} ${metadata.localId}.`;
  }
  if (metadata.event === 'already_linked') {
    return `${externalLabel} was already linked to ${localLabel} ${metadata.localId}.`;
  }
  if (metadata.event === 'unlinked') {
    return `Unlinked ${externalLabel} from ${localLabel} ${metadata.localId}.`;
  }
  return `${externalLabel} was not linked to ${localLabel} ${metadata.localId}.`;
}

function describeWorkTriageLookupResult(metadata: WorkTriageLookupResultMetadata): string {
  if (metadata.projects.length === 0) {
    return metadata.query
      ? `No active Projects matched "${metadata.query}".`
      : 'No active Projects are available for Work triage.';
  }
  const projectSummary = metadata.projects
    .slice(0, 5)
    .map((project) => `${project.title} (${project.projectId})`)
    .join(', ');
  return `Project candidates: ${projectSummary}.`;
}

function describeWorkProjectCreateResult(metadata: WorkProjectCreateResultMetadata): string {
  const action = metadata.created ? 'Created' : 'Found existing';
  return `${action} Project ${metadata.title} (${metadata.projectId}).`;
}

function describeWorkItemUpdateResult(metadata: WorkItemUpdateResultMetadata): string {
  const action = metadata.updated ? 'Updated' : 'No changes for';
  return `${action} Work Item ${metadata.workItemId} (${metadata.status}).`;
}

function describeWorkItemAssignProjectResult(
  metadata: WorkItemAssignProjectResultMetadata,
): string {
  if (!metadata.assigned) {
    return `Work Item ${metadata.workItemId} was already assigned to Project ${metadata.projectId}.`;
  }
  return `Assigned Work Item ${metadata.workItemId} to Project ${metadata.projectId}.`;
}

function hasProjectCreateCue(rawText: string): boolean {
  const normalizedText = rawText.trim().replace(/\s+/gu, ' ');
  return Boolean(normalizedText)
    && !normalizedText.startsWith('/')
    && CHAT_WORK_PROJECT_CREATE_CUE_PATTERN.test(normalizedText);
}

function extractWorkItemIdFromUpdateText(rawText: string): string | null {
  const normalizedText = rawText.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (
    !normalizedText
    || normalizedText.startsWith('/')
    || !CHAT_WORK_ITEM_UPDATE_CUE_PATTERN.test(normalizedText)
  ) {
    return null;
  }

  return extractWorkItemIdFromText(normalizedText);
}

function extractWorkItemAssignProjectRefsFromText(
  rawText: string,
): { workItemId: string; projectId: string } | null {
  const normalizedText = rawText.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (
    !normalizedText
    || normalizedText.startsWith('/')
    || !CHAT_WORK_ITEM_ASSIGN_PROJECT_CUE_PATTERN.test(normalizedText)
  ) {
    return null;
  }

  const workItemId = extractWorkItemIdFromText(normalizedText);
  const projectId = extractProjectIdFromText(normalizedText);
  return workItemId && projectId ? { workItemId, projectId } : null;
}

function extractWorkItemIdFromText(rawText: string): string | null {
  return CHAT_WORK_ITEM_ID_PATTERN.exec(rawText.toLowerCase())?.[0] ?? null;
}

function extractProjectIdFromText(rawText: string): string | null {
  return CHAT_PROJECT_ID_PATTERN.exec(rawText.toLowerCase())?.[0] ?? null;
}

function isWorkItemKind(value: unknown): value is WorkItemKind {
  return value === 'todo'
    || value === 'bug'
    || value === 'issue'
    || value === 'story'
    || value === 'requirement'
    || value === 'epic'
    || value === 'defect'
    || value === 'note';
}

function isWorkItemPriorityHint(value: unknown): value is WorkItemPriorityHint {
  return value === 'urgent' || value === 'high' || value === 'medium' || value === 'low';
}

function isWorkItemTriageStatus(value: unknown): value is WorkItemTriageStatus {
  return value === 'draft' || value === 'planned' || value === 'ready' || value === 'blocked';
}

function isWorkProjectCreateStatus(value: unknown): value is WorkProjectCreateStatus {
  return value === 'planned' || value === 'active' || value === 'paused';
}

type WorkExecutionPreparationChoiceAction = 'create_tasks' | 'decline' | 'handled';

interface ResolvedWorkExecutionPreparationChoice {
  action: WorkExecutionPreparationChoiceAction;
  proposalMessage: ChatMessage;
  originalMessage: ChatMessage;
  proposal: WorkExecutionPreparationProposalMetadata;
}

function resolveWorkExecutionPreparationChoice(input: {
  channel: ChatChannelState;
  choiceResponse?: SendChannelMessageInput['choiceResponse'];
}): ResolvedWorkExecutionPreparationChoice | null {
  if (!input.choiceResponse || input.choiceResponse.status !== 'submitted') {
    return null;
  }
  const proposalMessage = input.channel.messages.find((message) =>
    message.id === input.choiceResponse?.sourceMessageId);
  const proposal = readWorkExecutionPreparationProposalMetadata(
    proposalMessage?.metadata[WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_KEY],
  );
  if (!proposalMessage || !proposal) {
    return null;
  }
  const originalMessage = input.channel.messages.find((message) =>
    message.id === proposal.sourceMessageId);
  if (!originalMessage || originalMessage.senderKind !== 'user') {
    return null;
  }
  if (findWorkExecutionPreparationTransition({
    channel: input.channel,
    proposalId: proposal.proposalId,
  })) {
    return {
      action: 'handled',
      proposalMessage,
      originalMessage,
      proposal,
    };
  }

  const selectedOptionIds = new Set(
    input.choiceResponse.answers.flatMap((answer) => answer.selectedOptionIds),
  );
  const action = selectedOptionIds.has(WORK_EXECUTION_PREPARATION_CREATE_TASKS_OPTION_ID)
    ? 'create_tasks'
    : selectedOptionIds.has(WORK_EXECUTION_PREPARATION_DECLINE_OPTION_ID)
      ? 'decline'
      : null;
  if (!action) {
    return null;
  }

  return {
    action,
    proposalMessage,
    originalMessage,
    proposal,
  };
}

function readWorkExecutionPreparationTransitionMetadata(
  value: unknown,
): WorkExecutionPreparationTransitionMetadata | null {
  const record = readToolInputRecord(value);
  const createdTasks = Array.isArray(record.createdTasks)
    ? record.createdTasks.map(readWorkExecutionPreparationCreatedTask)
    : [];
  if (
    record.schemaVersion !== WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION
    || record.phase !== 'execution_preparation'
    || (record.event !== 'tasks_created' && record.event !== 'declined')
    || typeof record.proposalId !== 'string'
    || typeof record.sourceMessageId !== 'string'
    || typeof record.proposalMessageId !== 'string'
    || typeof record.idempotencyKey !== 'string'
    || createdTasks.some((task) => task === null)
    || !Array.isArray(record.skippedWorkItemIds)
  ) {
    return null;
  }

  return {
    schemaVersion: WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION,
    phase: 'execution_preparation',
    proposalId: record.proposalId,
    event: record.event,
    sourceMessageId: record.sourceMessageId,
    proposalMessageId: record.proposalMessageId,
    idempotencyKey: record.idempotencyKey,
    createdTasks: createdTasks.filter(
      (task): task is WorkExecutionPreparationCreatedTaskMetadata => task !== null,
    ),
    skippedWorkItemIds: record.skippedWorkItemIds.filter(
      (workItemId): workItemId is string => typeof workItemId === 'string',
    ),
  };
}

function readWorkExecutionPreparationCreatedTask(
  value: unknown,
): WorkExecutionPreparationCreatedTaskMetadata | null {
  const record = readToolInputRecord(value);
  if (
    typeof record.workItemId !== 'string'
    || typeof record.taskId !== 'string'
    || typeof record.created !== 'boolean'
    || typeof record.linked !== 'boolean'
  ) {
    return null;
  }

  return {
    workItemId: record.workItemId,
    taskId: record.taskId,
    taskPath: readOptionalString(record.taskPath) ?? buildWorkTaskDetailPath(record.taskId),
    created: record.created,
    linked: record.linked,
  };
}

function findWorkExecutionPreparationTransition(input: {
  channel: ChatChannelState;
  proposalId: string;
}): WorkExecutionPreparationTransitionMetadata | null {
  for (const message of input.channel.messages) {
    const transition = readWorkExecutionPreparationTransitionMetadata(
      message.metadata[WORK_EXECUTION_PREPARATION_TRANSITION_METADATA_KEY],
    );
    if (transition?.proposalId === input.proposalId) {
      return transition;
    }
  }

  return null;
}

function warnWorkIntakeProposalToolCallIgnored(input: {
  channelId: string;
  messageId: string;
  decisionId: string;
  reason: string;
  details?: unknown;
}): void {
  console.warn('Work intake proposal tool call ignored.', {
    feature: 'work_intake_proposal',
    channelId: input.channelId,
    messageId: input.messageId,
    decisionId: input.decisionId,
    reason: input.reason,
    ...(input.details ? { details: input.details } : {}),
  });
}

type WorkIntakeProposalChoiceAction = 'capture' | 'decline' | 'handled';

interface ResolvedWorkIntakeProposalChoice {
  action: WorkIntakeProposalChoiceAction;
  proposalMessage: ChatMessage;
  originalMessage: ChatMessage;
  proposal: WorkIntakeProposalMetadata;
}

function resolveWorkIntakeProposalChoice(input: {
  channel: ChatChannelState;
  choiceResponse?: SendChannelMessageInput['choiceResponse'];
}): ResolvedWorkIntakeProposalChoice | null {
  if (!input.choiceResponse || input.choiceResponse.status !== 'submitted') {
    return null;
  }
  const proposalMessage = input.channel.messages.find((message) =>
    message.id === input.choiceResponse?.sourceMessageId);
  const proposal = readWorkIntakeProposalMetadata(
    proposalMessage?.metadata[WORK_INTAKE_PROPOSAL_METADATA_KEY],
  );
  if (!proposalMessage || !proposal) {
    return null;
  }
  const originalMessage = input.channel.messages.find((message) =>
    message.id === proposal.sourceMessageId);
  if (!originalMessage || originalMessage.senderKind !== 'user') {
    return null;
  }
  if (findWorkIntakeProposalTransition({
    channel: input.channel,
    proposalId: proposal.proposalId,
  })) {
    return {
      action: 'handled',
      proposalMessage,
      originalMessage,
      proposal,
    };
  }

  const selectedOptionIds = new Set(
    input.choiceResponse.answers.flatMap((answer) => answer.selectedOptionIds),
  );
  const action = selectedOptionIds.has(WORK_INTAKE_PROPOSAL_CAPTURE_OPTION_ID)
    ? 'capture'
    : selectedOptionIds.has(WORK_INTAKE_PROPOSAL_DECLINE_OPTION_ID)
      ? 'decline'
      : null;
  if (!action) {
    return null;
  }

  return {
    action,
    proposalMessage,
    originalMessage,
    proposal,
  };
}

function readWorkIntakeProposalTransitionMetadata(
  value: unknown,
): WorkIntakeProposalTransitionMetadata | null {
  const record = readToolInputRecord(value);
  if (
    record.schemaVersion !== WORK_INTAKE_PROPOSAL_METADATA_VERSION
    || record.phase !== 'intake'
    || (record.event !== 'captured' && record.event !== 'declined')
    || typeof record.proposalId !== 'string'
    || typeof record.sourceMessageId !== 'string'
    || typeof record.proposalMessageId !== 'string'
    || typeof record.idempotencyKey !== 'string'
    || !Array.isArray(record.capturedWorkItemIds)
  ) {
    return null;
  }

  return {
    schemaVersion: WORK_INTAKE_PROPOSAL_METADATA_VERSION,
    phase: 'intake',
    proposalId: record.proposalId,
    event: record.event,
    sourceMessageId: record.sourceMessageId,
    proposalMessageId: record.proposalMessageId,
    idempotencyKey: record.idempotencyKey,
    capturedWorkItemIds: record.capturedWorkItemIds.filter(
      (workItemId): workItemId is string => typeof workItemId === 'string',
    ),
  };
}

function findWorkIntakeProposalTransition(input: {
  channel: ChatChannelState;
  proposalId: string;
}): WorkIntakeProposalTransitionMetadata | null {
  for (const message of input.channel.messages) {
    const transition = readWorkIntakeProposalTransitionMetadata(
      message.metadata[WORK_INTAKE_PROPOSAL_TRANSITION_METADATA_KEY],
    );
    if (transition?.proposalId === input.proposalId) {
      return transition;
    }
  }

  return null;
}

async function appendWorkIntakeProposalCapture(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  transport: RuntimeTransportContext | undefined;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore' | 'updateCore'>;
  resolvedChoice: ResolvedWorkIntakeProposalChoice;
  now: Date;
}): Promise<{ state: ChatState; userMessage: ChatMessage }> {
  const userAppend = appendWorkProposalChoiceUserMessage(input);
  if (!input.chatStore) {
    warnWorkIntakeProposalCaptureIgnored({
      channelId: input.channelId,
      proposalId: input.resolvedChoice.proposal.proposalId,
      reason: 'missing_core_store',
    });
    return {
      state: userAppend.state,
      userMessage: userAppend.userMessage,
    };
  }

  const core = await input.chatStore.readCore();
  const delegate = createWorkIntakeDelegate({
    coreStore: input.chatStore,
    now: () => input.now,
  });
  const capturedWorkItemIds: string[] = [];

  for (const candidate of input.resolvedChoice.proposal.candidates) {
    const result = await delegate.capture(
      {
        title: candidate.title,
        source: input.resolvedChoice.proposal.source,
        status: 'draft',
        ...(candidate.summary ? { summary: candidate.summary } : {}),
        ...(candidate.kind ? { kind: candidate.kind } : {}),
        ...(candidate.priority ? { priority: candidate.priority } : {}),
        ...(candidate.suggestedProjectTitle
          ? { suggestedProjectTitle: candidate.suggestedProjectTitle }
          : {}),
        ...(candidate.openQuestions.length > 0
          ? { openQuestions: candidate.openQuestions }
          : {}),
      },
      {
        actorRef: core.ownerProfile.actorId,
        actionId: `${input.resolvedChoice.proposal.proposalId}:${candidate.tempId}:capture`,
        runId: `chat:${input.channelId}`,
      },
    );
    if (result.status === 'applied') {
      capturedWorkItemIds.push(result.result.workItemId);
      continue;
    }
    warnWorkIntakeProposalCaptureIgnored({
      channelId: input.channelId,
      proposalId: input.resolvedChoice.proposal.proposalId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
    });
  }

  const transition = appendWorkIntakeProposalTransitionSidecar({
    state: userAppend.state,
    channelId: input.channelId,
    resolvedChoice: input.resolvedChoice,
    event: 'captured',
    capturedWorkItemIds,
    now: input.now,
  });

  return {
    state: transition.state,
    userMessage: userAppend.userMessage,
  };
}

function appendWorkIntakeProposalDecline(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  transport: RuntimeTransportContext | undefined;
  resolvedChoice: ResolvedWorkIntakeProposalChoice;
  now: Date;
}): { state: ChatState; userMessage: ChatMessage } {
  const userAppend = appendWorkProposalChoiceUserMessage(input);
  const transition = appendWorkIntakeProposalTransitionSidecar({
    state: userAppend.state,
    channelId: input.channelId,
    resolvedChoice: input.resolvedChoice,
    event: 'declined',
    capturedWorkItemIds: [],
    now: input.now,
  });

  return {
    state: transition.state,
    userMessage: userAppend.userMessage,
  };
}

function appendWorkProposalChoiceUserMessage(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  transport: RuntimeTransportContext | undefined;
  now: Date;
}): { state: ChatState; userMessage: ChatMessage } {
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'user',
      senderName: input.payload.senderName?.trim() || 'User',
      body: input.payload.body,
    },
    input.now,
    {
      metadata: buildBaseUserMessageMetadata({
        payload: input.payload,
        channelId: input.channelId,
        deterministicRoutingPlan: input.deterministicRoutingPlan,
        transportBindingId: input.transportBindingId,
      }),
      choiceResponse: input.payload.choiceResponse,
      origin: resolveUserMessageOrigin(input.transport),
      sourceTransportBindingId: input.transport === 'telegram'
        ? input.transportBindingId ?? null
        : null,
    },
  );

  return {
    state: append.state,
    userMessage: append.message,
  };
}

async function appendWorkExecutionPreparationTaskCreation(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  transport: RuntimeTransportContext | undefined;
  chatStore?: Pick<ChatStore, 'readCore' | 'writeCore' | 'updateCore'>;
  resolvedChoice: ResolvedWorkExecutionPreparationChoice;
  now: Date;
}): Promise<{ state: ChatState; userMessage: ChatMessage }> {
  const userAppend = appendWorkProposalChoiceUserMessage(input);
  if (!input.chatStore) {
    warnWorkExecutionPreparationTaskCreationIgnored({
      channelId: input.channelId,
      proposalId: input.resolvedChoice.proposal.proposalId,
      reason: 'missing_core_store',
    });
    return {
      state: userAppend.state,
      userMessage: userAppend.userMessage,
    };
  }

  const core = await input.chatStore.readCore();
  const delegate = createWorkExecutionTaskDelegate({
    coreStore: input.chatStore,
    now: () => input.now,
  });
  const actorRef = resolveWorkExecutionPreparationActorRef(input.state, core);
  const createdTasks: WorkExecutionPreparationCreatedTaskMetadata[] = [];
  const skippedWorkItemIds: string[] = [];

  for (const proposal of input.resolvedChoice.proposal.proposals) {
    if (proposal.readiness !== 'ready') {
      skippedWorkItemIds.push(proposal.workItemId);
      continue;
    }

    const result = await delegate.createTaskFromWorkItem(
      {
        workItemId: proposal.workItemId,
        title: proposal.proposedTaskTitle,
        summary: proposal.proposedTaskSummary,
        approvalNote: `Approve Boss Cat execution Task for Work Item ${proposal.workItemId}.`,
      },
      {
        actorRef,
        actionId: [
          input.resolvedChoice.proposal.proposalId,
          WORK_TASK_CREATE_FROM_WORK_ITEM_TOOL,
          proposal.workItemId,
        ].join(':'),
        runId: [
          'chat-choice',
          input.channelId,
          input.resolvedChoice.proposalMessage.id,
        ].join(':'),
      },
    );
    if (result.status === 'applied') {
      createdTasks.push({
        workItemId: result.result.workItemId,
        taskId: result.result.taskId,
        taskPath: buildWorkTaskDetailPath(result.result.taskId),
        created: result.result.created,
        linked: result.result.linked,
      });
      continue;
    }

    skippedWorkItemIds.push(proposal.workItemId);
    warnWorkExecutionPreparationTaskCreationIgnored({
      channelId: input.channelId,
      proposalId: input.resolvedChoice.proposal.proposalId,
      reason: result.status === 'rejected' ? result.error.code : 'pending_approval',
    });
  }

  const transition = appendWorkExecutionPreparationTransitionSidecar({
    state: userAppend.state,
    channelId: input.channelId,
    resolvedChoice: input.resolvedChoice,
    event: 'tasks_created',
    createdTasks,
    skippedWorkItemIds,
    now: input.now,
  });

  return {
    state: transition.state,
    userMessage: userAppend.userMessage,
  };
}

function appendWorkExecutionPreparationDecline(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  transport: RuntimeTransportContext | undefined;
  resolvedChoice: ResolvedWorkExecutionPreparationChoice;
  now: Date;
}): { state: ChatState; userMessage: ChatMessage } {
  const userAppend = appendWorkProposalChoiceUserMessage(input);
  const transition = appendWorkExecutionPreparationTransitionSidecar({
    state: userAppend.state,
    channelId: input.channelId,
    resolvedChoice: input.resolvedChoice,
    event: 'declined',
    createdTasks: [],
    skippedWorkItemIds: input.resolvedChoice.proposal.workItemIds,
    now: input.now,
  });

  return {
    state: transition.state,
    userMessage: userAppend.userMessage,
  };
}

function appendWorkExecutionPreparationTransitionSidecar(input: {
  state: ChatState;
  channelId: string;
  resolvedChoice: ResolvedWorkExecutionPreparationChoice;
  event: 'tasks_created' | 'declined';
  createdTasks: WorkExecutionPreparationCreatedTaskMetadata[];
  skippedWorkItemIds: string[];
  now: Date;
}): { state: ChatState; transitionMessage: ChatMessage } {
  const transition: WorkExecutionPreparationTransitionMetadata = {
    schemaVersion: WORK_EXECUTION_PREPARATION_PROPOSAL_METADATA_VERSION,
    phase: 'execution_preparation',
    proposalId: input.resolvedChoice.proposal.proposalId,
    event: input.event,
    sourceMessageId: input.resolvedChoice.originalMessage.id,
    proposalMessageId: input.resolvedChoice.proposalMessage.id,
    idempotencyKey: [
      'work-execution-preparation-transition',
      input.resolvedChoice.proposal.proposalId,
      input.event,
    ].join(':'),
    createdTasks: input.createdTasks,
    skippedWorkItemIds: uniqueNonEmptyStrings(input.skippedWorkItemIds),
  };
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkExecutionPreparationTransition(input.resolvedChoice, transition),
    },
    input.now,
    {
      metadata: {
        event: `work_execution_preparation_${input.event}`,
        sourceMessageId: input.resolvedChoice.originalMessage.id,
        sourceProposalMessageId: input.resolvedChoice.proposalMessage.id,
        [WORK_EXECUTION_PREPARATION_TRANSITION_METADATA_KEY]: transition,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    transitionMessage: append.message,
  };
}

function describeWorkExecutionPreparationTransition(
  resolvedChoice: ResolvedWorkExecutionPreparationChoice,
  transition: WorkExecutionPreparationTransitionMetadata,
): string {
  if (transition.event === 'declined') {
    return 'Execution preparation proposal deferred.';
  }
  if (transition.createdTasks.length === 0) {
    return 'No ready execution Tasks were created.';
  }

  const createdLines = transition.createdTasks.map((created, index) => {
    const proposal = resolvedChoice.proposal.proposals.find((candidate) =>
      candidate.workItemId === created.workItemId);
    return `${index + 1}. ${proposal?.proposedTaskTitle ?? created.workItemId}`
      + ` - Review: ${created.taskPath}`;
  });

  return [
    'Created execution Tasks:',
    ...createdLines,
  ].join('\n');
}

function resolveWorkExecutionPreparationActorRef(
  state: ChatState,
  core: CatsCoreState,
): string {
  const bossCatId = state.bossCatId?.trim();
  return bossCatId ? createCatActorId(bossCatId) : core.ownerProfile.actorId;
}

function buildWorkTaskDetailPath(taskId: string): string {
  return `/work/tasks/${encodeURIComponent(taskId)}`;
}

function appendWorkIntakeProposalTransitionSidecar(input: {
  state: ChatState;
  channelId: string;
  resolvedChoice: ResolvedWorkIntakeProposalChoice;
  event: 'captured' | 'declined';
  capturedWorkItemIds: string[];
  now: Date;
}): { state: ChatState; transitionMessage: ChatMessage } {
  const transition: WorkIntakeProposalTransitionMetadata = {
    schemaVersion: WORK_INTAKE_PROPOSAL_METADATA_VERSION,
    phase: 'intake',
    proposalId: input.resolvedChoice.proposal.proposalId,
    event: input.event,
    sourceMessageId: input.resolvedChoice.originalMessage.id,
    proposalMessageId: input.resolvedChoice.proposalMessage.id,
    idempotencyKey: [
      'work-intake-proposal-transition',
      input.resolvedChoice.proposal.proposalId,
      input.event,
    ].join(':'),
    capturedWorkItemIds: input.capturedWorkItemIds,
  };
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats Work',
      body: describeWorkIntakeProposalTransition(input.resolvedChoice, transition),
    },
    input.now,
    {
      metadata: {
        event: `work_intake_proposal_${input.event}`,
        sourceMessageId: input.resolvedChoice.originalMessage.id,
        sourceProposalMessageId: input.resolvedChoice.proposalMessage.id,
        [WORK_INTAKE_PROPOSAL_TRANSITION_METADATA_KEY]: transition,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    transitionMessage: append.message,
  };
}

function describeWorkIntakeProposalTransition(
  resolvedChoice: ResolvedWorkIntakeProposalChoice,
  transition: WorkIntakeProposalTransitionMetadata,
): string {
  if (transition.event === 'declined') {
    return 'Work intake proposal ignored.';
  }
  if (transition.capturedWorkItemIds.length === 0) {
    return 'No Work Items were captured.';
  }

  const capturedTitles = resolvedChoice.proposal.candidates
    .slice(0, transition.capturedWorkItemIds.length)
    .map((candidate, index) => `${index + 1}. ${candidate.title}`);
  return [
    'Captured Work Items:',
    ...capturedTitles,
  ].join('\n');
}

function warnWorkIntakeProposalCaptureIgnored(input: {
  channelId: string;
  proposalId: string;
  reason: string;
}): void {
  console.warn('Work intake proposal capture ignored.', {
    feature: 'work_intake_proposal',
    channelId: input.channelId,
    proposalId: input.proposalId,
    reason: input.reason,
  });
}

function warnWorkExecutionPreparationTaskCreationIgnored(input: {
  channelId: string;
  proposalId: string;
  reason: string;
}): void {
  console.warn('Work execution preparation Task creation ignored.', {
    feature: 'work_execution_preparation',
    channelId: input.channelId,
    proposalId: input.proposalId,
    reason: input.reason,
  });
}

function warnCatProductIntentProposalToolCallIgnored(input: {
  channelId: string;
  messageId: string;
  reason: CatProductIntentProposalRejectionReason;
  errors: string[];
  response: unknown;
}): void {
  console.warn('Cat product-intent proposal tool call ignored.', {
    feature: 'cat_product_intent_proposal',
    channelId: input.channelId,
    messageId: input.messageId,
    reason: input.reason,
    ...(input.errors.length > 0 ? { errors: input.errors } : {}),
    ...(input.response ? { response: input.response } : {}),
  });
}

type CatProductIntentProposalChoiceAction = 'confirm' | 'decline' | 'expired' | 'handled';

interface ResolvedCatProductIntentProposalChoice {
  action: CatProductIntentProposalChoiceAction;
  proposalMessage: ChatMessage;
  originalMessage: ChatMessage;
  proposal: CatProductIntentProposalMetadata;
  productIntentCommand: ProductIntentCommandMetadata | null;
}

function resolveCatProductIntentProposalChoiceAction(input: {
  choiceResponse: NonNullable<SendChannelMessageInput['choiceResponse']>;
  proposal: CatProductIntentProposalMetadata;
}): CatProductIntentProposalChoiceAction | null {
  if (input.choiceResponse.status !== 'submitted') {
    return null;
  }
  const selectedOptionIds = new Set(
    input.choiceResponse.answers.flatMap((answer) => answer.selectedOptionIds),
  );
  if (selectedOptionIds.has('decline')) {
    return 'decline';
  }
  const confirmOptionId = input.proposal.proposal.targetProduct === 'code'
    ? 'confirm_code'
    : 'confirm_work';
  return selectedOptionIds.has(confirmOptionId) ? 'confirm' : null;
}

function resolveCatProductIntentProposalChoice(input: {
  channel: ChatChannelState;
  choiceResponse?: SendChannelMessageInput['choiceResponse'];
  source: ProductIntentCommandSource;
  now: Date;
}): ResolvedCatProductIntentProposalChoice | null {
  if (!input.choiceResponse) {
    return null;
  }
  const proposalMessage = input.channel.messages.find((message) =>
    message.id === input.choiceResponse?.sourceMessageId);
  const proposal = readCatProductIntentProposalMetadata(
    proposalMessage?.metadata[CAT_PRODUCT_INTENT_PROPOSAL_METADATA_KEY],
  );
  if (!proposalMessage || !proposal) {
    return null;
  }
  const originalMessage = input.channel.messages.find((message) =>
    message.id === proposal.source.messageId);
  if (!originalMessage || originalMessage.senderKind !== 'user') {
    return null;
  }
  const existingTransition = findCatProductIntentProposalTransition({
    messages: input.channel.messages,
    proposalId: proposal.proposalId,
  });
  if (existingTransition) {
    return {
      action: 'handled',
      proposalMessage,
      originalMessage,
      proposal,
      productIntentCommand: null,
    };
  }
  const expiresAt = Date.parse(proposal.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= input.now.getTime()) {
    return {
      action: 'expired',
      proposalMessage,
      originalMessage,
      proposal,
      productIntentCommand: null,
    };
  }
  const action = resolveCatProductIntentProposalChoiceAction({
    choiceResponse: input.choiceResponse,
    proposal,
  });
  if (!action) {
    return null;
  }

  const targetProduct = proposal.proposal.targetProduct;
  const argumentText = proposal.proposal.summary.trim() || originalMessage.body.trim();
  return {
    action,
    proposalMessage,
    originalMessage,
    proposal,
    productIntentCommand: action === 'confirm'
      ? {
          version: 1,
          source: input.source,
          command: targetProduct,
          posture: targetProduct,
          targetProduct,
          argumentText,
          rawCommandToken: CAT_PRODUCT_INTENT_PROPOSAL_COMMAND_TOKEN,
          botSuffix: null,
          sourceKind: 'cat_product_intent_proposal',
          proposalConfirmed: true,
          originalProposalId: proposal.proposalId,
          originalMessageId: originalMessage.id,
          proposedByCatId: proposal.proposedBy.catId,
        }
      : null,
  };
}

function appendCatProductIntentProposalDecline(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  transport: RuntimeTransportContext | undefined;
  resolvedChoice: ResolvedCatProductIntentProposalChoice;
  locale: MessageLocale;
  now: Date;
}): { state: ChatState; userMessage: ChatMessage } {
  const userAppend = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'user',
      senderName: input.payload.senderName?.trim() || 'User',
      body: input.payload.body,
    },
    input.now,
    {
      metadata: buildBaseUserMessageMetadata({
        payload: input.payload,
        channelId: input.channelId,
        deterministicRoutingPlan: input.deterministicRoutingPlan,
        transportBindingId: input.transportBindingId,
      }),
      choiceResponse: input.payload.choiceResponse,
      origin: resolveUserMessageOrigin(input.transport),
      sourceTransportBindingId: input.transport === 'telegram'
        ? input.transportBindingId ?? null
        : null,
    },
  );
  const transitionAppend = appendCatProductIntentProposalTransitionSidecar({
    state: userAppend.state,
    channelId: input.channelId,
    proposal: input.resolvedChoice.proposal,
    proposalMessageId: input.resolvedChoice.proposalMessage.id,
    originalMessage: input.resolvedChoice.originalMessage,
    event: 'declined',
    locale: input.locale,
    now: input.now,
  });

  return {
    state: transitionAppend.state,
    userMessage: userAppend.message,
  };
}

function appendImplicitProductIntentCandidateSidecar(input: {
  state: ChatState;
  channel: ChatChannelState;
  channelId: string;
  userMessage: ChatMessage;
  body: string;
  transport: RuntimeTransportContext | undefined;
  effectiveMode: ChatNaturalProductIntentMode;
  locale: MessageLocale;
  now: Date;
  choiceResponse?: SendChannelMessageInput['choiceResponse'];
}): { state: ChatState; candidateMessage: ChatMessage | null } {
  if (input.effectiveMode !== 'heuristic_prefilter') {
    return { state: input.state, candidateMessage: null };
  }
  if (input.choiceResponse) {
    return { state: input.state, candidateMessage: null };
  }
  if (hasRecentImplicitProductIntentDecline({ channel: input.channel, now: input.now })) {
    return { state: input.state, candidateMessage: null };
  }

  const detection = detectImplicitProductIntent({
    rawText: input.body,
    channelKind: isImplicitProductIntentDirectLane(input.channel)
      ? 'direct_message'
      : 'chat_channel',
  });
  if (detection.kind !== 'candidate') {
    return { state: input.state, candidateMessage: null };
  }

  const { conversationId } = resolveChannelCanonicalIdentity(input.state, input.channelId);
  const candidate = buildImplicitProductIntentCandidateMetadata({
    messageId: input.userMessage.id,
    channelId: input.channelId,
    conversationId,
    transport: resolveImplicitProductIntentTransport(input.transport),
    targetProduct: detection.targetProduct,
    confidence: detection.confidence,
    reasonCode: detection.reasonCode,
    now: input.now,
  });
  if (!shouldAppendImplicitProductIntentCandidateSegment({
    messages: input.channel.messages,
    candidateId: candidate.candidateId,
  })) {
    return { state: input.state, candidateMessage: null };
  }
  const stateWithPriorOpenCandidatesExpired =
    expireOpenImplicitProductIntentCandidatesBeforeSuggestion({
    state: input.state,
    channelId: input.channelId,
    locale: input.locale,
    now: input.now,
  });
  const translate = createTranslator(input.locale);
  const append = appendMessage(
    stateWithPriorOpenCandidatesExpired,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats',
      body: describeImplicitProductIntentCandidate(candidate, translate),
    },
    input.now,
    {
      choices: buildImplicitProductIntentCandidateChoices(candidate, translate),
      metadata: {
        event: 'implicit_product_intent_candidate_suggested',
        sourceMessageId: input.userMessage.id,
        implicitProductIntentCandidate: candidate,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    candidateMessage: append.message,
  };
}

type ImplicitProductIntentChoiceAction = 'confirm' | 'decline' | 'expired' | 'handled';
const IMPLICIT_PRODUCT_INTENT_DECLINE_COOLDOWN_MS = 5 * 60 * 1000;

interface ResolvedImplicitProductIntentChoice {
  action: ImplicitProductIntentChoiceAction;
  candidateMessage: ChatMessage;
  originalMessage: ChatMessage;
  candidate: ImplicitProductIntentCandidateMetadata;
  productIntentCommand: ProductIntentCommandMetadata | null;
}

function readImplicitProductIntentTransitionMetadata(
  value: unknown,
): ImplicitProductIntentCandidateTransitionMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<ImplicitProductIntentCandidateTransitionMetadata>;
  if (
    record.version !== 1
    || typeof record.candidateId !== 'string'
    || (
      record.event !== 'confirmed'
      && record.event !== 'declined'
      && record.event !== 'expired'
    )
    || typeof record.sourceMessageId !== 'string'
    || (record.targetProduct !== 'work' && record.targetProduct !== 'code')
    || typeof record.idempotencyKey !== 'string'
  ) {
    return null;
  }

  return record as ImplicitProductIntentCandidateTransitionMetadata;
}

function findImplicitProductIntentTransition(input: {
  channel: ChatChannelState;
  candidateId: string;
}): ImplicitProductIntentCandidateTransitionMetadata | null {
  for (const message of input.channel.messages) {
    const transition = readImplicitProductIntentTransitionMetadata(
      message.metadata.implicitProductIntentTransition,
    );
    if (transition?.candidateId === input.candidateId) {
      return transition;
    }
  }

  return null;
}

function hasRecentImplicitProductIntentDecline(input: {
  channel: ChatChannelState;
  now: Date;
}): boolean {
  return input.channel.messages.some((message) => {
    const transition = readImplicitProductIntentTransitionMetadata(
      message.metadata.implicitProductIntentTransition,
    );
    if (transition?.event !== 'declined') {
      return false;
    }
    const declinedAt = Date.parse(message.createdAt);
    return Number.isFinite(declinedAt)
      && input.now.getTime() - declinedAt < IMPLICIT_PRODUCT_INTENT_DECLINE_COOLDOWN_MS;
  });
}

function listOpenImplicitProductIntentCandidates(
  channel: ChatChannelState,
): Array<{
  candidateMessage: ChatMessage;
  originalMessage: ChatMessage;
  candidate: ImplicitProductIntentCandidateMetadata;
}> {
  return channel.messages.flatMap((candidateMessage) => {
    const candidate = readImplicitProductIntentCandidateMetadata(
      candidateMessage.metadata.implicitProductIntentCandidate,
    );
    if (!candidate) {
      return [];
    }
    if (findImplicitProductIntentTransition({ channel, candidateId: candidate.candidateId })) {
      return [];
    }
    const originalMessage = channel.messages.find((message) =>
      message.id === candidate.source.messageId);
    return originalMessage && originalMessage.senderKind === 'user'
      ? [{ candidateMessage, originalMessage, candidate }]
      : [];
  });
}

function resolveImplicitProductIntentChoiceAction(input: {
  choiceResponse: NonNullable<SendChannelMessageInput['choiceResponse']>;
  candidate: ImplicitProductIntentCandidateMetadata;
}): ImplicitProductIntentChoiceAction | null {
  if (input.choiceResponse.status !== 'submitted') {
    return null;
  }
  const selectedOptionIds = new Set(
    input.choiceResponse.answers.flatMap((answer) => answer.selectedOptionIds),
  );
  if (selectedOptionIds.has('decline')) {
    return 'decline';
  }
  const confirmOptionId = input.candidate.candidate.targetProduct === 'code'
    ? 'confirm_code'
    : 'confirm_work';
  return selectedOptionIds.has(confirmOptionId) ? 'confirm' : null;
}

function resolveImplicitProductIntentChoice(input: {
  channel: ChatChannelState;
  choiceResponse?: SendChannelMessageInput['choiceResponse'];
  source: ProductIntentCommandSource;
  now: Date;
}): ResolvedImplicitProductIntentChoice | null {
  if (!input.choiceResponse) {
    return null;
  }
  const candidateMessage = input.channel.messages.find((message) =>
    message.id === input.choiceResponse?.sourceMessageId);
  const candidate = readImplicitProductIntentCandidateMetadata(
    candidateMessage?.metadata.implicitProductIntentCandidate,
  );
  if (!candidateMessage || !candidate) {
    return null;
  }
  const originalMessage = input.channel.messages.find((message) =>
    message.id === candidate.source.messageId);
  if (!originalMessage || originalMessage.senderKind !== 'user') {
    return null;
  }
  const existingTransition = findImplicitProductIntentTransition({
    channel: input.channel,
    candidateId: candidate.candidateId,
  });
  if (existingTransition) {
    return {
      action: 'handled',
      candidateMessage,
      originalMessage,
      candidate,
      productIntentCommand: null,
    };
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= input.now.getTime()) {
    return {
      action: 'expired',
      candidateMessage,
      originalMessage,
      candidate,
      productIntentCommand: null,
    };
  }
  const action = resolveImplicitProductIntentChoiceAction({
    choiceResponse: input.choiceResponse,
    candidate,
  });
  if (!action) {
    return null;
  }

  const targetProduct = candidate.candidate.targetProduct;
  return {
    action,
    candidateMessage,
    originalMessage,
    candidate,
    productIntentCommand: action === 'confirm'
      ? {
          version: 1,
          source: input.source,
          command: targetProduct,
          posture: targetProduct,
          targetProduct,
          argumentText: originalMessage.body.trim(),
          rawCommandToken: IMPLICIT_PRODUCT_INTENT_COMMAND_TOKEN,
          botSuffix: null,
          sourceKind: 'implicit_confirmation',
          implicitConfirmed: true,
          originalCandidateId: candidate.candidateId,
          originalMessageId: originalMessage.id,
        }
      : null,
  };
}

function describeImplicitProductIntentTransition(
  transition: ImplicitProductIntentCandidateTransitionMetadata,
  translate: ProductIntentTranslator,
): string {
  if (transition.event === 'declined') {
    return translate(messageKeys.chatImplicitProductIntentDeclined);
  }
  if (transition.event === 'expired') {
    return translate(messageKeys.chatImplicitProductIntentExpired);
  }

  return translate(
    transition.targetProduct === 'code'
      ? messageKeys.chatImplicitProductIntentConfirmedCode
      : messageKeys.chatImplicitProductIntentConfirmedWork,
  );
}

function appendImplicitProductIntentTransitionSidecar(input: {
  state: ChatState;
  channelId: string;
  resolvedChoice: ResolvedImplicitProductIntentChoice;
  event: 'confirmed' | 'declined' | 'expired';
  locale: MessageLocale;
  now: Date;
}): { state: ChatState; transitionMessage: ChatMessage } {
  const transition = buildImplicitProductIntentTransitionMetadata({
    candidateId: input.resolvedChoice.candidate.candidateId,
    event: input.event,
    sourceMessageId: input.resolvedChoice.originalMessage.id,
    targetProduct: input.resolvedChoice.candidate.candidate.targetProduct,
    originalMessageBody: input.resolvedChoice.originalMessage.body,
  });
  const translate = createTranslator(input.locale);
  const append = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'system',
      senderName: 'Cats',
      body: describeImplicitProductIntentTransition(transition, translate),
    },
    input.now,
    {
      metadata: {
        event: `implicit_product_intent_candidate_${input.event}`,
        sourceMessageId: input.resolvedChoice.originalMessage.id,
        sourceCandidateMessageId: input.resolvedChoice.candidateMessage.id,
        implicitProductIntentTransition: transition,
      },
      incrementUnread: false,
    },
  );

  return {
    state: refreshDerivedMemoryLayers(append.state, input.channelId, input.now),
    transitionMessage: append.message,
  };
}

function appendExpiredImplicitProductIntentCandidates(input: {
  state: ChatState;
  channelId: string;
  expireAll: boolean;
  locale: MessageLocale;
  now: Date;
}): ChatState {
  const channel = requireChannel(input.state, input.channelId);
  const openCandidates = listOpenImplicitProductIntentCandidates(channel);
  return openCandidates.reduce((state, openCandidate) => {
    const expiresAt = Date.parse(openCandidate.candidate.expiresAt);
    const shouldExpire = input.expireAll
      || (Number.isFinite(expiresAt) && expiresAt <= input.now.getTime());
    if (!shouldExpire) {
      return state;
    }
    return appendImplicitProductIntentTransitionSidecar({
      state,
      channelId: input.channelId,
      resolvedChoice: {
        action: 'handled',
        candidateMessage: openCandidate.candidateMessage,
        originalMessage: openCandidate.originalMessage,
        candidate: openCandidate.candidate,
        productIntentCommand: null,
      },
      event: 'expired',
      locale: input.locale,
      now: input.now,
    }).state;
  }, input.state);
}

interface ExpireImplicitProductIntentCandidatesInput {
  state: ChatState;
  channelId: string;
  locale: MessageLocale;
  now: Date;
}

function expireTtlImplicitProductIntentCandidates(
  input: ExpireImplicitProductIntentCandidatesInput,
): ChatState {
  return appendExpiredImplicitProductIntentCandidates({
    ...input,
    expireAll: false,
  });
}

function expireOpenImplicitProductIntentCandidatesBeforeSuggestion(
  input: ExpireImplicitProductIntentCandidatesInput,
): ChatState {
  return appendExpiredImplicitProductIntentCandidates({
    ...input,
    expireAll: true,
  });
}

function appendImplicitProductIntentDecline(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  deterministicRoutingPlan: DeterministicChatRoutingPlan | null;
  transportBindingId?: string | null;
  transport: RuntimeTransportContext | undefined;
  resolvedChoice: ResolvedImplicitProductIntentChoice;
  locale: MessageLocale;
  now: Date;
}): { state: ChatState; userMessage: ChatMessage } {
  const userAppend = appendMessage(
    input.state,
    input.channelId,
    {
      senderKind: 'user',
      senderName: input.payload.senderName?.trim() || 'User',
      body: input.payload.body,
    },
    input.now,
    {
      metadata: buildBaseUserMessageMetadata({
        payload: input.payload,
        channelId: input.channelId,
        deterministicRoutingPlan: input.deterministicRoutingPlan,
        transportBindingId: input.transportBindingId,
      }),
      choiceResponse: input.payload.choiceResponse,
      origin: resolveUserMessageOrigin(input.transport),
      sourceTransportBindingId: input.transport === 'telegram'
        ? input.transportBindingId ?? null
        : null,
    },
  );
  const transitionAppend = appendImplicitProductIntentTransitionSidecar({
    state: userAppend.state,
    channelId: input.channelId,
    resolvedChoice: input.resolvedChoice,
    event: 'declined',
    locale: input.locale,
    now: input.now,
  });

  return {
    state: transitionAppend.state,
    userMessage: userAppend.message,
  };
}

function readDirectSlashModeActiveAnchor(
  value: unknown,
): DirectSlashModeActiveAnchorMetadata | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.workItemId === 'string'
    && (candidate.targetProduct === 'work' || candidate.targetProduct === 'code')
    && typeof candidate.establishedBySegmentId === 'string'
    && typeof candidate.establishedAt === 'string'
    ? {
        workItemId: candidate.workItemId,
        targetProduct: candidate.targetProduct,
        establishedBySegmentId: candidate.establishedBySegmentId,
        establishedAt: candidate.establishedAt,
      }
    : null;
}

function readMessageDirectSlashModeMetadata(
  message: ChatMessage,
): Record<string, unknown> | null {
  const candidate = message.metadata.directSlashMode;
  return candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : null;
}

function readProductIntentActiveAnchor(
  value: unknown,
): ProductIntentActiveAnchorMetadata | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const sourceContextRef = candidate.sourceContextRef;
  return candidate.version === 1
    && typeof candidate.workItemId === 'string'
    && (candidate.targetProduct === 'work' || candidate.targetProduct === 'code')
    && sourceContextRef !== null
    && typeof sourceContextRef === 'object'
    && typeof candidate.establishedBySegmentId === 'string'
    && typeof candidate.establishedAt === 'string'
    ? {
        version: 1,
        workItemId: candidate.workItemId,
        targetProduct: candidate.targetProduct,
        sourceContextRef: sourceContextRef as ProductIntentActiveAnchorMetadata['sourceContextRef'],
        establishedBySegmentId: candidate.establishedBySegmentId,
        establishedAt: candidate.establishedAt,
      }
    : null;
}

function readMessageProductIntentMetadata(
  message: ChatMessage,
): Record<string, unknown> | null {
  const candidate = message.metadata.productIntent;
  return candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : null;
}

function readDirectSlashModeClearedActiveAnchor(
  value: Record<string, unknown>,
): DirectSlashModeActiveAnchorMetadata | null {
  return readDirectSlashModeActiveAnchor(value.clearedActiveAnchor);
}

function resolveLatestDirectSlashModeActiveAnchor(
  channel: ChatChannelState,
): DirectSlashModeActiveAnchorMetadata | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const directSlashMode = readMessageDirectSlashModeMetadata(channel.messages[index]!);
    if (!directSlashMode || !Object.hasOwn(directSlashMode, 'activeAnchor')) {
      continue;
    }
    return readDirectSlashModeActiveAnchor(directSlashMode.activeAnchor);
  }

  return null;
}

// Bound the backward transcript walk so a long channel does not pay O(N) per
// dispatch. The cache only needs to find the most recent active anchor or its
// matching cleared marker, which is always within the recent turns; older
// history is irrelevant. Tune if a real workload demands more headroom.
const PRODUCT_INTENT_ACTIVE_ANCHOR_TRANSCRIPT_SCAN_LIMIT = 200;

function resolveLatestProductIntentActiveAnchorFromTranscript(
  channel: ChatChannelState,
): ProductIntentActiveAnchorMetadata | null {
  const clearedWorkItemIds = new Set<string>();
  const minIndex = Math.max(
    0,
    channel.messages.length - PRODUCT_INTENT_ACTIVE_ANCHOR_TRANSCRIPT_SCAN_LIMIT,
  );
  for (let index = channel.messages.length - 1; index >= minIndex; index -= 1) {
    const message = channel.messages[index]!;
    const productIntent = readMessageProductIntentMetadata(message);
    if (productIntent && Object.hasOwn(productIntent, 'activeAnchor')) {
      const activeAnchor = readProductIntentActiveAnchor(productIntent.activeAnchor);
      if (!activeAnchor || clearedWorkItemIds.has(activeAnchor.workItemId)) {
        return null;
      }
      return activeAnchor;
    }

    // Phase 2 dual-write fallback: read the legacy `directSlashMode.clearedActiveAnchor`
    // marker so canonical reads still see clears emitted only on the legacy path.
    // Remove this branch when the legacy `directSlashMode` writes are dropped in
    // PLAN-096 Phase 2 close-out.
    const directSlashMode = readMessageDirectSlashModeMetadata(message);
    if (!directSlashMode || !Object.hasOwn(directSlashMode, 'clearedActiveAnchor')) {
      continue;
    }
    const clearedActiveAnchor = readDirectSlashModeClearedActiveAnchor(directSlashMode);
    if (clearedActiveAnchor) {
      clearedWorkItemIds.add(clearedActiveAnchor.workItemId);
    }
  }

  return null;
}

function resolveLatestProductIntentActiveAnchor(
  channel: ChatChannelState,
): ProductIntentActiveAnchorMetadata | null {
  return resolveLatestProductIntentActiveAnchorFromTranscript(channel);
}

function isTerminalProductIntentWorkItemStatus(status: unknown): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'archived';
}

function resolveDirectSlashModeActiveAnchorState(input: {
  channel: ChatChannelState;
  core: CatsCoreState | null;
}): {
  activeAnchor: DirectSlashModeActiveAnchorMetadata | null;
  clear: DirectSlashModeClearMetadata | null;
} {
  const activeAnchor = resolveLatestDirectSlashModeActiveAnchor(input.channel);
  if (!activeAnchor) {
    return { activeAnchor: null, clear: null };
  }

  const workItem = input.core?.workItems.find((candidate) =>
    candidate.id === activeAnchor.workItemId) ?? null;
  if (input.core && !workItem) {
    return {
      activeAnchor: null,
      clear: {
        clearedActiveAnchor: activeAnchor,
        clearReason: 'work_item_missing',
      },
    };
  }
  if (workItem && isTerminalProductIntentWorkItemStatus(workItem.status)) {
    return {
      activeAnchor: null,
      clear: {
        clearedActiveAnchor: activeAnchor,
        clearReason: 'work_item_terminal',
      },
    };
  }

  return { activeAnchor, clear: null };
}

function resolveProductIntentActiveAnchorState(input: {
  channel: ChatChannelState;
  core: CatsCoreState | null;
  sourceContextRef: ProductIntentActiveAnchorSourceContextRef | null;
}): {
  activeAnchor: ProductIntentActiveAnchorMetadata | null;
} {
  const activeAnchor = resolveLatestProductIntentActiveAnchor(input.channel);
  if (!activeAnchor) {
    return { activeAnchor: null };
  }

  const workItem = input.core?.workItems.find((candidate) =>
    candidate.id === activeAnchor.workItemId) ?? null;
  if (
    (input.core && !workItem)
    || (workItem && isTerminalProductIntentWorkItemStatus(workItem.status))
  ) {
    return { activeAnchor: null };
  }
  if (
    input.sourceContextRef
    && !doesProductIntentActiveAnchorMatchSourceContextRef(activeAnchor, input.sourceContextRef)
  ) {
    return { activeAnchor: null };
  }

  return { activeAnchor };
}

function buildDirectSlashModeIntakeRef(
  activeAnchor: DirectSlashModeActiveAnchorMetadata,
): Record<string, unknown> {
  return {
    workItemId: activeAnchor.workItemId,
    commandSegmentId: activeAnchor.establishedBySegmentId,
    targetProduct: activeAnchor.targetProduct,
  };
}

function buildProductIntentIntakeRef(
  activeAnchor: ProductIntentActiveAnchorMetadata,
): Record<string, unknown> {
  return {
    workItemId: activeAnchor.workItemId,
    commandSegmentId: activeAnchor.establishedBySegmentId,
    targetProduct: activeAnchor.targetProduct,
    sourceContextRef: activeAnchor.sourceContextRef,
  };
}

function annotateProductIntentUserMessageWithActiveAnchor(input: {
  state: ChatState;
  channelId: string;
  messageId: string;
  activeAnchor: DirectSlashModeActiveAnchorMetadata;
  productIntentActiveAnchor: ProductIntentActiveAnchorMetadata | null;
  directSlashMode: Record<string, unknown> | null;
  now: Date;
}): { state: ChatState; userMessage: ChatMessage } {
  const nextState = structuredClone(input.state);
  const channel = requireChannel(nextState, input.channelId);
  const message = channel.messages.find((candidate) => candidate.id === input.messageId);
  if (!message) {
    throw new Error(`Product-intent user message not found: ${input.messageId}`);
  }
  message.metadata = {
    ...(message.metadata ?? {}),
    ...(input.directSlashMode ? { directSlashMode: input.directSlashMode } : {}),
    directSlashModeIntakeRef: buildDirectSlashModeIntakeRef(input.activeAnchor),
    ...(input.productIntentActiveAnchor
      ? {
          productIntent: {
            activeAnchor: input.productIntentActiveAnchor,
          },
          productIntentIntakeRef: buildProductIntentIntakeRef(input.productIntentActiveAnchor),
        }
      : {}),
  };
  return {
    state: refreshDerivedMemoryLayers(nextState, input.channelId, input.now),
    userMessage: message,
  };
}

function buildProductIntentConciergePromptSource(input: {
  userMessage: ChatMessage;
  productIntentCommand: ProductIntentCommandMetadata;
  activeAnchor: DirectSlashModeActiveAnchorMetadata;
}): ChatMessage {
  // Trust the flag written by `buildProductIntentUserMessageMetadata` at
  // append time rather than recomputing from `argumentText.trim()`. Keeps
  // the empty-argument contract single-sourced on the user message.
  const hasArgument = input.userMessage.metadata.productIntentArgumentProvided === true;
  return {
    ...structuredClone(input.userMessage),
    body: hasArgument
      ? input.productIntentCommand.argumentText.trim()
      : PRODUCT_INTENT_EMPTY_ARGUMENT_PROMPT,
    metadata: {
      ...(input.userMessage.metadata ?? {}),
      directSlashModeIntakeRef: buildDirectSlashModeIntakeRef(input.activeAnchor),
    },
  };
}

function describeProductIntentCommandAck(
  productIntentCommand: ProductIntentCommandMetadata,
  accepted: boolean,
  translate: ProductIntentTranslator,
  rejectionReason: ProductIntentAudienceResolution['rejectionReason'] = null,
  capabilityProfileKind: DirectSlashModePostureChangeMetadata['capabilityProfileKind'] = null,
): string {
  if (!accepted) {
    return rejectionReason === 'missing_direct_audience_cat'
      ? translate(messageKeys.chatProductIntentAckUnsupportedDirectAudience)
      : translate(messageKeys.chatProductIntentAckUnsupportedContext);
  }

  switch (productIntentCommand.command) {
    case 'chat':
      return translate(messageKeys.chatProductIntentAckChatActive);
    case 'work':
      if (capabilityProfileKind === 'weak_worker' || capabilityProfileKind === 'unknown') {
        return translate(messageKeys.chatProductIntentAckWorkHumanGate);
      }
      if (capabilityProfileKind === 'strong_agent') {
        return translate(messageKeys.chatProductIntentAckWorkStrongAnchor);
      }
      return translate(messageKeys.chatProductIntentAckWorkClarify);
    case 'code':
      if (capabilityProfileKind === 'weak_worker' || capabilityProfileKind === 'unknown') {
        return translate(messageKeys.chatProductIntentAckCodeHumanGate);
      }
      if (capabilityProfileKind === 'strong_agent') {
        return translate(messageKeys.chatProductIntentAckCodeStrongAnchor);
      }
      return translate(messageKeys.chatProductIntentAckCodeClarify);
    default:
      return translate(messageKeys.chatProductIntentAckUnsupportedContext);
  }
}

function mergeSupersededDirectSlashModeMetadata(input: {
  metadata: Record<string, unknown>;
  supersededByWorkItemId: string;
  supersededBySegmentId: string;
  supersededAt: string;
}): Record<string, unknown> {
  const supersededBy = {
    workItemId: input.supersededByWorkItemId,
    segmentId: input.supersededBySegmentId,
    supersededAt: input.supersededAt,
  };
  const directSlashModeIntake = input.metadata.directSlashModeIntake;
  return {
    ...input.metadata,
    directSlashModeSupersededBy: supersededBy,
    ...(directSlashModeIntake && typeof directSlashModeIntake === 'object'
      ? {
          directSlashModeIntake: {
            ...(directSlashModeIntake as Record<string, unknown>),
            supersededByWorkItemId: input.supersededByWorkItemId,
            supersededBy,
          },
        }
      : {}),
  };
}

function mergeAbandonedDirectSlashModeMetadata(input: {
  metadata: Record<string, unknown>;
  reason: 'posture_abandoned';
  abandonedAt: string;
  abandonedBySegmentId: string;
}): Record<string, unknown> {
  const abandonedBy = {
    reason: input.reason,
    segmentId: input.abandonedBySegmentId,
    abandonedAt: input.abandonedAt,
  };
  const directSlashModeIntake = input.metadata.directSlashModeIntake;
  return {
    ...input.metadata,
    directSlashModeAbandonedBy: abandonedBy,
    ...(directSlashModeIntake && typeof directSlashModeIntake === 'object'
      ? {
          directSlashModeIntake: {
            ...(directSlashModeIntake as Record<string, unknown>),
            abandonedBy,
          },
        }
      : {}),
  };
}

async function persistProductIntentCommandCoreSegment(input: {
  chatStore?: Pick<ChatStore, 'updateCore'>;
  state: ChatState;
  channelId: string;
  userMessage: ChatMessage;
  ackMessage: ChatMessage;
  productIntentCommand: ProductIntentCommandMetadata;
  postureChange: DirectSlashModePostureChangeMetadata | null;
  coreIds: ReturnType<typeof resolveProductIntentCoreIds>;
  activeAnchor: DirectSlashModeActiveAnchorMetadata | null;
  activeAnchorClear: DirectSlashModeClearMetadata | null;
  humanGate: DirectSlashModeHumanGateMetadata | null;
  accepted: boolean;
  locale: MessageLocale;
  translate: ProductIntentTranslator;
  now: Date;
}): Promise<void> {
  if (!input.chatStore) {
    return;
  }

  const { conversationId, containerId } = resolveChannelCanonicalIdentity(
    input.state,
    input.channelId,
  );
  const { turnId, laneId, segmentId, workItemId } = input.coreIds;
  const event = input.accepted
    ? 'product_intent_posture_changed'
    : 'product_intent_unsupported_context';
  const directSlashMode = buildDirectSlashModeStateMetadata({
    activeAnchor: input.activeAnchor ?? (input.activeAnchorClear ? null : undefined),
    clear: input.activeAnchorClear,
    humanGate: input.humanGate,
  });
  const productIntentSourceContext = input.activeAnchor
    && buildProductIntentIntakeCommandMetadata(input.productIntentCommand)
    ? buildProductPresetIntentContextForCommand({
        state: input.state,
        channelId: input.channelId,
        conversationId,
        turnId,
        segmentId,
        productIntentCommand: input.productIntentCommand,
        postureChange: input.postureChange,
      })
    : null;
  const productIntentActiveAnchor = input.activeAnchor && productIntentSourceContext
    ? buildProductIntentActiveAnchorForDirectCommand({
        activeAnchor: input.activeAnchor,
        sourceContext: productIntentSourceContext,
      })
    : null;
  const productIntent = buildProductIntentStateMetadata({
    activeAnchor: productIntentActiveAnchor ?? (input.activeAnchorClear ? null : undefined),
  });
  const metadata = {
    event,
    version: 1,
    channelId: input.channelId,
    containerId,
    sourceMessageId: input.userMessage.id,
    ackMessageId: input.ackMessage.id,
    accepted: input.accepted,
    productIntentCommand: input.productIntentCommand,
    ...(input.postureChange
      ? {
          directSlashModePostureChange: input.postureChange,
        }
      : {}),
    activeProductPosture: input.productIntentCommand.posture,
    targetProduct: input.productIntentCommand.targetProduct,
    source: input.productIntentCommand.source,
    ...(productIntent ? { productIntent } : {}),
    ...(directSlashMode ? { directSlashMode } : {}),
  };

  await input.chatStore.updateCore((core) => {
    let nextCore = core;
    nextCore = upsertCoreTurn(
      nextCore,
      {
        id: turnId,
        conversationId,
        kind: 'system',
        status: 'completed',
        sourceParticipantId: buildChatOwnerParticipantId(input.channelId),
        createdAt: input.userMessage.createdAt,
        startedAt: input.userMessage.createdAt,
        completedAt: input.ackMessage.createdAt,
        metadata,
      },
      input.now,
    ).core;
    nextCore = upsertCoreLane(
      nextCore,
      {
        id: laneId,
        turnId,
        conversationId,
        participantId: buildChatOwnerParticipantId(input.channelId),
        agentId: null,
        orderIndex: 0,
        status: 'completed',
        createdAt: input.userMessage.createdAt,
        startedAt: input.userMessage.createdAt,
        completedAt: input.ackMessage.createdAt,
        metadata,
      },
      input.now,
    ).core;
    nextCore = upsertCoreSegment(
      nextCore,
      {
        id: segmentId,
        laneId,
        turnId,
        conversationId,
        sequence: 0,
        kind: 'system',
        status: 'complete',
        content: input.ackMessage.body,
        createdAt: input.ackMessage.createdAt,
        completedAt: input.ackMessage.createdAt,
        metadata,
      },
      input.now,
    ).core;
    if (input.activeAnchor && input.postureChange?.audienceCatId) {
      const targetProduct = input.productIntentCommand.targetProduct === 'code' ? 'code' : 'work';
      const targetProductLabel = resolveProductIntentTargetLabel(targetProduct);
      const titleFallbackKey = targetProduct === 'code'
        ? messageKeys.chatProductIntentDraftTitleCode
        : messageKeys.chatProductIntentDraftTitleWork;
      const goal = input.productIntentCommand.argumentText
        || input.translate(
          messageKeys.chatProductIntentDraftGoalFallback,
          { targetProduct: targetProductLabel },
        );
      const successCriteria = [
        input.translate(messageKeys.chatProductIntentDraftSuccessCriteria),
      ];
      const outOfScope = [
        input.translate(messageKeys.chatProductIntentDraftOutOfScope),
      ];
      const openQuestions = [
        input.translate(messageKeys.chatProductIntentDraftOpenQuestion),
      ];
      const productIntentIntake = productIntentSourceContext
        ? buildDirectProductIntentIntakeMetadata({
            targetProduct,
            sourceContext: productIntentSourceContext,
            productIntentCommand: input.productIntentCommand,
            goal,
            successCriteria,
            outOfScope,
            openQuestions,
          })
        : null;
      nextCore = upsertCoreWorkItem(
        nextCore,
        {
          id: workItemId,
          title: normalizeWorkItemTitle(
            input.productIntentCommand.argumentText,
            input.translate(titleFallbackKey),
          ),
          status: 'draft',
          conversationId,
          assignedActorIds: [createCatActorId(input.postureChange.audienceCatId)],
          summary: input.translate(
            messageKeys.chatProductIntentDraftSummary,
            { targetProduct: targetProductLabel },
          ),
          createdAt: input.ackMessage.createdAt,
          metadata: {
            ...(productIntentIntake ? { productIntentIntake } : {}),
            directSlashModeIntake: {
              version: 1,
              targetProduct,
              source: {
                channelId: input.channelId,
                conversationId,
                commandTurnId: turnId,
                commandLaneId: laneId,
                commandSegmentId: segmentId,
                transport: input.productIntentCommand.source,
              },
              audience: {
                catId: input.postureChange.audienceCatId,
                capabilityProfileKind: input.postureChange.capabilityProfileKind,
              },
              command: {
                name: input.productIntentCommand.command,
                argumentText: input.productIntentCommand.argumentText,
                posture: input.productIntentCommand.posture,
              },
              draft: {
                goal,
                successCriteria,
                outOfScope,
                openQuestions,
                proposedNextAction: 'clarify',
                placeholder: true,
                requiresClarification: true,
                localization: {
                  locale: input.locale,
                  titleFallbackKey,
                  summaryKey: messageKeys.chatProductIntentDraftSummary,
                  goalFallbackKey: messageKeys.chatProductIntentDraftGoalFallback,
                  successCriteriaKeys: [messageKeys.chatProductIntentDraftSuccessCriteria],
                  outOfScopeKeys: [messageKeys.chatProductIntentDraftOutOfScope],
                  openQuestionKeys: [messageKeys.chatProductIntentDraftOpenQuestion],
                },
              },
            },
            ...(productIntentActiveAnchor
              ? {
                  productIntent: {
                    activeAnchor: productIntentActiveAnchor,
                  },
                }
              : {}),
            directSlashMode: {
              activeAnchor: input.activeAnchor,
            },
            planning: {
              productHint: targetProduct,
            },
          },
        },
        input.now,
      ).core;
    }
    if (
      input.activeAnchor
      && input.activeAnchorClear?.clearReason === 'anchor_superseded'
      && input.activeAnchor.workItemId === input.activeAnchorClear.clearedActiveAnchor.workItemId
    ) {
      throw new Error('Direct slash-mode replacement anchor id matched the cleared anchor id.');
    }
    if (
      input.activeAnchor
      && input.activeAnchorClear?.clearReason === 'anchor_superseded'
    ) {
      const existingWorkItem = nextCore.workItems.find((candidate) =>
        candidate.id === input.activeAnchorClear?.clearedActiveAnchor.workItemId) ?? null;
      if (existingWorkItem) {
        nextCore = upsertCoreWorkItem(
          nextCore,
          {
            id: existingWorkItem.id,
            title: existingWorkItem.title,
            status: existingWorkItem.status === 'draft'
              ? 'cancelled'
              : existingWorkItem.status,
            metadata: mergeSupersededDirectSlashModeMetadata({
              metadata: existingWorkItem.metadata,
              supersededByWorkItemId: workItemId,
              supersededBySegmentId: segmentId,
              supersededAt: input.ackMessage.createdAt,
            }),
          },
          input.now,
        ).core;
      }
    }
    if (
      input.activeAnchorClear?.clearReason === 'posture_changed'
      || input.activeAnchorClear?.clearReason === 'chat_posture'
    ) {
      const abandonedWorkItem = nextCore.workItems.find((candidate) =>
        candidate.id === input.activeAnchorClear?.clearedActiveAnchor.workItemId
        && candidate.conversationId === conversationId) ?? null;
      if (abandonedWorkItem?.status === 'draft') {
        nextCore = upsertCoreWorkItem(
          nextCore,
          {
            id: abandonedWorkItem.id,
            title: abandonedWorkItem.title,
            status: 'cancelled',
            metadata: mergeAbandonedDirectSlashModeMetadata({
              metadata: abandonedWorkItem.metadata,
              reason: 'posture_abandoned',
              abandonedAt: input.ackMessage.createdAt,
              abandonedBySegmentId: segmentId,
            }),
          },
          input.now,
        ).core;
      }
    }
    return nextCore;
  });
}

function buildRetrySendPayload(message: ChatMessage): SendChannelMessageInput {
  const messageMetadata = readMessageRetryMetadata(message);
  return {
    body: message.body,
    senderName: message.senderName,
    ...(message.choiceResponse
      ? {
          choiceResponse: message.choiceResponse,
        }
      : {}),
    ...(messageMetadata
      ? {
          messageMetadata,
        }
      : {}),
  };
}

function restoreMissingTranscriptMessage(
  state: ChatState,
  channelId: string,
  message: ChatMessage,
  now: Date,
): ChatState {
  const existingChannel = requireChannel(state, channelId);
  if (existingChannel.messages.some((candidate) => candidate.id === message.id)) {
    return state;
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const insertIndex = nextChannel.messages.findIndex((candidate) =>
    candidate.createdAt.localeCompare(message.createdAt) > 0);
  const nextIndex = insertIndex >= 0 ? insertIndex : nextChannel.messages.length;
  nextChannel.messages.splice(nextIndex, 0, structuredClone(message));
  nextChannel.lastMessageAt = nextChannel.messages.at(-1)?.createdAt ?? nextChannel.lastMessageAt;
  return refreshDerivedMemoryLayers(nextState, channelId, now);
}

function applyDeterministicPlanMetadataToExistingUserMessage(
  state: ChatState,
  channelId: string,
  messageId: string,
  plan: DeterministicChatRoutingPlan | null,
  now: Date,
): {
  state: ChatState;
  userMessage: ChatMessage | null;
} {
  if (plan && plan.channelId !== channelId) {
    return { state, userMessage: null };
  }

  const planMetadata = buildDeterministicRoutingPlanMessageMetadata(plan);
  if (Object.keys(planMetadata).length === 0) {
    return { state, userMessage: null };
  }

  const channel = requireChannel(state, channelId);
  const messageIndex = channel.messages.findIndex((message) => message.id === messageId);
  if (messageIndex < 0) {
    return { state, userMessage: null };
  }

  const nextState = structuredClone(state);
  const nextChannel = requireChannel(nextState, channelId);
  const nextMessage = nextChannel.messages[messageIndex]!;
  nextMessage.metadata = {
    ...(nextMessage.metadata ?? {}),
    ...planMetadata,
  };
  return {
    state: refreshDerivedMemoryLayers(nextState, channelId, now),
    userMessage: nextMessage,
  };
}

function buildPreparedTurnDeterministicRoutingPlan(
  channelId: string,
  preparedTurn: import('./turn.js').PreparedDispatchTurn,
): DeterministicChatRoutingPlan {
  return {
    planId:
      preparedTurn.providerAgentObservation?.observationId
      ?? `chat-deterministic:${channelId}:${preparedTurn.userMessage.id}`,
    channelId,
    metadata: {
      planner: preparedTurn.providerAgentObservation
        ? 'provider_agent_observation'
        : 'chat_deterministic_router',
      loopMode: 'agent_driven',
      dispatchBoundary: 'supervised_runtime_boundary',
      runtimeToolBoundary: 'runtime_mcp_facade',
    },
    routing: {
      trigger: preparedTurn.initialResolution.trigger,
      resolution: structuredClone(preparedTurn.initialResolution.resolution),
      mentionNames: [...preparedTurn.initialResolution.mentionNames],
      unresolvedMentions: [...preparedTurn.initialResolution.unresolved],
      initialTargets: preparedTurn.initialResolution.targets.map((target) => {
        const targetStatus = preparedTurn.activeTurn.targetStatuses.find((candidate) =>
          candidate.participant.participantKind === target.participantKind
          && candidate.participant.participantId === target.participantId
          && candidate.laneId === (target.laneId ?? null));
        return {
          participantKind: target.participantKind,
          participantId: target.participantId,
          participantName: target.participantName,
          laneId: target.laneId,
          sessionId: target.sessionId,
          trigger: targetStatus?.trigger ?? preparedTurn.initialResolution.trigger,
          plannedDepth: targetStatus?.depth ?? 0,
        };
      }),
    },
  };
}

function describeGuardReason(reason: Exclude<RoomRoutingGuardReason, null>): string {
  switch (reason) {
    case 'max_continuations':
      return 'the continuation depth limit';
    case 'max_dispatches':
      return 'the per-turn dispatch limit';
    case 'max_target_visits':
      return 'the per-target revisit limit';
    case 'anti_ping_pong':
      return 'anti-ping-pong protection';
    default:
      return 'a routing guard';
  }
}

export interface BegunChannelMessageDispatch {
  state: ChatState;
  results: ChannelDispatchResult[];
  preparedTurn: import('./turn.js').PreparedDispatchTurn | null;
  userMessage: ChatMessage;
  providerAgentDecision: ProviderAgentDecision | null;
  idempotent?: true;
  messageIdentity?: SendChannelMessageIdentity;
}

export async function beginChannelMessageDispatch(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<BegunChannelMessageDispatch> {
  let nextState = state;
  const channelBeforeMessage = requireChannel(nextState, channelId);
  // Inbound direct-lane pre-flight: when the channel is a direct-
  // message lane and a chatStore is available, verify the canonical
  // direct-lane transport binding (deterministically derived from
  // the channel id, NOT from `options.transportBindingId`) actually
  // resolves to a direct-lane conversation. The deterministic id
  // matters: callers like the Telegram bridge supply *bot* binding
  // ids in `options.transportBindingId` (those are bidirectional
  // bindings with `conversationId: null` — see
  // `createBotTransportBindings`), and feeding them into the direct-
  // lane resolver would falsely return `no_conversation_linked` and
  // block legitimate Telegram inbound. The right gate question is
  // "does this channel's own direct-lane projection resolve cleanly?"
  // — that's the binding the chat runtime stamps on outbound
  // messages and the canonical anchor for inbound continuation.
  if (options.chatStore && channelBeforeMessage.channelKind === 'direct_message') {
    const directLaneBindingId = buildDirectLaneTransportBindingId(channelId);
    const inboundCoreSnapshot = await options.chatStore.readCore();
    const inboundBindingResolution = resolveTransportBindingDirectLane(
      inboundCoreSnapshot,
      directLaneBindingId,
    );
    if (inboundBindingResolution.status !== 'resolved') {
      const diagnostic = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Direct-lane transport binding ${directLaneBindingId} is not ready for dispatch: ${
            inboundBindingResolution.reason ?? inboundBindingResolution.status
          }`,
        },
        now,
        {
          metadata: {
            event: 'transport_binding_inbound_rejected',
            transportBindingId: directLaneBindingId,
            status: inboundBindingResolution.status,
            reason: inboundBindingResolution.reason,
          },
        },
      );
      nextState = diagnostic.state;
      nextState = await persistInFlightDispatchState(options.chatStore, nextState);
      options.onStateWritten?.(channelId);
      return {
        state: nextState,
        results: [],
        preparedTurn: null,
        // No user message is produced when the binding is broken; the
        // diagnostic system message stands in to keep the contract on
        // BegunChannelMessageDispatch.userMessage non-null.
        userMessage: diagnostic.message,
        providerAgentDecision: null,
      };
    }
  }
  const deterministicRoutingPlan = options.deterministicRoutingPlan ?? null;
  const productIntentSource = resolveProductIntentCommandSource(options.transport);
  const implicitProductIntentChoice = resolveImplicitProductIntentChoice({
    channel: channelBeforeMessage,
    choiceResponse: payload.choiceResponse,
    source: productIntentSource,
    now,
  });
  const catProductIntentProposalChoice = resolveCatProductIntentProposalChoice({
    channel: channelBeforeMessage,
    choiceResponse: payload.choiceResponse,
    source: productIntentSource,
    now,
  });
  const workIntakeProposalChoice = resolveWorkIntakeProposalChoice({
    channel: channelBeforeMessage,
    choiceResponse: payload.choiceResponse,
  });
  const workExecutionPreparationChoice = resolveWorkExecutionPreparationChoice({
    channel: channelBeforeMessage,
    choiceResponse: payload.choiceResponse,
  });
  const productIntentCommand = resolveProductIntentCommandMetadata(
    payload.body,
    productIntentSource,
  )
    ?? implicitProductIntentChoice?.productIntentCommand
    ?? catProductIntentProposalChoice?.productIntentCommand
    ?? null;
  if (implicitProductIntentChoice?.action === 'handled') {
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: implicitProductIntentChoice.originalMessage,
      providerAgentDecision: null,
    };
  }
  if (catProductIntentProposalChoice?.action === 'handled') {
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: catProductIntentProposalChoice.originalMessage,
      providerAgentDecision: null,
    };
  }
  if (workIntakeProposalChoice?.action === 'handled') {
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: workIntakeProposalChoice.originalMessage,
      providerAgentDecision: null,
    };
  }
  if (workExecutionPreparationChoice?.action === 'handled') {
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: workExecutionPreparationChoice.originalMessage,
      providerAgentDecision: null,
    };
  }
  if (implicitProductIntentChoice?.action === 'decline') {
    const locale = resolveProductIntentMessageLocale(
      channelBeforeMessage,
      options.transportLocale,
    );
    const declined = appendImplicitProductIntentDecline({
      state: nextState,
      channelId,
      payload,
      deterministicRoutingPlan,
      transportBindingId: options.transportBindingId,
      transport: options.transport,
      resolvedChoice: implicitProductIntentChoice,
      locale,
      now,
    });
    nextState = declined.state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: declined.userMessage,
      providerAgentDecision: null,
    };
  }
  if (catProductIntentProposalChoice?.action === 'decline') {
    const locale = resolveProductIntentMessageLocale(
      channelBeforeMessage,
      options.transportLocale,
    );
    const declined = appendCatProductIntentProposalDecline({
      state: nextState,
      channelId,
      payload,
      deterministicRoutingPlan,
      transportBindingId: options.transportBindingId,
      transport: options.transport,
      resolvedChoice: catProductIntentProposalChoice,
      locale,
      now,
    });
    nextState = declined.state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: declined.userMessage,
      providerAgentDecision: null,
    };
  }
  if (workIntakeProposalChoice?.action === 'decline') {
    const declined = appendWorkIntakeProposalDecline({
      state: nextState,
      channelId,
      payload,
      deterministicRoutingPlan,
      transportBindingId: options.transportBindingId,
      transport: options.transport,
      resolvedChoice: workIntakeProposalChoice,
      now,
    });
    nextState = declined.state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: declined.userMessage,
      providerAgentDecision: null,
    };
  }
  if (workExecutionPreparationChoice?.action === 'decline') {
    const declined = appendWorkExecutionPreparationDecline({
      state: nextState,
      channelId,
      payload,
      deterministicRoutingPlan,
      transportBindingId: options.transportBindingId,
      transport: options.transport,
      resolvedChoice: workExecutionPreparationChoice,
      now,
    });
    nextState = declined.state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: declined.userMessage,
      providerAgentDecision: null,
    };
  }
  if (workIntakeProposalChoice?.action === 'capture') {
    const captured = await appendWorkIntakeProposalCapture({
      state: nextState,
      channelId,
      payload,
      deterministicRoutingPlan,
      transportBindingId: options.transportBindingId,
      transport: options.transport,
      chatStore: options.chatStore,
      resolvedChoice: workIntakeProposalChoice,
      now,
    });
    nextState = captured.state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: captured.userMessage,
      providerAgentDecision: null,
    };
  }
  if (workExecutionPreparationChoice?.action === 'create_tasks') {
    const created = await appendWorkExecutionPreparationTaskCreation({
      state: nextState,
      channelId,
      payload,
      deterministicRoutingPlan,
      transportBindingId: options.transportBindingId,
      transport: options.transport,
      chatStore: options.chatStore,
      resolvedChoice: workExecutionPreparationChoice,
      now,
    });
    nextState = created.state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: created.userMessage,
      providerAgentDecision: null,
    };
  }
  if (implicitProductIntentChoice?.action === 'expired') {
    const locale = resolveProductIntentMessageLocale(
      channelBeforeMessage,
      options.transportLocale,
    );
    nextState = appendImplicitProductIntentTransitionSidecar({
      state: nextState,
      channelId,
      resolvedChoice: implicitProductIntentChoice,
      event: 'expired',
      locale,
      now,
    }).state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: implicitProductIntentChoice.originalMessage,
      providerAgentDecision: null,
    };
  }
  if (catProductIntentProposalChoice?.action === 'expired') {
    const locale = resolveProductIntentMessageLocale(
      channelBeforeMessage,
      options.transportLocale,
    );
    nextState = appendCatProductIntentProposalTransitionSidecar({
      state: nextState,
      channelId,
      proposal: catProductIntentProposalChoice.proposal,
      proposalMessageId: catProductIntentProposalChoice.proposalMessage.id,
      originalMessage: catProductIntentProposalChoice.originalMessage,
      event: 'expired',
      locale,
      now,
    }).state;
    nextState = await persistInFlightDispatchState(options.chatStore, nextState);
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: catProductIntentProposalChoice.originalMessage,
      providerAgentDecision: null,
    };
  }
  if (productIntentCommand) {
    const locale = resolveProductIntentMessageLocale(
      channelBeforeMessage,
      options.transportLocale,
    );
    const translate = createTranslator(locale);
    const senderName = payload.senderName?.trim() || 'User';
    const userMessageMetadata = {
      ...buildBaseUserMessageMetadata({
        payload,
        channelId,
        deterministicRoutingPlan,
        transportBindingId: options.transportBindingId,
      }),
      ...buildProductIntentUserMessageMetadata({
        productIntentCommand,
        locale,
      }),
    };
    const clientMessagePlan = resolveClientMessageAppendPlan({
      channel: channelBeforeMessage,
      payload,
      senderName,
      metadata: userMessageMetadata,
    });
    if (clientMessagePlan.kind === 'idempotent' && clientMessagePlan.existingMessage) {
      return {
        state: nextState,
        results: [],
        preparedTurn: null,
        userMessage: clientMessagePlan.existingMessage,
        providerAgentDecision: null,
        idempotent: true,
        messageIdentity: clientMessagePlan.messageIdentity,
      };
    }
    const userAppend = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'user',
        senderName,
        body: payload.body,
      },
      now,
      {
        metadata: userMessageMetadata,
        choiceResponse: payload.choiceResponse,
        clientMessageIdentity: clientMessagePlan.appendIdentity,
        origin: resolveUserMessageOrigin(options.transport),
        sourceTransportBindingId: options.transport === 'telegram'
          ? options.transportBindingId ?? null
          : null,
      },
    );
    const messageIdentity = buildFreshClientMessageIdentity(
      clientMessagePlan,
      userAppend.message.id,
    );
    nextState = userAppend.state;
    if (productIntentCommand.command === 'chat') {
      nextState = appendExpiredImplicitProductIntentCandidates({
        state: nextState,
        channelId,
        expireAll: true,
        locale,
        now,
      });
      nextState = expireCatProductIntentProposalSidecars({
        state: nextState,
        channelId,
        locale,
        now,
        expireAll: true,
      });
    }
    if (implicitProductIntentChoice?.action === 'confirm') {
      const transitionAppend = appendImplicitProductIntentTransitionSidecar({
        state: nextState,
        channelId,
        resolvedChoice: implicitProductIntentChoice,
        event: 'confirmed',
        locale,
        now,
      });
      nextState = transitionAppend.state;
    }
    if (catProductIntentProposalChoice?.action === 'confirm') {
      const transitionAppend = appendCatProductIntentProposalTransitionSidecar({
        state: nextState,
        channelId,
        proposal: catProductIntentProposalChoice.proposal,
        proposalMessageId: catProductIntentProposalChoice.proposalMessage.id,
        originalMessage: catProductIntentProposalChoice.originalMessage,
        event: 'confirmed',
        locale,
        now,
      });
      nextState = transitionAppend.state;
    }
    const audience = resolveProductIntentAudience({
      state: nextState,
      channel: channelBeforeMessage,
      channelId,
      payload,
      deterministicRoutingPlan,
      productIntentCommand,
    });
    const capabilityProfileKind = resolveDirectAudienceCapabilityProfileKind({
      channel: channelBeforeMessage,
      audience,
      assessedAt: now.toISOString(),
      providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink:
        options.providerCapabilityBootstrapDiagnosticSink,
    });
    const postureChange = audience.accepted
      ? buildProductPostureChangeMetadata({
          channel: channelBeforeMessage,
          channelId,
          productIntentCommand,
          audience,
          capabilityProfileKind,
        })
      : null;
    const coreBeforeProductIntent = options.chatStore
      ? await options.chatStore.readCore()
      : null;
    const activeAnchorState = resolveDirectSlashModeActiveAnchorState({
      channel: channelBeforeMessage,
      core: coreBeforeProductIntent,
    });
    const activeAnchorPostureChangeClear = (
      productIntentCommand.command === 'work'
      || productIntentCommand.command === 'code'
    ) && activeAnchorState.activeAnchor
      && postureChange?.changed === true
      ? {
          clearedActiveAnchor: activeAnchorState.activeAnchor,
          clearReason: postureChange.capabilityProfileKind === 'strong_agent'
            ? 'anchor_superseded' as const
            : 'posture_changed' as const,
        }
      : null;
    const activeAnchorClear = productIntentCommand.command === 'chat'
      && activeAnchorState.activeAnchor
      ? {
          clearedActiveAnchor: activeAnchorState.activeAnchor,
          clearReason: 'chat_posture' as const,
        }
      : activeAnchorPostureChangeClear ?? activeAnchorState.clear;
    const coreIds = resolveProductIntentCoreIds(userAppend.message.id);
    const activeAnchor = shouldCreateProductIntentWorkItemAnchor({
      productIntentCommand,
      postureChange,
      activeAnchorClear,
    })
      ? buildDirectSlashModeActiveAnchor({
          workItemId: coreIds.workItemId,
          targetProduct: productIntentCommand.targetProduct === 'code' ? 'code' : 'work',
          segmentId: coreIds.segmentId,
          establishedAt: now.toISOString(),
        })
      : null;
    const productIntentIntakeCommandMetadata = activeAnchor
      ? buildProductIntentIntakeCommandMetadata(productIntentCommand)
      : null;
    const productIntentSourceContext = activeAnchor && productIntentIntakeCommandMetadata
      ? buildProductPresetIntentContextForCommand({
          state: nextState,
          channelId,
          conversationId: resolveChannelCanonicalIdentity(nextState, channelId).conversationId,
          turnId: coreIds.turnId,
          segmentId: coreIds.segmentId,
          productIntentCommand,
          postureChange,
        })
      : null;
    const productIntentActiveAnchor = activeAnchor && productIntentSourceContext
      ? buildProductIntentActiveAnchorForDirectCommand({
          activeAnchor,
          sourceContext: productIntentSourceContext,
        })
      : null;
    const humanGate = buildDirectSlashModeHumanGate({
      productIntentCommand,
      postureChange,
      translate,
    });
    const directSlashMode = buildDirectSlashModeStateMetadata({
      activeAnchor: activeAnchor ?? (activeAnchorClear ? null : undefined),
      clear: activeAnchorClear,
      humanGate,
    });
    const productIntent = buildProductIntentStateMetadata({
      activeAnchor: productIntentActiveAnchor ?? (activeAnchorClear ? null : undefined),
    });
    let productIntentUserMessage = userAppend.message;
    if (activeAnchor) {
      const annotated = annotateProductIntentUserMessageWithActiveAnchor({
        state: nextState,
        channelId,
        messageId: userAppend.message.id,
        activeAnchor,
        productIntentActiveAnchor,
        directSlashMode,
        now,
      });
      nextState = annotated.state;
      productIntentUserMessage = annotated.userMessage;
    }
    const ackAppend = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Cats',
        body: describeProductIntentCommandAck(
          productIntentCommand,
          audience.accepted,
          translate,
          audience.rejectionReason,
          capabilityProfileKind,
        ),
      },
      now,
      {
        choices: buildDirectSlashModeHumanGateChoices(humanGate, translate),
        metadata: {
          event: audience.accepted
            ? 'product_intent_posture_changed'
            : 'product_intent_unsupported_context',
          productIntentCommand,
          ...(postureChange
            ? {
                directSlashModePostureChange: postureChange,
              }
            : {}),
          sourceMessageId: userAppend.message.id,
          activeProductPosture: productIntentCommand.posture,
          targetProduct: productIntentCommand.targetProduct,
          ...(productIntent ? { productIntent } : {}),
          ...(directSlashMode ? { directSlashMode } : {}),
          accepted: audience.accepted,
          audienceCatId: audience.audienceCatId,
          ...(audience.rejectionReason
            ? {
                rejectionReason: audience.rejectionReason,
              }
            : {}),
          ...(capabilityProfileKind
            ? {
                capabilityProfileKind,
              }
            : {}),
        },
        incrementUnread: false,
      },
    );
    nextState = refreshDerivedMemoryLayers(ackAppend.state, channelId, now);
    if (options.chatStore) {
      nextState = await options.chatStore.write(nextState);
    }
    await persistProductIntentCommandCoreSegment({
      chatStore: options.chatStore,
      state: nextState,
      channelId,
      userMessage: productIntentUserMessage,
      ackMessage: ackAppend.message,
      productIntentCommand,
      postureChange,
      coreIds,
      activeAnchor,
      activeAnchorClear,
      humanGate,
      accepted: audience.accepted,
      locale,
      translate,
      now,
    });
    let productIntentResults: ChannelDispatchResult[] = [];
    let productIntentPreparedTurn: import('./turn.js').PreparedDispatchTurn | null = null;
    let providerAgentDecision: ProviderAgentDecision | null = null;
    if (activeAnchor && productIntentCommand.command !== 'chat') {
      const coreAfterProductIntent = options.chatStore
        ? await options.chatStore.readCore()
        : null;
      const conciergeSourceMessage = buildProductIntentConciergePromptSource({
        userMessage: productIntentUserMessage,
        productIntentCommand,
        activeAnchor,
      });
      const conciergePayload: SendChannelMessageInput = {
        ...payload,
        body: conciergeSourceMessage.body,
      };
      const preparedTurn = prepareDispatchTurnForUserMessage(
        nextState,
        channelId,
        conciergePayload,
        conciergeSourceMessage,
        now,
        coreAfterProductIntent ?? undefined,
        {
          deterministicRoutingPlan,
          providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
          providerCapabilityBootstrapDiagnosticSink:
            options.providerCapabilityBootstrapDiagnosticSink,
          naturalProductIntentMode: options.naturalProductIntentMode,
        },
      );
      const effectiveDeterministicRoutingPlan =
        deterministicRoutingPlan
        ?? buildPreparedTurnDeterministicRoutingPlan(channelId, preparedTurn);
      const metadataApplied = applyDeterministicPlanMetadataToExistingUserMessage(
        preparedTurn.state,
        channelId,
        preparedTurn.userMessage.id,
        effectiveDeterministicRoutingPlan,
        now,
      );
      if (metadataApplied.userMessage) {
        preparedTurn.state = metadataApplied.state;
        preparedTurn.userMessage = {
          ...preparedTurn.userMessage,
          metadata: metadataApplied.userMessage.metadata,
        };
      }
      providerAgentDecision = preparedTurn.providerAgentObservation
        && options.providerAgentDecisionRequester
        ? await options.providerAgentDecisionRequester({
            state: preparedTurn.state,
            channelId,
            payload: conciergePayload,
            observation: preparedTurn.providerAgentObservation,
            runtimeClient,
            now,
          })
        : null;
      if (preparedTurn.terminalResult) {
        nextState = preparedTurn.terminalResult.state;
        productIntentResults = preparedTurn.terminalResult.results;
      } else {
        productIntentPreparedTurn = preparedTurn;
        nextState = materializeInFlightDispatchState(
          preparedTurn.state,
          channelId,
          preparedTurn.baseRoomRouting,
          preparedTurn.workflow,
          preparedTurn.outcome,
          preparedTurn.latestCheckpoint,
          now,
        );
        nextState = await persistInFlightDispatchState(options.chatStore, nextState);
      }
    }
    options.onStateWritten?.(channelId);
    return {
      state: nextState,
      results: productIntentResults,
      preparedTurn: productIntentPreparedTurn,
      userMessage: productIntentUserMessage,
      providerAgentDecision,
      ...(messageIdentity ? { messageIdentity } : {}),
    };
  }
  const nextTarget = resolveNextPendingExecutionTarget(channelBeforeMessage, payload);
  const pendingTargetChanged = isProviderDefaultChatChannel(channelBeforeMessage)
    && (
      nextTarget.provider !== channelBeforeMessage.pendingProvider
      || nextTarget.model !== channelBeforeMessage.pendingModel
      || nextTarget.instance !== channelBeforeMessage.pendingInstance
      || !sameProviderModelSelection(
        channelBeforeMessage.pendingModelSelection,
        nextTarget.modelSelection,
      )
    );
  const orchestratorSessionAttachment = resolveOrchestratorLeaseAttachment(channelBeforeMessage);
  const orchestratorSessionId = orchestratorSessionAttachment?.sessionId ?? null;
  if (
    pendingTargetChanged
    && orchestratorSessionId
  ) {
    await bestEffortFlushRuntimeSessionMemory({
      runtimeClient,
      sessionId: orchestratorSessionId,
      requestedPhase: 'pre_reset',
      memoryService: options.memoryService,
      companionStore: options.companionStore,
      coreStore: options.chatStore,
      now,
    });
    await runtimeClient.closeSession(orchestratorSessionId);
    nextState = setChannelOrchestratorLease(
      nextState,
      channelId,
      {
        sessionId: null,
        status: 'not_started',
        lastError: null,
        provider: nextTarget.provider,
        instance: nextTarget.instance,
        model: nextTarget.model,
        modelSelection: nextTarget.modelSelection,
        startedAt: null,
      },
      now,
    );
  }

  nextState = setChannelPendingExecutionTarget(
    nextState,
    channelId,
    {
      provider: nextTarget.provider,
      model: nextTarget.model,
      instance: nextTarget.instance,
      modelSelection: nextTarget.modelSelection,
    },
    now,
  );
  const coreBeforeUserMessage = options.chatStore
    ? await options.chatStore.readCore()
    : null;
  const naturalProductIntentEffectiveMode = resolveEffectiveChatNaturalProductIntentMode({
    deploymentMode: options.naturalProductIntentMode,
    ownerEnabled:
      coreBeforeUserMessage?.ownerProfile.naturalProductIntentProposalsEnabled,
  });
  const naturalProductIntentAudience = resolveProductIntentAudience({
    state: nextState,
    channel: channelBeforeMessage,
    channelId,
    payload,
    deterministicRoutingPlan,
  });
  const naturalProductIntentCapabilityProfileKind = resolveDirectAudienceCapabilityProfileKind({
    channel: channelBeforeMessage,
    audience: naturalProductIntentAudience,
    assessedAt: now.toISOString(),
    providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
    providerCapabilityBootstrapDiagnosticSink:
      options.providerCapabilityBootstrapDiagnosticSink,
  });
  const followUpActiveAnchorState = resolveDirectSlashModeActiveAnchorState({
    channel: channelBeforeMessage,
    core: coreBeforeUserMessage,
  });
  const followUpProductIntentSourceContextRef =
    buildProductIntentActiveAnchorSourceContextRefForChannel({
      state: nextState,
      channelId,
      conversationId: resolveChannelCanonicalIdentity(nextState, channelId).conversationId,
    });
  const followUpProductIntentActiveAnchorState = resolveProductIntentActiveAnchorState({
    channel: channelBeforeMessage,
    core: coreBeforeUserMessage,
    sourceContextRef: followUpProductIntentSourceContextRef,
  });
  const matchedFollowUpProductIntentActiveAnchor =
    followUpProductIntentActiveAnchorState.activeAnchor
    && (
      !followUpActiveAnchorState.activeAnchor
      || followUpProductIntentActiveAnchorState.activeAnchor.workItemId
        === followUpActiveAnchorState.activeAnchor.workItemId
    )
      ? followUpProductIntentActiveAnchorState.activeAnchor
      : null;
  const followUpDirectSlashMode = buildDirectSlashModeStateMetadata({
    activeAnchor: followUpActiveAnchorState.activeAnchor
      ?? (followUpActiveAnchorState.clear ? null : undefined),
    clear: followUpActiveAnchorState.clear,
    humanGate: null,
  });
  const senderName = payload.senderName?.trim() || 'User';
  const userMessageMetadata = {
    ...buildBaseUserMessageMetadata({
      payload,
      channelId,
      deterministicRoutingPlan,
      transportBindingId: options.transportBindingId,
    }),
    ...(followUpDirectSlashMode ? { directSlashMode: followUpDirectSlashMode } : {}),
    ...(followUpActiveAnchorState.activeAnchor
      ? {
          directSlashModeIntakeRef: buildDirectSlashModeIntakeRef(
            followUpActiveAnchorState.activeAnchor,
          ),
        }
      : {}),
    ...(matchedFollowUpProductIntentActiveAnchor
      ? {
          productIntent: {
            activeAnchor: matchedFollowUpProductIntentActiveAnchor,
          },
          productIntentIntakeRef: buildProductIntentIntakeRef(
            matchedFollowUpProductIntentActiveAnchor,
          ),
        }
      : {}),
  };
  const clientMessagePlan = resolveClientMessageAppendPlan({
    channel: channelBeforeMessage,
    payload,
    senderName,
    metadata: userMessageMetadata,
  });
  if (clientMessagePlan.kind === 'idempotent' && clientMessagePlan.existingMessage) {
    return {
      state: nextState,
      results: [],
      preparedTurn: null,
      userMessage: clientMessagePlan.existingMessage,
      providerAgentDecision: null,
      idempotent: true,
      messageIdentity: clientMessagePlan.messageIdentity,
    };
  }
  const userAppend = appendMessage(
    nextState,
    channelId,
    {
      senderKind: 'user',
      senderName,
      body: payload.body,
    },
    now,
    {
      metadata: userMessageMetadata,
      choiceResponse: payload.choiceResponse,
      clientMessageIdentity: clientMessagePlan.appendIdentity,
      origin: resolveUserMessageOrigin(options.transport),
      sourceTransportBindingId: options.transport === 'telegram'
        ? options.transportBindingId ?? null
        : null,
    },
  );
  const messageIdentity = buildFreshClientMessageIdentity(
    clientMessagePlan,
    userAppend.message.id,
  );
  nextState = userAppend.state;
  nextState = refreshDerivedMemoryLayers(nextState, channelId, now);

  const choiceResponseCore = payload.choiceResponse && options.chatStore
    ? await options.chatStore.readCore()
    : undefined;
  const preparedTurn = prepareDispatchTurn(
    nextState,
    channelId,
    payload,
    now,
    choiceResponseCore ?? coreBeforeUserMessage ?? undefined,
    {
      deterministicRoutingPlan,
      providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink:
        options.providerCapabilityBootstrapDiagnosticSink,
      naturalProductIntentMode: options.naturalProductIntentMode,
      transport: options.transport,
      transportBindingId: options.transportBindingId,
    },
  );
  const effectiveDeterministicRoutingPlan =
    deterministicRoutingPlan ?? buildPreparedTurnDeterministicRoutingPlan(channelId, preparedTurn);
  const metadataApplied = applyDeterministicPlanMetadataToExistingUserMessage(
    preparedTurn.state,
    channelId,
    preparedTurn.userMessage.id,
    effectiveDeterministicRoutingPlan,
    now,
  );
  if (metadataApplied.userMessage) {
    preparedTurn.state = metadataApplied.state;
    preparedTurn.userMessage = metadataApplied.userMessage;
  }
  const providerAgentDecision = preparedTurn.providerAgentObservation
    && options.providerAgentDecisionRequester
    ? await options.providerAgentDecisionRequester({
        state: preparedTurn.state,
        channelId,
        payload,
        observation: preparedTurn.providerAgentObservation,
        runtimeClient,
        now,
      })
    : null;
  nextState = materializeInFlightDispatchState(
    preparedTurn.state,
    channelId,
    preparedTurn.baseRoomRouting,
    preparedTurn.workflow,
    preparedTurn.outcome,
    preparedTurn.latestCheckpoint,
    now,
  );
  const ordinaryProductIntentLocale = resolveProductIntentMessageLocale(
    channelBeforeMessage,
    options.transportLocale,
  );
  nextState = expireTtlImplicitProductIntentCandidates({
    state: nextState,
    channelId,
    locale: ordinaryProductIntentLocale,
    now,
  });
  nextState = expireCatProductIntentProposalSidecars({
    state: nextState,
    channelId,
    locale: ordinaryProductIntentLocale,
    now,
  });
  const catProposalSidecar = appendCatProductIntentProposalSidecar({
    state: nextState,
    channel: requireChannel(nextState, channelId),
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    effectiveMode: naturalProductIntentEffectiveMode,
    capabilityProfileKind: naturalProductIntentCapabilityProfileKind,
    audienceCatId: naturalProductIntentAudience.audienceCatId,
    locale: ordinaryProductIntentLocale,
    now,
    transport: options.transport,
  });
  nextState = catProposalSidecar.state;
  const workIntakeProposalSidecar = appendWorkIntakeProposalSidecar({
    state: nextState,
    channel: requireChannel(nextState, channelId),
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    now,
    transport: options.transport,
    transportBindingId: options.transportBindingId,
  });
  nextState = workIntakeProposalSidecar.state;
  const workExecutionPreparationSidecar = appendWorkExecutionPreparationProposalSidecar({
    state: nextState,
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    core: choiceResponseCore ?? coreBeforeUserMessage,
    now,
  });
  nextState = workExecutionPreparationSidecar.state;
  const workExternalBindingSidecar = await appendWorkExternalBindingResultSidecar({
    state: nextState,
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workExternalBindingSidecar.state;
  const workTriageLookupSidecar = await appendWorkTriageLookupResultSidecar({
    state: nextState,
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workTriageLookupSidecar.state;
  const workProjectCreateSidecar = await appendWorkProjectCreateResultSidecar({
    state: nextState,
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workProjectCreateSidecar.state;
  const workItemUpdateSidecar = await appendWorkItemUpdateResultSidecar({
    state: nextState,
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workItemUpdateSidecar.state;
  const workItemAssignProjectSidecar = await appendWorkItemAssignProjectResultSidecar({
    state: nextState,
    channelId,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workItemAssignProjectSidecar.state;
  const implicitCandidateSidecar = appendImplicitProductIntentCandidateSidecar({
    state: nextState,
    channel: requireChannel(nextState, channelId),
    channelId,
    userMessage: preparedTurn.userMessage,
    body: payload.body,
    transport: options.transport,
    effectiveMode: naturalProductIntentEffectiveMode,
    locale: ordinaryProductIntentLocale,
    now,
    choiceResponse: payload.choiceResponse,
  });
  nextState = implicitCandidateSidecar.state;
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return {
    state: nextState,
    results: preparedTurn.results,
    preparedTurn: preparedTurn.terminalResult ? null : preparedTurn,
    userMessage: preparedTurn.userMessage,
    providerAgentDecision,
    ...(messageIdentity ? { messageIdentity } : {}),
  };
}

export async function beginChannelMessageRetryDispatch(
  state: ChatState,
  channelId: string,
  sourceMessageId: string,
  _runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<BegunChannelMessageDispatch> {
  let nextState = state;
  const channel = requireChannel(nextState, channelId);
  let core: CatsCoreState | undefined;
  let sourceMessage = channel.messages.find((message) => message.id === sourceMessageId) ?? null;
  const sourceWasMissingFromTranscript = !sourceMessage;
  if (!sourceMessage && options.chatStore) {
    core = await options.chatStore.readCore();
    sourceMessage = buildCanonicalChatUserMessage(core, channelId, sourceMessageId);
  }
  if (!sourceMessage) {
    throw new Error(`Channel message not found: ${sourceMessageId}`);
  }
  if (sourceMessage.senderKind !== 'user') {
    throw new Error(`Only user messages can be retried: ${sourceMessageId}`);
  }

  if (!core && options.chatStore) {
    core = await options.chatStore.readCore();
  }
  if (sourceWasMissingFromTranscript) {
    nextState = restoreMissingTranscriptMessage(nextState, channelId, sourceMessage, now);
  }
  const deterministicRoutingPlan = options.deterministicRoutingPlan ?? null;
  const metadataApplied = applyDeterministicPlanMetadataToExistingUserMessage(
    nextState,
    channelId,
    sourceMessageId,
    deterministicRoutingPlan,
    now,
  );
  nextState = metadataApplied.state;
  if (metadataApplied.userMessage) {
    sourceMessage = metadataApplied.userMessage;
  }
  const preparedTurn = prepareDispatchTurnForExistingUserMessage(
    nextState,
    channelId,
    buildRetrySendPayload(sourceMessage),
    sourceMessageId,
    now,
    core,
    {
      deterministicRoutingPlan,
      providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink:
        options.providerCapabilityBootstrapDiagnosticSink,
      naturalProductIntentMode: options.naturalProductIntentMode,
      transport: options.transport,
      transportBindingId: options.transportBindingId,
    },
  );
  const effectiveDeterministicRoutingPlan =
    deterministicRoutingPlan ?? buildPreparedTurnDeterministicRoutingPlan(channelId, preparedTurn);
  const preparedMetadataApplied = applyDeterministicPlanMetadataToExistingUserMessage(
    preparedTurn.state,
    channelId,
    preparedTurn.userMessage.id,
    effectiveDeterministicRoutingPlan,
    now,
  );
  if (preparedMetadataApplied.userMessage) {
    preparedTurn.state = preparedMetadataApplied.state;
    preparedTurn.userMessage = preparedMetadataApplied.userMessage;
    sourceMessage = preparedMetadataApplied.userMessage;
  }
  const providerAgentDecision = preparedTurn.providerAgentObservation
    && options.providerAgentDecisionRequester
    ? await options.providerAgentDecisionRequester({
        state: preparedTurn.state,
        channelId,
        payload: buildRetrySendPayload(sourceMessage),
        observation: preparedTurn.providerAgentObservation,
        runtimeClient: _runtimeClient,
        now,
      })
    : null;
  nextState = materializeInFlightDispatchState(
    preparedTurn.state,
    channelId,
    preparedTurn.baseRoomRouting,
    preparedTurn.workflow,
    preparedTurn.outcome,
    preparedTurn.latestCheckpoint,
    now,
  );
  const retryCoreForNaturalIntent = options.chatStore
    ? (core ?? await options.chatStore.readCore())
    : null;
  const retryChannelForNaturalIntent = requireChannel(nextState, channelId);
  const retryNaturalProductIntentEffectiveMode = resolveEffectiveChatNaturalProductIntentMode({
    deploymentMode: options.naturalProductIntentMode,
    ownerEnabled:
      retryCoreForNaturalIntent?.ownerProfile.naturalProductIntentProposalsEnabled,
  });
  const retryNaturalProductIntentAudience =
    resolveProductIntentAudience({
      state: nextState,
      channel: retryChannelForNaturalIntent,
      channelId,
      payload: buildRetrySendPayload(sourceMessage),
      deterministicRoutingPlan,
    });
  const retryNaturalProductIntentCapabilityProfileKind =
    resolveDirectAudienceCapabilityProfileKind({
      channel: retryChannelForNaturalIntent,
      audience: retryNaturalProductIntentAudience,
      assessedAt: now.toISOString(),
      providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
      providerCapabilityBootstrapDiagnosticSink:
        options.providerCapabilityBootstrapDiagnosticSink,
    });
  const retryProductIntentLocale = resolveProductIntentMessageLocale(
    retryChannelForNaturalIntent,
    options.transportLocale,
  );
  nextState = expireTtlImplicitProductIntentCandidates({
    state: nextState,
    channelId,
    locale: retryProductIntentLocale,
    now,
  });
  nextState = expireCatProductIntentProposalSidecars({
    state: nextState,
    channelId,
    locale: retryProductIntentLocale,
    now,
  });
  const catProposalSidecar = appendCatProductIntentProposalSidecar({
    state: nextState,
    channel: requireChannel(nextState, channelId),
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    effectiveMode: retryNaturalProductIntentEffectiveMode,
    capabilityProfileKind: retryNaturalProductIntentCapabilityProfileKind,
    audienceCatId: retryNaturalProductIntentAudience.audienceCatId,
    locale: retryProductIntentLocale,
    now,
    transport: options.transport,
  });
  nextState = catProposalSidecar.state;
  const workIntakeProposalSidecar = appendWorkIntakeProposalSidecar({
    state: nextState,
    channel: requireChannel(nextState, channelId),
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    now,
    transport: options.transport,
    transportBindingId: options.transportBindingId,
  });
  nextState = workIntakeProposalSidecar.state;
  const workExecutionPreparationSidecar = appendWorkExecutionPreparationProposalSidecar({
    state: nextState,
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    core: retryCoreForNaturalIntent,
    now,
  });
  nextState = workExecutionPreparationSidecar.state;
  const workExternalBindingSidecar = await appendWorkExternalBindingResultSidecar({
    state: nextState,
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workExternalBindingSidecar.state;
  const workTriageLookupSidecar = await appendWorkTriageLookupResultSidecar({
    state: nextState,
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workTriageLookupSidecar.state;
  const workProjectCreateSidecar = await appendWorkProjectCreateResultSidecar({
    state: nextState,
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workProjectCreateSidecar.state;
  const workItemUpdateSidecar = await appendWorkItemUpdateResultSidecar({
    state: nextState,
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workItemUpdateSidecar.state;
  const workItemAssignProjectSidecar = await appendWorkItemAssignProjectResultSidecar({
    state: nextState,
    channelId,
    userMessage: sourceMessage,
    providerAgentDecision,
    chatStore: options.chatStore,
    now,
  });
  nextState = workItemAssignProjectSidecar.state;
  const implicitCandidateSidecar = appendImplicitProductIntentCandidateSidecar({
    state: nextState,
    channel: requireChannel(nextState, channelId),
    channelId,
    userMessage: sourceMessage,
    body: sourceMessage.body,
    transport: options.transport,
    effectiveMode: retryNaturalProductIntentEffectiveMode,
    locale: retryProductIntentLocale,
    now,
    choiceResponse: sourceMessage.choiceResponse,
  });
  nextState = implicitCandidateSidecar.state;
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return {
    state: nextState,
    results: preparedTurn.results,
    preparedTurn: preparedTurn.terminalResult ? null : preparedTurn,
    userMessage: sourceMessage,
    providerAgentDecision,
  };
}

export async function continueBegunChannelMessageDispatch(
  begun: BegunChannelMessageDispatch,
  channelId: string,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  if (!begun.preparedTurn) {
    return { state: begun.state, results: begun.results };
  }

  const runtimeRecovery = normalizeRuntimeDispatchRecoveryPolicy(options.runtimeRecovery);
  let nextState = begun.state;
  const {
    activeTurn,
    baseRoomRouting,
    initialResolution,
    latestCheckpoint: initialCheckpoint,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    nowIso,
    outcome,
    results,
    userMessage,
    workflow,
  } = begun.preparedTurn;
  let latestCheckpoint = initialCheckpoint;
  const loopResult = await processDispatchQueue({
    state: nextState,
    channelId,
    runtimeClient,
    now,
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    initialResolution,
    userMessage,
    results,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    describeGuardReason,
    transport: options.transport,
    transportBindingId: options.transportBindingId,
    companionStore: options.companionStore,
    memoryService: options.memoryService,
    chatStore: options.chatStore,
    chatStatePath: options.chatStatePath,
    runtimeDataDir: options.runtimeDataDir,
    runtimeRecovery,
    cancellationRegistry: options.cancellationRegistry,
    onStateWritten: options.onStateWritten,
  });
  nextState = loopResult.state;
  latestCheckpoint = loopResult.latestCheckpoint;
  const guardReason = loopResult.guardReason;
  const blockedResolution = loopResult.blockedResolution;

  nextState = finalizeDispatchTurn(nextState, channelId, now, {
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    guardReason,
    blockedResolution,
    userMessageId: userMessage.id,
    describeGuardReason,
  });
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return { state: nextState, results };
}

export async function settleBegunChannelMessageDispatchFailure(
  begun: BegunChannelMessageDispatch,
  channelId: string,
  error: unknown,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{ state: ChatState; results: ChannelDispatchResult[] }> {
  if (!begun.preparedTurn) {
    return { state: begun.state, results: begun.results };
  }

  const errorMessage = error instanceof Error
    ? error.message
    : 'Runtime dispatch failed before completion.';
  const {
    activeTurn,
    baseRoomRouting,
    latestCheckpoint: initialCheckpoint,
    outcome,
    results,
    userMessage,
    workflow,
  } = begun.preparedTurn;
  const nowIso = now.toISOString();

  const latestState = options.latestState ?? begun.state;
  const latestChannel = requireChannel(latestState, channelId);
  const canonicalIdentity = resolveChannelCanonicalIdentity(latestState, channelId);
  const { conversationId, containerId } = canonicalIdentity;
  const transportBindingId = options.transportBindingId
    ?? (latestChannel.channelKind === 'direct_message'
      ? buildDirectLaneTransportBindingId(channelId)
      : null);
  let nextState = appendMessage(
    latestState,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: `Failed to continue the message dispatch: ${errorMessage}`,
    },
    now,
    {
      metadata: {
        event: 'runtime_error',
        phase: 'dispatch_continue',
        conversationId,
        containerId,
        ...(transportBindingId ? { transportBindingId } : {}),
      },
    },
  ).state;

  outcome.status = 'error';
  outcome.completedAt = nowIso;
  activeTurn.status = 'failed';
  activeTurn.stageId = 'runtime_error';
  activeTurn.completedAt = nowIso;
  activeTurn.updatedAt = nowIso;
  const plannedTargets = activeTurn.targetStatuses.map((target) => structuredClone(target.participant));

  const latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'runtime_error',
    `Room workflow failed before completion: ${errorMessage}`,
    nowIso,
    null,
    plannedTargets,
    {
      error: errorMessage,
      checkpointSeed: randomUUID(),
    },
  );
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'outcome',
      'failed',
      `Room workflow failed before completion: ${errorMessage}`,
      nowIso,
      null,
      userMessage.id,
      plannedTargets,
      {
        outcomeId: randomUUID(),
        checkpointId: latestCheckpoint.id,
        targetIdentities: activeTurn.targetStatuses.map((target) => ({
          participantKind: target.participant.participantKind,
          participantId: target.participant.participantId,
          laneId: target.laneId,
          sessionId: target.sessionId,
        })),
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          workflowLastCheckpointId: latestCheckpoint.id,
          failedBeforeCompletion: true,
          previousCheckpointId: initialCheckpoint?.id ?? null,
        },
      },
    ),
  );
  finalizeWorkflowTurn(workflow, activeTurn);

  nextState = applyRoomRoutingSnapshot(
    nextState,
    channelId,
    baseRoomRouting,
    workflow,
    outcome,
    latestCheckpoint,
    now,
  );
  if (options.latestState) {
    nextState = mergeCompletedDispatchState(
      latestState,
      begun.state,
      nextState,
      channelId,
      now,
    );
  }
  nextState = await persistInFlightDispatchState(options.chatStore, nextState);
  options.onStateWritten?.(channelId);

  return { state: nextState, results };
}

export async function routeChannelMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  runtimeClient: RuntimeClient,
  now: Date = new Date(),
  options: RouteChannelMessageOptions = {},
): Promise<{
  state: ChatState;
  results: ChannelDispatchResult[];
  idempotent?: true;
  messageIdentity?: SendChannelMessageIdentity;
}> {
  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    payload,
    runtimeClient,
    now,
    options,
  );
  const completed = await continueBegunChannelMessageDispatch(
    begun,
    channelId,
    runtimeClient,
    now,
    options,
  );
  return {
    ...completed,
    ...(begun.idempotent ? { idempotent: true as const } : {}),
    ...(begun.messageIdentity ? { messageIdentity: begun.messageIdentity } : {}),
  };
}
