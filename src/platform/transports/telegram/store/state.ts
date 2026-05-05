import type {
  TelegramAttachmentKind,
  TelegramConversationBinding,
  TelegramDeliveryReceipt,
  TelegramWebhookReceipt,
} from '../contracts.js';
import type { TelegramDeliveryStatsSnapshot, TelegramIngressStatsSnapshot } from './index.js';

export interface PersistedTelegramRelayState {
  version: 2;
  bindings: TelegramConversationBinding[];
  processedUpdateIds: number[];
  lastProcessedUpdateId: number | null;
  ingress: TelegramIngressStatsSnapshot;
  delivery: TelegramDeliveryStatsSnapshot;
}

const ATTACHMENT_KINDS = new Set<string>([
  'photo',
  'document',
  'audio',
  'voice',
  'video',
  'video_note',
  'animation',
  'sticker',
  'location',
  'contact',
]);

const WEBHOOK_REASONS = new Set<NonNullable<TelegramWebhookReceipt['reason']>>([
  'telegram_not_bound_to_boss_cat',
  'duplicate_update',
  'unsupported_update',
  'unsupported_chat_type',
  'message_from_bot',
]);

const DELIVERY_OPERATIONS = new Set<TelegramDeliveryReceipt['operation']>([
  'send',
  'reply',
  'edit',
  'delete',
]);
const DELIVERY_STATUSES = new Set<TelegramDeliveryReceipt['status']>([
  'sent',
  'edited',
  'deleted',
  'failed',
]);
const DELIVERY_REASONS = new Set<NonNullable<TelegramDeliveryReceipt['reason']>>([
  'telegram_not_bound_to_boss_cat',
  'delivery_client_not_configured',
  'runtime_dispatch_failed',
  'conversation_not_mapped',
  'chat_id_required',
  'message_id_required',
  'text_required',
  'telegram_api_error',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readAttachmentKinds(value: unknown): TelegramAttachmentKind[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is TelegramAttachmentKind => typeof item === 'string' && ATTACHMENT_KINDS.has(item),
  );
}

function readRoomRoutingStatus(
  value: unknown,
): TelegramConversationBinding['roomRoutingStatus'] | null {
  return value === 'linked_room' || value === 'placeholder'
    ? value
    : null;
}

function toRoomRouting(rawValue: unknown): TelegramWebhookReceipt['roomRouting'] | null {
  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const transportConversationMode = record.transportConversationMode;
  const roomRoutingStatus = readRoomRoutingStatus(record.roomRoutingStatus);
  const linkedRoomId = record.linkedRoomId;
  const note = readString(record.note);

  if (
    transportConversationMode !== 'direct_message'
    || !roomRoutingStatus
    || !(typeof linkedRoomId === 'string' || linkedRoomId === null)
    || !note
  ) {
    return null;
  }

  return {
    transportConversationMode,
    roomRoutingStatus,
    linkedRoomId: typeof linkedRoomId === 'string' ? linkedRoomId : null,
    note,
  };
}

function toMessageSummary(
  rawValue: unknown,
): TelegramWebhookReceipt['messageSummary'] {
  if (rawValue == null) {
    return null;
  }

  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const attachmentKinds = readAttachmentKinds(record.attachmentKinds);
  const attachmentCount = readNumber(record.attachmentCount);
  const isEdited = typeof record.isEdited === 'boolean' ? record.isEdited : null;

  if (attachmentCount === null || isEdited === null) {
    return null;
  }

  return {
    isEdited,
    senderId: readString(record.senderId),
    senderDisplayName: readString(record.senderDisplayName),
    senderUsername: readString(record.senderUsername),
    textPreview: readString(record.textPreview),
    attachmentCount,
    attachmentKinds,
    replyToMessageId: readString(record.replyToMessageId),
  };
}

function toWebhookReceipt(rawValue: unknown): TelegramWebhookReceipt | null {
  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const roomRouting = toRoomRouting(record.roomRouting);
  const acceptedAt = readString(record.acceptedAt);
  const status = record.status === 'accepted' || record.status === 'ignored'
    ? record.status
    : null;

  if (
    record.platform !== 'telegram'
    || !status
    || !acceptedAt
    || !roomRouting
  ) {
    return null;
  }

  const reason = typeof record.reason === 'string'
    && WEBHOOK_REASONS.has(record.reason as NonNullable<TelegramWebhookReceipt['reason']>)
    ? record.reason as NonNullable<TelegramWebhookReceipt['reason']>
    : undefined;

  return {
    platform: 'telegram',
    status,
    acceptedAt,
    updateId: readNumber(record.updateId),
    chatId: readString(record.chatId),
    messageId: readString(record.messageId),
    bindingId: readString(record.bindingId),
    botName: readString(record.botName),
    bossCatId: readString(record.bossCatId),
    bossCatName: readString(record.bossCatName),
    mappedConversationId: readString(record.mappedConversationId),
    messageSummary: toMessageSummary(record.messageSummary),
    roomRouting,
    reason,
  };
}

function toDeliveryReceipt(rawValue: unknown): TelegramDeliveryReceipt | null {
  const record = asRecord(rawValue);
  if (!record) {
    return null;
  }

  const operation = typeof record.operation === 'string'
    && DELIVERY_OPERATIONS.has(record.operation as TelegramDeliveryReceipt['operation'])
    ? record.operation as TelegramDeliveryReceipt['operation']
    : null;
  const status = typeof record.status === 'string'
    && DELIVERY_STATUSES.has(record.status as TelegramDeliveryReceipt['status'])
    ? record.status as TelegramDeliveryReceipt['status']
    : null;
  const deliveredAt = readString(record.deliveredAt);
  const deliveryId = readString(record.deliveryId);

  if (
    record.platform !== 'telegram'
    || !operation
    || !status
    || !deliveredAt
    || !deliveryId
  ) {
    return null;
  }

  const reason = typeof record.reason === 'string'
    && DELIVERY_REASONS.has(record.reason as NonNullable<TelegramDeliveryReceipt['reason']>)
    ? record.reason as NonNullable<TelegramDeliveryReceipt['reason']>
    : undefined;

  return {
    platform: 'telegram',
    operation,
    status,
    deliveredAt,
    deliveryId,
    chatId: readString(record.chatId),
    conversationId: readString(record.conversationId),
    messageId: readString(record.messageId),
    replyToMessageId: readString(record.replyToMessageId),
    bindingId: readString(record.bindingId),
    botName: readString(record.botName),
    bossCatId: readString(record.bossCatId),
    bossCatName: readString(record.bossCatName),
    textPreview: readString(record.textPreview),
    reason,
    errorMessage: readString(record.errorMessage),
  };
}

function toBinding(rawBinding: unknown): TelegramConversationBinding | null {
  if (!rawBinding || typeof rawBinding !== 'object' || Array.isArray(rawBinding)) {
    return null;
  }

  const binding = rawBinding as Record<string, unknown>;
  const telegramChatId = readString(binding.telegramChatId);
  const conversationId = readString(binding.conversationId);
  const transportConversationMode = binding.transportConversationMode;
  const roomRoutingStatus = readRoomRoutingStatus(binding.roomRoutingStatus);
  const linkedRoomId = binding.linkedRoomId;
  const createdAt = readString(binding.createdAt);
  const updatedAt = readString(binding.updatedAt);

  if (
    !telegramChatId
    || !conversationId
    || transportConversationMode !== 'direct_message'
    || !roomRoutingStatus
    || !(typeof linkedRoomId === 'string' || linkedRoomId === null || linkedRoomId === undefined)
    || !createdAt
    || !updatedAt
  ) {
    return null;
  }

  return {
    telegramChatId,
    conversationId,
    bindingId: readString(binding.bindingId),
    botName: readString(binding.botName),
    transportConversationMode,
    roomRoutingStatus,
    linkedRoomId: typeof linkedRoomId === 'string' && linkedRoomId.trim().length > 0
      ? linkedRoomId
      : null,
    telegramChatType: readString(binding.telegramChatType) ?? 'private',
    telegramChatTitle: readString(binding.telegramChatTitle),
    telegramChatUsername: readString(binding.telegramChatUsername),
    lastInboundMessageId: readString(binding.lastInboundMessageId),
    lastInboundAt: readString(binding.lastInboundAt),
    lastInboundTextPreview: readString(binding.lastInboundTextPreview),
    lastInboundAttachmentKinds: readAttachmentKinds(binding.lastInboundAttachmentKinds),
    lastOutboundMessageId: readString(binding.lastOutboundMessageId),
    lastOutboundAt: readString(binding.lastOutboundAt),
    createdAt,
    updatedAt,
  };
}

export function createEmptyPersistedTelegramRelayState(): PersistedTelegramRelayState {
  return {
    version: 2,
    bindings: [],
    processedUpdateIds: [],
    lastProcessedUpdateId: null,
    ingress: {
      acceptedCount: 0,
      ignoredCount: 0,
      lastReceipt: null,
    },
    delivery: {
      sentCount: 0,
      repliedCount: 0,
      editedCount: 0,
      deletedCount: 0,
      failedCount: 0,
      lastReceipt: null,
    },
  };
}

export function asPersistedTelegramRelayState(
  payload: unknown,
  maxProcessedUpdates: number,
): PersistedTelegramRelayState {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return createEmptyPersistedTelegramRelayState();
  }

  const record = payload as Record<string, unknown>;
  const fallback = createEmptyPersistedTelegramRelayState();
  const bindings = Array.isArray(record.bindings)
    ? record.bindings
        .map((rawBinding) => toBinding(rawBinding))
        .filter((binding): binding is TelegramConversationBinding => binding !== null)
    : [];
  const processedUpdateIds = Array.isArray(record.processedUpdateIds)
    ? record.processedUpdateIds
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        .slice(-maxProcessedUpdates)
    : [];
  const ingressRecord = asRecord(record.ingress);
  const deliveryRecord = asRecord(record.delivery);

  return {
    version: 2,
    bindings,
    processedUpdateIds,
    lastProcessedUpdateId:
      typeof record.lastProcessedUpdateId === 'number'
      && Number.isFinite(record.lastProcessedUpdateId)
        ? record.lastProcessedUpdateId
        : null,
    ingress: {
      acceptedCount: readNumber(ingressRecord?.acceptedCount) ?? fallback.ingress.acceptedCount,
      ignoredCount: readNumber(ingressRecord?.ignoredCount) ?? fallback.ingress.ignoredCount,
      lastReceipt: toWebhookReceipt(ingressRecord?.lastReceipt),
    },
    delivery: {
      sentCount: readNumber(deliveryRecord?.sentCount) ?? fallback.delivery.sentCount,
      repliedCount: readNumber(deliveryRecord?.repliedCount) ?? fallback.delivery.repliedCount,
      editedCount: readNumber(deliveryRecord?.editedCount) ?? fallback.delivery.editedCount,
      deletedCount: readNumber(deliveryRecord?.deletedCount) ?? fallback.delivery.deletedCount,
      failedCount: readNumber(deliveryRecord?.failedCount) ?? fallback.delivery.failedCount,
      lastReceipt: toDeliveryReceipt(deliveryRecord?.lastReceipt),
    },
  };
}
