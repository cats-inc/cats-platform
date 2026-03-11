import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from './config.js';
import type { RuntimeClient } from './runtime/client.js';
import { createAppShell } from './workspace/shell.js';

export interface ServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  now?: () => Date;
}

const WEB_DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url));
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
  });
  response.end(body);
}

function sendBinary(
  response: ServerResponse,
  statusCode: number,
  body: Buffer,
  contentType: string,
): void {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'content-length': body.byteLength.toString(),
  });
  response.end(body);
}

function sendMethodNotAllowed(response: ServerResponse): void {
  sendJson(response, 405, { error: 'Method not allowed' });
}

function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const method = request.method ?? 'GET';

  if (method !== 'GET') {
    switch (url.pathname) {
      case '/health':
      case '/api/app-shell':
        sendMethodNotAllowed(response);
        return Promise.resolve();
      default:
        sendJson(response, 404, { error: 'Not found' });
        return Promise.resolve();
    }
  }

  return handleGet(url.pathname, response, dependencies);
}

async function handleGet(
  path: string,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const runtime = await dependencies.runtimeClient.getHealth();
  const now = dependencies.now?.() ?? new Date();

  switch (path) {
    case '/health': {
      const status = runtime.reachable ? 'ok' : 'degraded';
      const statusCode = runtime.reachable ? 200 : 503;

      sendJson(response, statusCode, {
        service: 'cats-inc',
        status,
        timestamp: now.toISOString(),
        runtime,
      });
      return;
    }
    case '/api/app-shell':
      sendJson(response, 200, createAppShell(dependencies.config, runtime, now));
      return;
    default:
      if (await tryServeWebAsset(path, response)) {
        return;
      }
      sendJson(response, 404, { error: 'Not found' });
  }
}

async function tryServeWebAsset(pathname: string, response: ServerResponse): Promise<boolean> {
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
    const contentType = MIME_TYPES[extension] ?? 'application/octet-stream';
    sendBinary(response, 200, fileBody, contentType);
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

export function createServer(dependencies: ServerDependencies) {
  return createHttpServer((request, response) => {
    void routeRequest(request, response, dependencies);
  });
}
