import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import type { MessageKey } from '../../../../../shared/i18n/index.js';
import {
  CHAT_MCP_PROFILE_ID,
  WORK_MCP_PROFILE_ID,
} from '../../../../../shared/catMcpProfiles.js';

export const SKILL_PROFILES = [
  { value: 'chat-default', label: messageKeys.sharedSettingsCatsSkillProfileDefaultLabel },
  { value: 'companion', label: messageKeys.sharedSettingsCatsSkillProfileCompanionLabel },
] as const;

export const MCP_PROFILES = [
  { value: CHAT_MCP_PROFILE_ID, label: messageKeys.sharedSettingsCatsMcpProfileChatMemoryLabel },
  { value: WORK_MCP_PROFILE_ID, label: messageKeys.sharedSettingsCatsMcpProfileWorkMemoryLabel },
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

export function getCatMcpProfileLabel(profile: string | null | undefined): MessageKey | null {
  if (!profile || profile === CHAT_MCP_PROFILE_ID) {
    return messageKeys.sharedSettingsCatsMcpProfileChatMemoryLabel;
  }
  if (profile === WORK_MCP_PROFILE_ID) {
    return messageKeys.sharedSettingsCatsMcpProfileWorkMemoryLabel;
  }
  return null;
}

export function getMemoryCategoryLabel(category: string): MessageKey | null {
  const match = MEMORY_CATEGORIES.find((candidate) => candidate.value === category);
  return match ? match.label : null;
}

export function getCatRecordStatusLabel(status: string): MessageKey | null {
  if (status === 'active') {
    return messageKeys.sharedSettingsCatsStatusActive;
  }
  if (status === 'archived') {
    return messageKeys.sharedSettingsCatsStatusArchived;
  }
  return null;
}

export function getCatProductSurfaceLabel(surface: string): MessageKey | null {
  if (surface === 'chat') {
    return messageKeys.platformProductChatSettingsLabel;
  }
  if (surface === 'code') {
    return messageKeys.platformProductCodeSettingsLabel;
  }
  if (surface === 'work') {
    return messageKeys.platformProductWorkSettingsLabel;
  }
  return null;
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
