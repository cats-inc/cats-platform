import { COMPANION_ROLE, withCompanionRole } from '../../../shared/companionRole.js';
import { normalizePersistedChatSnapshot } from './chat-snapshot/index.js';
import { syncCoreStateWithChatState } from './core-projection/index.js';
import {
  buildPersistedChatSnapshot,
  extractCoreState,
  type PersistedChatSnapshot,
} from './core-snapshot/index.js';

/**
 * One-time upgrade for ADR-124: Cats persisted with `skillProfile: 'companion'`
 * carry the companion role instead. Channel and orchestrator skill profiles are
 * untouched. Remove after the minor that follows 0.6.0.
 */
export interface CompanionRoleMigration {
  snapshot: PersistedChatSnapshot;
  migratedCatIds: string[];
}

export function resolveCompanionRoleMigrationBackupPath(chatStatePath: string): string {
  return `${chatStatePath}.pre-companion-role.bak`;
}

/** Returns null when the snapshot holds no legacy companion skill profiles. */
export function migrateCompanionSkillProfiles(
  snapshot: PersistedChatSnapshot,
): CompanionRoleMigration | null {
  const migratedCatIds = snapshot.chat.cats
    .filter((cat) => cat.skillProfile === COMPANION_ROLE)
    .map((cat) => cat.id);
  if (migratedCatIds.length === 0) {
    return null;
  }

  const chat = structuredClone(snapshot.chat);
  for (const cat of chat.cats) {
    if (cat.skillProfile === COMPANION_ROLE) {
      cat.roles = withCompanionRole(cat.roles, true);
      cat.skillProfile = null;
    }
  }
  const migrated = normalizePersistedChatSnapshot(
    JSON.parse(JSON.stringify(
      buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat, extractCoreState(snapshot))),
    )),
  );

  for (const catId of migratedCatIds) {
    const cat = migrated.chat.cats.find((candidate) => candidate.id === catId);
    if (!cat || cat.skillProfile === COMPANION_ROLE || !cat.roles.includes(COMPANION_ROLE)) {
      throw new Error(`Companion role migration did not validate for Cat ${catId}`);
    }
  }
  if (migrated.chat.cats.length !== snapshot.chat.cats.length) {
    throw new Error('Companion role migration changed the Cat count');
  }

  return { snapshot: migrated, migratedCatIds };
}
