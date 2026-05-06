import type { BotBindingInboundMode, BotBindingRecord } from '../../../core/types.js';

export type TelegramRelayMode = 'boss-cat-ingress';
export type TelegramPublicIdentityMode = 'multi_cat_bindings_single_boss';
export type TelegramInboundMode = BotBindingInboundMode;
export type TelegramPollingHealth = 'healthy' | 'degraded' | 'failed' | 'stopped';

export type TelegramTransportConversationMode = 'direct_message';

export interface TelegramPollingStatus {
  bindingId: string;
  health: TelegramPollingHealth;
  lastPollTime: string | null;
  lastSuccessAt: string | null;
  lastPollError: string | null;
  consecutiveFailures: number;
  processedUpdateCount: number;
  lastProcessedUpdateId: number | null;
}

export type TelegramRoomRoutingStatus = 'placeholder' | 'linked_room';
export type TelegramAttachmentKind =
  | 'photo'
  | 'document'
  | 'audio'
  | 'voice'
  | 'video'
  | 'video_note'
  | 'animation'
  | 'sticker'
  | 'location'
  | 'contact';
export type TelegramDeliveryMediaKind = 'photo' | 'document' | 'audio' | 'video' | 'animation';
export type TelegramDeliveryOperation = 'send' | 'reply' | 'edit' | 'delete' | 'send_media';
export type TelegramDeliveryStatus = 'configured' | 'not_configured';
export type TelegramDeliveryResult = 'sent' | 'edited' | 'deleted' | 'failed';

export interface TelegramWebhookUpdate {
  update_id?: number;
  message?: TelegramMessagePayload;
  edited_message?: TelegramMessagePayload;
  callback_query?: TelegramCallbackQueryPayload;
}

export interface TelegramCallbackQueryPayload {
  id?: string;
  data?: string;
  message?: TelegramMessagePayload;
  from?: TelegramMessagePayload['from'];
}

export interface TelegramMessagePayload {
  message_id?: number;
  text?: string;
  caption?: string;
  date?: number;
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
    language_code?: string;
  };
  reply_to_message?: {
    message_id?: number;
  };
  photo?: TelegramPhotoSizePayload[];
  document?: TelegramDocumentPayload;
  audio?: TelegramAudioPayload;
  voice?: TelegramVoicePayload;
  video?: TelegramVideoPayload;
  video_note?: TelegramVideoNotePayload;
  animation?: TelegramAnimationPayload;
  sticker?: TelegramStickerPayload;
  location?: TelegramLocationPayload;
  contact?: TelegramContactPayload;
}

export interface TelegramFilePayload {
  file_id?: string;
  file_unique_id?: string;
  file_size?: number;
  mime_type?: string;
}

export interface TelegramPhotoSizePayload extends TelegramFilePayload {
  width?: number;
  height?: number;
}

export interface TelegramDocumentPayload extends TelegramFilePayload {
  file_name?: string;
}

export interface TelegramAudioPayload extends TelegramDocumentPayload {
  duration?: number;
}

export interface TelegramVoicePayload extends TelegramFilePayload {
  duration?: number;
}

export interface TelegramVideoPayload extends TelegramFilePayload {
  width?: number;
  height?: number;
  duration?: number;
}

export interface TelegramVideoNotePayload extends TelegramFilePayload {
  length?: number;
  duration?: number;
}

export interface TelegramAnimationPayload extends TelegramFilePayload {
  width?: number;
  height?: number;
  duration?: number;
  file_name?: string;
}

export interface TelegramStickerPayload extends TelegramFilePayload {
  width?: number;
  height?: number;
  emoji?: string;
}

export interface TelegramLocationPayload {
  latitude?: number;
  longitude?: number;
}

export interface TelegramContactPayload {
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  user_id?: number | string;
}

export interface TelegramNormalizedAttachment {
  kind: TelegramAttachmentKind;
  fileId: string | null;
  fileUniqueId: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  latitude: number | null;
  longitude: number | null;
  phoneNumber: string | null;
  displayName: string | null;
}

