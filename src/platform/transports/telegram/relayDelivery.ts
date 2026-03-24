import { randomUUID } from 'node:crypto';

import type { BotBindingRecord } from '../../../core/types.js';
import type {
  TelegramConversationBinding,
  TelegramDeliveryReceipt,
  TelegramDeliveryRequest,
  TelegramRelayContext,
  TelegramWebhookReceipt,
} from './contracts.js';
import type { TelegramDeliveryClient } from './delivery.js';
import type { TelegramConversationMapper } from './mapping.js';
import { normalizeTelegramDeliveryTextPreview } from './normalization.js';
import type { TelegramRelayStore } from './store.js';
import { readTelegramString, resolveActiveTelegramBinding } from './utils.js';

export function createBridgeDispatchFailureReceipt(input: {
  receipt: TelegramWebhookReceipt;
  context: TelegramRelayContext;
  binding: BotBindingRecord | null;
  deliveredAt: string;
  errorMessage: string;
}): TelegramDeliveryReceipt {
  return {
    platform: 'telegram',
    operation: input.receipt.messageId ? 'reply' : 'send',
    status: 'failed',
    deliveredAt: input.deliveredAt,
    deliveryId: randomUUID(),
    chatId: input.receipt.chatId,
    conversationId: input.receipt.mappedConversationId,
    messageId: null,
    replyToMessageId: input.receipt.messageId,
    bindingId: input.binding?.id ?? input.receipt.bindingId ?? null,
    botName: input.binding?.botName ?? input.receipt.botName ?? null,
    bossCatId: input.context.bossCatId,
    bossCatName: input.context.bossCatName,
    textPreview: null,
    reason: 'runtime_dispatch_failed',
    errorMessage: input.errorMessage,
  };
}

interface TelegramDeliveryBaseReceipt {
  platform: 'telegram';
  operation: TelegramDeliveryRequest['operation'];
  deliveredAt: string;
  deliveryId: string;
  bindingId: string | null;
  botName: string | null;
  bossCatId: string | null;
  bossCatName: string | null;
  replyToMessageId: string | null;
  textPreview: string | null;
}

function buildTelegramDeliveryBaseReceipt(input: {
  request: TelegramDeliveryRequest;
  context: TelegramRelayContext;
  deliveredAt: string;
}): TelegramDeliveryBaseReceipt {
  return {
    platform: 'telegram',
    operation: input.request.operation,
    deliveredAt: input.deliveredAt,
    deliveryId: randomUUID(),
    bindingId: null,
    botName: null,
    bossCatId: input.context.bossCatId,
    bossCatName: input.context.bossCatName,
    replyToMessageId: readTelegramString(input.request.replyToMessageId),
    textPreview: normalizeTelegramDeliveryTextPreview(input.request.text),
  };
}

function recordFailedTelegramDelivery(
  store: TelegramRelayStore,
  input: {
    baseReceipt: TelegramDeliveryBaseReceipt;
    request: TelegramDeliveryRequest;
    reason: TelegramDeliveryReceipt['reason'];
    bindingId?: string | null;
    botName?: string | null;
    chatId?: string | null;
    conversationId?: string | null;
    messageId?: string | null;
    errorMessage?: string | null;
  },
): TelegramDeliveryReceipt {
  const receipt: TelegramDeliveryReceipt = {
    ...input.baseReceipt,
    bindingId: input.bindingId ?? null,
    botName: input.botName ?? null,
    status: 'failed',
    chatId: input.chatId ?? readTelegramString(input.request.chatId),
    conversationId: input.conversationId ?? readTelegramString(input.request.conversationId),
    messageId: input.messageId ?? readTelegramString(input.request.messageId),
    reason: input.reason,
    errorMessage: input.errorMessage ?? null,
  };
  store.recordDeliveryReceipt(receipt);
  return receipt;
}

function buildPlaceholderBinding(input: {
  chatId: string;
  conversationId: string;
  deliveryBinding: BotBindingRecord | null;
  deliveredAt: string;
  messageId: string | null;
}): TelegramConversationBinding {
  return {
    telegramChatId: input.chatId,
    conversationId: input.conversationId,
    bindingId: input.deliveryBinding?.id ?? null,
    botName: input.deliveryBinding?.botName ?? null,
    transportConversationMode: 'direct_cat_chat',
    roomRoutingStatus: 'placeholder',
    linkedRoomId: null,
    telegramChatType: 'private',
    telegramChatTitle: null,
    telegramChatUsername: null,
    lastInboundMessageId: null,
    lastInboundAt: null,
    lastInboundTextPreview: null,
    lastInboundAttachmentKinds: [],
    lastOutboundMessageId: input.messageId,
    lastOutboundAt: input.deliveredAt,
    createdAt: input.deliveredAt,
    updatedAt: input.deliveredAt,
  };
}

export interface DeliverTelegramRequestOptions {
  now: () => Date;
  store: TelegramRelayStore;
  conversationMapper: TelegramConversationMapper;
  deliveryClient: TelegramDeliveryClient | null;
  resolveDeliveryClient?: (binding: BotBindingRecord | null) => TelegramDeliveryClient | null;
  request: TelegramDeliveryRequest;
  context: TelegramRelayContext;
}

