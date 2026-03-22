import { randomUUID } from 'node:crypto';

import type {
  TelegramDeliveryReceipt,
  TelegramDeliveryRequest,
  TelegramMessagePayload,
  TelegramRelayContext,
  TelegramRelayDiagnostics,
  TelegramRelayStatus,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from './contracts.js';
import type { TelegramDeliveryClient } from './delivery.js';
import {
  createTelegramConversationMapper,
  type TelegramConversationMapper,
} from './mapping.js';
import {
  normalizeTelegramDeliveryTextPreview,
  normalizeTelegramMessageSummary,
} from './normalization.js';
import { InMemoryTelegramRelayStore, type TelegramRelayStore } from './store.js';

export interface TelegramWebhookIngressConfig {
  secretToken: string | null;
  maxBodyBytes: number;
}

export interface TelegramRelay {
  getIngressConfig(): TelegramWebhookIngressConfig;
  getStatus(context: TelegramRelayContext): TelegramRelayStatus;
  getDiagnostics(context: TelegramRelayContext): TelegramRelayDiagnostics;
  receiveUpdate(input: {
    update: TelegramWebhookUpdate;
    context: TelegramRelayContext;
  }): TelegramWebhookReceipt;
  deliver(input: {
    request: TelegramDeliveryRequest;
    context: TelegramRelayContext;
  }): Promise<TelegramDeliveryReceipt>;
}

interface TelegramRelayOptions {
  now?: () => Date;
  store?: TelegramRelayStore;
  webhookPath?: string;
  diagnosticsPath?: string;
  webhookSecretToken?: string | null;
  maxBodyBytes?: number;
  conversationMapper?: TelegramConversationMapper;
  deliveryClient?: TelegramDeliveryClient | null;
}

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const SUPPORTED_DELIVERY_OPERATIONS = ['send', 'reply', 'edit', 'delete'] as const;

function pickMessage(
  update: TelegramWebhookUpdate,
): { message: TelegramMessagePayload | null; isEdited: boolean } {
  if (update.message) {
    return { message: update.message, isEdited: false };
  }
  if (update.edited_message) {
    return { message: update.edited_message, isEdited: true };
  }
  return { message: null, isEdited: false };
}

function hasActiveBossCatBinding(context: TelegramRelayContext): boolean {
  return Boolean(
    context.bossCatId
    && context.bossCatActorId
    && context.botBinding
    && context.botBinding.status === 'active'
    && context.botBinding.bossCatActorId === context.bossCatActorId,
  );
}

function buildStatusNote(input: {
  context: TelegramRelayContext;
  boundToBossCat: boolean;
  deliveryConfigured: boolean;
}): string {
  if (!input.context.bossCatId) {
    return 'No Boss Cat is configured for Telegram ingress.';
  }

  if (!input.boundToBossCat) {
    return 'No Telegram bot binding is configured for the current Boss Cat.';
  }

  if (!input.deliveryConfigured) {
    return 'Telegram ingress is wired to Boss Cat. Outbound delivery remains unconfigured.';
  }

  return 'Telegram ingress and delivery are both pinned to the single public Boss Cat identity.';
}

function readString(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function createTelegramRelay(options: TelegramRelayOptions = {}): TelegramRelay {
  const now = options.now ?? (() => new Date());
  const store = options.store ?? new InMemoryTelegramRelayStore();
  const conversationMapper = options.conversationMapper ?? createTelegramConversationMapper(store);
  const webhookPath = options.webhookPath ?? '/api/transports/telegram/webhook';
  const diagnosticsPath = options.diagnosticsPath ?? '/api/transports/telegram/diagnostics';
  const webhookSecretToken = readString(options.webhookSecretToken);
  const maxBodyBytes = Number.isFinite(options.maxBodyBytes)
    ? Math.max(1024, Number(options.maxBodyBytes))
    : DEFAULT_MAX_BODY_BYTES;
  const deliveryClient = options.deliveryClient ?? null;

  function getBaseStatus(context: TelegramRelayContext): {
    status: 'bound' | 'unbound';
    note: string;
    botBinding: TelegramRelayStatus['botBinding'];
  } {
    const boundToBossCat = hasActiveBossCatBinding(context);
    const botBinding = boundToBossCat && context.botBinding
      ? {
          id: context.botBinding.id,
          platform: 'telegram' as const,
          botName: context.botBinding.botName,
        }
      : null;

    return {
      status: boundToBossCat ? 'bound' : 'unbound',
      note: buildStatusNote({
        context,
        boundToBossCat,
        deliveryConfigured: deliveryClient !== null,
      }),
      botBinding,
    };
  }

  function buildWebhookReceipt(input: {
    context: TelegramRelayContext;
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
  }): TelegramWebhookReceipt {
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
      bossCatId: input.context.bossCatId,
      bossCatName: input.context.bossCatName,
      mappedConversationId: input.mappedConversationId,
      messageSummary,
      roomRouting: input.roomRouting,
      reason: input.reason,
    };
  }

  function getStatus(context: TelegramRelayContext): TelegramRelayStatus {
    const base = getBaseStatus(context);
    const ingress = store.getIngressStats();
    const delivery = store.getDeliveryStats();

    return {
      platform: 'telegram',
      status: base.status,
      bossCatId: context.bossCatId,
      bossCatName: context.bossCatName,
      botBinding: base.botBinding,
      publicIdentityMode: 'boss_cat_single_identity',
      mappedConversationCount: conversationMapper.getBindingCount(),
      lastProcessedUpdateId: store.getLastProcessedUpdateId(),
      webhookPath,
      diagnosticsPath,
      relayMode: 'boss-cat-ingress',
      roomRouting: conversationMapper.describeRoomRouting(),
      ingress: {
        secretTokenConfigured: webhookSecretToken !== null,
        maxBodyBytes,
        acceptedUpdates: ingress.acceptedCount,
        ignoredUpdates: ingress.ignoredCount,
        lastReceipt: ingress.lastReceipt,
      },
      delivery: {
        status: deliveryClient ? 'configured' : 'not_configured',
        supportedOperations: [...SUPPORTED_DELIVERY_OPERATIONS],
        sentCount: delivery.sentCount,
        repliedCount: delivery.repliedCount,
        editedCount: delivery.editedCount,
        deletedCount: delivery.deletedCount,
        failedCount: delivery.failedCount,
        lastReceipt: delivery.lastReceipt,
      },
      note: base.note,
    };
  }

  return {
    getIngressConfig(): TelegramWebhookIngressConfig {
      return {
        secretToken: webhookSecretToken,
        maxBodyBytes,
      };
    },

    getStatus(context: TelegramRelayContext): TelegramRelayStatus {
      return getStatus(context);
    },

    getDiagnostics(context: TelegramRelayContext): TelegramRelayDiagnostics {
      const status = getStatus(context);
      return {
        platform: 'telegram',
        status: status.status,
        publicIdentityMode: status.publicIdentityMode,
        bossCatId: status.bossCatId,
        bossCatName: status.bossCatName,
        botBinding: status.botBinding,
        relayMode: status.relayMode,
        webhookPath: status.webhookPath,
        diagnosticsPath: status.diagnosticsPath,
        lastProcessedUpdateId: status.lastProcessedUpdateId,
        dedupe: {
          retainedUpdateCount: store.getProcessedUpdateCount(),
          maxRetainedUpdateCount: store.getMaxProcessedUpdates(),
        },
        roomRouting: status.roomRouting,
        ingress: status.ingress,
        delivery: status.delivery,
        bindings: conversationMapper.listBindings(),
        note: status.note,
      };
    },

    receiveUpdate({
      update,
      context,
    }: {
      update: TelegramWebhookUpdate;
      context: TelegramRelayContext;
    }): TelegramWebhookReceipt {
      const acceptedAt = now().toISOString();
      const updateId = typeof update.update_id === 'number' ? update.update_id : null;
      const pickedMessage = pickMessage(update);
      const message = pickedMessage.message;
      const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
      const messageId = typeof message?.message_id === 'number' ? String(message.message_id) : null;

      if (!hasActiveBossCatBinding(context)) {
        const receipt = buildWebhookReceipt({
          context,
          acceptedAt,
          updateId,
          chatId,
          messageId,
          mappedConversationId: null,
          message,
          isEdited: pickedMessage.isEdited,
          status: 'ignored',
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'telegram_not_bound_to_boss_cat',
        });
        store.recordIngressReceipt(receipt);
        return receipt;
      }

      if (updateId !== null && store.hasProcessedUpdate(updateId)) {
        const receipt = buildWebhookReceipt({
          context,
          acceptedAt,
          updateId,
          chatId,
          messageId,
          mappedConversationId: chatId ? store.getBinding(chatId)?.conversationId ?? null : null,
          message,
          isEdited: pickedMessage.isEdited,
          status: 'ignored',
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'duplicate_update',
        });
        store.recordIngressReceipt(receipt);
        return receipt;
      }

      if (!message || !chatId) {
        const receipt = buildWebhookReceipt({
          context,
          acceptedAt,
          updateId,
          chatId,
          messageId,
          mappedConversationId: null,
          message,
          isEdited: pickedMessage.isEdited,
          status: 'ignored',
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'unsupported_update',
        });
        store.recordIngressReceipt(receipt);
        return receipt;
      }

      if (message.from?.is_bot === true) {
        const receipt = buildWebhookReceipt({
          context,
          acceptedAt,
          updateId,
          chatId,
          messageId,
          mappedConversationId: null,
          message,
          isEdited: pickedMessage.isEdited,
          status: 'ignored',
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'message_from_bot',
        });
        store.recordIngressReceipt(receipt);
        return receipt;
      }

      if (message.chat?.type !== 'private') {
        const receipt = buildWebhookReceipt({
          context,
          acceptedAt,
          updateId,
          chatId,
          messageId,
          mappedConversationId: null,
          message,
          isEdited: pickedMessage.isEdited,
          status: 'ignored',
          roomRouting: conversationMapper.describeRoomRouting(),
          reason: 'unsupported_chat_type',
        });
        store.recordIngressReceipt(receipt);
        return receipt;
      }

      const mapping = conversationMapper.resolveChatConversation({
        chatId,
        acceptedAt,
        chatType: message.chat?.type ?? 'private',
        chatTitle: readString(message.chat?.title),
        chatUsername: readString(message.chat?.username),
        messageId,
        messageSummary: normalizeTelegramMessageSummary(message, {
          isEdited: pickedMessage.isEdited,
        }),
      });

      if (updateId !== null) {
        store.markProcessedUpdate(updateId);
      }

      const receipt = buildWebhookReceipt({
        context,
        acceptedAt,
        updateId,
        chatId,
        messageId,
        mappedConversationId: mapping.binding.conversationId,
        message,
        isEdited: pickedMessage.isEdited,
        status: 'accepted',
        roomRouting: mapping.roomRouting,
      });
      store.recordIngressReceipt(receipt);
      return receipt;
    },

    async deliver({
      request,
      context,
    }: {
      request: TelegramDeliveryRequest;
      context: TelegramRelayContext;
    }): Promise<TelegramDeliveryReceipt> {
      const deliveredAt = now().toISOString();
      const baseReceipt = {
        platform: 'telegram' as const,
        operation: request.operation,
        deliveredAt,
        deliveryId: randomUUID(),
        bossCatId: context.bossCatId,
        bossCatName: context.bossCatName,
        replyToMessageId: readString(request.replyToMessageId),
        textPreview: normalizeTelegramDeliveryTextPreview(request.text),
      };

      if (!hasActiveBossCatBinding(context)) {
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: 'failed',
          chatId: readString(request.chatId),
          conversationId: readString(request.conversationId),
          messageId: readString(request.messageId),
          reason: 'telegram_not_bound_to_boss_cat',
          errorMessage: null,
        };
        store.recordDeliveryReceipt(receipt);
        return receipt;
      }

      if (!deliveryClient) {
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: 'failed',
          chatId: readString(request.chatId),
          conversationId: readString(request.conversationId),
          messageId: readString(request.messageId),
          reason: 'delivery_client_not_configured',
          errorMessage: null,
        };
        store.recordDeliveryReceipt(receipt);
        return receipt;
      }

      if (
        (request.operation === 'send' || request.operation === 'reply' || request.operation === 'edit')
        && !baseReceipt.textPreview
      ) {
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: 'failed',
          chatId: readString(request.chatId),
          conversationId: readString(request.conversationId),
          messageId: readString(request.messageId),
          reason: 'text_required',
          errorMessage: null,
        };
        store.recordDeliveryReceipt(receipt);
        return receipt;
      }

      if (request.operation === 'reply' && !baseReceipt.replyToMessageId) {
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: 'failed',
          chatId: readString(request.chatId),
          conversationId: readString(request.conversationId),
          messageId: readString(request.messageId),
          reason: 'message_id_required',
          errorMessage: null,
        };
        store.recordDeliveryReceipt(receipt);
        return receipt;
      }

      if ((request.operation === 'edit' || request.operation === 'delete') && !readString(request.messageId)) {
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: 'failed',
          chatId: readString(request.chatId),
          conversationId: readString(request.conversationId),
          messageId: null,
          reason: 'message_id_required',
          errorMessage: null,
        };
        store.recordDeliveryReceipt(receipt);
        return receipt;
      }

      let binding = request.chatId ? store.getBinding(request.chatId) : null;
      if (!binding && request.chatId) {
        binding = conversationMapper.resolveChatConversation({
          chatId: request.chatId,
          acceptedAt: deliveredAt,
          chatType: 'private',
          chatTitle: null,
          chatUsername: null,
          messageId: null,
          messageSummary: null,
        }).binding;
      }

      if (!binding && request.conversationId) {
        binding = store.getBindingByConversationId(request.conversationId);
      }

      const chatId = binding?.telegramChatId ?? readString(request.chatId);
      if (!chatId) {
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: 'failed',
          chatId: null,
          conversationId: binding?.conversationId ?? readString(request.conversationId),
          messageId: readString(request.messageId),
          reason: request.conversationId ? 'conversation_not_mapped' : 'chat_id_required',
          errorMessage: null,
        };
        store.recordDeliveryReceipt(receipt);
        return receipt;
      }

      const conversationId = binding?.conversationId ?? `telegram:${chatId}`;

      try {
        const result = await deliveryClient.deliver({
          ...request,
          chatId,
        });
        const status = request.operation === 'edit'
          ? 'edited'
          : request.operation === 'delete'
            ? 'deleted'
            : 'sent';
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: result.ok ? status : 'failed',
          chatId,
          conversationId,
          messageId: result.messageId ?? readString(request.messageId),
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
            : {
                botBindingId: null,
                telegramChatId: chatId,
                conversationId,
                transportConversationMode: 'transport_inbox' as const,
                roomRoutingStatus: 'placeholder' as const,
                linkedRoomId: null,
                telegramChatType: 'private',
                telegramChatTitle: null,
                telegramChatUsername: null,
                lastInboundMessageId: null,
                lastInboundAt: null,
                lastInboundTextPreview: null,
                lastInboundAttachmentKinds: [],
                lastOutboundMessageId: receipt.messageId,
                lastOutboundAt: deliveredAt,
                createdAt: deliveredAt,
                updatedAt: deliveredAt,
              };
          store.upsertBinding(nextBinding);
        }

        store.recordDeliveryReceipt(receipt);
        return receipt;
      } catch (error) {
        const receipt: TelegramDeliveryReceipt = {
          ...baseReceipt,
          status: 'failed',
          chatId,
          conversationId,
          messageId: readString(request.messageId),
          reason: 'telegram_api_error',
          errorMessage: error instanceof Error ? error.message : 'Telegram delivery failed',
        };
        store.recordDeliveryReceipt(receipt);
        return receipt;
      }
    },
  };
}
