import type {
  BotBindingInboundMode,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
} from '../../../core/types.js';
import type {
  ChatMessageSenderKind,
  ParticipantSessionStatus,
  RoomRouteBlockedReason,
  RoomRouteDefaultTargetReason,
  RoomRouteResolution,
  RoomRouteResolutionMode,
  RoomRouteSelectionKind,
  RoomRoutingCheckpoint,
  RoomRoutingCheckpointKind,
  RoomRoutingDispatch,
  RoomRoutingDispatchStatus,
  RoomRoutingGuardReason,
  RoomRoutingMode,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomRoutingTurnStatus,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeRequestStatus,
  RoomWakeTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowEvent,
  RoomWorkflowEventKind,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetState,
  RoomWorkflowTargetStatus,
  RoomWorkflowTurn,
} from '../../../shared/roomRouting.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';

export type { BotBindingInboundMode, ExecutionTargetSummary, MemoryCheckpointSummary } from '../../../core/types.js';
export type {
  ChatMessageSenderKind,
  ParticipantSessionStatus,
  RoomRouteBlockedReason,
  RoomRouteDefaultTargetReason,
  RoomRouteResolution,
  RoomRouteResolutionMode,
  RoomRouteSelectionKind,
  RoomRoutingCheckpoint,
  RoomRoutingCheckpointKind,
  RoomRoutingDispatch,
  RoomRoutingDispatchStatus,
  RoomRoutingGuardReason,
  RoomRoutingMode,
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomRoutingTurnStatus,
  RoomWakeReason,
  RoomWakeRequest,
  RoomWakeRequestStatus,
  RoomWakeTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowEvent,
  RoomWorkflowEventKind,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomWorkflowState,
  RoomWorkflowStatus,
  RoomWorkflowTargetState,
  RoomWorkflowTargetStatus,
  RoomWorkflowTurn,
} from '../../../shared/roomRouting.js';
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
export type ComposerMode = 'solo' | 'cat_led';
export type ChatChannelKind = 'boss_thread' | 'direct_lane' | 'multi_cat_room';
export type NewChatEntryKind = 'solo' | 'group' | 'direct';
export type ConcurrentChatMode = 'parallel';
export type ConcurrentChatStatus = 'active' | 'archived';
export type ConcurrentChatRelayCommandKind =
  | 'check_this'
  | 'adopt_this'
  | 'debate_this'
  | 'improve_this'
  | 'counter_this'
  | 'synthesize_this';
export type ConcurrentChatRelayTargetPolicy = 'all_others' | 'single';

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
  modelSelection?: ProviderModelSelection | null;
  lease: ParticipantExecutionLease;
}

export type ChannelParticipantSourceKind = 'cat' | 'adhoc';

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
  avatarUrl: string | null;
  defaultExecutionTarget: ExecutionTargetSummary;
  defaultModelSelection?: ProviderModelSelection | null;
  products: string[];
  memory: MemoryCheckpointSummary;
}

export interface ChannelCatAssignment {
  participantId: string;
  sourceKind: 'cat';
  sourceRefId: string;
  catId: string;
  name: string;
  status: 'active' | 'removed';
  roles: string[];
  roleHint: string | null;
  joinedAt: string;
  leftAt: string | null;
  execution: ParticipantExecutionState;
}

export interface ChannelParticipantAssignment {
  participantId: string;
  sourceKind: ChannelParticipantSourceKind;
  sourceRefId: string | null;
  name: string;
  status: 'active' | 'removed';
  roles: string[];
  roleHint: string | null;
  joinedAt: string;
  leftAt: string | null;
  execution: ParticipantExecutionState;
}

export interface ChatChannelParticipant {
  participantId: string;
  sourceKind: ChannelParticipantSourceKind;
  sourceRefId: string | null;
  name: string;
  roles: string[];
  roleHint: string | null;
  skillProfile: string | null;
  mcpProfile: string | null;
  status: 'active' | 'removed';
  joinedAt: string;
  leftAt: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  execution: ParticipantExecutionState;
  memory: MemoryCheckpointSummary;
}

