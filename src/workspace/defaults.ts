import { randomUUID } from 'node:crypto';

import type {
  GlobalOrchestratorSummary,
  ParticipantSessionSummary,
  WorkspaceCapabilities,
  WorkspaceChannelState,
  WorkspaceMessage,
  WorkspaceState,
} from '../shared/app-shell.js';

function isoNow(): string {
  return new Date().toISOString();
}

export function createEmptySessionState(): ParticipantSessionSummary {
  return {
    sessionId: null,
    status: 'not_started',
    cwd: null,
    lastError: null,
  };
}

function createSystemMessage(channelId: string, body: string, createdAt: string): WorkspaceMessage {
  return {
    id: randomUUID(),
    channelId,
    senderKind: 'system',
    senderName: 'Workspace',
    body,
    mentions: [],
    metadata: {},
    usage: null,
    createdAt,
  };
}

function createBaseChannel(
  partial: Pick<WorkspaceChannelState, 'id' | 'title' | 'topic' | 'status'> & {
    repoPath?: string | null;
    workspaceCwd?: string | null;
    language?: string | null;
    responseLanguage?: string;
    formationMode?: WorkspaceChannelState['formationMode'];
    skillProfile?: string | null;
    mcpProfile?: string | null;
    orchestratorRoles?: string[];
    initialBody?: string;
  },
  createdAt: string,
): WorkspaceChannelState {
  const initialMessage = createSystemMessage(
    partial.id,
    partial.initialBody ?? 'Channel shell created. Add members, then activate runtime sessions.',
    createdAt,
  );

  return {
    id: partial.id,
    title: partial.title,
    topic: partial.topic,
    status: partial.status,
    unreadCount: 0,
    repoPath: partial.repoPath ?? null,
    workspaceCwd: partial.workspaceCwd ?? null,
    language: partial.language ?? null,
    responseLanguage: partial.responseLanguage ?? 'en',
    formationMode: partial.formationMode ?? 'manual',
    skillProfile: partial.skillProfile ?? 'workspace-default',
    mcpProfile: partial.mcpProfile ?? 'workspace-memory',
    orchestratorRoles: partial.orchestratorRoles ?? [],
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: createdAt,
    lastActivatedAt: null,
    orchestratorSession: createEmptySessionState(),
    members: [],
    messages: [initialMessage],
  };
}

function createDefaultOrchestrator(updatedAt: string): GlobalOrchestratorSummary {
  return {
    mode: 'global',
    status: 'warming',
    nextFocus: 'Activate channels, route @mentions, and persist transcripts for later export',
    entrypoints: ['web', 'desktop', 'telegram'],
    referenceProjects: ['agent-workspace-poc', 'crew-chat-poc', 'cats-runtime'],
    notes: [
      'Keep runtime concerns behind cats-runtime.',
      'Channel setup should stay pre-start and explicit.',
      'Messages, membership, and exports should be first-class local data.',
    ],
    provider: 'claude',
    model: null,
    systemPrompt:
      'You are the global orchestrator for cats-inc. Coordinate the workspace, respect ' +
      'explicit @mentions, and keep the user aware of which teammates should act next.',
    skillProfile: 'aaif-a2a-default',
    mcpProfile: 'workspace-memory',
    telegramBotName: null,
    updatedAt,
  };
}

function createCapabilities(): WorkspaceCapabilities {
  return {
    multiChannel: true,
    persistence: 'file-backed',
    mentions: 'basic',
    splitView: 'planned',
    transcriptExport: true,
    participantManagement: 'basic',
    runtimeSessions: true,
  };
}

export function createDefaultWorkspaceState(): WorkspaceState {
  const createdAt = isoNow();
  const channels: WorkspaceChannelState[] = [
    createBaseChannel(
      {
        id: 'launchpad',
        title: 'Launchpad',
        topic: 'Shape the next workspace loop before wiring the first runtime-backed team.',
        status: 'configured',
        orchestratorRoles: ['architect', 'coder', 'reviewer'],
      },
      createdAt,
    ),
    createBaseChannel(
      {
        id: 'runtime-debug',
        title: 'Runtime Debug',
        topic: 'Watch cats-runtime reachability and keep recovery notes attached to one channel.',
        status: 'watching',
        initialBody: 'Runtime watch channel ready. Use this room for diagnostics and recovery notes.',
      },
      createdAt,
    ),
    createBaseChannel(
      {
        id: 'strategy-room',
        title: 'Strategy Room',
        topic: 'Keep long-range orchestrator and product direction visible alongside delivery work.',
        status: 'planned',
        initialBody: 'Strategy room ready. Add members when you want a dedicated planning track.',
      },
      createdAt,
    ),
  ];

  return {
    id: 'default',
    name: 'Cats Inc Workspace',
    selectedChannelId: channels[0].id,
    channels,
    globalOrchestrator: createDefaultOrchestrator(createdAt),
    capabilities: createCapabilities(),
  };
}
