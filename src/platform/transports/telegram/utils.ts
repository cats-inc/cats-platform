import type { BotBindingRecord } from '../../../core/types.js';
import type {
  TelegramMessagePayload,
  TelegramRelayContext,
  TelegramWebhookUpdate,
} from './contracts.js';

export interface PickedTelegramMessage {
  message: TelegramMessagePayload | null;
  isEdited: boolean;
  isCallbackQuery: boolean;
  sender: TelegramMessagePayload['from'] | null;
}

export function readTelegramString(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function pickTelegramMessage(update: TelegramWebhookUpdate): PickedTelegramMessage {
  if (update.message) {
    return {
      message: update.message,
      isEdited: false,
      isCallbackQuery: false,
      sender: update.message.from ?? null,
    };
  }
  if (update.edited_message) {
    return {
      message: update.edited_message,
      isEdited: true,
      isCallbackQuery: false,
      sender: update.edited_message.from ?? null,
    };
  }
  if (update.callback_query?.message) {
    return {
      message: update.callback_query.message,
      isEdited: false,
      isCallbackQuery: true,
      sender: update.callback_query.from ?? null,
    };
  }
  return { message: null, isEdited: false, isCallbackQuery: false, sender: null };
}

export function resolveActiveTelegramBinding(
  context: TelegramRelayContext,
  preferredBindingId?: string | null,
): BotBindingRecord | null {
  const preferredId = readTelegramString(preferredBindingId);
  if (preferredId) {
    const preferredBinding = context.botBindings.find((binding) =>
      binding.id === preferredId && binding.status === 'active',
    ) ?? null;
    if (preferredBinding) {
      return preferredBinding;
    }
  }

  const candidate = context.selectedBotBinding ?? context.defaultBotBinding ?? null;
  return candidate?.status === 'active' ? candidate : null;
}