export interface ChatChannelCat extends ChatChannelParticipant {
  sourceKind: 'cat';
  sourceRefId: string;
  catId: string;
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
  channelKind?: ChatChannelKind;
  recoverableDirectLaneCatId?: string | null;
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
  pendingModelSelection?: ProviderModelSelection | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
  orchestratorLease: ParticipantExecutionLease;
  catAssignments: ChannelCatAssignment[];
  /** Optional for legacy persisted snapshots; runtime normalization populates this. */
  participantAssignments?: ChannelParticipantAssignment[];
  messages: ChatMessage[];
  roomRouting?: RoomRoutingState;
  workingMemory?: MemoryCheckpointSummary;
}

export interface ChatChannelView extends ChatChannelState {
  assignedParticipants?: ChatChannelParticipant[];
  assignedCats: ChatChannelCat[];
}

export interface ChatChannelSummary {
  id: string;
  title: string;
  topic: string;
  channelKind?: ChatChannelKind;
  status: ChatChannelStatus;
  unreadCount: number;
  /** Legacy alias that now counts all channel participants, not only Cat-backed ones. */
  catCount: number;
  /** Legacy alias that now counts all active channel participants, not only Cat-backed ones. */
  activeCatCount: number;
  participantCount?: number;
  activeParticipantCount?: number;
  repoPath: string | null;
  chatCwd: string | null;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
  composerMode?: ComposerMode;
  pendingProvider?: string | null;
  pendingModel?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
  leadCatId?: string | null;
  leadParticipantLeaseStatus?: ParticipantSessionStatus | null;
  roomMode?: RoomRoutingMode;
  routingStatus?: RoomRoutingTurnStatus;
  lastRoutingAt?: string | null;
  orchestratorRoles?: string[];
}

