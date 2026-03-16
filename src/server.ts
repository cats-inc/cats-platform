import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from './config.js';
import type { RuntimeClient } from './runtime/client.js';
import type {
  AssignChannelPalInput,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  SendChannelMessageInput,
  UpdateGlobalOrchestratorInput,
  UpdateSelectedChannelInput,
} from './shared/app-shell.js';
import type { WorkspaceStore } from './workspace/store.js';
import {
  appendMessage,
  assignPalToChannel,
  createChannel,
  createWorkspacePal,
  exportChannel,
  requireChannel,
  requirePal,
  removePalFromChannel,
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
  if (
    message.startsWith('Channel not found:')
    || message.startsWith('Pal not found:')
    || message.startsWith('Channel pal assignment not found:')
  ) {
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

async function handleCoreState(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  sendJson(response, 200, await dependencies.workspaceStore.readCore());
}

async function handleCoreActors(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const core = await dependencies.workspaceStore.readCore();
  sendJson(response, 200, { actors: core.actors });
}

async function handleCoreConversations(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const core = await dependencies.workspaceStore.readCore();
  sendJson(response, 200, { conversations: core.conversations });
}

async function handleCoreTasks(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const core = await dependencies.workspaceStore.readCore();
  sendJson(response, 200, { tasks: core.tasks });
}

async function handleOwnerProfile(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  const core = await dependencies.workspaceStore.readCore();
  sendJson(response, 200, { ownerProfile: core.ownerProfile });
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

async function handleWorkspacePalCreate(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(request);
    const nextState = createWorkspacePal(
      await dependencies.workspaceStore.read(),
      body,
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to create workspace pal',
    });
  }
}

async function handleAssignPal(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<AssignChannelPalInput>(request);
    const currentState = await dependencies.workspaceStore.read();
    const currentChannel = requireChannel(currentState, channelId);
    const existingAssignment = currentChannel.palAssignments.find(
      (candidate) => candidate.palId === body.palId,
    );
    const previousSessionId = existingAssignment?.execution.lease.sessionId ?? null;
    const previousProvider = existingAssignment?.execution.target.provider ?? null;
    const previousModel = existingAssignment?.execution.target.model ?? null;

    let nextState = assignPalToChannel(
      currentState,
      channelId,
      body,
      dependencies.now?.() ?? new Date(),
    );
    const updatedChannel = requireChannel(nextState, channelId);
    const updatedAssignment = updatedChannel.palAssignments.find(
      (candidate) => candidate.palId === body.palId,
    );
    const targetChanged = Boolean(
      existingAssignment
      && updatedAssignment
      && (
        updatedAssignment.execution.target.provider !== previousProvider
        || updatedAssignment.execution.target.model !== previousModel
      ),
    );

    if (targetChanged && previousSessionId) {
      try {
        await dependencies.runtimeClient.closeSession(previousSessionId);
      } catch (error) {
        const pal = requirePal(nextState, body.palId);
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to close ${pal.name}'s previous session cleanly: ${
              error instanceof Error ? error.message : 'Unknown runtime error'
            }`,
          },
          dependencies.now?.() ?? new Date(),
          {
            metadata: { event: 'session_close_failed', palId: body.palId },
          },
        ).state;
      }
    }

    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to assign pal to channel',
    });
  }
}

async function handleRemovePalAssignment(
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
  palId: string,
): Promise<void> {
  try {
    const currentState = await dependencies.workspaceStore.read();
    const channel = requireChannel(currentState, channelId);
    const assignment = channel.palAssignments.find((candidate) => candidate.palId === palId);
    if (!assignment) {
      throw new Error(`Channel pal assignment not found: ${palId}`);
    }
    const pal = requirePal(currentState, palId);

    let nextState = removePalFromChannel(
      currentState,
      channelId,
      palId,
      dependencies.now?.() ?? new Date(),
    );

    if (assignment.execution.lease.sessionId) {
      try {
        await dependencies.runtimeClient.closeSession(assignment.execution.lease.sessionId);
      } catch (error) {
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to close ${pal.name}'s session cleanly: ${
              error instanceof Error ? error.message : 'Unknown runtime error'
            }`,
          },
          dependencies.now?.() ?? new Date(),
          {
            metadata: { event: 'session_close_failed', palId },
          },
        ).state;
      }
    }

    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to remove channel pal',
    });
  }
}

async function handleLegacyAddMember(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(request);
    let nextState = createWorkspacePal(
      await dependencies.workspaceStore.read(),
      body,
      dependencies.now?.() ?? new Date(),
    );
    const createdPalId = nextState.pals[0]?.id;
    if (!createdPalId) {
      throw new Error('Failed to create pal for channel assignment');
    }
    nextState = assignPalToChannel(
      nextState,
      channelId,
      {
        palId: createdPalId,
        provider: body.provider,
        model: body.model,
        roles: body.roles,
      },
      dependencies.now?.() ?? new Date(),
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to create and assign channel pal',
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
  const assignPalMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/pals$/u);
  const removePalMatch = matchRoute(
    url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/pals\/([^/]+)$/u,
  );
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

  if (url.pathname === '/api/core') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleCoreState(response, dependencies);
  }

  if (url.pathname === '/api/core/actors') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleCoreActors(response, dependencies);
  }

  if (url.pathname === '/api/core/conversations') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleCoreConversations(response, dependencies);
  }

  if (url.pathname === '/api/core/tasks') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleCoreTasks(response, dependencies);
  }

  if (url.pathname === '/api/core/owner-profile') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleOwnerProfile(response, dependencies);
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

  if (url.pathname === '/api/workspace/pals') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleWorkspacePalCreate(request, response, dependencies);
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

  if (assignPalMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleAssignPal(request, response, dependencies, assignPalMatch[0]);
  }

  if (removePalMatch) {
    if (method !== 'DELETE') {
      sendMethodNotAllowed(response, ['DELETE']);
      return Promise.resolve();
    }
    return handleRemovePalAssignment(response, dependencies, removePalMatch[0], removePalMatch[1]);
  }

  if (addMemberMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleLegacyAddMember(request, response, dependencies, addMemberMatch[0]);
  }

  if (removeMemberMatch) {
    if (method !== 'DELETE') {
      sendMethodNotAllowed(response, ['DELETE']);
      return Promise.resolve();
    }
    return handleRemovePalAssignment(response, dependencies, removeMemberMatch[0], removeMemberMatch[1]);
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
