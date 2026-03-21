import type {
  TelegramConversationBinding,
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
  resolveChatConversation(input: {
    chatId: string;
    acceptedAt: string;
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

    resolveChatConversation({
      chatId,
      acceptedAt,
    }: {
      chatId: string;
      acceptedAt: string;
    }): TelegramConversationMappingResult {
      const existingBinding = store.getBinding(chatId);
      const binding: TelegramConversationBinding = existingBinding
        ? {
            ...existingBinding,
            updatedAt: acceptedAt,
          }
        : {
            telegramChatId: chatId,
            conversationId: createPlaceholderConversationId(chatId),
            transportConversationMode: 'transport_inbox',
            roomRoutingStatus: 'placeholder',
            linkedRoomId: null,
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
