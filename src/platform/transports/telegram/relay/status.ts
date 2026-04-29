import type {
  TelegramDeliveryOperation,
  TelegramPollingStatus,
  TelegramRelayContext,
  TelegramRelayDiagnostics,
  TelegramRelayStatus,
} from '../contracts.js';
import type { TelegramConversationMapper } from '../mapping.js';
import type { TelegramRelayStore } from '../store/index.js';

const SUPPORTED_DELIVERY_OPERATIONS: TelegramDeliveryOperation[] = [
  'send',
  'reply',
  'edit',
  'delete',
  'send_media',
];

function hasActiveDefaultBinding(context: TelegramRelayContext): boolean {
  return context.defaultBotBinding?.status === 'active';
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
    return 'No active Telegram bot binding is available for ingress.';
  }

  if (!input.deliveryConfigured) {
    return input.context.botBindings.length > 1
      ? 'Multiple Cat-bound Telegram bots are configured. One active binding is used for ingress and delivery is still unconfigured.'
      : 'Telegram ingress is wired to the active Cat binding. Outbound delivery remains unconfigured.';
  }

  return input.context.botBindings.length > 1
    ? 'Telegram supports multiple Cat-bound bot bindings while keeping one default ingress path.'
    : 'Telegram ingress and delivery are both pinned to the active Cat binding.';
}

export interface BuildTelegramRelayStatusOptions {
  context: TelegramRelayContext;
  store: TelegramRelayStore;
  conversationMapper: TelegramConversationMapper;
  webhookPath: string;
  diagnosticsPath: string;
  webhookSecretToken: string | null;
  maxBodyBytes: number;
  deliveryConfigured: boolean;
  pollingStatuses: TelegramPollingStatus[];
}

export function buildTelegramRelayStatus(
  options: BuildTelegramRelayStatusOptions,
): TelegramRelayStatus {
  const boundToBossCat = hasActiveDefaultBinding(options.context);
  const botBinding = boundToBossCat && options.context.defaultBotBinding
    ? {
        id: options.context.defaultBotBinding.id,
        platform: 'telegram' as const,
        botName: options.context.defaultBotBinding.botName,
      }
    : null;
  const availableBindings = options.context.botBindings.map((binding) => ({
    id: binding.id,
    platform: 'telegram' as const,
    botName: binding.botName,
    catActorId: binding.catActorId,
    inboundMode: binding.inboundMode ?? 'polling' as const,
    roomMode: binding.roomMode,
    status: binding.status,
  }));
  const ingress = options.store.getIngressStats();
  const delivery = options.store.getDeliveryStats();

  return {
    platform: 'telegram',
    status: boundToBossCat ? 'bound' : 'unbound',
    bossCatId: options.context.bossCatId,
    bossCatName: options.context.bossCatName,
    botBinding,
    availableBindings,
    publicIdentityMode: 'multi_cat_bindings_single_boss',
    mappedConversationCount: options.conversationMapper.getBindingCount(),
    lastProcessedUpdateId: options.store.getLastProcessedUpdateId(),
    webhookPath: options.webhookPath,
    diagnosticsPath: options.diagnosticsPath,
    relayMode: 'boss-cat-ingress',
    roomRouting: options.conversationMapper.describeRoomRouting(
      options.context.selectedBotBinding?.id ?? null,
    ),
    ingress: {
      secretTokenConfigured: options.webhookSecretToken !== null,
      maxBodyBytes: options.maxBodyBytes,
      acceptedUpdates: ingress.acceptedCount,
      ignoredUpdates: ingress.ignoredCount,
      lastReceipt: ingress.lastReceipt,
    },
    delivery: {
      status: options.deliveryConfigured ? 'configured' : 'not_configured',
      supportedOperations: [...SUPPORTED_DELIVERY_OPERATIONS],
      sentCount: delivery.sentCount,
      repliedCount: delivery.repliedCount,
      editedCount: delivery.editedCount,
      deletedCount: delivery.deletedCount,
      failedCount: delivery.failedCount,
      lastReceipt: delivery.lastReceipt,
    },
    polling: {
      activeConsumers: options.pollingStatuses.filter((status) => status.health !== 'stopped').length,
      statuses: options.pollingStatuses,
    },
    note: buildStatusNote({
      context: options.context,
      boundToBossCat,
      deliveryConfigured: options.deliveryConfigured,
    }),
  };
}

export function buildTelegramRelayDiagnostics(input: {
  status: TelegramRelayStatus;
  store: TelegramRelayStore;
  conversationMapper: TelegramConversationMapper;
}): TelegramRelayDiagnostics {
  return {
    platform: 'telegram',
    status: input.status.status,
    publicIdentityMode: input.status.publicIdentityMode,
    bossCatId: input.status.bossCatId,
    bossCatName: input.status.bossCatName,
    botBinding: input.status.botBinding,
    availableBindings: input.status.availableBindings,
    relayMode: input.status.relayMode,
    webhookPath: input.status.webhookPath,
    diagnosticsPath: input.status.diagnosticsPath,
    lastProcessedUpdateId: input.status.lastProcessedUpdateId,
    dedupe: {
      retainedUpdateCount: input.store.getProcessedUpdateCount(),
      maxRetainedUpdateCount: input.store.getMaxProcessedUpdates(),
    },
    roomRouting: input.status.roomRouting,
    ingress: input.status.ingress,
    delivery: input.status.delivery,
    polling: input.status.polling,
    bindings: input.conversationMapper.listBindings(),
    note: input.status.note,
  };
}
