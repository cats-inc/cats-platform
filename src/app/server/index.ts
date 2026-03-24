import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { spawn } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from '../../config.js';
import { routeCoreApi } from '../../core/api/index.js';
import type { CoreStore } from '../../core/store.js';
import type { TaskExecutionLocator } from '../../core/taskExecutionLocator.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import type {
  OrchestratorChannelRouter,
  OrchestratorDispatchResponse,
  OrchestratorPlannerSurface,
} from '../../platform/orchestration/contracts.js';
import {
  createCatsMemoryService,
  createFileBackedCanonicalMemoryStore,
  MemoryCanonicalMemoryStore,
  type CanonicalMemoryStore,
  type CatsMemoryService,
} from '../../platform/memory/index.js';
import { createTelegramBotApiDeliveryClient } from '../../platform/transports/telegram/delivery.js';
import {
  createTelegramPollingSupervisor,
  type TelegramPollingSupervisor,
} from '../../platform/transports/telegram/polling.js';
import {
  createTelegramRelay,
  type TelegramRelay,
} from '../../platform/transports/telegram/relay/index.js';
import type { TelegramRoomBridge } from '../../platform/transports/telegram/bridge.js';
import { dispatchOrchestratorTurn } from '../../platform/orchestration/index.js';
import type { PendingOrchestratorDispatchRequest } from '../../platform/orchestration/pendingDispatch.js';
import {
  createFileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../../platform/transports/telegram/store/index.js';
import { routeChatApi } from '../../products/chat/api/index.js';
import type { ChatState } from '../../products/chat/api/contracts.js';
import {
  createFileBackedCompanionBoxStore,
  MemoryCompanionBoxStore,
  type CompanionBoxStore,
} from '../../products/chat/state/companion-box/index.js';
import {
  MemoryChatStore,
  type ChatStore,
} from '../../products/chat/state/store.js';
import { createChatTaskExecutionLocator } from '../../products/chat/state/taskExecutionLocator.js';
import {
  chatOrchestratorChannelRouter,
  chatOrchestratorPlannerSurface,
} from '../../products/chat/state/orchestratorAdapter.js';
import { createMemoryAwareCompanionBoxStore } from '../../products/chat/state/companionMemoryAdapter.js';
import { createChatMemorySurface } from '../../products/chat/state/memoryAdapter.js';
import { createChatTelegramRoomBridge } from '../../products/chat/state/telegramBridgeAdapter.js';
import { handleCodePlaceholder } from '../../products/code/api/index.js';
import { handleWorkPlaceholder } from '../../products/work/api/index.js';
import {
  matchRoute,
  sendBinary,
  sendJson,
  sendMethodNotAllowed,
} from '../../shared/http.js';
import {
  handleProviderModels,
  handleProviderRegistry,
} from '../../server/routes/providers.js';
import {
  createAppStartupState,
  getAppLifecycleContract,
  getAppOperationalStatus,
  getAppReadinessSnapshot,
  getAppShutdownContract,
  type AppStartupState,
} from './startup.js';
import {
  handleTelegramDiagnostics,
  handleTelegramPollingReconnect,
  handleTelegramPollingStatus,
  handleTelegramStatus,
  handleTelegramWebhook,
} from '../../server/routes/telegram.js';

export interface ServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  chatStore: ChatStore;
  coreStore?: CoreStore;
  startup?: AppStartupState;
  companionStore?: CompanionBoxStore;
  orchestratorChannelRouter?: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface?: OrchestratorPlannerSurface<ChatState>;
  taskExecutionLocator?: TaskExecutionLocator;
  memoryStore?: CanonicalMemoryStore;
  memoryService?: CatsMemoryService;
  telegramRelay?: TelegramRelay;
  telegramRoomBridge?: TelegramRoomBridge<ChatState>;
  pollingSupervisor?: TelegramPollingSupervisor;
  now?: () => Date;
  resumePendingOrchestratorDispatch?: (
    request: PendingOrchestratorDispatchRequest,
    options: {
      trigger: 'approve' | 'reroute';
    },
  ) => Promise<OrchestratorDispatchResponse>;
}

