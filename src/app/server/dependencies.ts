import { createAppStartupState } from './startup.js';
import type {
  ResolvedServerDependencies,
  ServerDependencies,
} from './contracts.js';

import {
  createCatsMemoryService,
  createFileBackedCanonicalMemoryStore,
  MemoryCanonicalMemoryStore,
  type CanonicalMemoryStore,
} from '../../platform/memory/index.js';
import { createTelegramBotApiDeliveryClient } from '../../platform/transports/telegram/delivery.js';
import { createTelegramPollingSupervisor } from '../../platform/transports/telegram/polling.js';
import { createTelegramRelay } from '../../platform/transports/telegram/relay/index.js';
import {
  createFileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../../platform/transports/telegram/store/index.js';
import { dispatchOrchestratorTurn } from '../../platform/orchestration/index.js';
import type { PendingOrchestratorDispatchRequest } from '../../platform/orchestration/pendingDispatch.js';
import { createMemoryAwareCompanionBoxStore } from '../../products/chat/state/companionMemoryAdapter.js';
import {
  createFileBackedCompanionBoxStore,
  MemoryCompanionBoxStore,
  type CompanionBoxStore,
} from '../../products/chat/state/companion-box/index.js';
import { createChatMemorySurface } from '../../products/chat/state/memoryAdapter.js';
import {
  chatOrchestratorChannelRouter,
  chatOrchestratorPlannerSurface,
} from '../../products/chat/state/orchestratorAdapter.js';
import { MemoryChatStore } from '../../products/chat/state/store.js';
import { createChatTaskExecutionLocator } from '../../products/chat/state/taskExecutionLocator.js';
import { createChatTelegramRoomBridge } from '../../products/chat/state/telegramBridgeAdapter.js';

function createDefaultCompanionStore(
  dependencies: ServerDependencies,
): CompanionBoxStore {
  return dependencies.chatStore instanceof MemoryChatStore
    ? new MemoryCompanionBoxStore()
    : createFileBackedCompanionBoxStore(dependencies.config.chatStatePath);
}

function createDefaultMemoryStore(
  dependencies: ServerDependencies,
): CanonicalMemoryStore {
  return dependencies.chatStore instanceof MemoryChatStore
    ? new MemoryCanonicalMemoryStore()
    : createFileBackedCanonicalMemoryStore(dependencies.config.chatStatePath);
}

function createDefaultTelegramRelay(
  dependencies: ServerDependencies,
  pollingSupervisor: ResolvedServerDependencies['pollingSupervisor'],
): ResolvedServerDependencies['telegramRelay'] {
  const webhookSecretToken = process.env.CATS_TELEGRAM_WEBHOOK_SECRET?.trim() || null;
  const botToken = process.env.CATS_TELEGRAM_BOT_TOKEN?.trim() || null;
  const parsedMaxBodyBytes = Number.parseInt(
    process.env.CATS_TELEGRAM_WEBHOOK_MAX_BYTES ?? '',
    10,
  );
  const deliveryClientCache = new Map<string, ReturnType<typeof createTelegramBotApiDeliveryClient>>();

  return createTelegramRelay({
    now: dependencies.now,
    store: dependencies.chatStore instanceof MemoryChatStore
      ? new InMemoryTelegramRelayStore()
      : createFileBackedTelegramRelayStore(dependencies.config.chatStatePath),
    webhookSecretToken,
    maxBodyBytes: Number.isFinite(parsedMaxBodyBytes) ? parsedMaxBodyBytes : undefined,
    getPollingStatuses: () => pollingSupervisor.getAllPollingStatuses(),
    resolveDeliveryClient(binding) {
      const resolvedToken = binding?.botToken?.trim() || botToken;
      if (!resolvedToken) {
        return null;
      }
      const existing = deliveryClientCache.get(resolvedToken);
      if (existing) {
        return existing;
      }
      const client = createTelegramBotApiDeliveryClient({
        botToken: resolvedToken,
      });
      deliveryClientCache.set(resolvedToken, client);
      return client;
    },
  });
}

export function resolveServerDependencies(
  dependencies: ServerDependencies,
): ResolvedServerDependencies {
  const memoryStore = dependencies.memoryStore ?? createDefaultMemoryStore(dependencies);
  const memoryService = dependencies.memoryService
    ?? createCatsMemoryService(createChatMemorySurface(dependencies.chatStore), memoryStore);
  const pollingSupervisor = dependencies.pollingSupervisor
    ?? createTelegramPollingSupervisor({ now: dependencies.now });
  const telegramRelay = dependencies.telegramRelay
    ?? createDefaultTelegramRelay(dependencies, pollingSupervisor);
  const baseCompanionStore = dependencies.companionStore ?? createDefaultCompanionStore(dependencies);
  const companionStore = createMemoryAwareCompanionBoxStore(baseCompanionStore, memoryService);
  const orchestratorChannelRouter = dependencies.orchestratorChannelRouter
    ?? chatOrchestratorChannelRouter;
  const orchestratorPlannerSurface = dependencies.orchestratorPlannerSurface
    ?? chatOrchestratorPlannerSurface;
  const taskExecutionLocator = dependencies.taskExecutionLocator
    ?? createChatTaskExecutionLocator(dependencies.chatStore);
  const telegramRoomBridge = dependencies.telegramRoomBridge
    ?? createChatTelegramRoomBridge({
      chatStore: dependencies.chatStore,
      companionStore,
    });

  const resumePendingOrchestratorDispatch = dependencies.resumePendingOrchestratorDispatch
    ?? (async (
      request: PendingOrchestratorDispatchRequest,
      _options: {
        trigger: 'approve' | 'reroute';
      },
    ) => dispatchOrchestratorTurn({
      ...request,
      senderName: request.senderName ?? undefined,
      chatStore: dependencies.chatStore,
      channelRouter: orchestratorChannelRouter,
      plannerSurface: orchestratorPlannerSurface,
      runtimeClient: dependencies.runtimeClient,
      now: dependencies.now?.(),
      companionStore,
      memoryService,
    }));

  return {
    ...dependencies,
    coreStore: dependencies.coreStore ?? dependencies.chatStore,
    startup: dependencies.startup ?? createAppStartupState({
      phase: 'ready',
      ready: true,
    }),
    companionStore,
    orchestratorChannelRouter,
    orchestratorPlannerSurface,
    taskExecutionLocator,
    memoryStore,
    memoryService,
    telegramRelay,
    telegramRoomBridge,
    pollingSupervisor,
    resumePendingOrchestratorDispatch,
  };
}
