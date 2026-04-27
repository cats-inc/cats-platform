import { createChatEventHub } from '../../products/chat/api/chatEventHub.js';
import { createAppStartupState } from './startup.js';
import { createTelegramCommandSurfaceSync } from './telegramCommandSurfaceSync.js';
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
import { readEvidenceEvents as readPersistedEvidenceEvents } from '../../platform/persistence/evidence.js';
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
  createChatOrchestratorChannelRouter,
  chatOrchestratorChannelRouter,
  chatOrchestratorPlannerSurface,
  resumeStoredWorkflowContinuationDispatch,
} from '../../products/chat/state/orchestratorAdapter.js';
import { MemoryChatStore } from '../../products/chat/state/store.js';
import { createAsyncKeyedGate } from '../../products/chat/shared/asyncControl.js';
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
  options: {
    defaultBotToken: string | null;
    resolveBotApiClient: (botToken: string) => ReturnType<typeof createTelegramBotApiDeliveryClient>;
  },
): ResolvedChatServerDependencies['telegramRelay'] {
  const webhookSecretToken = process.env.CATS_TELEGRAM_WEBHOOK_SECRET?.trim() || null;
  const parsedMaxBodyBytes = Number.parseInt(
    process.env.CATS_TELEGRAM_WEBHOOK_MAX_BYTES ?? '',
    10,
  );

  return createTelegramRelay({
    now: shared.now,
    store: chat.chatStore instanceof MemoryChatStore
      ? new InMemoryTelegramRelayStore()
      : createFileBackedTelegramRelayStore(shared.config.chatStatePath),
    webhookSecretToken,
    maxBodyBytes: Number.isFinite(parsedMaxBodyBytes) ? parsedMaxBodyBytes : undefined,
    getPollingStatuses: () => pollingSupervisor.getAllPollingStatuses(),
    resolveDeliveryClient(binding) {
      const resolvedToken = binding?.botToken?.trim() || options.defaultBotToken;
      if (!resolvedToken) {
        return null;
      }
      return options.resolveBotApiClient(resolvedToken);
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
  const mutationGate = dependencies.chat.mutationGate ?? createAsyncKeyedGate();
  const defaultTelegramBotToken = process.env.CATS_TELEGRAM_BOT_TOKEN?.trim() || null;
  const deliveryClientCache = new Map<string, ReturnType<typeof createTelegramBotApiDeliveryClient>>();
  const resolveTelegramBotApiClient = (botToken: string) => {
    const existing = deliveryClientCache.get(botToken);
    if (existing) {
      return existing;
    }
    const client = createTelegramBotApiDeliveryClient({
      botToken,
    });
    deliveryClientCache.set(botToken, client);
    return client;
  };
  const telegramRelay = dependencies.chat.telegramRelay
    ?? createDefaultTelegramRelay(
      dependencies.shared,
      dependencies.chat,
      pollingSupervisor,
      {
        defaultBotToken: defaultTelegramBotToken,
        resolveBotApiClient: resolveTelegramBotApiClient,
      },
    );
  const telegramCommandSurfaceSync = dependencies.chat.telegramCommandSurfaceSync
    ?? createTelegramCommandSurfaceSync({
      chatStore: dependencies.chat.chatStore,
      defaultBotToken: defaultTelegramBotToken,
      resolveClient: resolveTelegramBotApiClient,
    });
  const baseCompanionStore = dependencies.chat.companionStore
    ?? createDefaultCompanionStore(dependencies.shared, dependencies.chat);
  const companionStore = createMemoryAwareCompanionBoxStore(
    baseCompanionStore,
    memoryService,
    dependencies.chat.chatStore,
  );
  const orchestratorChannelRouter = dependencies.chat.orchestratorChannelRouter
    ?? (
      dependencies.shared.config.runtimeStaleSessionRetryLimit === undefined
        ? chatOrchestratorChannelRouter
        : createChatOrchestratorChannelRouter({
          runtimeRecovery: {
            staleSessionRetryLimit: dependencies.shared.config.runtimeStaleSessionRetryLimit,
          },
          chatStatePath: dependencies.shared.config.chatStatePath,
          runtimeDataDir: dependencies.shared.config.runtimeDataDir,
        })
    );
  const orchestratorPlannerSurface = dependencies.chat.orchestratorPlannerSurface
    ?? chatOrchestratorPlannerSurface;
  const taskExecutionLocator = dependencies.chat.taskExecutionLocator
    ?? createChatTaskExecutionLocator(dependencies.chat.chatStore);
  const telegramRoomBridge = dependencies.chat.telegramRoomBridge
    ?? createChatTelegramRoomBridge({
      chatStore: dependencies.chat.chatStore,
      companionStore,
      mutationGate,
      chatStatePath: dependencies.shared.config.chatStatePath,
      runtimeDataDir: dependencies.shared.config.runtimeDataDir,
      runtimeRecovery: {
        staleSessionRetryLimit: dependencies.shared.config.runtimeStaleSessionRetryLimit,
      },
    });
  const resumePendingOrchestratorDispatch =
    dependencies.shared.resumePendingOrchestratorDispatch
    ?? (async (
      request: PendingOrchestratorDispatchRequest,
      _options: {
        trigger: 'dispatch' | 'approve' | 'reroute' | 'retry';
      },
    ) => mutationGate.run(request.channelId, async () => dispatchOrchestratorTurn({
      ...request,
      senderName: request.senderName ?? undefined,
      chatStore: dependencies.chat.chatStore,
      channelRouter: orchestratorChannelRouter,
      plannerSurface: orchestratorPlannerSurface,
      runtimeClient: dependencies.shared.runtimeClient,
      now: dependencies.shared.now?.(),
      companionStore,
      memoryService,
    })));
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
      mutationGate,
      companionStore,
      orchestratorChannelRouter,
      orchestratorPlannerSurface,
      taskExecutionLocator,
      memoryStore,
      memoryService,
      telegramRelay,
      telegramRoomBridge,
      pollingSupervisor,
      telegramCommandSurfaceSync,
      eventHub: dependencies.chat.eventHub ?? createChatEventHub(),
    },
    work: {
      coreStore: dependencies.work?.coreStore ?? sharedCoreStore,
      runtimeClient: dependencies.work?.runtimeClient ?? dependencies.shared.runtimeClient,
      runtimeTarget: dependencies.work?.runtimeTarget,
      evidenceDataDir: dependencies.work?.evidenceDataDir ?? dependencies.shared.config.chatStatePath,
      readEvidenceEvents: dependencies.work?.readEvidenceEvents
        ?? ((conversationId: string) =>
          readPersistedEvidenceEvents(dependencies.shared.config.chatStatePath, conversationId)),
      now: dependencies.shared.now,
    },
    code: {
      coreStore: dependencies.code?.coreStore ?? sharedCoreStore,
      runtimeClient: dependencies.code?.runtimeClient ?? dependencies.shared.runtimeClient,
      config: dependencies.code?.config ?? dependencies.shared.config,
      now: dependencies.code?.now ?? dependencies.shared.now,
    },
  };
}