type ResolvedServerDependencies = ServerDependencies & {
  coreStore: CoreStore;
  startup: AppStartupState;
  companionStore: CompanionBoxStore;
  orchestratorChannelRouter: OrchestratorChannelRouter<CompanionBoxStore, ChatState>;
  orchestratorPlannerSurface: OrchestratorPlannerSurface<ChatState>;
  taskExecutionLocator: TaskExecutionLocator;
  memoryStore: CanonicalMemoryStore;
  memoryService: CatsMemoryService;
  telegramRelay: TelegramRelay;
  telegramRoomBridge: TelegramRoomBridge<ChatState>;
  pollingSupervisor: TelegramPollingSupervisor;
};

const WEB_DIST_ROOT = fileURLToPath(new URL('../../../dist', import.meta.url));
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function handleHealth(
  dependencies: ServerDependencies,
  response: import('node:http').ServerResponse,
): Promise<void> {
  const startup = dependencies.startup ?? createAppStartupState();
  const runtime = await dependencies.runtimeClient.getHealth();
  const now = dependencies.now?.() ?? new Date();
  const appStatus = getAppOperationalStatus(startup);
  const readiness = getAppReadinessSnapshot(startup);
  const status = appStatus.status === 'unavailable'
    ? 'unavailable'
    : runtime.reachable
      ? appStatus.status
      : 'degraded';
  const summary = !runtime.reachable && appStatus.status === 'ok'
    ? 'Cats app server is ready, but cats-runtime is unreachable.'
    : appStatus.summary;

  sendJson(response, readiness.ready ? 200 : 503, {
    service: 'cats',
    status,
    summary,
    timestamp: now.toISOString(),
    version: startup.version,
    contract: getAppLifecycleContract(startup),
    readiness,
    startup: {
      contractVersion: startup.contractVersion,
      mode: startup.mode,
      managedBy: startup.managedBy,
      phase: startup.phase,
      readySignal: startup.readySignal,
      ready: readiness.ready,
      pid: startup.pid,
      startedAt: startup.startedAt,
      address: startup.address,
      shutdownReason: startup.shutdownReason,
      lastEvent: startup.lastEvent,
    },
    shutdown: getAppShutdownContract(startup),
    runtime,
  });
}

