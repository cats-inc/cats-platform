import type {
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
} from '../../../core/types.js';
import type { SuiteHostEnvelope } from '../../../shared/suite-contract.js';

export type { ExecutionTargetSummary, MemoryCheckpointSummary } from '../../../core/types.js';

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

export type RoomRoutingMode = 'boss_chat' | 'direct_cat_chat' | 'transport_inbox';

export type RoomRoutingTrigger =
  | 'room_default'
  | 'explicit_mention'
  | 'continuation_mention';

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

export type RoomRoutingCheckpointKind =
  | 'turn_started'
  | 'fan_out'
  | 'continuation'
  | 'loop_guard'
  | 'anti_ping_pong'
  | 'no_targets'
  | 'completed'
  | 'runtime_error';

export interface RoomRoutingParticipantRef {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
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

export interface RoomRoutingOutcome {
  turnId: string;
  mode: RoomRoutingMode;
  sourceMessageId: string;
  sourceSenderKind: ChatMessageSenderKind;
  sourceSenderName: string;
  status: RoomRoutingTurnStatus;
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

export interface RoomRoutingState {
  mode: RoomRoutingMode;
  leadParticipantId: string | null;
  maxContinuations: number;
  maxDispatchesPerTurn: number;
  maxTargetVisitsPerTurn: number;
  lastOutcome: RoomRoutingOutcome | null;
  lastCheckpoint: RoomRoutingCheckpoint | null;
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

export interface ChatMessage {
  id: string;
  channelId: string;
  senderKind: ChatMessageSenderKind;
  senderName: string;
  body: string;
  mentions: string[];
  metadata: Record<string, unknown>;
  usage: MessageUsageSummary | null;
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
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
  orchestratorLease: ParticipantExecutionLease;
  catAssignments: ChannelCatAssignment[];
  messages: ChatMessage[];
  roomRouting?: RoomRoutingState;
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
  roomMode?: RoomRoutingMode;
  leadParticipantId?: string;
  skillProfile?: string;
  mcpProfile?: string;
  orchestratorRoles?: string[];
  cats?: CatDraftInput[];
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
  bossCatName: string;
  bossCatProvider: string;
  bossCatInstance?: string;
  bossCatModel?: string;
}
