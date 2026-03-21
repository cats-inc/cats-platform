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
      chatType,
      chatTitle,
      chatUsername,
      messageId,
      messageSummary,
    }: {
      chatId: string;
      acceptedAt: string;
      chatType: string;
      chatTitle: string | null;
      chatUsername: string | null;
      messageId: string | null;
      messageSummary: TelegramNormalizedMessageSummary | null;
    }): TelegramConversationMappingResult {
      const existingBinding = store.getBinding(chatId);
      const binding: TelegramConversationBinding = existingBinding
        ? {
            ...existingBinding,
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
            conversationId: createPlaceholderConversationId(chatId),
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