async function tryServeWebAsset(
  pathname: string,
  response: import('node:http').ServerResponse,
): Promise<boolean> {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const resolvedPath = path.resolve(WEB_DIST_ROOT, `.${requestedPath}`);

  if (!resolvedPath.startsWith(WEB_DIST_ROOT)) {
    return false;
  }

  const fallbackIndexPath = path.join(WEB_DIST_ROOT, 'index.html');
  const candidatePath = path.extname(resolvedPath) ? resolvedPath : fallbackIndexPath;

  try {
    await access(candidatePath);
    const fileBody = await readFile(candidatePath);
    const extension = path.extname(candidatePath);
    sendBinary(
      response,
      200,
      fileBody,
      MIME_TYPES[extension] ?? 'application/octet-stream',
    );
    return true;
  } catch {
    if (candidatePath !== fallbackIndexPath) {
      try {
        await access(fallbackIndexPath);
        const fileBody = await readFile(fallbackIndexPath);
        sendBinary(response, 200, fileBody, MIME_TYPES['.html']);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }
}

async function routeRequest(
  request: IncomingMessage,
  response: import('node:http').ServerResponse,
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  const url = new URL(
    request.url ?? '/',
    `http://${request.headers.host ?? 'localhost'}`,
  );
  const method = request.method ?? 'GET';
  const context = {
    request,
    response,
    url,
    method,
    dependencies,
  };

  if (url.pathname === '/health') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleHealth(dependencies, response);
    return;
  }

  if (url.pathname === '/api/shell/browse') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    const requestedPath = url.searchParams.get('path')?.trim() ?? '';
    const resolvedPath = path.resolve(requestedPath || os.homedir());
    const payload = {
      current: resolvedPath,
      parent: path.dirname(resolvedPath),
      entries: [] as Array<{ name: string; path: string }>,
      error: undefined as string | undefined,
    };

    try {
      const targetStats = await stat(resolvedPath);
      if (!targetStats.isDirectory()) {
        payload.error = `Not a directory: ${resolvedPath}`;
        sendJson(response, 200, payload);
        return;
      }

      const directoryEntries = await readdir(resolvedPath, { withFileTypes: true });
      payload.entries = directoryEntries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => ({
          name: entry.name,
          path: path.join(resolvedPath, entry.name),
        }));
      sendJson(response, 200, payload);
      return;
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : '';
      payload.error = code === 'ENOENT'
        ? `Not a directory: ${resolvedPath}`
        : `Cannot read directory: ${resolvedPath}`;
      sendJson(response, 200, payload);
      return;
    }
  }

  if (url.pathname === '/api/shell/open-folder') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }
    try {
      const { readJsonBody } = await import('../../shared/http.js');
      const body = await readJsonBody<{ path: string }>(request);
      const folderPath = body.path?.trim();
      if (!folderPath) {
        sendJson(response, 400, { error: 'path is required' });
        return;
      }
      const stats = await stat(folderPath);
      if (!stats.isDirectory()) {
        sendJson(response, 400, { error: 'path is not a directory' });
        return;
      }
      const [command, args] = process.platform === 'win32'
        ? ['explorer', [folderPath]]
        : process.platform === 'darwin'
          ? ['open', [folderPath]]
          : ['xdg-open', [folderPath]];
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      sendJson(response, 200, { opened: folderPath });
    } catch {
      sendJson(response, 400, { error: 'failed to open folder' });
    }
    return;
  }

  if (await routeCoreApi(context)) {
    return;
  }

  if (url.pathname === '/api/work') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    handleWorkPlaceholder(response, await dependencies.coreStore.readCore());
    return;
  }

  if (url.pathname === '/api/code') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    handleCodePlaceholder(response, await dependencies.coreStore.readCore());
    return;
  }

  if (url.pathname === '/api/providers') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleProviderRegistry(dependencies, response);
    return;
  }

  const providerModelsMatch = matchRoute(
    url.pathname,
    /^\/api\/providers\/([^/]+)\/models$/u,
  );
  if (providerModelsMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleProviderModels(
      response,
      { runtimeClient: dependencies.runtimeClient },
      providerModelsMatch[0]!,
      url.searchParams.get('instance'),
    );
    return;
  }

  if (url.pathname === '/api/transports/telegram') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleTelegramStatus(response, {
      chatStore: dependencies.chatStore,
      telegramRelay: dependencies.telegramRelay,
    });
    return;
  }

  if (url.pathname === '/api/transports/telegram/diagnostics') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleTelegramDiagnostics(response, {
      chatStore: dependencies.chatStore,
      telegramRelay: dependencies.telegramRelay,
    });
    return;
  }

  const telegramWebhookMatch = matchRoute(
    url.pathname,
    /^\/api\/transports\/telegram\/webhook(?:\/([^/]+))?$/u,
  );
  if (telegramWebhookMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }
    await handleTelegramWebhook(request, response, {
      chatStore: dependencies.chatStore,
      telegramRoomBridge: dependencies.telegramRoomBridge,
      memoryService: dependencies.memoryService,
      telegramRelay: dependencies.telegramRelay,
      runtimeClient: dependencies.runtimeClient,
      now: dependencies.now,
    }, telegramWebhookMatch[0]);
    return;
  }

  if (url.pathname === '/api/transports/telegram/polling') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    handleTelegramPollingStatus(response, {
      pollingSupervisor: dependencies.pollingSupervisor,
    });
    return;
  }

  const pollingReconnectMatch = matchRoute(
    url.pathname,
    /^\/api\/transports\/telegram\/polling\/([^/]+)\/reconnect$/u,
  );
  if (pollingReconnectMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }
    await handleTelegramPollingReconnect(response, {
      bindingId: pollingReconnectMatch[0]!,
      chatStore: dependencies.chatStore,
      telegramRoomBridge: dependencies.telegramRoomBridge,
      memoryService: dependencies.memoryService,
      telegramRelay: dependencies.telegramRelay,
      runtimeClient: dependencies.runtimeClient,
      pollingSupervisor: dependencies.pollingSupervisor,
      now: dependencies.now,
    });
    return;
  }

  if (await routeChatApi(context)) {
    return;
  }

  if (method === 'GET') {
    const served = await tryServeWebAsset(url.pathname, response);
    if (!served) {
      sendJson(response, 404, {
        error: { code: 'not_found', message: 'Not found' },
      });
    }
    return;
  }

  sendJson(response, 404, { error: { code: 'not_found', message: 'Not found' } });
}

