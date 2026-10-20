import type { BotBindingRecord } from '../../../core/types.js';

export const GLOBAL_TELEGRAM_BOT_BINDING_ID = 'bot-binding-telegram-global';

/** A bot binding always talks through its cat's DM, whatever an older record says. */
export function resolveEffectiveBotBindingRoomMode(): BotBindingRecord['roomMode'] {
  return 'direct_message';
}

export function normalizeEffectiveBotBinding<T extends BotBindingRecord>(binding: T): T {
  return {
    ...binding,
    roomMode: resolveEffectiveBotBindingRoomMode(),
  };
}
