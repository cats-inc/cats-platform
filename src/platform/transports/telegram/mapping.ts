import type {
  TelegramConversationBinding,
  TelegramNormalizedMessageSummary,
  TelegramRoomRoutingSeam,
} from './contracts.js';
import type { TelegramRelayStore } from './store.js';

export const TELEGRAM_ROOM_ROUTING_PLACEHOLDER_NOTE =
  'Telegram ingress is durably mapped to transport inbox conversations. ' +
  'Room continuation and creation policy remains pending.';

export const TELEGRAM_ROOM_ROUTING_LINKED_NOTE_PREFIX =
  'Telegram inbox is linked to the current Cats Chat room';

export function describeTelegramRoomRouting(
  binding:
    | Pick<TelegramConversationBinding, 'roomRoutingStatus' | 'linkedRoomId'>
    | null,
): TelegramRoomRoutingSeam {
  if (binding?.roomRoutingStatus === 'linked_room' && binding.linkedRoomId) {
    return {
      transportConversationMode: 'transport_inbox',
      roomRoutingStatus: 'linked_room',
      linkedRoomId: binding.linkedRoomId,
      note: `${TELEGRAM_ROOM_ROUTING_LINKED_NOTE_PREFIX} ${binding.linkedRoomId}.`,
    };
  }

  return {
    transportConversationMode: 'transport_inbox',
    roomRoutingStatus: 'placeholder',
    linkedRoomId: binding?.linkedRoomId ?? null,
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
  describeRoomRouting(bindingId?: string | null): TelegramRoomRoutingSeam;
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
  function findLatestBinding(bindingId?: string | null): TelegramConversationBinding | null {
    const normalizedBindingId = typeof bindingId === 'string' && bindingId.trim().length > 0
      ? bindingId.trim()
      : null;

    return store
      .listBindings()
      .find((binding) => (normalizedBindingId ? binding.bindingId === normalizedBindingId : true))
      ?? null;
  }

  return {
    describeRoomRouting(bindingId?: string | null): TelegramRoomRoutingSeam {
      return describeTelegramRoomRouting(findLatestBinding(bindingId));
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
        roomRouting: describeTelegramRoomRouting(binding),
      };
    },
  };
}
