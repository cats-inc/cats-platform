import type {
  CompanionExpressionMode,
  CompanionMemoryCategory,
  CompanionOutputMode,
  CompanionSourceKind,
  CompanionSourceStorageMode,
} from './contracts.js';

export const COMPANION_SOURCE_KINDS: CompanionSourceKind[] = [
  'note',
  'conversation_log',
  'article',
  'image',
  'video',
  'audio',
  'path_ref',
];

export const COMPANION_SOURCE_STORAGE_MODES: CompanionSourceStorageMode[] = [
  'uploaded_copy',
  'imported_copy',
  'linked_path',
];

export const COMPANION_EXPRESSION_MODES: CompanionExpressionMode[] = [
  'animalistic',
  'anthropomorphic',
  'mixed',
];

export const COMPANION_OUTPUT_MODES: CompanionOutputMode[] = [
  'text',
  'audio_clip',
  'tts',
  'mixed',
];

export const COMPANION_MEMORY_CATEGORIES: CompanionMemoryCategory[] = [
  'identity',
  'preference',
  'relationship',
  'fact',
  'event',
  'owner_note',
];

export function isCompanionSourceKind(value: unknown): value is CompanionSourceKind {
  return typeof value === 'string' && COMPANION_SOURCE_KINDS.includes(value as CompanionSourceKind);
}

export function isCompanionSourceStorageMode(
  value: unknown,
): value is CompanionSourceStorageMode {
  return typeof value === 'string'
    && COMPANION_SOURCE_STORAGE_MODES.includes(value as CompanionSourceStorageMode);
}

export function isCompanionExpressionMode(
  value: unknown,
): value is CompanionExpressionMode {
  return typeof value === 'string'
    && COMPANION_EXPRESSION_MODES.includes(value as CompanionExpressionMode);
}

export function isCompanionOutputMode(value: unknown): value is CompanionOutputMode {
  return typeof value === 'string'
    && COMPANION_OUTPUT_MODES.includes(value as CompanionOutputMode);
}

export function isCompanionMemoryCategory(
  value: unknown,
): value is CompanionMemoryCategory {
  return typeof value === 'string'
    && COMPANION_MEMORY_CATEGORIES.includes(value as CompanionMemoryCategory);
}
