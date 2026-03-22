import type {
  TelegramConversationBinding,
  TelegramNormalizedMessageSummary,
  TelegramRoomRoutingSeam,
} from './contracts.js';
import type { TelegramRelayStore } from './store.js';

export const TELEGRAM_ROOM_ROUTING_PLACEHOLDER_NOTE =
  'Telegram ingress is durably mapped to transport inbox conversations. ' +
  'Room continuation and creation policy remains pending.';

function createPlaceholderRoomRoutingSeam(
  linkedRoomId: string | null = null,
): TelegramRoomRoutingSeam {
  return {
    transportConversationMode: 'transport_inbox',
    roomRoutingStatus: 'placeholder',
    linkedRoomId,
    note: TELEGRAM_ROOM_ROUTING_PLACEHOLDER_NOTE,
  };
}

function createPlaceholderConversationId(chatId: string): string {
  return `telegram:${chatId}`;
}

function createScopedConversationId(
  chatId: string,
  bindingId?: string | null,
): string {
  const normalizedBindingId = typeof bindingId === 'string' && bindingId.trim().length > 0
    ? bindingId.trim()
    : null;
  return normalizedBindingId
    ? `telegram:${normalizedBindingId}:${chatId}`
    : createPlaceholderConversationId(chatId);
}

export interface TelegramConversationMappingResult {
  binding: TelegramConversationBinding;
  created: boolean;
  roomRouting: TelegramRoomRoutingSeam;
}

export interface TelegramConversationMapper {
  describeRoomRouting(): TelegramRoomRoutingSeam;
  getBindingCount(): number;
  listBindings(): TelegramConversationBinding[];
    resolveChatConversation(input: {
      chatId: string;
      acceptedAt: string;
      bindingId?: string | null;
      botName?: string | null;
      chatType: string;
      chatTitle: string | null;
      chatUsername: string | null;
    messageId: string | null;
    messageSummary: TelegramNormalizedMessageSummary | null;
  }): TelegramConversationMappingResult;
}

export function createTelegramConversationMapper(
  store: TelegramRelayStore,
): TelegramConversationMapper {
  return {
    describeRoomRouting(): TelegramRoomRoutingSeam {
      return createPlaceholderRoomRoutingSeam();
    },

    getBindingCount(): number {
      return store.listBindings().length;
    },

    listBindings(): TelegramConversationBinding[] {
      return store.listBindings();
    },

    resolveChatConversation({
      chatId,
      acceptedAt,
      bindingId,
      botName,
      chatType,
      chatTitle,
      chatUsername,
      messageId,
      messageSummary,
    }: {
      chatId: string;
      acceptedAt: string;
      bindingId?: string | null;
      botName?: string | null;
      chatType: string;
      chatTitle: string | null;
      chatUsername: string | null;
      messageId: string | null;
      messageSummary: TelegramNormalizedMessageSummary | null;
    }): TelegramConversationMappingResult {
      const existingBinding = store.getBinding(chatId, bindingId);
      const binding: TelegramConversationBinding = existingBinding
        ? {
            ...existingBinding,
            bindingId: bindingId ?? existingBinding.bindingId,
            botName: botName ?? existingBinding.botName,
            telegramChatType: chatType || existingBinding.telegramChatType,
            telegramChatTitle: chatTitle,
            telegramChatUsername: chatUsername,
            lastInboundMessageId: messageId,
            lastInboundAt: acceptedAt,
            lastInboundTextPreview: messageSummary?.textPreview ?? null,
            lastInboundAttachmentKinds: messageSummary?.attachmentKinds ?? [],
            updatedAt: acceptedAt,
          }
        : {
            telegramChatId: chatId,
            conversationId: createScopedConversationId(chatId, bindingId),
            bindingId: bindingId ?? null,
            botName: botName ?? null,
            transportConversationMode: 'transport_inbox',
            roomRoutingStatus: 'placeholder',
            linkedRoomId: null,
            telegramChatType: chatType,
            telegramChatTitle: chatTitle,
            telegramChatUsername: chatUsername,
            lastInboundMessageId: messageId,
            lastInboundAt: acceptedAt,
            lastInboundTextPreview: messageSummary?.textPreview ?? null,
            lastInboundAttachmentKinds: messageSummary?.attachmentKinds ?? [],
            lastOutboundMessageId: null,
            lastOutboundAt: null,
            createdAt: acceptedAt,
            updatedAt: acceptedAt,
          };

      store.upsertBinding(binding);

      return {
        binding,
        created: existingBinding === null,
        roomRouting: createPlaceholderRoomRoutingSeam(binding.linkedRoomId),
      };
    },
  };
}
