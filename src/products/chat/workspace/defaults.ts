import type {
  ParticipantExecutionLease,
  GlobalOrchestratorSummary,
  ChatCapabilities,
  ChatState,
} from '../../../shared/app-shell.js';
import type { MemoryCheckpointSummary } from '../../../core/types.js';
import { createEmptyMemoryCheckpoint } from '../../../core/model.js';
export { createEmptyMemoryCheckpoint };

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
      'Messages, cats, memory checkpoints, and exports should be first-class local data.',
    ],
    executionTarget: {
      provider: 'claude',
      instance: null,
      model: null,
    },
    systemPrompt:
      'You are the global coordinator for Cats Inc. This conversation happens in the Chat ' +
      'module. Keep team chats clear, respect explicit @mentions, and tell the user who ' +
      'should act next.',
    skillProfile: 'aaif-a2a-default',
    mcpProfile: 'chat-memory',
    memory: createEmptyMemoryCheckpoint(),
    telegramBotName: null,
    updatedAt,
  };
}

function createCapabilities(): ChatCapabilities {
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

export function createDefaultChatState(): ChatState {
  const createdAt = isoNow();

  return {
    id: 'default',
    name: 'Chat',
    selectedChannelId: '',
    bossCatId: null,
    cats: [],
    channels: [],
    globalOrchestrator: createDefaultOrchestrator(createdAt),
    capabilities: createCapabilities(),
    showVerboseMessages: false,
  };
}
