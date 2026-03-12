import { randomUUID } from 'node:crypto';

import type {
  MemoryCheckpointSummary,
  ParticipantExecutionLease,
  GlobalOrchestratorSummary,
  WorkspaceCapabilities,
  WorkspaceChannelState,
  WorkspaceMessage,
  WorkspaceState,
} from '../shared/app-shell.js';

function isoNow(): string {
  return new Date().toISOString();
}

export function createEmptyExecutionLease(): ParticipantExecutionLease {
  return {
    sessionId: null,
    status: 'not_started',
    cwd: null,
    lastError: null,
    provider: null,
    model: null,
    startedAt: null,
    lastUsedAt: null,
  };
}

export function createEmptyMemoryCheckpoint(): MemoryCheckpointSummary {
  return {
    summary: null,
    facts: [],
    openLoops: [],
    updatedAt: null,
  };
}

function createSystemMessage(channelId: string, body: string, createdAt: string): WorkspaceMessage {
  return {
    id: randomUUID(),
    channelId,
    senderKind: 'system',
    senderName: 'Chat',
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
    partial.initialBody ?? 'Chat ready. Add pals, then activate replies when you need them.',
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
    orchestratorLease: createEmptyExecutionLease(),
    members: [],
    messages: [initialMessage],
  };
}

function createDefaultOrchestrator(updatedAt: string): GlobalOrchestratorSummary {
  return {
    mode: 'global',
    status: 'warming',
    nextFocus: 'Bring chats online, route @mentions, and keep transcripts ready to export',
    entrypoints: ['web', 'desktop', 'telegram'],
    referenceProjects: ['agent-workspace-poc', 'crew-chat-poc', 'cats-runtime'],
    notes: [
      'Keep runtime concerns behind cats-runtime.',
      'Chat setup should stay lightweight and explicit.',
      'Messages, pals, memory checkpoints, and exports should be first-class local data.',
    ],
    executionTarget: {
      provider: 'claude',
      model: null,
    },
    systemPrompt:
      'You are the global coordinator for Cats Inc. This conversation happens in the Chat ' +
      'module. Keep team chats clear, respect explicit @mentions, and tell the user who ' +
      'should act next.',
    skillProfile: 'aaif-a2a-default',
    mcpProfile: 'workspace-memory',
    memory: createEmptyMemoryCheckpoint(),
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
        id: 'lobby',
        title: 'Lobby',
        topic: 'A casual room for the team to coordinate, ask for help, and keep things moving.',
        status: 'configured',
        orchestratorRoles: ['architect', 'coder', 'reviewer'],
      },
      createdAt,
    ),
  ];

  return {
    id: 'default',
    name: 'Chat',
    selectedChannelId: channels[0].id,
    channels,
    globalOrchestrator: createDefaultOrchestrator(createdAt),
    capabilities: createCapabilities(),
  };
}
