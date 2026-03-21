import type { BotBindingRecord } from '../../../core/types.js';

export type TelegramRelayMode = 'boss-cat-ingress';

export type TelegramTransportConversationMode = 'transport_inbox';

export type TelegramRoomRoutingStatus = 'placeholder';

export interface TelegramWebhookUpdate {
  update_id?: number;
  message?: TelegramMessagePayload;
  edited_message?: TelegramMessagePayload;
}

export interface TelegramMessagePayload {
  message_id?: number;
  text?: string;
  chat?: {
    id?: number | string;
    type?: string;
    title?: string;
    username?: string;
  };
  from?: {
    id?: number | string;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
}

export interface TelegramRoomRoutingSeam {
  transportConversationMode: TelegramTransportConversationMode;
  roomRoutingStatus: TelegramRoomRoutingStatus;
  linkedRoomId: string | null;
  note: string;
}

export interface TelegramConversationBinding {
  telegramChatId: string;
  conversationId: string;
  transportConversationMode: TelegramTransportConversationMode;
  roomRoutingStatus: TelegramRoomRoutingStatus;
  linkedRoomId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramRelayContext {
  bossCatId: string | null;
  bossCatName: string | null;
  bossCatActorId: string | null;
  botBinding: BotBindingRecord | null;
}

export interface TelegramRelayStatus {
  platform: 'telegram';
  status: 'bound' | 'unbound';
  bossCatId: string | null;
  bossCatName: string | null;
  botBinding: {
    id: string;
    platform: 'telegram';
    botName: string;
  } | null;
  mappedConversationCount: number;
  lastProcessedUpdateId: number | null;
  webhookPath: string;
  relayMode: TelegramRelayMode;
  roomRouting: TelegramRoomRoutingSeam;
  note: string;
}

export interface TelegramWebhookReceipt {
  platform: 'telegram';
  status: 'accepted' | 'ignored';
  acceptedAt: string;
  updateId: number | null;
  chatId: string | null;
  messageId: string | null;
  bossCatId: string | null;
  bossCatName: string | null;
  mappedConversationId: string | null;
  roomRouting: TelegramRoomRoutingSeam;
  reason?:
    | 'telegram_not_bound_to_boss_cat'
    | 'duplicate_update'
    | 'unsupported_update'
    | 'unsupported_chat_type';
}
