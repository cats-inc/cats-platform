import type { PlatformSurfaceId } from '../../shared/platform-contract.js';

export type ConversationBehaviorSurface = PlatformSurfaceId;

export type ConcurrentChatPresentationMode =
  | 'inline_stack'
  | 'compare_cards'
  | 'focus_rail'
  | 'adaptive';

export const CONCURRENT_PRESENTATION_MODES: readonly ConcurrentChatPresentationMode[] = [
  'inline_stack',
  'compare_cards',
  'focus_rail',
  'adaptive',
];

export interface SurfaceConversationBehaviorPreferences {
  showVerboseMessages: boolean;
  showLiveProgressDetails: boolean;
  concurrentPresentationMode: ConcurrentChatPresentationMode;
}

export interface ConversationBehaviorPreferences {
  chat: SurfaceConversationBehaviorPreferences;
  work: SurfaceConversationBehaviorPreferences;
  code: SurfaceConversationBehaviorPreferences;
}

export type SurfaceConversationBehaviorPatch =
  Partial<SurfaceConversationBehaviorPreferences>;

export type ConversationBehaviorPatch = Partial<
  Record<ConversationBehaviorSurface, SurfaceConversationBehaviorPatch>
>;

const CONVERSATION_BEHAVIOR_SURFACES: readonly ConversationBehaviorSurface[] = [
  'chat',
  'work',
  'code',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function createDefaultSurfaceConversationBehaviorPreferences():
SurfaceConversationBehaviorPreferences {
  return {
    showVerboseMessages: false,
    showLiveProgressDetails: false,
    concurrentPresentationMode: 'inline_stack',
  };
}

export function createDefaultConversationBehaviorPreferences():
ConversationBehaviorPreferences {
  return {
    chat: createDefaultSurfaceConversationBehaviorPreferences(),
    work: createDefaultSurfaceConversationBehaviorPreferences(),
    code: createDefaultSurfaceConversationBehaviorPreferences(),
  };
}

export function normalizeConcurrentPresentationMode(
  value: unknown,
): ConcurrentChatPresentationMode {
  return typeof value === 'string'
    && (CONCURRENT_PRESENTATION_MODES as readonly string[]).includes(value)
    ? value as ConcurrentChatPresentationMode
    : 'inline_stack';
}

export function normalizeSurfaceConversationBehaviorPreferences(
  value: unknown,
): SurfaceConversationBehaviorPreferences {
  const fallback = createDefaultSurfaceConversationBehaviorPreferences();
  const record = asRecord(value);

  return {
    showVerboseMessages: record?.showVerboseMessages === true,
    showLiveProgressDetails: record?.showLiveProgressDetails === true,
    concurrentPresentationMode: normalizeConcurrentPresentationMode(
      record?.concurrentPresentationMode ?? fallback.concurrentPresentationMode,
    ),
  };
}

export function normalizeConversationBehaviorPreferences(
  value: unknown,
): ConversationBehaviorPreferences {
  const fallback = createDefaultConversationBehaviorPreferences();
  const record = asRecord(value);

  return CONVERSATION_BEHAVIOR_SURFACES.reduce<ConversationBehaviorPreferences>(
    (next, surface) => {
      next[surface] = normalizeSurfaceConversationBehaviorPreferences(record?.[surface]);
      return next;
    },
    fallback,
  );
}

export function cloneConversationBehaviorPreferences(
  value: ConversationBehaviorPreferences | null | undefined,
): ConversationBehaviorPreferences {
  return normalizeConversationBehaviorPreferences(value);
}

export function applyConversationBehaviorPatch(
  current: ConversationBehaviorPreferences | null | undefined,
  patch: ConversationBehaviorPatch | null | undefined,
): ConversationBehaviorPreferences {
  const next = normalizeConversationBehaviorPreferences(current);
  const record = asRecord(patch);
  if (!record) {
    return next;
  }

  for (const surface of CONVERSATION_BEHAVIOR_SURFACES) {
    const surfacePatch = asRecord(record[surface]);
    if (!surfacePatch) {
      continue;
    }

    if (typeof surfacePatch.showVerboseMessages === 'boolean') {
      next[surface].showVerboseMessages = surfacePatch.showVerboseMessages;
    }
    if (typeof surfacePatch.showLiveProgressDetails === 'boolean') {
      next[surface].showLiveProgressDetails = surfacePatch.showLiveProgressDetails;
    }
    if (surfacePatch.concurrentPresentationMode !== undefined) {
      next[surface].concurrentPresentationMode = normalizeConcurrentPresentationMode(
        surfacePatch.concurrentPresentationMode,
      );
    }
  }

  return next;
}

export function resolveConversationBehaviorPreferences(
  value: ConversationBehaviorPreferences | null | undefined,
  surface: ConversationBehaviorSurface,
): SurfaceConversationBehaviorPreferences {
  return normalizeConversationBehaviorPreferences(value)[surface];
}
