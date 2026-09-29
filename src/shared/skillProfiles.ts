import type { RuntimeSkillManifest } from '../runtime/client.js';
import { COMPANION_ROLE, COMPANION_SKILL_ID } from './companionRole.js';
import { AGENCY_PLUGIN } from './managedPlugins.js';

export interface SkillProfileOption {
  id: string;
  requestedSkills: string[];
}

export const SKILL_PROFILE_OPTIONS: SkillProfileOption[] = [
  {
    id: 'none',
    requestedSkills: [],
  },
];

const MANAGED_PLUGIN_SKILL_PREFIX = 'plugin:';

/**
 * Normalizes a Cat skill profile. Companion is a Cat role since ADR-124, so it
 * is rejected here rather than silently stored as a behavior profile.
 */
export function normalizeCatSkillProfile(profile: string | null | undefined): string | null {
  const normalized = profile?.trim();
  if (!normalized) {
    return null;
  }
  if (normalized === COMPANION_ROLE) {
    throw new Error('Unsupported Cat skill profile: companion is a Cat role');
  }
  return normalized;
}

function findSkillProfile(profileId: string | null | undefined): SkillProfileOption | null {
  if (!profileId) {
    return null;
  }
  if (AGENCY_PLUGIN.skills.some(skill => skill.id === profileId)) return { id: profileId, requestedSkills: [profileId] };

  return SKILL_PROFILE_OPTIONS.find((profile) => profile.id === profileId) ?? null;
}

export function resolveSkillProfileManifest(input: {
  profileId?: string | null;
  /** Whether the Cat carries the companion role (see `isCompanionCat`). */
  companion?: boolean;
  catId?: string | null;
  roomMode?: 'chat_channel' | 'direct_message';
  transport?: 'telegram' | 'line' | 'web' | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
}): RuntimeSkillManifest | undefined {
  const profile = findSkillProfile(input.profileId);
  const requestedSkills = [...(profile?.requestedSkills ?? [])];
  // Runtime managed-plugin sessions accept managed skills only, so a companion Cat on a
  // Plugin profile keeps its identity but not the built-in companion skill.
  const usesManagedPlugin = requestedSkills.some(
    (skill) => skill.startsWith(MANAGED_PLUGIN_SKILL_PREFIX),
  );
  if (input.companion && !usesManagedPlugin) {
    requestedSkills.push(COMPANION_SKILL_ID);
  }
  if (requestedSkills.length === 0) {
    return undefined;
  }

  return {
    ...(profile && profile.requestedSkills.length > 0 ? { profileId: profile.id } : {}),
    requestedSkills,
    context: {
      ...(input.catId ? { catId: input.catId } : {}),
      ...(input.roomMode ? { roomMode: input.roomMode } : {}),
      transport: input.transport ?? 'web',
      ...(input.labels?.length ? { labels: input.labels } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
  };
}

export function describeSkillProfile(profileId: string | null | undefined): SkillProfileOption | null {
  return findSkillProfile(profileId);
}
