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
import type { SuiteHostEnvelope } from '../../../shared/suite-contract.js';
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
  defaultModelSelection?: ProviderModelSelection | null;
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
  pendingModelSelection?: ProviderModelSelection | null;
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
  pendingModelSelection?: ProviderModelSelection | null;
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
}

export interface ChatState {
  id: string;
  name: string;
  selectedChannelId: string;
  bossCatId: string | null;
  cats: ChatCat[];
  channels: ChatChannelState[];
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
  selectedChannel: ChatChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
  newChatDefaults: NewChatDefaults;
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
  modelSelection?: ProviderModelSelection | null;
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
  modelSelection?: ProviderModelSelection | null;
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
  pendingModelSelection?: ProviderModelSelection | null;
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
