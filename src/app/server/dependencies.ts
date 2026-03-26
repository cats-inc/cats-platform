import { createAppStartupState } from './startup.js';
import type {
  ChatServerDependencies,
  ResolvedChatServerDependencies,
  ResolvedServerDependencies,
  ServerDependencies,
  SharedServerDependencies,
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
  resumeStoredWorkflowContinuationDispatch,
} from '../../products/chat/state/orchestratorAdapter.js';
import { MemoryChatStore } from '../../products/chat/state/store.js';
import { createChatTaskExecutionLocator } from '../../products/chat/state/taskExecutionLocator.js';
import { createChatTelegramRoomBridge } from '../../products/chat/state/telegramBridgeAdapter.js';

function createDefaultCompanionStore(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
): CompanionBoxStore {
  return chat.chatStore instanceof MemoryChatStore
    ? new MemoryCompanionBoxStore()
    : createFileBackedCompanionBoxStore(shared.config.chatStatePath);
}

function createDefaultMemoryStore(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
): CanonicalMemoryStore {
  return chat.chatStore instanceof MemoryChatStore
    ? new MemoryCanonicalMemoryStore()
    : createFileBackedCanonicalMemoryStore(shared.config.chatStatePath);
}

function createDefaultTelegramRelay(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
  pollingSupervisor: ResolvedChatServerDependencies['pollingSupervisor'],
): ResolvedChatServerDependencies['telegramRelay'] {
  const webhookSecretToken = process.env.CATS_TELEGRAM_WEBHOOK_SECRET?.trim() || null;
  const botToken = process.env.CATS_TELEGRAM_BOT_TOKEN?.trim() || null;
  const parsedMaxBodyBytes = Number.parseInt(
    process.env.CATS_TELEGRAM_WEBHOOK_MAX_BYTES ?? '',
    10,
  );
  const deliveryClientCache = new Map<string, ReturnType<typeof createTelegramBotApiDeliveryClient>>();

  return createTelegramRelay({
    now: shared.now,
    store: chat.chatStore instanceof MemoryChatStore
      ? new InMemoryTelegramRelayStore()
      : createFileBackedTelegramRelayStore(shared.config.chatStatePath),
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
  const sharedCoreStore = dependencies.shared.coreStore ?? dependencies.chat.chatStore;
  const startup = dependencies.shared.startup ?? createAppStartupState({
    phase: 'ready',
    ready: true,
  });

  const memoryStore = dependencies.chat.memoryStore
    ?? createDefaultMemoryStore(dependencies.shared, dependencies.chat);
  const memoryService = dependencies.chat.memoryService
    ?? createCatsMemoryService(createChatMemorySurface(dependencies.chat.chatStore), memoryStore);
  const pollingSupervisor = dependencies.chat.pollingSupervisor
    ?? createTelegramPollingSupervisor({ now: dependencies.shared.now });
  const telegramRelay = dependencies.chat.telegramRelay
    ?? createDefaultTelegramRelay(dependencies.shared, dependencies.chat, pollingSupervisor);
  const baseCompanionStore = dependencies.chat.companionStore
    ?? createDefaultCompanionStore(dependencies.shared, dependencies.chat);
  const companionStore = createMemoryAwareCompanionBoxStore(
    baseCompanionStore,
    memoryService,
    dependencies.chat.chatStore,
  );
  const orchestratorChannelRouter = dependencies.chat.orchestratorChannelRouter
    ?? chatOrchestratorChannelRouter;
  const orchestratorPlannerSurface = dependencies.chat.orchestratorPlannerSurface
    ?? chatOrchestratorPlannerSurface;
  const taskExecutionLocator = dependencies.chat.taskExecutionLocator
    ?? createChatTaskExecutionLocator(dependencies.chat.chatStore);
  const telegramRoomBridge = dependencies.chat.telegramRoomBridge
    ?? createChatTelegramRoomBridge({
      chatStore: dependencies.chat.chatStore,
      companionStore,
    });
  const resumePendingOrchestratorDispatch =
    dependencies.shared.resumePendingOrchestratorDispatch
    ?? (async (
      request: PendingOrchestratorDispatchRequest,
      _options: {
        trigger: 'dispatch' | 'approve' | 'reroute' | 'retry';
      },
    ) => dispatchOrchestratorTurn({
      ...request,
      senderName: request.senderName ?? undefined,
      chatStore: dependencies.chat.chatStore,
      channelRouter: orchestratorChannelRouter,
      plannerSurface: orchestratorPlannerSurface,
      runtimeClient: dependencies.shared.runtimeClient,
      now: dependencies.shared.now?.(),
      companionStore,
      memoryService,
    }));
  const resumeWorkflowContinuationDispatch =
    dependencies.shared.resumeWorkflowContinuationDispatch
    ?? (async (
      request,
      _options,
    ) => resumeStoredWorkflowContinuationDispatch({
      request,
      chatStore: dependencies.chat.chatStore,
      runtimeClient: dependencies.shared.runtimeClient,
      now: dependencies.shared.now?.() ?? new Date(),
      companionStore,
      memoryService,
    }));

  return {
    shared: {
      ...dependencies.shared,
      coreStore: sharedCoreStore,
      startup,
      resumePendingOrchestratorDispatch,
      resumeWorkflowContinuationDispatch,
    },
    chat: {
      ...dependencies.chat,
      companionStore,
      orchestratorChannelRouter,
      orchestratorPlannerSurface,
      taskExecutionLocator,
      memoryStore,
      memoryService,
      telegramRelay,
      telegramRoomBridge,
      pollingSupervisor,
    },
    work: {
      coreStore: dependencies.work?.coreStore ?? sharedCoreStore,
    },
    code: {
      coreStore: dependencies.code?.coreStore ?? sharedCoreStore,
    },
  };
}