export interface ConcurrentChatTarget {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export interface ConcurrentChatGroupState {
  id: string;
  title: string;
  mode: ConcurrentChatMode;
  status: ConcurrentChatStatus;
  memberChannelIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface ConcurrentChatGroupMemberSummary extends ConcurrentChatTarget {
  channelId: string;
  title: string;
  index: number;
  lastMessageAt: string | null;
}

export interface ConcurrentChatGroupSummary {
  id: string;
  title: string;
  mode: ConcurrentChatMode;
  status: ConcurrentChatStatus;
  memberCount: number;
  memberChannelIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  members: ConcurrentChatGroupMemberSummary[];
}

export interface GlobalOrchestratorSummary {
  mode: 'global';
  status: 'warming' | 'ready';
  nextFocus: string;
  entrypoints: string[];
  referenceProjects: string[];
  notes: string[];
  executionTarget: ExecutionTargetSummary;
  executionModelSelection?: ProviderModelSelection | null;
  systemPrompt: string;
  skillProfile: string | null;
  mcpProfile: string | null;
  memory: MemoryCheckpointSummary;
  telegramBotName: string | null;
  updatedAt: string;
}

export interface NewChatDefaults {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export interface ChatCapabilities {
  multiChannel: true;
  persistence: 'file-backed';
  mentions: 'basic';
  splitView: 'planned';
  transcriptExport: true;
  participantManagement: 'basic';
  runtimeSessions: true;
  maxBossCats: number;
  maxCats: number;
  maxParallelChats: number;
  availableSurfaces: string[];
}

export interface ChatState {
  id: string;
  name: string;
  selectedChannelId: string;
  bossCatId: string | null;
  cats: ChatCat[];
  channels: ChatChannelState[];
  concurrentGroups: ConcurrentChatGroupState[];
  globalOrchestrator: GlobalOrchestratorSummary;
  newChatDefaults: NewChatDefaults;
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
  concurrentGroups: ConcurrentChatGroupSummary[];
  selectedChannel: ChatChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
  newChatDefaults: NewChatDefaults;
  capabilities: ChatCapabilities;
  showVerboseMessages: boolean;
  botBindings: ChatBotBindingSummary[];
}

export interface AppShellPayload extends PlatformHostEnvelope {
  chat: ChatShellState;
}

export interface CatDraftInput {
  name: string;
  provider: string;
  instance?: string;
  model?: string;
  modelSelection?: ProviderModelSelection | null;
  roles?: string[];
  skillProfile?: string;
  mcpProfile?: string;
}

export interface CreateTemporaryParticipantInput {
  participantId?: string;
  name: string;
  provider: string;
  instance?: string;
  model?: string;
  modelSelection?: ProviderModelSelection | null;
  roleHint?: string;
}

export interface CreateCatInput extends CatDraftInput {
  makeBoss?: boolean;
  products?: string[];
}

export interface AssignChannelCatInput {
  catId: string;
  provider?: string;
  instance?: string;
  model?: string;
  modelSelection?: ProviderModelSelection | null;
  roles?: string[];
}

export interface UpdateSelectedChannelInput {
  selectedChannelId: string;
}

export interface CreateChatChannelInput {
  title: string;
  topic: string;
  entryKind?: NewChatEntryKind;
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
  pendingModelSelection?: ProviderModelSelection | null;
  skillProfile?: string;
  mcpProfile?: string;
  orchestratorRoles?: string[];
  cats?: CatDraftInput[];
  /** Existing cat IDs to assign at creation time. */
  participantCatIds?: string[];
  /** Channel-only non-Cat members created inline for this room. */
  temporaryParticipants?: CreateTemporaryParticipantInput[];
  /** Internal UI affordance for the first user-sent turn in a newly created chat. */
  skipBossCatGreeting?: boolean;
}

export interface CreateConcurrentChatGroupInput {
  title: string;
  repoPath?: string;
  responseLanguage?: string;
  targets: ConcurrentChatTarget[];
}

export interface UpdateGlobalOrchestratorInput {
  provider: string;
  instance?: string;
  model?: string;
  modelSelection?: ProviderModelSelection | null;
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
  pendingModelSelection?: ProviderModelSelection | null;
  messageMetadata?: Record<string, unknown>;
  choiceResponse?: ChatMessageChoiceResponse | null;
}

export interface ConcurrentChatAttachmentInput {
  name: string;
  data: string;
}

export interface SendConcurrentChatMessageInput {
  activeChannelId: string;
  body: string;
  attachments?: ConcurrentChatAttachmentInput[];
}

export interface CancelConcurrentChatGroupInput {
  activeChannelId: string;
}

export interface RelayConcurrentChatMessageInput {
  activeChannelId: string;
  sourceChannelId: string;
  sourceMessageId: string;
  command: ConcurrentChatRelayCommandKind;
  targetPolicy?: ConcurrentChatRelayTargetPolicy;
  targetChannelId?: string;
}

export interface UpdateConcurrentChatGroupInput {
  title?: string;
}

export interface UpdateChannelInput {
  title?: string;
  pendingProvider?: string | null;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
}

export interface UpdateChannelParticipantInput {
  name?: string;
  roleHint?: string | null;
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
  message: ChatMessage | null;
  phase: 'acknowledged';
  results: ChannelDispatchResult[];
}

export interface CancelChannelResponse {
  appShell: AppShellPayload;
  cancellation: {
    channelId: string;
    cancelledAt: string;
    cancelledSessionCount: number;
  };
}

export interface ConcurrentChatDispatchResult {
  channelId: string;
  status: 'sent' | 'error' | 'skipped';
  sourceMessageId?: string;
  error?: string;
}

export interface CreateConcurrentChatGroupResponse {
  appShell: AppShellPayload;
  group: ConcurrentChatGroupSummary;
}

export interface ConcurrentChatDispatchResponse {
  appShell: AppShellPayload;
  groupId: string;
  phase: 'acknowledged' | 'completed';
  results: ConcurrentChatDispatchResult[];
}

export interface CancelConcurrentChatGroupResponse {
  appShell: AppShellPayload;
  groupId: string;
  cancellation: {
    activeChannelId: string;
    cancelledAt: string;
    cancelledSessionCount: number;
    targetChannelIds: string[];
  };
}

export interface ChannelExportPayload {
  exportedAt: string;
  orchestrator: GlobalOrchestratorSummary;
  channel: ChatChannelState;
  assignedParticipants?: ChatChannelParticipant[];
  assignedCats: ChatChannelCat[];
}

export interface SetupCompleteInput {
  ownerDisplayName: string;
  bossCatName?: string;
  bossCatProvider: string;
  bossCatInstance?: string;
  bossCatModel?: string;
  bossCatModelSelection?: ProviderModelSelection | null;
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
