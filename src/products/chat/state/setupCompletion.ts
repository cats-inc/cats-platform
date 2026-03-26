import type { ChatState } from '../api/contracts.js';

function hasNonDefaultOwnerName(ownerDisplayName: string | null | undefined): boolean {
  const trimmed = ownerDisplayName?.trim() ?? '';
  return trimmed.length > 0 && trimmed !== 'Owner';
}

export function hasInitializedChatState(
  chat: ChatState,
  options: {
    ownerDisplayName?: string | null;
    botBindingCount?: number;
  } = {},
): boolean {
  return Boolean(
    chat.bossCatId
      || chat.cats.length > 0
      || chat.channels.length > 0
      || (options.botBindingCount ?? 0) > 0
      || hasNonDefaultOwnerName(options.ownerDisplayName),
  );
}

export function resolveSetupCompletionTimestamp(
  chat: ChatState,
  options: {
    explicitSetupCompleteAt?: string | null;
    ownerDisplayName?: string | null;
    botBindingCount?: number;
    fallbackTimestamp?: string | null;
    now?: Date;
  } = {},
): string | null {
  const explicit = options.explicitSetupCompleteAt?.trim() ?? '';
  if (explicit) {
    return explicit;
  }

  if (!hasInitializedChatState(chat, options)) {
    return null;
  }

  return options.fallbackTimestamp ?? chat.globalOrchestrator.updatedAt ?? options.now?.toISOString() ?? null;
}