export interface TelegramNormalizedMessageSummary {
  isEdited: boolean;
  senderId: string | null;
  senderDisplayName: string | null;
  senderUsername: string | null;
  textPreview: string | null;
  attachmentCount: number;
  attachmentKinds: TelegramAttachmentKind[];
  replyToMessageId: string | null;
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
  bindingId: string | null;
  botName: string | null;
  transportConversationMode: TelegramTransportConversationMode;
  roomRoutingStatus: TelegramRoomRoutingStatus;
  linkedRoomId: string | null;
  telegramChatType: string;
  telegramChatTitle: string | null;
  telegramChatUsername: string | null;
  lastInboundMessageId: string | null;
  lastInboundAt: string | null;
  lastInboundTextPreview: string | null;
  lastInboundAttachmentKinds: TelegramAttachmentKind[];
  lastOutboundMessageId: string | null;
  lastOutboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramRelayContext {
  bossCatId: string | null;
  bossCatName: string | null;
  bossCatActorId: string | null;
  botBindings: BotBindingRecord[];
  defaultBotBinding: BotBindingRecord | null;
  selectedBotBinding: BotBindingRecord | null;
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
  availableBindings: Array<{
    id: string;
    platform: 'telegram';
    botName: string;
    catActorId: string | null;
    inboundMode: TelegramInboundMode;
    roomMode: 'chat_channel' | 'direct_message';
    status: 'active' | 'disabled';
  }>;
  publicIdentityMode: TelegramPublicIdentityMode;
  mappedConversationCount: number;
  lastProcessedUpdateId: number | null;
  webhookPath: string;
  diagnosticsPath: string;
  relayMode: TelegramRelayMode;
  roomRouting: TelegramRoomRoutingSeam;
  ingress: {
    secretTokenConfigured: boolean;
    maxBodyBytes: number;
    acceptedUpdates: number;
    ignoredUpdates: number;
    lastReceipt: TelegramWebhookReceipt | null;
  };
  delivery: {
    status: TelegramDeliveryStatus;
    supportedOperations: TelegramDeliveryOperation[];
    sentCount: number;
    repliedCount: number;
    editedCount: number;
    deletedCount: number;
    failedCount: number;
    lastReceipt: TelegramDeliveryReceipt | null;
  };
  polling: {
    activeConsumers: number;
    statuses: TelegramPollingStatus[];
  };
  note: string;
}

export interface TelegramWebhookReceipt {
  platform: 'telegram';
  status: 'accepted' | 'ignored';
  acceptedAt: string;
  updateId: number | null;
  chatId: string | null;
  messageId: string | null;
  bindingId: string | null;
  botName: string | null;
  bossCatId: string | null;
  bossCatName: string | null;
  mappedConversationId: string | null;
  messageSummary: TelegramNormalizedMessageSummary | null;
  roomRouting: TelegramRoomRoutingSeam;
  reason?:
    | 'telegram_not_bound_to_boss_cat'
    | 'duplicate_update'
    | 'unsupported_update'
    | 'unsupported_chat_type'
    | 'message_from_bot';
}

export interface TelegramWebhookIngressDiagnostics {
  secretTokenConfigured: boolean;
  maxBodyBytes: number;
  acceptedUpdates: number;
  ignoredUpdates: number;
  lastReceipt: TelegramWebhookReceipt | null;
}

export interface TelegramDeliveryRequest {
  operation: TelegramDeliveryOperation;
  conversationId?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  replyToMessageId?: string | null;
  text?: string | null;
  mediaKind?: TelegramDeliveryMediaKind | null;
  mediaUrl?: string | null;
  fileId?: string | null;
  caption?: string | null;
  parseMode?: 'HTML' | 'MarkdownV2' | null;
  disableLinkPreview?: boolean;
  replyMarkup?: TelegramInlineKeyboardMarkup | null;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramDeliveryReceipt {
  platform: 'telegram';
  operation: TelegramDeliveryOperation;
  status: TelegramDeliveryResult;
  deliveredAt: string;
  deliveryId: string;
  chatId: string | null;
  conversationId: string | null;
  messageId: string | null;
  replyToMessageId: string | null;
  mediaKind?: TelegramDeliveryMediaKind | null;
  bindingId: string | null;
  botName: string | null;
  bossCatId: string | null;
  bossCatName: string | null;
  textPreview: string | null;
  reason?:
    | 'telegram_not_bound_to_boss_cat'
    | 'delivery_client_not_configured'
    | 'runtime_dispatch_failed'
    | 'conversation_not_mapped'
    | 'chat_id_required'
    | 'message_id_required'
    | 'text_required'
    | 'media_required'
    | 'telegram_api_error';
  errorMessage?: string | null;
}

export interface TelegramDeliveryDiagnostics {
  status: TelegramDeliveryStatus;
  supportedOperations: TelegramDeliveryOperation[];
  sentCount: number;
  repliedCount: number;
  editedCount: number;
  deletedCount: number;
  failedCount: number;
  lastReceipt: TelegramDeliveryReceipt | null;
}

export interface TelegramRelayDiagnostics {
  platform: 'telegram';
  status: 'bound' | 'unbound';
  publicIdentityMode: TelegramPublicIdentityMode;
  bossCatId: string | null;
  bossCatName: string | null;
  botBinding: {
    id: string;
    platform: 'telegram';
    botName: string;
  } | null;
  availableBindings: Array<{
    id: string;
    platform: 'telegram';
    botName: string;
    catActorId: string | null;
    inboundMode: TelegramInboundMode;
    roomMode: 'chat_channel' | 'direct_message';
    status: 'active' | 'disabled';
  }>;
  relayMode: TelegramRelayMode;
  webhookPath: string;
  diagnosticsPath: string;
  lastProcessedUpdateId: number | null;
  dedupe: {
    retainedUpdateCount: number;
    maxRetainedUpdateCount: number;
  };
  roomRouting: TelegramRoomRoutingSeam;
  ingress: TelegramWebhookIngressDiagnostics;
  delivery: TelegramDeliveryDiagnostics;
  polling: {
    activeConsumers: number;
    statuses: TelegramPollingStatus[];
  };
  bindings: TelegramConversationBinding[];
  note: string;
}
