import type {
  MemoryCheckpointSummary,
  OwnerProfileRecord,
} from './types.js';

export const OWNER_ACTOR_ID = 'actor-owner';
export const GLOBAL_ORCHESTRATOR_ACTOR_ID = 'actor-orchestrator-global';

export function createCatActorId(catId: string): string {
  return `actor-cat-${catId}`;
}

export function createEmptyMemoryCheckpoint(): MemoryCheckpointSummary {
  return {
    summary: null,
    facts: [],
    openLoops: [],
    updatedAt: null,
  };
}

export function createDefaultOwnerProfile(
  updatedAt: string = new Date().toISOString(),
): OwnerProfileRecord {
  return {
    actorId: OWNER_ACTOR_ID,
    displayName: 'Owner',
    avatarColor: null,
    avatarUrl: null,
    summary: null,
    communicationPreferences: [],
    decisionPreferences: [],
    escalationPreferences: [],
    updatedAt,
  };
}
