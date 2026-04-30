import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import type { MessageKey } from '../../../../../shared/i18n/index.js';

export const SKILL_PROFILES = [
  { value: 'chat-default', label: messageKeys.sharedSettingsCatsSkillProfileDefaultLabel },
  { value: 'companion', label: messageKeys.sharedSettingsCatsSkillProfileCompanionLabel },
] as const;

export const MEMORY_CATEGORIES = [
  { value: 'preference', label: messageKeys.sharedSettingsCatsMemoryCategoryPreferenceLabel },
  { value: 'fact', label: messageKeys.sharedSettingsCatsMemoryCategoryFactLabel },
  { value: 'policy', label: messageKeys.sharedSettingsCatsMemoryCategoryPolicyLabel },
  { value: 'style', label: messageKeys.sharedSettingsCatsMemoryCategoryStyleLabel },
  { value: 'relationship', label: messageKeys.sharedSettingsCatsMemoryCategoryRelationshipLabel },
  { value: 'lesson', label: messageKeys.sharedSettingsCatsMemoryCategoryLessonLabel },
] as const;

export function getCatSkillProfileLabel(profile: string | null | undefined): MessageKey | null {
  if (profile === 'chat-default') {
    return messageKeys.sharedSettingsCatsSkillProfileDefaultLabel;
  }
  if (profile === 'companion') {
    return messageKeys.sharedSettingsCatsSkillProfileCompanionLabel;
  }
  return null;
}

export function getMemoryCategoryLabel(category: string): MessageKey | null {
  const match = MEMORY_CATEGORIES.find((candidate) => candidate.value === category);
  return match ? match.label : null;
}

export function formatTransportTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
