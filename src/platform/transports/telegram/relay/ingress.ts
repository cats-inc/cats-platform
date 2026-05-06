import type { BotBindingRecord } from '../../../../core/types.js';
import type {
  TelegramConversationBinding,
  TelegramMessagePayload,
  TelegramRelayContext,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from '../contracts.js';
import { describeTelegramRoomRouting, type TelegramConversationMapper } from '../mapping.js';
import { normalizeTelegramMessageSummary } from '../normalization.js';
import type { TelegramRelayStore } from '../store/index.js';
import {
  pickTelegramMessage,
  readTelegramString,
  resolveActiveTelegramBinding,
} from '../utils.js';

interface BuildTelegramWebhookReceiptInput {
  context: TelegramRelayContext;
  binding: BotBindingRecord | null;
  acceptedAt: string;
  updateId: number | null;
  chatId: string | null;
  messageId: string | null;
  mappedConversationId: string | null;
  message: TelegramMessagePayload | null;
  isEdited: boolean;
  status: TelegramWebhookReceipt['status'];
  roomRouting: TelegramWebhookReceipt['roomRouting'];
  reason?: TelegramWebhookReceipt['reason'];
}

function buildTelegramWebhookReceipt(input: BuildTelegramWebhookReceiptInput): TelegramWebhookReceipt {
  const messageSummary = input.message
    ? normalizeTelegramMessageSummary(input.message, { isEdited: input.isEdited })
    : null;

  return {
    platform: 'telegram',
    status: input.status,
    acceptedAt: input.acceptedAt,
    updateId: input.updateId,
    chatId: input.chatId,
    messageId: input.messageId,
    bindingId: input.binding?.id ?? null,
    botName: input.binding?.botName ?? null,
    bossCatId: input.context.bossCatId,
    bossCatName: input.context.bossCatName,
    mappedConversationId: input.mappedConversationId,
    messageSummary,
    roomRouting: input.roomRouting,
    reason: input.reason,
  };
}

function recordTelegramIngressReceipt(
  store: TelegramRelayStore,
  input: BuildTelegramWebhookReceiptInput,
): TelegramWebhookReceipt {
  const receipt = buildTelegramWebhookReceipt(input);
  store.recordIngressReceipt(receipt);
  return receipt;
}

export interface ReceiveTelegramUpdateOptions {
  now: () => Date;
  store: TelegramRelayStore;
  conversationMapper: TelegramConversationMapper;
  context: TelegramRelayContext;
  update: TelegramWebhookUpdate;
}

export function receiveTelegramUpdate(options: ReceiveTelegramUpdateOptions): TelegramWebhookReceipt {
  const acceptedAt = options.now().toISOString();
  const updateId = typeof options.update.update_id === 'number' ? options.update.update_id : null;
  const pickedMessage = pickTelegramMessage(options.update);
  const message = pickedMessage.message;
  const sender = pickedMessage.sender;
  const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
  const messageId = typeof message?.message_id === 'number' ? String(message.message_id) : null;
  const activeBinding = resolveActiveTelegramBinding(options.context);
  const scopedBindingId = options.context.selectedBotBinding?.id ?? null;
  const scopedBotName = options.context.selectedBotBinding?.botName ?? activeBinding?.botName ?? null;
  const roomRouting = options.conversationMapper.describeRoomRouting(scopedBindingId);

  if (!activeBinding) {
    return recordTelegramIngressReceipt(options.store, {
      context: options.context,
      binding: null,
      acceptedAt,
      updateId,
      chatId,
      messageId,
      mappedConversationId: null,
      message,
      isEdited: pickedMessage.isEdited,
      status: 'ignored',
      roomRouting,
      reason: 'telegram_not_bound_to_boss_cat',
    });
  }

  if (updateId !== null && options.store.hasProcessedUpdate(updateId)) {
    return recordTelegramIngressReceipt(options.store, {
      context: options.context,
      binding: activeBinding,
      acceptedAt,
      updateId,
      chatId,
      messageId,
      mappedConversationId: chatId
        ? options.store.getBinding(chatId, scopedBindingId)?.conversationId ?? null
        : null,
      message,
      isEdited: pickedMessage.isEdited,
      status: 'ignored',
      roomRouting,
      reason: 'duplicate_update',
    });
  }

  if (!message || !chatId) {
    return recordTelegramIngressReceipt(options.store, {
      context: options.context,
      binding: activeBinding,
      acceptedAt,
      updateId,
      chatId,
      messageId,
      mappedConversationId: null,
      message,
      isEdited: pickedMessage.isEdited,
      status: 'ignored',
      roomRouting,
      reason: 'unsupported_update',
    });
  }

  if (sender?.is_bot === true) {
    return recordTelegramIngressReceipt(options.store, {
      context: options.context,
      binding: activeBinding,
      acceptedAt,
      updateId,
      chatId,
      messageId,
      mappedConversationId: null,
      message,
      isEdited: pickedMessage.isEdited,
      status: 'ignored',
      roomRouting,
      reason: 'message_from_bot',
    });
  }

  if (message.chat?.type !== 'private') {
    return recordTelegramIngressReceipt(options.store, {
      context: options.context,
      binding: activeBinding,
      acceptedAt,
      updateId,
      chatId,
      messageId,
      mappedConversationId: null,
      message,
      isEdited: pickedMessage.isEdited,
      status: 'ignored',
      roomRouting,
      reason: 'unsupported_chat_type',
    });
  }

  const mapping = options.conversationMapper.resolveChatConversation({
    chatId,
    acceptedAt,
    bindingId: scopedBindingId,
    botName: scopedBotName,
    chatType: message.chat?.type ?? 'private',
    chatTitle: readTelegramString(message.chat?.title),
    chatUsername: readTelegramString(message.chat?.username),
    messageId,
    messageSummary: normalizeTelegramMessageSummary(message, {
      isEdited: pickedMessage.isEdited,
    }),
  });

  if (updateId !== null) {
    options.store.markProcessedUpdate(updateId);
  }

  return recordTelegramIngressReceipt(options.store, {
    context: options.context,
    binding: activeBinding,
    acceptedAt,
    updateId,
    chatId,
    messageId,
    mappedConversationId: mapping.binding.conversationId,
    message,
    isEdited: pickedMessage.isEdited,
    status: 'accepted',
    roomRouting: describeTelegramRoomRouting(mapping.binding),
  });
}

export function linkTelegramRoom(input: {
  store: TelegramRelayStore;
  binding: TelegramConversationBinding;
  roomId: string;
  linkedAt: string;
}): TelegramConversationBinding {
  const nextBinding: TelegramConversationBinding = {
    ...input.binding,
    linkedRoomId: input.roomId,
    roomRoutingStatus: 'linked_room',
    updatedAt: input.linkedAt,
  };
  input.store.upsertBinding(nextBinding);
  return nextBinding;
}
