import type {
  BotBindingInboundMode,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
} from '../../../core/types.js';
import type { SuiteHostEnvelope } from '../../../shared/suite-contract.js';

export type { BotBindingInboundMode, ExecutionTargetSummary, MemoryCheckpointSummary } from '../../../core/types.js';
export type {
  CompanionBox,
  CompanionBoxSummary,
  CompanionDerivedKind,
  CompanionDerivedRecord,
  CompanionExpressionMode,
  CompanionMemoryCategory,
  CompanionMemoryRecord,
  CompanionMemoryStatus,
  CompanionOutputMode,
  CompanionResponseProfile,
  CompanionSessionContext,
  CompanionSessionDerivedRef,
  CompanionSessionMemoryRef,
  CompanionSessionSourceRef,
  CompanionSnapshot,
  CompanionSourceIngestResult,
  CompanionSourceKind,
  CompanionSourceRecord,
  CompanionSourceStorageMode,
  CompanionStorageLayout,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
} from '../companion/contracts.js';

export type ChatChannelStatus =
  | 'planned'
  | 'configured'
  | 'active'
  | 'watching'
  | 'archived';

export type ChannelFormationMode = 'manual' | 'orchestrator_suggested';

export type ParticipantSessionStatus =
  | 'not_started'
  | 'initializing'
  | 'ready'
  | 'error'
  | 'closed'
  | 'removed';

export type ChatMessageSenderKind = 'user' | 'agent' | 'system' | 'orchestrator';

export type RoomRoutingMode = 'boss_chat' | 'direct_cat_chat';
export type ComposerMode = 'solo' | 'cat_led';

export type RoomRoutingTrigger =
  | 'room_default'
  | 'explicit_mention'
  | 'continuation_mention';

export type RoomRouteResolutionMode =
  | 'room_default'
  | 'explicit_single'
  | 'explicit_multi';

export type RoomRouteSelectionKind =
  | 'default_target'
  | 'explicit_mentions'
  | 'blocked';

export type RoomRouteBlockedReason =
  | 'missing_direct_chat_lead'
  | 'missing_cat_led_lead'
  | 'no_valid_targets';

export type RoomRouteDefaultTargetReason =
  | 'boss_chat_default'
  | 'direct_chat_lead'
  | 'cat_led_lead';

export type RoomRoutingTurnStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'error';

export type RoomRoutingDispatchStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'error'
  | 'blocked';

export type RoomRoutingGuardReason =
  | 'max_continuations'
  | 'max_dispatches'
  | 'max_target_visits'
  | 'anti_ping_pong'
  | null;

export type RoomWorkflowStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed';

export type RoomWorkflowTargetStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled'
  | 'waiting_for_converge';

export type RoomWorkflowShape =
  | 'sequential'
  | 'parallel'
  | 'converge';

export type RoomWorkflowBranchStrategy =
  | 'fork_if_possible'
  | 'transplant_context'
  | 'fresh_no_parent';

export type RoomWakeTrigger = 'room_entry' | 'route_target';

export type RoomWakeReason =
  | 'room_entry'
  | 'room_default'
  | 'explicit_mention'
  | 'workflow_continuation';

export type RoomWorkflowHandoffReason =
  | RoomWakeReason
  | 'operator_reroute'
  | 'runtime_retry';

export type RoomWakeRequestStatus = 'skipped' | 'completed' | 'failed';

export type RoomRoutingCheckpointKind =
  | 'turn_started'
  | 'fan_out'
  | 'continuation'
  | 'loop_guard'
  | 'anti_ping_pong'
  | 'no_targets'
  | 'completed'
  | 'runtime_error';

export type RoomWorkflowEventKind =
  | 'turn_started'
  | 'fan_out'
  | 'target_pending'
  | 'target_running'
  | 'target_completed'
  | 'target_failed'
  | 'target_blocked'
  | 'checkpoint'
  | 'guard_blocked'
  | 'outcome';

export interface RoomRoutingParticipantRef {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
}

