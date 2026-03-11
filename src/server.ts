import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from './config.js';
import type { RuntimeClient } from './runtime/client.js';
import type {
  AddChannelMemberInput,
  CreateWorkspaceChannelInput,
  SendChannelMessageInput,
  UpdateGlobalOrchestratorInput,
  UpdateSelectedChannelInput,
} from './shared/app-shell.js';
import type { WorkspaceStore } from './workspace/store.js';
import {
  addMemberToChannel,
  appendMessage,
  createChannel,
  exportChannel,
  removeMemberFromChannel,
  requireChannel,
  selectChannel,
  updateGlobalOrchestrator,
} from './workspace/model.js';
import { activateChannelSessions, routeChannelMessage } from './workspace/runtimeActions.js';
import { createAppShell } from './workspace/shell.js';

export interface ServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  workspaceStore: WorkspaceStore;
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

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body).toString(),
    ...headers,
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

function sendMethodNotAllowed(response: ServerResponse, allowedMethods: string[]): void {
  sendJson(
    response,
    405,
    { error: 'Method not allowed' },
    { Allow: allowedMethods.join(', ') },
  );
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf-8').trim();
  if (!rawBody) {
    throw new Error('Request body is required');
  }

  return JSON.parse(rawBody) as T;
}

function matchRoute(pathname: string, pattern: RegExp): string[] | null {
  const match = pattern.exec(pathname);
  if (!match) {
    return null;
  }

  return match.slice(1).map((value) => decodeURIComponent(value));
}

function errorStatusCode(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Channel not found:') || message.startsWith('Member not found:')) {
    return 404;
  }
  return 400;
}

async function buildAppShell(
  dependencies: ServerDependencies,
  state?: Awaited<ReturnType<WorkspaceStore['read']>>,
): Promise<ReturnType<typeof createAppShell>> {
  const resolvedState = state ?? (await dependencies.workspaceStore.read());
  const runtime = await dependencies.runtimeClient.getHealth();
  const now = dependencies.now?.() ?? new Date();
  return createAppShell(dependencies.config, runtime, resolvedState, now);
}

async function handleHealth(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const runtime = await dependencies.runtimeClient.getHealth();
  const now = dependencies.now?.() ?? new Date();
  const status = runtime.reachable ? 'ok' : 'degraded';
  const statusCode = runtime.reachable ? 200 : 503;

  sendJson(response, statusCode, {
    service: 'cats-inc',
    status,
    timestamp: now.toISOString(),
    runtime,
  });
}

async function handleAppShell(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  sendJson(response, 200, await buildAppShell(dependencies));
}

async function handleSelectionUpdate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const body = await readJsonBody<UpdateSelectedChannelInput>(request);
    const nextState = selectChannel(
      await dependencies.workspaceStore.read(),
      body.selectedChannelId,
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to update workspace selection',
    });
  }
}

async function handleChannelCreate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspaceChannelInput>(request);
    const nextState = createChannel(
      await dependencies.workspaceStore.read(),
      body,
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to create workspace channel',
    });
  }
}

async function handleAddMember(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<AddChannelMemberInput>(request);
    const nextState = addMemberToChannel(
      await dependencies.workspaceStore.read(),
      channelId,
      body,
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to add channel member',
    });
  }
}

async function handleRemoveMember(
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
  memberId: string,
): Promise<void> {
  try {
    const currentState = await dependencies.workspaceStore.read();
    const channel = requireChannel(currentState, channelId);
    const member = channel.members.find((candidate) => candidate.id === memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }

    let nextState = removeMemberFromChannel(
      currentState,
      channelId,
      memberId,
      dependencies.now?.() ?? new Date(),
    );

    if (member.session.sessionId) {
      try {
        await dependencies.runtimeClient.closeSession(member.session.sessionId);
      } catch (error) {
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to close ${member.name}'s session cleanly: ${
              error instanceof Error ? error.message : 'Unknown runtime error'
            }`,
          },
          dependencies.now?.() ?? new Date(),
          {
            metadata: { event: 'session_close_failed', memberId },
          },
        ).state;
      }
    }

    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to remove channel member',
    });
  }
}

async function handleOrchestratorUpdate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const body = await readJsonBody<UpdateGlobalOrchestratorInput>(request);
    const nextState = updateGlobalOrchestrator(
      await dependencies.workspaceStore.read(),
      body,
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to update orchestrator',
    });
  }
}

async function handleChannelActivation(
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const activation = await activateChannelSessions(
      await dependencies.workspaceStore.read(),
      channelId,
      dependencies.runtimeClient,
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(activation.state);
    sendJson(response, 200, {
      appShell: await buildAppShell(dependencies, persisted),
      results: activation.results,
    });
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to activate workspace channel',
    });
  }
}

async function handleChannelMessage(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<SendChannelMessageInput>(request);
    const dispatch = await routeChannelMessage(
      await dependencies.workspaceStore.read(),
      channelId,
      body,
      dependencies.runtimeClient,
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(dispatch.state);
    sendJson(response, 200, {
      appShell: await buildAppShell(dependencies, persisted),
      results: dispatch.results,
    });
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to route channel message',
    });
  }
}

async function handleChannelExport(
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const payload = exportChannel(await dependencies.workspaceStore.read(), channelId);
    sendJson(response, 200, payload, {
      'content-disposition': `attachment; filename="channel-${channelId}.json"`,
    });
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to export channel',
    });
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

function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const method = request.method ?? 'GET';
  const activateMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/activate$/u);
  const messageMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/messages$/u);
  const addMemberMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/members$/u);
  const removeMemberMatch = matchRoute(
    url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/members\/([^/]+)$/u,
  );
  const exportMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/export$/u);

  if (url.pathname === '/health') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleHealth(response, dependencies);
  }

  if (url.pathname === '/api/app-shell') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleAppShell(response, dependencies);
  }

  if (url.pathname === '/api/workspace/selection') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleSelectionUpdate(request, response, dependencies);
  }

  if (url.pathname === '/api/workspace/channels') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleChannelCreate(request, response, dependencies);
  }

  if (url.pathname === '/api/orchestrator') {
    if (method !== 'PUT') {
      sendMethodNotAllowed(response, ['PUT']);
      return Promise.resolve();
    }
    return handleOrchestratorUpdate(request, response, dependencies);
  }

  if (activateMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleChannelActivation(response, dependencies, activateMatch[0]);
  }

  if (messageMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleChannelMessage(request, response, dependencies, messageMatch[0]);
  }

  if (addMemberMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleAddMember(request, response, dependencies, addMemberMatch[0]);
  }

  if (removeMemberMatch) {
    if (method !== 'DELETE') {
      sendMethodNotAllowed(response, ['DELETE']);
      return Promise.resolve();
    }
    return handleRemoveMember(response, dependencies, removeMemberMatch[0], removeMemberMatch[1]);
  }

  if (exportMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleChannelExport(response, dependencies, exportMatch[0]);
  }

  if (method === 'GET') {
    return tryServeWebAsset(url.pathname, response).then((served) => {
      if (!served) {
        sendJson(response, 404, { error: 'Not found' });
      }
    });
  }

  sendJson(response, 404, { error: 'Not found' });
  return Promise.resolve();
}

export function createServer(dependencies: ServerDependencies) {
  return createHttpServer((request, response) => {
    void routeRequest(request, response, dependencies).catch((error) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unexpected server error',
      });
    });
  });
}
