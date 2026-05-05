import type { BotBindingRecord } from '../../../core/types.js';

export const GLOBAL_TELEGRAM_BOT_BINDING_ID = 'bot-binding-telegram-global';

export function resolveEffectiveBotBindingRoomMode(
  binding: Pick<BotBindingRecord, 'id' | 'roomMode' | 'catActorId'>,
): BotBindingRecord['roomMode'] {
  if (binding.roomMode === 'direct_message') {
    return 'direct_message';
  }

  if (binding.id === GLOBAL_TELEGRAM_BOT_BINDING_ID) {
    return 'chat_channel';
  }

  if (binding.catActorId) {
    return 'direct_message';
  }

  return 'chat_channel';
}

export function normalizeEffectiveBotBinding<T extends BotBindingRecord>(binding: T): T {
  return {
    ...binding,
    roomMode: resolveEffectiveBotBindingRoomMode(binding),
  };
}
