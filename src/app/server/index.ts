import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { spawn } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from '../../config.js';
import { routeCoreApi } from '../../core/api.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import {
  createTelegramRelay,
  type TelegramRelay,
} from '../../platform/transports/telegram/relay.js';
import {
  createFileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../../platform/transports/telegram/store.js';
import { routeChatApi } from '../../products/chat/api/index.js';
import {
  MemoryChatStore,
  type ChatStore,
} from '../../products/chat/state/store.js';
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
  handleTelegramStatus,
  handleTelegramWebhook,
} from '../../server/routes/telegram.js';

export interface ServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  chatStore: ChatStore;
  telegramRelay?: TelegramRelay;
  now?: () => Date;
}

type ResolvedServerDependencies = ServerDependencies & {
  telegramRelay: TelegramRelay;
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
  const runtime = await dependencies.runtimeClient.getHealth();
  const now = dependencies.now?.() ?? new Date();
  const status = runtime.reachable ? 'ok' : 'degraded';

  sendJson(response, runtime.reachable ? 200 : 503, {
    service: 'cats',
    status,
    timestamp: now.toISOString(),
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
    handleWorkPlaceholder(response, await dependencies.chatStore.readCore());
    return;
  }

  if (url.pathname === '/api/code') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return;
    }
    handleCodePlaceholder(response, await dependencies.chatStore.readCore());
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
      providerModelsMatch[0],
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

  if (url.pathname === '/api/transports/telegram/webhook') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return;
    }
    await handleTelegramWebhook(request, response, {
      chatStore: dependencies.chatStore,
      telegramRelay: dependencies.telegramRelay,
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
  const resolvedDependencies: ResolvedServerDependencies = {
    ...dependencies,
    telegramRelay: dependencies.telegramRelay ?? createDefaultTelegramRelay(dependencies),
  };

  return createHttpServer((request, response) => {
    void routeRequest(request, response, resolvedDependencies).catch((error) => {
      sendJson(response, 500, {
        error: {
          code: 'internal_error',
          message: error instanceof Error ? error.message : 'Unexpected server error',
        },
      });
    });
  });
}

function createDefaultTelegramRelay(dependencies: ServerDependencies): TelegramRelay {
  return createTelegramRelay({
    now: dependencies.now,
    store: dependencies.chatStore instanceof MemoryChatStore
      ? new InMemoryTelegramRelayStore()
      : createFileBackedTelegramRelayStore(dependencies.config.chatStatePath),
  });
}
