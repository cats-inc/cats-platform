import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { AppConfig } from './config.js';
import type { RuntimeClient } from './runtime/client.js';
import { createAppShell } from './workspace/shell.js';

export interface ServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  now?: () => Date;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
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
      sendJson(response, 404, { error: 'Not found' });
  }
}

export function createServer(dependencies: ServerDependencies) {
  return createHttpServer((request, response) => {
    void routeRequest(request, response, dependencies);
  });
}
