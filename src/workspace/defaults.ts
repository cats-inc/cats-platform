import type {
  MemoryCheckpointSummary,
  ParticipantExecutionLease,
  GlobalOrchestratorSummary,
  WorkspaceCapabilities,
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

  return {
    id: 'default',
    name: 'Chat',
    selectedChannelId: '',
    bossCatId: null,
    pals: [],
    channels: [],
    globalOrchestrator: createDefaultOrchestrator(createdAt),
    capabilities: createCapabilities(),
  };
}
