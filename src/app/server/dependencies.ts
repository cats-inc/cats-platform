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
import {
  createFileBackedScheduleStore,
  MemoryScheduleStore,
  type ScheduleStore,
} from '../../platform/scheduler/index.js';
import {
  createFileBackedPlatformAuthStore,
  createGoogleJwksIdTokenVerifier,
  MemoryPlatformAuthStore,
  type PlatformAuthRecoveryTokenState,
  type PlatformAuthStore,
} from '../../platform/auth/index.js';
import { createTelegramPollingSupervisor } from '../../platform/transports/telegram/polling.js';
import { createTelegramRelay } from '../../platform/transports/telegram/relay/index.js';
import {
  createFileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../../platform/transports/telegram/store/index.js';
import { readEvidenceEvents as readPersistedEvidenceEvents } from '../../platform/persistence/evidence.js';
import { dispatchOrchestratorTurn } from '../../products/chat/api/orchestratorDispatch.js';
import type { PendingOrchestratorDispatchRequest } from '../../platform/orchestration/pendingDispatch.js';
import { createMemoryAwareCompanionBoxStore } from '../../products/chat/state/companionMemoryAdapter.js';
import {
  createFileBackedCompanionBoxStore,
  MemoryCompanionBoxStore,
  type CompanionBoxStore,
} from '../../products/chat/state/companion-box/index.js';
import {
  createFileCompanionActivityStore,
  createMemoryCompanionActivityStore,
  type CompanionActivityStore,
} from '../../products/chat/companion/activityStore.js';
import { resolveCompanionActivityPathFromChatState } from '../../shared/platformPaths.js';
import { createChatMemorySurface } from '../../products/chat/state/memoryAdapter.js';
import {
  createChatDeterministicChannelRouter,
  chatDeterministicChannelRouter,
  chatDeterministicPlannerSurface,
  resumeStoredWorkflowContinuationDispatch,
} from '../../products/chat/state/deterministicRouterAdapter.js';
import { createChatProviderAgentDecisionRequester } from '../../products/chat/state/providerAgentDecisionRequester.js';
import {
  createProviderCapabilityBootstrapDiagnosticSink,
  resolveProviderCapabilityBootstrapDiagnosticsPath,
} from '../../platform/supervision/providerCapabilityBootstrapDiagnostics.js';
import { loadProviderCapabilityBootstrapConfigFromFile } from '../../platform/supervision/providerCapabilityBootstrapYaml.js';
import { MemoryChatStore } from '../../products/chat/state/store.js';
import { createAsyncKeyedGate } from '../../products/chat/shared/asyncControl.js';
import { createChatTaskExecutionLocator } from '../../products/chat/state/taskExecutionLocator.js';
import { createChatTelegramRoomBridge } from '../../products/chat/state/telegramBridgeAdapter.js';
import {
  registerCodeArtifactRuntimeInvocationEnrichers,
} from '../../products/code/state/runtimeArtifactTooling.js';
import {
  registerCodeArtifactRuntimeAssistantEffectProcessor,
} from '../../products/code/state/runtimeArtifactExecution.js';
import {
  registerCodeArtifactRuntimeFinalizationGate,
} from '../../products/code/state/sessionFinalization.js';

function createDefaultCompanionStore(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
): CompanionBoxStore {
  return chat.chatStore instanceof MemoryChatStore
    ? new MemoryCompanionBoxStore()
    : createFileBackedCompanionBoxStore(shared.config.chatStatePath);
}

function createDefaultCompanionActivityStore(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
): CompanionActivityStore {
  return chat.chatStore instanceof MemoryChatStore
    ? createMemoryCompanionActivityStore()
    : createFileCompanionActivityStore(
      resolveCompanionActivityPathFromChatState(shared.config.chatStatePath),
    );
}

function createDefaultMemoryStore(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
): CanonicalMemoryStore {
  return chat.chatStore instanceof MemoryChatStore
    ? new MemoryCanonicalMemoryStore()
    : createFileBackedCanonicalMemoryStore(shared.config.chatStatePath);
}

function createDefaultScheduleStore(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
): ScheduleStore {
  return chat.chatStore instanceof MemoryChatStore
    ? new MemoryScheduleStore(undefined, shared.now)
    : createFileBackedScheduleStore(shared.config.chatStatePath, shared.now);
}

function createDefaultAuthStore(
  shared: SharedServerDependencies,
  chat: ChatServerDependencies,
): PlatformAuthStore {
  return chat.chatStore instanceof MemoryChatStore
    ? new MemoryPlatformAuthStore(undefined, shared.now)
    : createFileBackedPlatformAuthStore(shared.config.chatStatePath, shared.now);
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
  registerCodeArtifactRuntimeInvocationEnrichers();
  registerCodeArtifactRuntimeAssistantEffectProcessor();
  registerCodeArtifactRuntimeFinalizationGate();

  const sharedCoreStore = dependencies.shared.coreStore ?? dependencies.chat.chatStore;
  const authStore = dependencies.shared.authStore
    ?? createDefaultAuthStore(dependencies.shared, dependencies.chat);
  const googleVerifier = dependencies.shared.googleVerifier
    ?? (
      dependencies.shared.config.auth.google.clientId
      || dependencies.shared.config.auth.google.mobileAudiences.length > 0
        ? createGoogleJwksIdTokenVerifier()
        : undefined
    );
  let authRecoveryTokenState: PlatformAuthRecoveryTokenState | null =
    dependencies.shared.authRecoveryTokenState ?? null;
  const getAuthRecoveryTokenState = dependencies.shared.getAuthRecoveryTokenState
    ?? (() => authRecoveryTokenState);
  const setAuthRecoveryTokenState = dependencies.shared.setAuthRecoveryTokenState
    ?? ((state: PlatformAuthRecoveryTokenState | null) => {
      authRecoveryTokenState = state;
    });
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
  const capabilityBootstrapLoaded =
    dependencies.shared.providerCapabilityBootstrapConfig !== undefined
      ? {
          config: dependencies.shared.providerCapabilityBootstrapConfig,
          diagnostics: dependencies.shared.providerCapabilityBootstrapDiagnostics ?? [],
        }
      : loadProviderCapabilityBootstrapConfigFromFile({
          configPath: dependencies.shared.config.providerCapabilityBootstrapConfigPath,
          bundledExamplePath:
            dependencies.shared.config.providerCapabilityBootstrapBundledExamplePath,
          observedAt: (dependencies.shared.now?.() ?? new Date()).toISOString(),
        });
  const providerCapabilityBootstrapDiagnosticSink =
    dependencies.shared.providerCapabilityBootstrapDiagnosticSink
    ?? createProviderCapabilityBootstrapDiagnosticSink({
      initialRecords: capabilityBootstrapLoaded.diagnostics,
      persistPath: resolveProviderCapabilityBootstrapDiagnosticsPath(
        dependencies.shared.config.chatStatePath,
      ),
    });
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
  const companionActivityStore = dependencies.chat.companionActivityStore
    ?? createDefaultCompanionActivityStore(dependencies.shared, dependencies.chat);
  const providerAgentDecisionRequester = dependencies.chat.providerAgentDecisionRequester
    ?? (
      dependencies.shared.config.chatProviderAgentDecisionEnabled === true
        ? createChatProviderAgentDecisionRequester({ failureMode: 'return_null' })
        : undefined
    );
  const orchestratorChannelRouter = dependencies.chat.orchestratorChannelRouter
    ?? (
      dependencies.shared.config.runtimeStaleSessionRetryLimit === undefined
      && providerAgentDecisionRequester === undefined
      && dependencies.shared.config.chatNaturalProductIntentMode === undefined
        ? chatDeterministicChannelRouter
        : createChatDeterministicChannelRouter({
          runtimeRecovery: {
            staleSessionRetryLimit: dependencies.shared.config.runtimeStaleSessionRetryLimit,
          },
          chatStatePath: dependencies.shared.config.chatStatePath,
          runtimeDataDir: dependencies.shared.config.runtimeDataDir,
          providerAgentDecisionRequester,
          providerCapabilityBootstrapConfig: capabilityBootstrapLoaded.config,
          providerCapabilityBootstrapDiagnosticSink,
          naturalProductIntentMode: dependencies.shared.config.chatNaturalProductIntentMode,
        })
    );
  const orchestratorPlannerSurface = dependencies.chat.orchestratorPlannerSurface
    ?? chatDeterministicPlannerSurface;
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
      providerAgentDecisionRequester,
      providerCapabilityBootstrapConfig: capabilityBootstrapLoaded.config,
      providerCapabilityBootstrapDiagnosticSink,
      naturalProductIntentMode: dependencies.shared.config.chatNaturalProductIntentMode,
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
      authStore,
      googleVerifier,
      authRecoveryTokenState: getAuthRecoveryTokenState(),
      getAuthRecoveryTokenState,
      setAuthRecoveryTokenState,
      resumePendingOrchestratorDispatch,
      resumeWorkflowContinuationDispatch,
      providerCapabilityBootstrapConfig: capabilityBootstrapLoaded.config,
      providerCapabilityBootstrapDiagnostics: providerCapabilityBootstrapDiagnosticSink.list(),
      providerCapabilityBootstrapDiagnosticSink,
    },
    chat: {
      ...dependencies.chat,
      mutationGate,
      companionStore,
      companionActivityStore,
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
      providerAgentDecisionRequester,
    },
    work: {
      coreStore: dependencies.work?.coreStore ?? sharedCoreStore,
      runtimeClient: dependencies.work?.runtimeClient ?? dependencies.shared.runtimeClient,
      runtimeTarget: dependencies.work?.runtimeTarget,
      scheduleStore: dependencies.work?.scheduleStore
        ?? createDefaultScheduleStore(dependencies.shared, dependencies.chat),
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
      evidenceDataDir: dependencies.code?.evidenceDataDir ?? dependencies.shared.config.chatStatePath,
      readEvidenceEvents: dependencies.code?.readEvidenceEvents
        ?? ((conversationId: string) =>
          readPersistedEvidenceEvents(dependencies.shared.config.chatStatePath, conversationId)),
      livePreviewStore: dependencies.code?.livePreviewStore,
      stopLivePreview: dependencies.code?.stopLivePreview,
      now: dependencies.code?.now ?? dependencies.shared.now,
    },
  };
}
