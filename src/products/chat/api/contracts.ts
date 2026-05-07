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
  RoomAssistantTurnDelivery,
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
import type {
  GuideCatAssistSurfaceReadModel,
} from '../../../shared/guideCatAssist.js';
import type {
  PlatformHostEnvelope,
  PlatformSurfaceId,
} from '../../../shared/platform-contract.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import type { MessageLocale } from '../../../shared/i18n/index.js';
import type { FolderBrowsePreferences } from '../../shared/folderBrowsePreferences.js';
import type { AdvancedDraftControlsPreferences } from '../../shared/advancedDraftControls.js';
import type { ConversationBehaviorPreferences } from '../../shared/conversationBehavior.js';
import type {
  ProductIntentCommandName,
  ProductIntentPosture,
  ProductIntentTargetProduct,
} from '../shared/productIntentCommands.js';
import type {
  ImplicitProductIntentCandidateMetadata,
  ImplicitProductIntentCandidateTransitionMetadata,
} from '../shared/implicitProductIntent.js';
import type {
  CatProductIntentProposalMetadata,
  CatProductIntentProposalTransitionMetadata,
} from '../shared/catProductIntentProposal.js';
import type {
  RuntimePermissionMode,
  RuntimeSessionPolicy,
  RuntimeSessionCreateContractInput,
  RuntimeWorkspaceAccess,
  RuntimeWorkspaceKind,
} from '../../../shared/runtimeSessionPolicy.js';

export type { BotBindingInboundMode, ExecutionTargetSummary, MemoryCheckpointSummary } from '../../../core/types.js';
export type {
  ChatMessageSenderKind,
  ParticipantSessionStatus,
  RoomRouteBlockedReason,
  RoomRouteDefaultTargetReason,
  RoomRouteResolution,
  RoomRouteResolutionMode,
  RoomRouteSelectionKind,
  RoomAssistantTurnDelivery,
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
export type {
  ConcurrentChatPresentationMode,
  ConversationBehaviorPatch,
  ConversationBehaviorPreferences,
  ConversationBehaviorSurface,
  SurfaceConversationBehaviorPatch,
  SurfaceConversationBehaviorPreferences,
} from '../../shared/conversationBehavior.js';
export { CONCURRENT_PRESENTATION_MODES } from '../../shared/conversationBehavior.js';

export type ChatChannelStatus =
  | 'planned'
  | 'configured'
  | 'active'
  | 'watching'
  | 'archived';

export type ChannelFormationMode = 'manual' | 'orchestrator_suggested';
export type ChatChannelKind = 'chat_channel' | 'direct_message';
export type NewChatEntryKind = 'default' | 'group' | 'direct';
export type ParallelChatMode = 'parallel';
export type ParallelChatStatus = 'active' | 'archived';
export type ParallelChatRelayCommandKind =
  | 'check_this'
  | 'adopt_this'
  | 'debate_this'
  | 'improve_this'
  | 'counter_this'
  | 'synthesize_this';
export type ParallelChatRelayTargetPolicy = 'all_others' | 'single';
export type MessageOrigin =
  | 'web'
  | 'telegram'
  | 'browser'
  | 'email'
  | 'runtime'
  | 'system'
  | 'unknown';

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
  laneId: string | null;
  provider: string | null;
  instance?: string | null;
  model: string | null;
  modelSelection?: ProviderModelSelection | null;
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
  originSurface?: PlatformSurfaceId | null;
  channelKind?: ChatChannelKind;
  recoverableDirectLaneCatId?: string | null;
  status: ChatChannelStatus;
  unreadCount: number;
  repoPath: string | null;
  chatCwd: string | null;
  runtimeWorkspaceKind?: RuntimeWorkspaceKind | null;
  runtimeWorkspaceAccess?: RuntimeWorkspaceAccess | null;
  runtimePermissionMode?: RuntimePermissionMode | null;
  language: string | null;
  responseLanguage: string;
  formationMode: ChannelFormationMode;
  skillProfile: string | null;
  mcpProfile: string | null;
  orchestratorRoles: string[];
  pendingProvider: string | null;
  pendingModel: string | null;
  pendingInstance: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
  continuityResetAt?: string | null;
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
  containerId: string;
  conversationId: string;
  assignedParticipants?: ChatChannelParticipant[];
  assignedCats: ChatChannelCat[];
}

