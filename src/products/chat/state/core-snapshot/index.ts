import type { ChatState } from '../../api/contracts.js';
import type { CatsCoreState } from '../../../../core/types.js';

export {
  normalizeArchiveMetadata,
  normalizeBotBinding,
  normalizeCoreActivity,
  normalizeCoreActor,
  normalizeCoreApprovalBinding,
  normalizeCoreArtifact,
  normalizeCoreCheckpoint,
  normalizeCoreConversation,
  normalizeCoreOutcome,
  normalizeCoreProject,
  normalizeCoreRun,
  normalizeCoreTask,
  normalizeCoreTrace,
  normalizeCoreWorkItem,
  normalizeDurableMemoryRecord,
  normalizeOwnerProfile,
} from './records.js';

export interface PersistedChatSnapshot extends CatsCoreState {
  chat: ChatState;
}

export function extractCoreState(snapshot: PersistedChatSnapshot): CatsCoreState {
  const { chat: _chat, ...core } = snapshot;
  return core;
}

export function buildPersistedChatSnapshot(
  chat: ChatState,
  core: CatsCoreState,
): PersistedChatSnapshot {
  return {
    ...structuredClone(core),
    chat: structuredClone(chat),
  };
}
