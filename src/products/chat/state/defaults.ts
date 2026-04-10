import type {
  GlobalOrchestratorSummary,
  ChatCapabilities,
  ChatState,
  NewChatDefaults,
  ParticipantExecutionLease,
} from '../api/contracts.js';
import type { MemoryCheckpointSummary } from '../../../core/types.js';
import { createEmptyMemoryCheckpoint } from '../../../core/actors.js';
import {
  getDefaultModel,
  getDefaultProviderInstance,
} from '../../../shared/providerCatalog.js';
import { listEnabledPlatformSurfaces } from '../../../shared/platformSurfaces.js';
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
    referenceProjects: ['crew-chat-poc', 'cats-runtime'],
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
    executionModelSelection: null,
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

function createCapabilities(limits?: {
  maxBossCats?: number;
  maxCats?: number;
  maxChatParticipants?: number;
  maxAudienceParticipants?: number;
  maxParallelChats?: number;
  availableSurfaces?: string[];
}): ChatCapabilities {
  return {
    multiChannel: true,
    persistence: 'file-backed',
    mentions: 'basic',
    splitView: 'planned',
    transcriptExport: true,
    participantManagement: 'basic',
    runtimeSessions: true,
    maxBossCats: limits?.maxBossCats ?? 1,
    maxCats: limits?.maxCats ?? 5,
    maxChatParticipants: limits?.maxChatParticipants ?? 5,
    maxAudienceParticipants: limits?.maxAudienceParticipants ?? 3,
    maxParallelChats: limits?.maxParallelChats ?? 3,
    availableSurfaces: limits?.availableSurfaces ?? listEnabledPlatformSurfaces(),
  };
}

export function createDefaultNewChatDefaults(): NewChatDefaults {
  return {
    provider: 'claude',
    instance: getDefaultProviderInstance('claude'),
    model: getDefaultModel('claude') || null,
    modelSelection: null,
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
    parallelChatGroups: [],
    globalOrchestrator: createDefaultOrchestrator(createdAt),
    newChatDefaults: createDefaultNewChatDefaults(),
    capabilities: createCapabilities(),
    showVerboseMessages: false,
    showLiveProgressDetails: false,
  };
}