export interface ChatChannelSummary {
  id: string;
  containerId: string;
  conversationId: string;
  title: string;
  topic: string;
  originSurface?: PlatformSurfaceId | null;
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
  runtimeWorkspaceKind?: RuntimeWorkspaceKind | null;
  runtimeWorkspaceAccess?: RuntimeWorkspaceAccess | null;
  runtimePermissionMode?: RuntimePermissionMode | null;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
  pendingProvider?: string | null;
  pendingModel?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
  defaultRecipientCatId?: string | null;
  defaultRecipientLeaseStatus?: ParticipantSessionStatus | null;
  roomMode?: RoomRoutingMode;
  routingStatus?: RoomRoutingTurnStatus;
  lastRoutingAt?: string | null;
  orchestratorRoles?: string[];
}

export interface ParallelChatTarget {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection?: ProviderModelSelection | null;
}

export interface ParallelChatGroupState {
  id: string;
  title: string;
  originSurface?: PlatformSurfaceId | null;
  mode: ParallelChatMode;
  status: ParallelChatStatus;
  memberChannelIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface ParallelChatGroupMemberSummary extends ParallelChatTarget {
  channelId: string;
  title: string;
  index: number;
  lastMessageAt: string | null;
}

export interface ParallelChatGroupSummary {
  id: string;
  title: string;
  originSurface?: PlatformSurfaceId | null;
  mode: ParallelChatMode;
  status: ParallelChatStatus;
  memberCount: number;
  memberChannelIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  members: ParallelChatGroupMemberSummary[];
}

export interface GlobalOrchestratorRouterConfig {
  kind: 'chat_deterministic_router';
  participantKind: 'orchestrator';
  participantId: 'orchestrator';
  defaultDispatch: 'room_default';
  mentionAliases: string[];
  audiencePolicy: 'chat_capabilities';
}

export interface GlobalOrchestratorVisibleParticipant {
  kind: 'visible_orchestrator_participant';
  participantKind: 'orchestrator';
  participantId: 'orchestrator';
  displayName: string;
  executionTarget: ExecutionTargetSummary;
  executionModelSelection?: ProviderModelSelection | null;
}

export interface GlobalOrchestratorSummary {
  mode: 'global';
  status: 'warming' | 'ready';
  nextFocus: string;
  entrypoints: string[];
  referenceProjects: string[];
  notes: string[];
  routerConfig?: GlobalOrchestratorRouterConfig;
  visibleParticipant?: GlobalOrchestratorVisibleParticipant;
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
  maxChatParticipants: number;
  maxAudienceParticipants: number;
  maxParallelChats: number;
  debugLiveTrace?: boolean;
  availableSurfaces: string[];
}

export interface ChatState {
  id: string;
  name: string;
  selectedChannelId: string;
  bossCatId: string | null;
  cats: ChatCat[];
  channels: ChatChannelState[];
  parallelChatGroups: ParallelChatGroupState[];
  globalOrchestrator: GlobalOrchestratorSummary;
  newChatDefaults: NewChatDefaults;
  capabilities: ChatCapabilities;
  conversationBehavior?: ConversationBehaviorPreferences;
  advancedDraftControls?: AdvancedDraftControlsPreferences;
  folderBrowsePreferences?: FolderBrowsePreferences;
}

export interface BotBindingSummary {
  id: string;
  platform: 'telegram' | 'line';
  botName: string;
  catId: string | null;
  inboundMode: BotBindingInboundMode;
  roomMode: string;
  status: 'active' | 'disabled';
  outboundFanoutEnabled: boolean;
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
  outboundFanoutEnabled: boolean;
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
  parallelChatGroups: ParallelChatGroupSummary[];
  selectedChannel: ChatChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
  newChatDefaults: NewChatDefaults;
  capabilities: ChatCapabilities;
  conversationBehavior?: ConversationBehaviorPreferences;
  advancedDraftControls?: AdvancedDraftControlsPreferences;
  folderBrowsePreferences?: FolderBrowsePreferences;
  botBindings: ChatBotBindingSummary[];
  newChatAssist?: GuideCatAssistSurfaceReadModel | null;
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

interface CreateChatChannelInputBase {
  title: string;
  topic: string;
  originSurface: PlatformSurfaceId;
  entryKind?: NewChatEntryKind;
  repoPath?: string;
  language?: string;
  responseLanguage?: string;
  formationMode?: ChannelFormationMode;
  roomMode?: RoomRoutingMode;
  defaultRecipientId?: string;
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

export type CreateChatChannelInput =
  CreateChatChannelInputBase & RuntimeSessionCreateContractInput;

export interface CreateParallelChatGroupInput {
  title: string;
  originSurface: PlatformSurfaceId;
  repoPath?: string;
  runtimeSessionPolicy?: RuntimeSessionPolicy | null;
  responseLanguage?: string;
  targets: Array<ParallelChatTarget & {
    audienceKeys?: string[];
    cwd?: string | null;
    runtimeSessionPolicy?: RuntimeSessionPolicy | null;
  }>;
  participantCatIds?: string[];
  temporaryParticipants?: CreateTemporaryParticipantInput[];
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

export interface ChannelMessageMetadata extends Record<string, unknown> {
  recipientParticipantIds?: string[];
  workflowShape?: RoomWorkflowShape | 'parallel' | null;
  clientMessageId?: string;
  clientMessageIdSource?: ClientMessageIdSource;
  clientMessageFingerprint?: string;
  productIntentCommand?: ProductIntentCommandMetadata;
  productIntentLocale?: 'en' | 'zh-TW';
  productIntentArgumentProvided?: boolean;
  implicitProductIntentCandidate?: ImplicitProductIntentCandidateMetadata;
  implicitProductIntentTransition?: ImplicitProductIntentCandidateTransitionMetadata;
  catProductIntentProposal?: CatProductIntentProposalMetadata;
  catProductIntentProposalTransition?: CatProductIntentProposalTransitionMetadata;
}

export type ClientMessageIdSource = 'client' | 'server_fallback';

export type SendChannelMessageIdentitySource = ClientMessageIdSource | 'idempotent';

export type SendChannelMessageIdentityReason =
  | 'invalid-uuid'
  | 'collision-foreign-sender'
  | 'collision-equivalence-mismatch';

export interface SendChannelMessageIdentity {
  source: SendChannelMessageIdentitySource;
  canonicalMessageId: string;
  clientMessageId?: string;
  reason?: SendChannelMessageIdentityReason;
}

export type ProductIntentCommandSource = 'web' | 'telegram';

export interface ProductIntentCommandMetadata {
  version: 1;
  source: ProductIntentCommandSource;
  command: ProductIntentCommandName;
  posture: ProductIntentPosture;
  targetProduct: ProductIntentTargetProduct;
  argumentText: string;
  rawCommandToken: string;
  botSuffix: string | null;
  sourceKind?: 'implicit_confirmation' | 'cat_product_intent_proposal';
  implicitConfirmed?: true;
  proposalConfirmed?: true;
  originalCandidateId?: string;
  originalProposalId?: string;
  originalMessageId?: string;
  proposedByCatId?: string;
}

export interface ProductIntentUserMessageMetadata {
  productIntentCommand: ProductIntentCommandMetadata;
  productIntentLocale: 'en' | 'zh-TW';
  productIntentArgumentProvided: boolean;
}

export type DirectSlashModeCapabilityProfileKind =
  | 'strong_agent'
  | 'weak_worker'
  | 'unknown';

export interface DirectSlashModePostureChangeMetadata {
  version: 1;
  command: ProductIntentCommandName;
  previousPosture: ProductIntentPosture | null;
  posture: ProductIntentPosture;
  targetProduct: ProductIntentTargetProduct;
  changed: boolean;
  sourceTransport: ProductIntentCommandSource;
  sourceChannelId: string;
  audienceCatId: string | null;
  capabilityProfileKind: DirectSlashModeCapabilityProfileKind | null;
}

export interface SendChannelMessageInput {
  body: string;
  clientMessageId?: string;
  senderName?: string;
  pendingProvider?: string;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
  messageMetadata?: ChannelMessageMetadata;
  choiceResponse?: ChatMessageChoiceResponse | null;
}

export interface ParallelChatAttachmentInput {
  name: string;
  data: string;
}

export interface SendParallelChatMessageInput {
  activeChannelId: string;
  body: string;
  attachments?: ParallelChatAttachmentInput[];
  channelInputs?: Array<{
    channelId: string;
    body?: string;
    messageMetadata?: ChannelMessageMetadata;
  }>;
}

export interface CancelParallelChatGroupInput {
  activeChannelId: string;
}

export interface RelayParallelChatMessageInput {
  activeChannelId: string;
  sourceChannelId: string;
  sourceMessageId: string;
  command: ParallelChatRelayCommandKind;
  targetPolicy?: ParallelChatRelayTargetPolicy;
  targetChannelId?: string;
  locale?: MessageLocale;
}

export interface UpdateParallelChatGroupInput {
  title?: string;
}

export interface UpdateChannelInput {
  title?: string;
  pendingProvider?: string | null;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
  resetContinuity?: boolean;
}

export interface UpdateChannelParticipantInput {
  name?: string;
  roleHint?: string | null;
}

export interface ChannelActivationResult {
  targetKind: 'orchestrator' | 'cat';
  targetId: string;
  targetName: string;
  laneId: string | null;
  status: 'started' | 'already_started' | 'error';
  sessionId: string | null;
  error?: string;
}

export interface ChannelDispatchResult {
  targetKind: 'orchestrator' | 'cat';
  targetId: string;
  targetName: string;
  laneId: string | null;
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

export interface ChannelDispatchOrchestratorSummary {
  planId: string;
  planner: string;
  loopMode: string;
  dispatchBoundary: string;
  runtimeToolBoundary: string;
  initialTargets: Array<{
    targetKind: 'orchestrator' | 'cat';
    targetId: string;
    targetName: string;
    laneId: string | null;
    sessionId: string | null;
    trigger: RoomRoutingTrigger;
    plannedDepth: number;
  }>;
}

export interface ChannelDispatchAcknowledgement {
  channelId: string;
  results: ChannelDispatchResult[];
  orchestrator: ChannelDispatchOrchestratorSummary;
}

export interface SendChannelMessageResponse {
  appShell: AppShellPayload;
  message: ChatMessage | null;
  phase: 'acknowledged';
  results: ChannelDispatchResult[];
  dispatch?: ChannelDispatchAcknowledgement;
  idempotent?: true;
  messageIdentity?: SendChannelMessageIdentity;
}

export interface CancelChannelResponse {
  appShell: AppShellPayload;
  cancellation: {
    channelId: string;
    cancelledAt: string;
    cancelledSessionCount: number;
  };
}

export interface ParallelChatDispatchResult {
  channelId: string;
  status: 'sent' | 'error' | 'skipped';
  sourceMessageId?: string;
  error?: string;
  orchestrator?: ChannelDispatchOrchestratorSummary;
}

export interface CreateParallelChatGroupResponse {
  appShell: AppShellPayload;
  group: ParallelChatGroupSummary;
}

export interface ParallelChatDispatchResponse {
  appShell: AppShellPayload;
  groupId: string;
  phase: 'acknowledged' | 'completed';
  results: ParallelChatDispatchResult[];
}

export interface CancelParallelChatGroupResponse {
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
  outboundFanoutEnabled?: boolean;
}

export interface UpdateBotBindingInput {
  botName?: string;
  catId?: string;
  inboundMode?: BotBindingInboundMode;
  roomMode?: RoomRoutingMode;
  status?: 'active' | 'disabled';
  botToken?: string | null;
  webhookSecret?: string | null;
  outboundFanoutEnabled?: boolean;
}
