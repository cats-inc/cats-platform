import { spawn } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ResolvedServerDependencies } from './contracts.js';
import { routePlatformSetupApi } from './platformSetupRoutes.js';

import { routeCoreApi } from '../../core/api/index.js';
import {
  handleAdvancedProviderModels,
  handleProviderModels,
  handleProviderRegistry,
} from '../../server/routes/providers.js';
import {
  handleTelegramDiagnostics,
  handleTelegramPollingReconnect,
  handleTelegramPollingStatus,
  handleTelegramStatus,
  handleTelegramWebhook,
} from '../../server/routes/telegram.js';
import {
  matchRoute,
  sendBinary,
  sendJson,
  sendMethodNotAllowed,
} from '../../shared/http.js';
import { routeChatApi } from '../../products/chat/api/index.js';
import { routeCodeApi } from '../../products/code/api/index.js';
import { routeWorkApi } from '../../products/work/api/index.js';
import {
  getAppLifecycleContract,
  getAppOperationalStatus,
  getAppReadinessSnapshot,
  getAppShutdownContract,
} from './startup.js';

const WEB_DIST_ROOT = fileURLToPath(new URL('../../../dist', import.meta.url));
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function handleHealth(
  dependencies: ResolvedServerDependencies,
  response: import('node:http').ServerResponse,
): Promise<void> {
  const runtime = await dependencies.shared.runtimeClient.getHealth();
  const now = dependencies.shared.now?.() ?? new Date();
  const appStatus = getAppOperationalStatus(dependencies.shared.startup);
  const readiness = getAppReadinessSnapshot(dependencies.shared.startup);
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
    version: dependencies.shared.startup.version,
    contract: getAppLifecycleContract(dependencies.shared.startup),
    readiness,
    startup: {
      contractVersion: dependencies.shared.startup.contractVersion,
      mode: dependencies.shared.startup.mode,
      managedBy: dependencies.shared.startup.managedBy,
      phase: dependencies.shared.startup.phase,
      readySignal: dependencies.shared.startup.readySignal,
      ready: readiness.ready,
      pid: dependencies.shared.startup.pid,
      startedAt: dependencies.shared.startup.startedAt,
      address: dependencies.shared.startup.address,
      shutdownReason: dependencies.shared.startup.shutdownReason,
      lastEvent: dependencies.shared.startup.lastEvent,
    },
    shutdown: getAppShutdownContract(dependencies.shared.startup),
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

async function handleShellBrowse(
  url: URL,
  response: import('node:http').ServerResponse,
): Promise<void> {
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
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : '';
    payload.error = code === 'ENOENT'
      ? `Not a directory: ${resolvedPath}`
      : `Cannot read directory: ${resolvedPath}`;
    sendJson(response, 200, payload);
  }
}

async function handleShellOpenFolder(
  request: IncomingMessage,
  response: import('node:http').ServerResponse,
): Promise<void> {
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
}

export async function routeRequest(
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
  };
  const coreContext = {
    ...context,
    dependencies: {
      coreStore: dependencies.shared.coreStore,
      taskExecutionLocator: dependencies.chat.taskExecutionLocator,
      memoryService: dependencies.chat.memoryService,
      companionStore: dependencies.chat.companionStore,
      runtimeClient: dependencies.shared.runtimeClient,
      now: dependencies.shared.now,
      resumePendingOrchestratorDispatch: dependencies.shared.resumePendingOrchestratorDispatch,
      resumeWorkflowContinuationDispatch: dependencies.shared.resumeWorkflowContinuationDispatch,
    },
  };
  const chatContext = {
    ...context,
    dependencies: {
      config: dependencies.shared.config,
      runtimeClient: dependencies.shared.runtimeClient,
      chatStore: dependencies.chat.chatStore,
      mutationGate: dependencies.chat.mutationGate,
      orchestratorChannelRouter: dependencies.chat.orchestratorChannelRouter,
      orchestratorPlannerSurface: dependencies.chat.orchestratorPlannerSurface,
      telegramRelay: dependencies.chat.telegramRelay,
      telegramRoomBridge: dependencies.chat.telegramRoomBridge,
      pollingSupervisor: dependencies.chat.pollingSupervisor,
      telegramCommandSurfaceSync: dependencies.chat.telegramCommandSurfaceSync,
      companionStore: dependencies.chat.companionStore,
      memoryService: dependencies.chat.memoryService,
      eventHub: dependencies.chat.eventHub,
      now: dependencies.shared.now,
    },
  };
  const workContext = {
    ...context,
    dependencies: dependencies.work,
  };
  const codeContext = {
    ...context,
    dependencies: dependencies.code,
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
    await handleShellBrowse(url, response);
    return;
  }

  if (url.pathname === '/api/shell/open-folder') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }
    await handleShellOpenFolder(request, response);
    return;
  }

  if (await routePlatformSetupApi(chatContext)) {
    return;
  }

  if (await routeCoreApi(coreContext)) {
    return;
  }

  if (await routeWorkApi(workContext)) {
    return;
  }

  if (await routeCodeApi(codeContext)) {
    return;
  }

  if (url.pathname === '/api/providers') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleProviderRegistry({ runtimeClient: dependencies.shared.runtimeClient }, response);
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
      { runtimeClient: dependencies.shared.runtimeClient },
      providerModelsMatch[0]!,
      url.searchParams.get('instance'),
    );
    return;
  }

  const advancedProviderModelsMatch = matchRoute(
    url.pathname,
    /^\/api\/providers\/([^/]+)\/models\/advanced$/u,
  );
  if (advancedProviderModelsMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleAdvancedProviderModels(
      response,
      { runtimeClient: dependencies.shared.runtimeClient },
      advancedProviderModelsMatch[0]!,
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
      chatStore: dependencies.chat.chatStore,
      telegramRelay: dependencies.chat.telegramRelay,
    });
    return;
  }

  if (url.pathname === '/api/transports/telegram/diagnostics') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    await handleTelegramDiagnostics(response, {
      chatStore: dependencies.chat.chatStore,
      telegramRelay: dependencies.chat.telegramRelay,
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
    await handleTelegramWebhook(
      request,
      response,
      {
        chatStore: dependencies.chat.chatStore,
        telegramRoomBridge: dependencies.chat.telegramRoomBridge,
        memoryService: dependencies.chat.memoryService,
        telegramRelay: dependencies.chat.telegramRelay,
        runtimeClient: dependencies.shared.runtimeClient,
        eventHub: dependencies.chat.eventHub,
        now: dependencies.shared.now,
      },
      telegramWebhookMatch[0],
    );
    return;
  }

  if (url.pathname === '/api/transports/telegram/polling') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    handleTelegramPollingStatus(response, {
      pollingSupervisor: dependencies.chat.pollingSupervisor,
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
      chatStore: dependencies.chat.chatStore,
      telegramRoomBridge: dependencies.chat.telegramRoomBridge,
      memoryService: dependencies.chat.memoryService,
      telegramRelay: dependencies.chat.telegramRelay,
      runtimeClient: dependencies.shared.runtimeClient,
      pollingSupervisor: dependencies.chat.pollingSupervisor,
      now: dependencies.shared.now,
    });
    return;
  }

  if (await routeChatApi(chatContext)) {
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