export function createServer(dependencies: ServerDependencies) {
  const memoryStore = dependencies.memoryStore
    ?? createDefaultMemoryStore(dependencies);
  const memoryService = dependencies.memoryService
    ?? createCatsMemoryService(createChatMemorySurface(dependencies.chatStore), memoryStore);
  const pollingSupervisor = dependencies.pollingSupervisor
    ?? createTelegramPollingSupervisor({ now: dependencies.now });
  const telegramRelay = dependencies.telegramRelay
    ?? createDefaultTelegramRelay(dependencies, pollingSupervisor);
  const baseCompanionStore = dependencies.companionStore ?? createDefaultCompanionStore(dependencies);
  const companionStore = createMemoryAwareCompanionBoxStore(baseCompanionStore, memoryService);
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
      channelRouter: dependencies.orchestratorChannelRouter ?? chatOrchestratorChannelRouter,
      plannerSurface: dependencies.orchestratorPlannerSurface ?? chatOrchestratorPlannerSurface,
      runtimeClient: dependencies.runtimeClient,
      now: dependencies.now?.(),
      companionStore,
      memoryService,
    }));

  const resolvedDependencies: ResolvedServerDependencies = {
    ...dependencies,
    coreStore: dependencies.coreStore ?? dependencies.chatStore,
    startup: dependencies.startup ?? createAppStartupState({
      phase: 'ready',
      ready: true,
    }),
    companionStore,
    orchestratorChannelRouter: dependencies.orchestratorChannelRouter ?? chatOrchestratorChannelRouter,
    orchestratorPlannerSurface: dependencies.orchestratorPlannerSurface ?? chatOrchestratorPlannerSurface,
    taskExecutionLocator: dependencies.taskExecutionLocator
      ?? createChatTaskExecutionLocator(dependencies.chatStore),
    memoryStore,
    memoryService,
    telegramRelay,
    telegramRoomBridge: dependencies.telegramRoomBridge ?? createChatTelegramRoomBridge({
      chatStore: dependencies.chatStore,
      companionStore,
    }),
    pollingSupervisor,
    resumePendingOrchestratorDispatch,
  };

  const server = createHttpServer((request, response) => {
    void routeRequest(request, response, resolvedDependencies).catch((error) => {
      sendJson(response, 500, {
        error: {
          code: 'internal_error',
          message: error instanceof Error ? error.message : 'Unexpected server error',
        },
      });
    });
  });

  // Stop polling consumers when server closes
  server.on('close', () => {
    pollingSupervisor.stopAll();
  });

  // Schedule polling reconciliation after server is created
  void reconcilePollingOnStartup(resolvedDependencies).catch(() => {});

  return server;
}

async function reconcilePollingOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  const { readTelegramPollingContext } = await import('../../server/routes/telegram.js');
  const pollingContext = await readTelegramPollingContext(dependencies.chatStore);
  if (pollingContext.bindings.length > 0) {
    await dependencies.pollingSupervisor.reconcilePolling({
      bindings: pollingContext.bindings,
      context: pollingContext.context,
      refreshContext: async () => (await readTelegramPollingContext(dependencies.chatStore)).context,
      roomBridge: dependencies.telegramRoomBridge,
      memoryService: dependencies.memoryService,
      runtimeClient: dependencies.runtimeClient,
      telegramRelay: dependencies.telegramRelay,
    });
  }
}

function createDefaultTelegramRelay(
  dependencies: ServerDependencies,
  pollingSupervisor?: TelegramPollingSupervisor,
): TelegramRelay {
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
    getPollingStatuses: () => pollingSupervisor?.getAllPollingStatuses() ?? [],
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
