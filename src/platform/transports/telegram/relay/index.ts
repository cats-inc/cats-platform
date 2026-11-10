import type { BotBindingRecord } from '../../../../core/types.js';
import type {
  TelegramConversationBinding,
  TelegramDeliveryReceipt,
  TelegramDeliveryRequest,
  TelegramOwnerRecord,
  TelegramPollingStatus,
  TelegramRelayContext,
  TelegramRelayDiagnostics,
  TelegramRelayStatus,
  TelegramWebhookReceipt,
  TelegramWebhookUpdate,
} from '../contracts.js';
import type { TelegramDeliveryClient, TelegramDownloadedFile } from '../delivery.js';
import {
  createTelegramConversationMapper,
  type TelegramConversationMapper,
} from '../mapping.js';
import {
  createBridgeDispatchFailureReceipt,
  deliverTelegramRequest,
  downloadTelegramFile,
  sendTelegramChatAction,
} from './delivery.js';
import { linkTelegramRoom, receiveTelegramUpdate } from './ingress.js';
import {
  chooseTelegramOwner,
  peekTelegramOwner,
  resetTelegramOwner,
  resolveTelegramOwner,
  type TelegramOwnerScope,
} from '../owner.js';
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
  clearForReset?(): void;
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
  /** SPEC-140: forget the owner; the next private chat that writes becomes it. */
  resetOwner(bindingId: string): TelegramOwnerRecord;
  /** SPEC-140: the owner picks themselves among the chats the binding had seen; null when not offered. */
  chooseOwner(bindingId: string, userId: string): TelegramOwnerRecord | null;
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
    deferProcessed?: boolean;
  }): TelegramWebhookReceipt;
  /** Completes a deferred ingress acknowledgement after durable product capture. */
  markUpdateProcessed(updateId: number): void;
  deliver(input: {
    request: TelegramDeliveryRequest;
    context: TelegramRelayContext;
    /** Trusted host hook, checked at the network dispatch boundary after local file reads. */
    assertAllowed?: () => void | Promise<void>;
  }): Promise<TelegramDeliveryReceipt>;
  recordBridgeDispatchFailure(input: {
    receipt: TelegramWebhookReceipt;
    context: TelegramRelayContext;
    binding: BotBindingRecord | null;
    deliveredAt?: string | null;
    errorMessage: string;
  }): TelegramDeliveryReceipt;
  /** SPEC-124 FR-25: best effort; it records nothing and never throws. */
  sendChatAction?(input: {
    chatId: string;
    action: 'typing';
    context: TelegramRelayContext;
  }): Promise<void>;
  /** SPEC-124 FR-33: best effort; null when the file cannot be fetched. */
  downloadFile?(input: {
    fileId: string;
    maxBytes: number;
    context: TelegramRelayContext;
  }): Promise<TelegramDownloadedFile | null>;
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
  nowIso: string = new Date().toISOString(),
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
    const linked = store.listBindings().filter((binding) =>
      binding.linkedRoomId === roomId
      && (!bindingId || binding.bindingId === bindingId),
    );
    if (!bindingId) {
      return linked[0] ?? null;
    }
    // SPEC-140: a room mirrors only to its binding's owner, never to the chat that touched it last.
    // Without the binding's scope nothing is stored here; ingress, delivery and Settings do that.
    const owner = peekTelegramOwner(store, bindingId);
    return owner.state === 'pinned'
      ? linked.find((binding) => binding.telegramChatId === owner.userId) ?? null
      : null;
  }

  return null;
}

function ownerScope(context: TelegramRelayContext, binding: BotBindingRecord): TelegramOwnerScope {
  return {
    defaultBindingId: context.defaultBotBinding?.id ?? null,
    bindingCreatedAt: binding.createdAt ?? null,
  };
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
    clearForReset: () => store.clearForReset?.(),
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
      const nowIso = now().toISOString();
      return buildTelegramRelayDiagnostics({
        status: readStatus(context),
        store,
        conversationMapper,
        // SPEC-140: who each Telegram bot binding answers.
        owners: context.botBindings
          .filter((binding) => binding.platform === 'telegram')
          .map((binding) => ({
            ...resolveTelegramOwner(store, binding.id, nowIso, ownerScope(context, binding)),
            bindingId: binding.id,
            botName: binding.botName,
          })),
      });
    },

    resolveBinding(input): TelegramConversationBinding | null {
      return resolveStoredBinding(store, input, now().toISOString());
    },

    findSoleUnlinkedConversation(bindingId: string): TelegramConversationBinding | null {
      const normalized = readTelegramString(bindingId);
      if (!normalized) return null;
      // SPEC-140: only the owner's chat may be linked to a room.
      const owner = peekTelegramOwner(store, normalized);
      if (owner.state !== 'pinned') return null;
      const unlinked = store
        .listBindings()
        .filter((binding) => binding.bindingId === normalized
          && !binding.linkedRoomId
          && binding.telegramChatId === owner.userId);
      return unlinked.length === 1 ? unlinked[0] : null;
    },

    resetOwner(bindingId: string): TelegramOwnerRecord {
      return resetTelegramOwner(store, bindingId, now().toISOString());
    },

    chooseOwner(bindingId: string, userId: string): TelegramOwnerRecord | null {
      return chooseTelegramOwner(store, { bindingId, userId, nowIso: now().toISOString() });
    },

    linkRoom(input): TelegramConversationBinding | null {
      const binding = resolveStoredBinding(store, input, now().toISOString());
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
      deferProcessed,
    }: {
      update: TelegramWebhookUpdate;
      context: TelegramRelayContext;
      deferProcessed?: boolean;
    }): TelegramWebhookReceipt {
      return receiveTelegramUpdate({
        now,
        store,
        conversationMapper,
        context,
        update,
        deferProcessed,
      });
    },

    markUpdateProcessed(updateId): void {
      store.markProcessedUpdate(updateId);
    },

    async deliver({
      request,
      context,
      assertAllowed,
    }: {
      request: TelegramDeliveryRequest;
      context: TelegramRelayContext;
      assertAllowed?: () => void | Promise<void>;
    }): Promise<TelegramDeliveryReceipt> {
      return deliverTelegramRequest({
        now,
        store,
        conversationMapper,
        deliveryClient,
        resolveDeliveryClient,
        request,
        context,
        assertAllowed,
      });
    },

    async sendChatAction({ chatId, action, context }): Promise<void> {
      // SPEC-140: even a typing action goes only to the owner.
      const binding = context.selectedBotBinding ?? context.defaultBotBinding ?? null;
      const owner = binding ? peekTelegramOwner(store, binding.id) : null;
      if (owner?.state !== 'pinned' || owner.userId !== chatId) {
        return;
      }
      await sendTelegramChatAction({
        deliveryClient,
        resolveDeliveryClient,
        chatId,
        action,
        context,
      });
    },

    async downloadFile({ fileId, maxBytes, context }): Promise<TelegramDownloadedFile | null> {
      return await downloadTelegramFile({
        deliveryClient,
        resolveDeliveryClient,
        fileId,
        maxBytes,
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
