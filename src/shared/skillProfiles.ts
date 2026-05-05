import type { RuntimeSkillManifest } from '../runtime/client.js';

export interface SkillProfileOption {
  id: string;
  requestedSkills: string[];
}

export const SKILL_PROFILE_OPTIONS: SkillProfileOption[] = [
  {
    id: 'none',
    requestedSkills: [],
  },
  {
    id: 'companion',
    requestedSkills: ['companion'],
  },
];

function findSkillProfile(profileId: string | null | undefined): SkillProfileOption | null {
  if (!profileId) {
    return null;
  }

  return SKILL_PROFILE_OPTIONS.find((profile) => profile.id === profileId) ?? null;
}

export function resolveSkillProfileManifest(input: {
  profileId?: string | null;
  catId?: string | null;
  roomMode?: 'chat_channel' | 'direct_message';
  transport?: 'telegram' | 'line' | 'web' | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
}): RuntimeSkillManifest | undefined {
  const profile = findSkillProfile(input.profileId);
  if (!profile || profile.requestedSkills.length === 0) {
    return undefined;
  }

  return {
    profileId: profile.id,
    requestedSkills: profile.requestedSkills,
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
