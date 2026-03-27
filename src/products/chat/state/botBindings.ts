import type { BotBindingRecord } from '../../../core/types.js';

export const GLOBAL_TELEGRAM_BOT_BINDING_ID = 'bot-binding-telegram-global';

export function resolveEffectiveBotBindingRoomMode(
  binding: Pick<BotBindingRecord, 'id' | 'roomMode' | 'catActorId'>,
): BotBindingRecord['roomMode'] {
  if (binding.roomMode === 'direct_cat_chat') {
    return 'direct_cat_chat';
  }

  if (binding.id === GLOBAL_TELEGRAM_BOT_BINDING_ID) {
    return 'boss_chat';
  }

  if (binding.catActorId) {
    return 'direct_cat_chat';
  }

  return 'boss_chat';
}

export function normalizeEffectiveBotBinding<T extends BotBindingRecord>(binding: T): T {
  return {
    ...binding,
    roomMode: resolveEffectiveBotBindingRoomMode(binding),
  };
}
