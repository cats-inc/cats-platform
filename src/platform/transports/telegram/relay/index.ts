import type { BotBindingRecord } from '../../../../core/types.js';
import type {
  TelegramConversationBinding,
  TelegramDeliveryReceipt,
  TelegramDeliveryRequest,
  TelegramPollingStatus,
  TelegramRelayContext,
  TelegramRelayDiagnostics,
  TelegramRelayStatus,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from '../contracts.js';
import type { TelegramDeliveryClient } from '../delivery.js';
import {
  createTelegramConversationMapper,
  type TelegramConversationMapper,
} from '../mapping.js';
import {
  createBridgeDispatchFailureReceipt,
  deliverTelegramRequest,
} from './delivery.js';
import { linkTelegramRoom, receiveTelegramUpdate } from './ingress.js';
import {
  buildTelegramRelayDiagnostics,
  buildTelegramRelayStatus,
} from './status.js';
import { InMemoryTelegramRelayStore, type TelegramRelayStore } from '../store/index.js';
import { readTelegramString } from '../utils.js';

export interface TelegramWebhookIngressConfig {
  secretToken: string | null;
  maxBodyBytes: number;
}

export interface TelegramRelay {
  getIngressConfig(): TelegramWebhookIngressConfig;
  getStatus(context: TelegramRelayContext): TelegramRelayStatus;
  getDiagnostics(context: TelegramRelayContext): TelegramRelayDiagnostics;
  resolveBinding(input: {
    conversationId?: string | null;
    chatId?: string | null;
    bindingId?: string | null;
    roomId?: string | null;
  }): TelegramConversationBinding | null;
  findSoleUnlinkedConversation(bindingId: string): TelegramConversationBinding | null;
  linkRoom(input: {
    conversationId?: string | null;
    chatId?: string | null;
    bindingId?: string | null;
    roomId: string;
    linkedAt?: string | null;
  }): TelegramConversationBinding | null;
  receiveUpdate(input: {
    update: TelegramWebhookUpdate;
    context: TelegramRelayContext;
  }): TelegramWebhookReceipt;
  deliver(input: {
    request: TelegramDeliveryRequest;
    context: TelegramRelayContext;
  }): Promise<TelegramDeliveryReceipt>;
  recordBridgeDispatchFailure(input: {
    receipt: TelegramWebhookReceipt;
    context: TelegramRelayContext;
    binding: BotBindingRecord | null;
    deliveredAt?: string | null;
    errorMessage: string;
  }): TelegramDeliveryReceipt;
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
  resolveDeliveryClient?: (binding: BotBindingRecord | null) => TelegramDeliveryClient | null;
  getPollingStatuses?: () => TelegramPollingStatus[];
}

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

function resolveStoredBinding(
  store: TelegramRelayStore,
  input: {
    conversationId?: string | null;
    chatId?: string | null;
    bindingId?: string | null;
    roomId?: string | null;
  },
): TelegramConversationBinding | null {
  const bindingId = readTelegramString(input.bindingId);
  const conversationId = readTelegramString(input.conversationId);
  if (conversationId) {
    return store.getBindingByConversationId(conversationId);
  }

  const chatId = readTelegramString(input.chatId);
  if (chatId) {
    return store.getBinding(chatId, bindingId);
  }

  const roomId = readTelegramString(input.roomId);
  if (roomId) {
    return store.listBindings().find((binding) =>
      binding.linkedRoomId === roomId
      && (!bindingId || binding.bindingId === bindingId),
    ) ?? null;
  }

  return null;
}

export function createTelegramRelay(options: TelegramRelayOptions = {}): TelegramRelay {
  const now = options.now ?? (() => new Date());
  const store = options.store ?? new InMemoryTelegramRelayStore();
  const conversationMapper = options.conversationMapper ?? createTelegramConversationMapper(store);
  const webhookPath = options.webhookPath ?? '/api/transports/telegram/webhook';
  const diagnosticsPath = options.diagnosticsPath ?? '/api/transports/telegram/diagnostics';
  const webhookSecretToken = readTelegramString(options.webhookSecretToken);
  const maxBodyBytes = Number.isFinite(options.maxBodyBytes)
    ? Math.max(1024, Number(options.maxBodyBytes))
    : DEFAULT_MAX_BODY_BYTES;
  const deliveryClient = options.deliveryClient ?? null;
  const resolveDeliveryClient = options.resolveDeliveryClient;
  const getPollingStatuses = options.getPollingStatuses ?? (() => []);
  const hasConfiguredDelivery = (context: TelegramRelayContext): boolean =>
    deliveryClient !== null
      || context.botBindings.some((binding) =>
        binding.status === 'active' && resolveDeliveryClient?.(binding) !== null,
      );
  const readStatus = (context: TelegramRelayContext): TelegramRelayStatus =>
    buildTelegramRelayStatus({
      context,
      store,
      conversationMapper,
      webhookPath,
      diagnosticsPath,
      webhookSecretToken,
      maxBodyBytes,
      deliveryConfigured: hasConfiguredDelivery(context),
      pollingStatuses: getPollingStatuses(),
    });

  return {
    getIngressConfig(): TelegramWebhookIngressConfig {
      return {
        secretToken: webhookSecretToken,
        maxBodyBytes,
      };
    },

    getStatus(context: TelegramRelayContext): TelegramRelayStatus {
      return readStatus(context);
    },

    getDiagnostics(context: TelegramRelayContext): TelegramRelayDiagnostics {
      return buildTelegramRelayDiagnostics({
        status: readStatus(context),
        store,
        conversationMapper,
      });
    },

    resolveBinding(input): TelegramConversationBinding | null {
      return resolveStoredBinding(store, input);
    },

    findSoleUnlinkedConversation(bindingId: string): TelegramConversationBinding | null {
      const normalized = readTelegramString(bindingId);
      if (!normalized) return null;
      const unlinked = store
        .listBindings()
        .filter((binding) => binding.bindingId === normalized && !binding.linkedRoomId);
      return unlinked.length === 1 ? unlinked[0] : null;
    },

    linkRoom(input): TelegramConversationBinding | null {
      const binding = resolveStoredBinding(store, input);
      if (!binding) {
        return null;
      }

      return linkTelegramRoom({
        store,
        binding,
        roomId: input.roomId,
        linkedAt: readTelegramString(input.linkedAt) ?? now().toISOString(),
      });
    },

    receiveUpdate({
      update,
      context,
    }: {
      update: TelegramWebhookUpdate;
      context: TelegramRelayContext;
    }): TelegramWebhookReceipt {
      return receiveTelegramUpdate({
        now,
        store,
        conversationMapper,
        context,
        update,
      });
    },

    async deliver({
      request,
      context,
    }: {
      request: TelegramDeliveryRequest;
      context: TelegramRelayContext;
    }): Promise<TelegramDeliveryReceipt> {
      return deliverTelegramRequest({
        now,
        store,
        conversationMapper,
        deliveryClient,
        resolveDeliveryClient,
        request,
        context,
      });
    },

    recordBridgeDispatchFailure(input): TelegramDeliveryReceipt {
      const receipt = createBridgeDispatchFailureReceipt({
        ...input,
        deliveredAt: readTelegramString(input.deliveredAt) ?? now().toISOString(),
      });
      store.recordDeliveryReceipt(receipt);
      return receipt;
    },
  };
}