export async function deliverTelegramRequest(
  options: DeliverTelegramRequestOptions,
): Promise<TelegramDeliveryReceipt> {
  const deliveredAt = options.now().toISOString();
  const baseReceipt = buildTelegramDeliveryBaseReceipt({
    request: options.request,
    context: options.context,
    deliveredAt,
  });
  const activeBinding = resolveActiveTelegramBinding(options.context);
  const scopedBindingId = options.context.selectedBotBinding?.id ?? null;
  const scopedBotName = options.context.selectedBotBinding?.botName ?? activeBinding?.botName ?? null;

  if (!activeBinding) {
    return recordFailedTelegramDelivery(options.store, {
      baseReceipt,
      request: options.request,
      reason: 'telegram_not_bound_to_boss_cat',
    });
  }

  if (
    (options.request.operation === 'send'
      || options.request.operation === 'reply'
      || options.request.operation === 'edit')
    && !baseReceipt.textPreview
  ) {
    return recordFailedTelegramDelivery(options.store, {
      baseReceipt,
      request: options.request,
      reason: 'text_required',
    });
  }

  if (options.request.operation === 'reply' && !baseReceipt.replyToMessageId) {
    return recordFailedTelegramDelivery(options.store, {
      baseReceipt,
      request: options.request,
      reason: 'message_id_required',
    });
  }

  if (
    (options.request.operation === 'edit' || options.request.operation === 'delete')
    && !readTelegramString(options.request.messageId)
  ) {
    return recordFailedTelegramDelivery(options.store, {
      baseReceipt,
      request: options.request,
      reason: 'message_id_required',
      messageId: null,
    });
  }

  let binding = options.request.chatId
    ? options.store.getBinding(options.request.chatId, scopedBindingId)
    : null;
  if (!binding && options.request.chatId) {
    binding = options.conversationMapper.resolveChatConversation({
      chatId: options.request.chatId,
      acceptedAt: deliveredAt,
      bindingId: scopedBindingId,
      botName: scopedBotName,
      chatType: 'private',
      chatTitle: null,
      chatUsername: null,
      messageId: null,
      messageSummary: null,
    }).binding;
  }

  if (!binding && options.request.conversationId) {
    binding = options.store.getBindingByConversationId(options.request.conversationId);
  }

  const deliveryBinding = binding?.bindingId
    ? options.context.botBindings.find((candidate) => candidate.id === binding.bindingId) ?? activeBinding
    : activeBinding;
  const activeDeliveryClient = options.resolveDeliveryClient?.(deliveryBinding ?? null)
    ?? options.deliveryClient;
  if (!activeDeliveryClient) {
    return recordFailedTelegramDelivery(options.store, {
      baseReceipt,
      request: options.request,
      bindingId: deliveryBinding?.id ?? null,
      botName: deliveryBinding?.botName ?? null,
      chatId: readTelegramString(options.request.chatId),
      conversationId: binding?.conversationId ?? readTelegramString(options.request.conversationId),
      reason: 'delivery_client_not_configured',
    });
  }

  const chatId = binding?.telegramChatId ?? readTelegramString(options.request.chatId);
  if (!chatId) {
    return recordFailedTelegramDelivery(options.store, {
      baseReceipt,
      request: options.request,
      bindingId: deliveryBinding?.id ?? null,
      botName: deliveryBinding?.botName ?? null,
      chatId: null,
      conversationId: binding?.conversationId ?? readTelegramString(options.request.conversationId),
      reason: options.request.conversationId ? 'conversation_not_mapped' : 'chat_id_required',
    });
  }

  const conversationId = binding?.conversationId ?? `telegram:${chatId}`;

  try {
    const result = await activeDeliveryClient.deliver({
      ...options.request,
      chatId,
    });
    const status = options.request.operation === 'edit'
      ? 'edited'
      : options.request.operation === 'delete'
        ? 'deleted'
        : 'sent';
    const receipt: TelegramDeliveryReceipt = {
      ...baseReceipt,
      bindingId: deliveryBinding?.id ?? null,
      botName: deliveryBinding?.botName ?? null,
      status: result.ok ? status : 'failed',
      chatId,
      conversationId,
      messageId: result.messageId ?? readTelegramString(options.request.messageId),
      reason: result.ok ? undefined : 'telegram_api_error',
      errorMessage: result.ok ? null : result.description ?? null,
    };

    if (result.ok) {
      const nextBinding = binding
        ? {
            ...binding,
            lastOutboundMessageId: receipt.messageId,
            lastOutboundAt: deliveredAt,
            updatedAt: deliveredAt,
          }
        : buildPlaceholderBinding({
            chatId,
            conversationId,
            deliveryBinding: deliveryBinding ?? null,
            deliveredAt,
            messageId: receipt.messageId,
          });
      options.store.upsertBinding(nextBinding);
    }

    options.store.recordDeliveryReceipt(receipt);
    return receipt;
  } catch (error) {
    return recordFailedTelegramDelivery(options.store, {
      baseReceipt,
      request: options.request,
      bindingId: deliveryBinding?.id ?? null,
      botName: deliveryBinding?.botName ?? null,
      chatId,
      conversationId,
      reason: 'telegram_api_error',
      errorMessage: error instanceof Error ? error.message : 'Telegram delivery failed',
    });
  }
}
