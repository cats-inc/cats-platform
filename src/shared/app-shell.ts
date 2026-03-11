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

export interface WorkspaceMember {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  roles: string[];
  skillProfile: string | null;
  mcpProfile: string | null;
  status: 'active' | 'removed';
  joinedAt: string;
  leftAt: string | null;
  session: ParticipantSessionSummary;
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
  orchestratorSession: ParticipantSessionSummary;
  members: WorkspaceMember[];
  messages: WorkspaceMessage[];
}

export interface WorkspaceChannelSummary {
  id: string;
  title: string;
  topic: string;
  status: WorkspaceChannelStatus;
  unreadCount: number;
  memberCount: number;
  activeMemberCount: number;
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
  provider: string;
  model: string | null;
  systemPrompt: string;
  skillProfile: string | null;
  mcpProfile: string | null;
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
  channels: WorkspaceChannelState[];
  globalOrchestrator: GlobalOrchestratorSummary;
  capabilities: WorkspaceCapabilities;
}

export interface WorkspaceShellState {
  id: string;
  name: string;
  selectedChannelId: string;
  channels: WorkspaceChannelSummary[];
  selectedChannel: WorkspaceChannelState | null;
  globalOrchestrator: GlobalOrchestratorSummary;
  capabilities: WorkspaceCapabilities;
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
}

export interface ChannelMemberDraftInput {
  name: string;
  provider: string;
  model?: string;
  roles?: string[];
  skillProfile?: string;
  mcpProfile?: string;
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
  members?: ChannelMemberDraftInput[];
}

export interface AddChannelMemberInput extends ChannelMemberDraftInput {}

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
  targetKind: 'orchestrator' | 'member';
  targetId: string;
  targetName: string;
  status: 'started' | 'already_started' | 'error';
  sessionId: string | null;
  error?: string;
}

export interface ChannelDispatchResult {
  targetKind: 'orchestrator' | 'member';
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
}
