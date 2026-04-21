import type { BotBindingRecord } from '../../../core/types.js';
import {
  buildTelegramBotTransportBindingId,
} from '../../../shared/chatCoreIds.js';
import type { ChatMessage, MessageOrigin } from '../../../products/chat/api/contracts.js';
import { chunkTelegramReply } from './chunking.js';
import type { TelegramRelayContext } from './contracts.js';
import type { TelegramRelay } from './relay/index.js';
import type {
  TransportDeliverer,
  TransportFanoutDeliveryInput,
  TransportFanoutDeliveryResult,
} from '../fanout/registry.js';

const TELEGRAM_FANOUT_LIMIT = 4000;

export interface TelegramFanoutDelivererOptions {
  telegramRelay: TelegramRelay;
  resolveContext(bindingId: string): Promise<TelegramRelayContext>;
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatTelegramFanoutText(
  message: Pick<ChatMessage, 'body' | 'senderKind' | 'senderName'>,
  origin: MessageOrigin,
): string | null {
  const body = normalizeText(message.body);
  if (!body) {
    return null;
  }

  if (origin === 'web' && message.senderKind === 'user') {
    const senderName = normalizeText(message.senderName);
    if (senderName) {
      return `[${senderName}] ${body}`;
    }
  }

  return body;
}

function sourceMatchesBinding(
  sourceTransportBindingId: string | null,
  binding: BotBindingRecord,
): boolean {
  if (!sourceTransportBindingId) {
    return false;
  }

  return sourceTransportBindingId === binding.id
    || sourceTransportBindingId === buildTelegramBotTransportBindingId(binding.id);
}

export function createTelegramFanoutDeliverer(
  options: TelegramFanoutDelivererOptions,
): TransportDeliverer {
  return {
    platform: 'telegram',
    async deliver(input: TransportFanoutDeliveryInput): Promise<TransportFanoutDeliveryResult> {
      if (sourceMatchesBinding(input.sourceTransportBindingId, input.binding)) {
        return { status: 'skipped', reason: 'source_binding' };
      }

      const text = formatTelegramFanoutText(input.message, input.origin);
      if (!text) {
        return { status: 'skipped', reason: 'empty_text' };
      }

      const linkedConversation = options.telegramRelay.resolveBinding({
        roomId: input.channelId,
        bindingId: input.binding.id,
      });
      if (!linkedConversation) {
        return { status: 'skipped', reason: 'unlinked_room' };
      }

      const context = await options.resolveContext(input.binding.id);
      const selectedContext: TelegramRelayContext = {
        ...context,
        selectedBotBinding: input.binding,
      };

      for (const chunk of chunkTelegramReply(text, TELEGRAM_FANOUT_LIMIT)) {
        await options.telegramRelay.deliver({
          request: {
            operation: 'send',
            conversationId: linkedConversation.conversationId,
            chatId: linkedConversation.telegramChatId,
            text: chunk,
            disableLinkPreview: true,
          },
          context: selectedContext,
        });
      }

      return { status: 'delivered' };
    },
  };
}