export interface RoomWakeRequest {
  id: string;
  participant: RoomRoutingParticipantRef;
  trigger: RoomWakeTrigger;
  reason: RoomWakeReason;
  sourceMessageId: string | null;
  status: RoomWakeRequestStatus;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface RoomRoutingDispatch {
  id: string;
  sourceMessageId: string;
  source: RoomRoutingParticipantRef | null;
  target: RoomRoutingParticipantRef;
  trigger: RoomRoutingTrigger;
  status: RoomRoutingDispatchStatus;
  mentionNames: string[];
  responseMessageId: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface RoomRoutingCheckpoint {
  id: string;
  kind: RoomRoutingCheckpointKind;
  message: string;
  actor: RoomRoutingParticipantRef | null;
  sourceMessageId: string | null;
  targets: RoomRoutingParticipantRef[];
  createdAt: string;
}

export interface RoomRouteResolution {
  routingMode: RoomRouteResolutionMode;
  selectionKind: RoomRouteSelectionKind;
  defaultTarget: RoomRoutingParticipantRef | null;
  defaultTargetReason: RoomRouteDefaultTargetReason | null;
  fallbackTarget: RoomRoutingParticipantRef | null;
  blockedReason: RoomRouteBlockedReason | null;
  note: string | null;
}

export interface RoomRoutingOutcome {
  turnId: string;
  mode: RoomRoutingMode;
  sourceMessageId: string;
  sourceSenderKind: ChatMessageSenderKind;
  sourceSenderName: string;
  status: RoomRoutingTurnStatus;
  resolution: RoomRouteResolution;
  resolvedTargets: RoomRoutingParticipantRef[];
  unresolvedMentions: string[];
  dispatches: RoomRoutingDispatch[];
  checkpoints: RoomRoutingCheckpoint[];
  continuationCount: number;
  totalDispatchCount: number;
  guard: RoomRoutingGuardReason;
  startedAt: string;
  completedAt: string | null;
}

export interface RoomWorkflowTargetState {
  id: string;
  dispatchId: string | null;
  participant: RoomRoutingParticipantRef;
  source: RoomRoutingParticipantRef | null;
  sourceMessageId: string;
  trigger: RoomRoutingTrigger;
  mentionNames: string[];
  depth: number;
  parentCheckpointId: string | null;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  handoffReason: RoomWorkflowHandoffReason | null;
  wakeRequestId: string | null;
  status: RoomWorkflowTargetStatus;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  responseMessageId: string | null;
  error: string | null;
}

export interface RoomWorkflowEvent {
  id: string;
  turnId: string;
  kind: RoomWorkflowEventKind;
  status: RoomWorkflowStatus;
  message: string;
  actor: RoomRoutingParticipantRef | null;
  sourceMessageId: string | null;
  targets: RoomRoutingParticipantRef[];
  dispatchId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface RoomWorkflowTurn {
  id: string;
  status: RoomWorkflowStatus;
  sourceMessageId: string;
  sourceSenderKind: ChatMessageSenderKind;
  sourceSenderName: string;
  guard: RoomRoutingGuardReason;
  stageId: string;
  workflowShape: RoomWorkflowShape;
  reviewRequired: boolean;
  lastCheckpointId: string | null;
  convergeTargetId: string | null;
  continuationCount: number;
  dispatchCount: number;
  targetStatuses: RoomWorkflowTargetState[];
  events: RoomWorkflowEvent[];
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface RoomWorkflowState {
  activeTurn: RoomWorkflowTurn | null;
  turnHistory: RoomWorkflowTurn[];
  eventHistory: RoomWorkflowEvent[];
  lastCheckpointEvent: RoomWorkflowEvent | null;
  lastOutcomeEvent: RoomWorkflowEvent | null;
}

export interface RoomRoutingState {
  mode: RoomRoutingMode;
  leadParticipantId: string | null;
  maxContinuations: number;
  maxDispatchesPerTurn: number;
  maxTargetVisitsPerTurn: number;
  lastOutcome: RoomRoutingOutcome | null;
  lastCheckpoint: RoomRoutingCheckpoint | null;
  lastWakeRequest: RoomWakeRequest | null;
  wakeHistory: RoomWakeRequest[];
  workflow: RoomWorkflowState;
}

export interface MessageUsageSummary {
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
}

export interface ParticipantSessionSummary {
  sessionId: string | null;
  status: ParticipantSessionStatus;
  cwd: string | null;
  lastError: string | null;
}

export interface ParticipantExecutionLease extends ParticipantSessionSummary {
  provider: string | null;
  model: string | null;
  startedAt: string | null;
  lastUsedAt: string | null;
}

export interface ParticipantExecutionState {
  target: ExecutionTargetSummary;
  lease: ParticipantExecutionLease;
}

export interface ChatCat {
  id: string;
  name: string;
  roles: string[];
  skillProfile: string | null;
  mcpProfile: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  avatarColor: string | null;
  defaultExecutionTarget: ExecutionTargetSummary;
  memory: MemoryCheckpointSummary;
}

export interface ChannelCatAssignment {
  catId: string;
  status: 'active' | 'removed';
  roles: string[];
  joinedAt: string;
  leftAt: string | null;
  execution: ParticipantExecutionState;
}

export interface ChatChannelCat {
  catId: string;
  name: string;
  roles: string[];
  skillProfile: string | null;
  mcpProfile: string | null;
  status: 'active' | 'removed';
  joinedAt: string;
  leftAt: string | null;
  avatarColor: string | null;
  execution: ParticipantExecutionState;
  memory: MemoryCheckpointSummary;
}

export interface ChatMessageOption {
  id: string;
  label: string;
  description?: string;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface ChatMessageChoice {
  question: string;
  options: ChatMessageOption[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  allowSkip?: boolean;
}

export interface ChatMessageChoiceAnswer {
  question: string;
  selectedOptionIds: string[];
  customText?: string;
  skipped?: boolean;
}

export interface ChatMessageChoiceResponse {
  sourceMessageId: string;
  status: 'submitted' | 'skipped';
  answers: ChatMessageChoiceAnswer[];
  submittedAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  senderKind: ChatMessageSenderKind;
  senderName: string;
  body: string;
  choices?: ChatMessageChoice[];
  choiceResponse?: ChatMessageChoiceResponse | null;
  mentions: string[];
  metadata: Record<string, unknown>;
  usage: MessageUsageSummary | null;
  executionProvider?: string | null;
  executionModel?: string | null;
  executionInstance?: string | null;
  createdAt: string;
}

export interface ChatChannelState {
  id: string;
  title: string;
  topic: string;
  status: ChatChannelStatus;
  unreadCount: number;
  repoPath: string | null;
  chatCwd: string | null;
  language: string | null;
  responseLanguage: string;
  formationMode: ChannelFormationMode;
  skillProfile: string | null;
  mcpProfile: string | null;
  orchestratorRoles: string[];
  composerMode: ComposerMode;
  pendingProvider: string | null;
  pendingModel: string | null;
  pendingInstance: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
  orchestratorLease: ParticipantExecutionLease;
  catAssignments: ChannelCatAssignment[];
  messages: ChatMessage[];
  roomRouting?: RoomRoutingState;
  workingMemory?: MemoryCheckpointSummary;
}

export interface ChatChannelView extends ChatChannelState {
  assignedCats: ChatChannelCat[];
}

export interface ChatChannelSummary {
  id: string;
  title: string;
  topic: string;
  status: ChatChannelStatus;
  unreadCount: number;
  catCount: number;
  activeCatCount: number;
  repoPath: string | null;
  chatCwd: string | null;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
  composerMode?: ComposerMode;
  pendingProvider?: string | null;
  pendingModel?: string | null;
  leadCatId?: string | null;
  leadParticipantLeaseStatus?: ParticipantSessionStatus | null;
  roomMode?: RoomRoutingMode;
  routingStatus?: RoomRoutingTurnStatus;
  lastRoutingAt?: string | null;
}

export interface GlobalOrchestratorSummary {
  mode: 'global';
  status: 'warming' | 'ready';
  nextFocus: string;
  entrypoints: string[];
  referenceProjects: string[];
  notes: string[];
  executionTarget: ExecutionTargetSummary;
  systemPrompt: string;
  skillProfile: string | null;
  mcpProfile: string | null;
  memory: MemoryCheckpointSummary;
  telegramBotName: string | null;
  updatedAt: string;
}

export interface ChatCapabilities {
  multiChannel: true;
  persistence: 'file-backed';
  mentions: 'basic';
  splitView: 'planned';
  transcriptExport: true;
  participantManagement: 'basic';
  runtimeSessions: true;
}

export interface ChatState {
  id: string;
  name: string;
  selectedChannelId: string;
  bossCatId: string | null;
  cats: ChatCat[];
  channels: ChatChannelState[];
  globalOrchestrator: GlobalOrchestratorSummary;
  capabilities: ChatCapabilities;
  showVerboseMessages: boolean;
}

export interface BotBindingSummary {
  id: string;
  platform: 'telegram' | 'line';
  botName: string;
  catId: string | null;
  inboundMode: BotBindingInboundMode;
  roomMode: string;
  status: 'active' | 'disabled';
  webhookPath: string;
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
}

export interface ChatBotBindingSummary {
  id: string;
  platform: 'telegram' | 'line';
  botName: string;
  catId: string | null;
  catName: string | null;
  inboundMode: BotBindingInboundMode;
  roomMode: string;
  isBossBinding: boolean;
  status: 'active' | 'disabled';
  updatedAt: string;
  webhookPath: string;
  hasBotToken: boolean;
  hasWebhookSecret: boolean;
}

export interface ChatShellState {
  id: string;
  name: string;
  selectedChannelId: string;
  bossCatId: string | null;
  cats: ChatCat[];
  channels: ChatChannelSummary[];
  selectedChannel: ChatChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
  capabilities: ChatCapabilities;
  showVerboseMessages: boolean;
  botBindings: ChatBotBindingSummary[];
}

export interface AppShellPayload extends SuiteHostEnvelope {
  chat: ChatShellState;
}

export interface CatDraftInput {
  name: string;
  provider: string;
  instance?: string;
  model?: string;
  roles?: string[];
  skillProfile?: string;
  mcpProfile?: string;
}

export interface CreateCatInput extends CatDraftInput {}

export interface AssignChannelCatInput {
  catId: string;
  provider?: string;
  instance?: string;
  model?: string;
  roles?: string[];
}

export interface UpdateSelectedChannelInput {
  selectedChannelId: string;
}

export interface CreateChatChannelInput {
  title: string;
  topic: string;
  repoPath?: string;
  language?: string;
  responseLanguage?: string;
  formationMode?: ChannelFormationMode;
  composerMode?: ComposerMode;
  roomMode?: RoomRoutingMode;
  leadParticipantId?: string;
  pendingProvider?: string;
  pendingModel?: string;
  pendingInstance?: string;
  skillProfile?: string;
  mcpProfile?: string;
  orchestratorRoles?: string[];
  cats?: CatDraftInput[];
  /** Existing cat IDs to assign at creation time. */
  participantCatIds?: string[];
  /** Internal UI affordance for the first user-sent turn in a newly created chat. */
  skipBossCatGreeting?: boolean;
}

export interface UpdateGlobalOrchestratorInput {
  provider: string;
  instance?: string;
  model?: string;
  systemPrompt?: string;
  skillProfile?: string;
  mcpProfile?: string;
  telegramBotName?: string;
}

export interface SendChannelMessageInput {
  body: string;
  senderName?: string;
  pendingProvider?: string;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  choiceResponse?: ChatMessageChoiceResponse | null;
}

export interface ChannelActivationResult {
  targetKind: 'orchestrator' | 'cat';
  targetId: string;
  targetName: string;
  status: 'started' | 'already_started' | 'error';
  sessionId: string | null;
  error?: string;
}

export interface ChannelDispatchResult {
  targetKind: 'orchestrator' | 'cat';
  targetId: string;
  targetName: string;
  sessionId: string | null;
  status: 'sent' | 'skipped' | 'error';
  dispatchId?: string;
  turnId?: string;
  targetStatus?: RoomWorkflowTargetStatus;
  error?: string;
  sourceMessageId?: string;
  trigger?: RoomRoutingTrigger;
  dispatchDepth?: number;
}

export interface ActivateChannelResponse {
  appShell: AppShellPayload;
  results: ChannelActivationResult[];
}

export interface SendChannelMessageResponse {
  appShell: AppShellPayload;
  results: ChannelDispatchResult[];
}

export interface ChannelExportPayload {
  exportedAt: string;
  orchestrator: GlobalOrchestratorSummary;
  channel: ChatChannelState;
  assignedCats: ChatChannelCat[];
}

export interface SetupCompleteInput {
  ownerDisplayName: string;
  bossCatName?: string;
  bossCatProvider: string;
  bossCatInstance?: string;
  bossCatModel?: string;
}

export interface CreateBotBindingInput {
  platform: 'telegram' | 'line';
  botName: string;
  catId: string;
  inboundMode?: BotBindingInboundMode;
  roomMode?: RoomRoutingMode;
  botToken?: string;
  webhookSecret?: string;
}

export interface UpdateBotBindingInput {
  botName?: string;
  catId?: string;
  inboundMode?: BotBindingInboundMode;
  roomMode?: RoomRoutingMode;
  status?: 'active' | 'disabled';
  botToken?: string | null;
  webhookSecret?: string | null;
}
