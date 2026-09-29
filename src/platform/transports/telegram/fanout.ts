import type { BotBindingRecord } from '../../../core/types.js';
import {
  buildTelegramBotTransportBindingId,
} from '../../../shared/chatCoreIds.js';
import type { ChatMessage, MessageOrigin } from '../../../products/chat/api/contracts.js';
import {
  TELEGRAM_REPLY_LIMIT,
  chunkTelegramReply,
} from './chunking.js';
import type { TelegramConversationBinding, TelegramRelayContext } from './contracts.js';
import type { TelegramRelay } from './relay/index.js';
import type {
  TransportDeliverer,
  TransportFanoutDeliveryInput,
  TransportFanoutDeliveryResult,
} from '../fanout/registry.js';

export interface TelegramFanoutDelivererOptions {
  telegramRelay: TelegramRelay;
  resolveContext(bindingId: string): Promise<TelegramRelayContext>;
}

/** Telegram rejects photo captions longer than this; longer text follows the photo. */
const TELEGRAM_CAPTION_LIMIT = 1024;

/** Desktop shows a lane image through this leading block; Telegram gets the photo itself. */
const ATTACHMENT_BLOCK_PATTERN = /^\[Attached files in working directory:\]\n(?:- [^\n]+\n)+\n?/u;

/**
 * Metadata key for a local image a message carries to transports (SPEC-124
 * FR-30). Generic on purpose: the fanout does not know who produced it.
 */
export const TRANSPORT_MEDIA_METADATA_KEY = 'transportMedia';

interface TransportPhoto {
  path: string;
  fileName: string;
}

function readTransportPhoto(message: Pick<ChatMessage, 'metadata'>): TransportPhoto | null {
  const media = message.metadata?.[TRANSPORT_MEDIA_METADATA_KEY];
  if (!media || typeof media !== 'object') {
    return null;
  }
  const record = media as Record<string, unknown>;
  return record.kind === 'photo'
    && typeof record.path === 'string' && record.path.length > 0
    && typeof record.fileName === 'string' && record.fileName.length > 0
    ? { path: record.path, fileName: record.fileName }
    : null;
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

function resolveLinkedConversation(
  relay: TelegramRelay,
  input: TransportFanoutDeliveryInput,
): TelegramConversationBinding | null {
  const linkedConversation = relay.resolveBinding({
    roomId: input.channelId,
    bindingId: input.binding.id,
  });
  if (linkedConversation) {
    return linkedConversation;
  }

  // Auto-link only when there is exactly one unlinked conversation for this
  // binding. If multiple unlinked conversations exist (bot used by more than
  // one Telegram user), we cannot safely guess which one belongs to the owner,
  // so we skip rather than risk leaking web-originated messages to a stranger.
  const candidate = relay.findSoleUnlinkedConversation(input.binding.id);
  if (!candidate) {
    return null;
  }

  return relay.linkRoom({
    conversationId: candidate.conversationId,
    chatId: candidate.telegramChatId,
    bindingId: input.binding.id,
    roomId: input.channelId,
  });
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

      const photo = readTransportPhoto(input.message);
      const text = formatTelegramFanoutText(
        photo
          ? { ...input.message, body: input.message.body.replace(ATTACHMENT_BLOCK_PATTERN, '') }
          : input.message,
        input.origin,
      );
      if (!text && !photo) {
        return { status: 'skipped', reason: 'empty_text' };
      }

      const linkedConversation = resolveLinkedConversation(options.telegramRelay, input);
      if (!linkedConversation) {
        return { status: 'skipped', reason: 'unlinked_room' };
      }

      const context = await options.resolveContext(input.binding.id);
      const selectedContext: TelegramRelayContext = {
        ...context,
        selectedBotBinding: input.binding,
      };

      const captioned = photo !== null && text !== null && text.length <= TELEGRAM_CAPTION_LIMIT;
      if (photo) {
        await options.telegramRelay.deliver({
          request: {
            operation: 'send_media',
            mediaKind: 'photo',
            conversationId: linkedConversation.conversationId,
            chatId: linkedConversation.telegramChatId,
            mediaFile: photo,
            caption: captioned ? text : null,
          },
          context: selectedContext,
        });
      }
      const remainingText = captioned ? null : text;
      for (const chunk of remainingText ? chunkTelegramReply(remainingText, TELEGRAM_REPLY_LIMIT) : []) {
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
