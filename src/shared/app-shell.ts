import type { RuntimeStatusSummary } from '../runtime/client.js';

export type WorkspaceChannelStatus =
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

export type WorkspaceMessageSenderKind = 'user' | 'agent' | 'system' | 'orchestrator';

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

export interface ExecutionTargetSummary {
  provider: string;
  model: string | null;
}

export interface ParticipantExecutionLease extends ParticipantSessionSummary {
  provider: string | null;
  model: string | null;
  startedAt: string | null;
  lastUsedAt: string | null;
}

export interface MemoryCheckpointSummary {
  summary: string | null;
  facts: string[];
  openLoops: string[];
  updatedAt: string | null;
}

export interface ParticipantExecutionState {
  target: ExecutionTargetSummary;
  lease: ParticipantExecutionLease;
}

export interface WorkspacePal {
  id: string;
  name: string;
  roles: string[];
  skillProfile: string | null;
  mcpProfile: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  defaultExecutionTarget: ExecutionTargetSummary;
  memory: MemoryCheckpointSummary;
}

export interface ChannelPalAssignment {
  palId: string;
  status: 'active' | 'removed';
  roles: string[];
  joinedAt: string;
  leftAt: string | null;
  execution: ParticipantExecutionState;
}

export interface WorkspaceChannelPal {
  palId: string;
  name: string;
  roles: string[];
  skillProfile: string | null;
  mcpProfile: string | null;
  status: 'active' | 'removed';
  joinedAt: string;
  leftAt: string | null;
  execution: ParticipantExecutionState;
  memory: MemoryCheckpointSummary;
}

export interface WorkspaceMessage {
  id: string;
  channelId: string;
  senderKind: WorkspaceMessageSenderKind;
  senderName: string;
  body: string;
  mentions: string[];
  metadata: Record<string, unknown>;
  usage: MessageUsageSummary | null;
  createdAt: string;
}

export interface WorkspaceChannelState {
  id: string;
  title: string;
  topic: string;
  status: WorkspaceChannelStatus;
  unreadCount: number;
  repoPath: string | null;
  workspaceCwd: string | null;
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
  palAssignments: ChannelPalAssignment[];
  messages: WorkspaceMessage[];
}

export interface WorkspaceChannelView extends WorkspaceChannelState {
  assignedPals: WorkspaceChannelPal[];
}

export interface WorkspaceChannelSummary {
  id: string;
  title: string;
  topic: string;
  status: WorkspaceChannelStatus;
  unreadCount: number;
  palCount: number;
  activePalCount: number;
  repoPath: string | null;
  workspaceCwd: string | null;
  lastMessageAt: string | null;
  lastActivatedAt: string | null;
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

export interface WorkspaceCapabilities {
  multiChannel: true;
  persistence: 'file-backed';
  mentions: 'basic';
  splitView: 'planned';
  transcriptExport: true;
  participantManagement: 'basic';
  runtimeSessions: true;
}

export interface WorkspaceState {
  id: string;
  name: string;
  selectedChannelId: string;
  bossCatId: string | null;
  pals: WorkspacePal[];
  channels: WorkspaceChannelState[];
  globalOrchestrator: GlobalOrchestratorSummary;
  capabilities: WorkspaceCapabilities;
  showVerboseMessages: boolean;
}

export interface WorkspaceShellState {
  id: string;
  name: string;
  selectedChannelId: string;
  bossCatId: string | null;
  pals: WorkspacePal[];
  channels: WorkspaceChannelSummary[];
  selectedChannel: WorkspaceChannelView | null;
  globalOrchestrator: GlobalOrchestratorSummary;
  capabilities: WorkspaceCapabilities;
  showVerboseMessages: boolean;
}

export interface AppShellPayload {
  app: {
    name: 'cats-inc';
    stage: 'phase-2-shell';
    runtimeBoundary: 'cats-runtime';
  };
  workspace: WorkspaceShellState;
  runtime: RuntimeStatusSummary;
  metadata: {
    generatedAt: string;
    host: string;
    port: number;
  };
  setupCompleteAt: string | null;
  ownerDisplayName: string;
}

export interface PalDraftInput {
  name: string;
  provider: string;
  model?: string;
  roles?: string[];
  skillProfile?: string;
  mcpProfile?: string;
}

export interface CreateWorkspacePalInput extends PalDraftInput {}

export interface AssignChannelPalInput {
  palId: string;
  provider?: string;
  model?: string;
  roles?: string[];
}

export interface UpdateSelectedChannelInput {
  selectedChannelId: string;
}

export interface CreateWorkspaceChannelInput {
  title: string;
  topic: string;
  repoPath?: string;
  language?: string;
  responseLanguage?: string;
  formationMode?: ChannelFormationMode;
  skillProfile?: string;
  mcpProfile?: string;
  orchestratorRoles?: string[];
  cats?: PalDraftInput[];
  /** @deprecated Use `cats` on canonical routes. Kept for legacy `/api/workspace/channels`. */
  pals?: PalDraftInput[];
}

export interface UpdateGlobalOrchestratorInput {
  provider: string;
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
  targetKind: 'orchestrator' | 'pal';
  targetId: string;
  targetName: string;
  status: 'started' | 'already_started' | 'error';
  sessionId: string | null;
  error?: string;
}

export interface ChannelDispatchResult {
  targetKind: 'orchestrator' | 'pal';
  targetId: string;
  targetName: string;
  sessionId: string | null;
  status: 'sent' | 'skipped' | 'error';
  error?: string;
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
  channel: WorkspaceChannelState;
  assignedPals: WorkspaceChannelPal[];
}
