import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AppConfig } from '../../config.js';
import type { RuntimeClient } from '../../platform/runtime/client.js';
import { createTelegramRelay, type TelegramRelay } from '../../platform/transports/telegram/relay.js';
import {
  createFileBackedTelegramRelayStore,
  InMemoryTelegramRelayStore,
} from '../../platform/transports/telegram/store.js';
import { MemoryWorkspaceStore, type WorkspaceStore } from '../../products/chat/workspace/store.js';
import type {
  AssignChannelPalInput,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  SendChannelMessageInput,
  UpdateGlobalOrchestratorInput,
  UpdateSelectedChannelInput,
  WorkspaceState,
} from '../../shared/app-shell.js';
import {
  escapeContentDispositionFilename,
} from '../../shared/channelPaths.js';
import {
  appendMessage,
  assignPalToChannel,
  buildChannelExportFilename,
  buildChannelView,
  createChannel,
  createWorkspacePal,
  deleteChannel,
  exportChannel,
  requireChannel,
  requirePal,
  removePalFromChannel,
  resolveOrchestratorDisplayName,
  selectChannel,
  toChannelSummary,
  updateGlobalOrchestrator,
  pickAvatarColor,
  deletePal,
} from '../../products/chat/workspace/model.js';
import {
  activateChannelSessions,
  routeChannelMessage,
} from '../../products/chat/workspace/runtimeActions.js';
import { createAppShell } from '../../products/chat/workspace/shell.js';
import { createDefaultCoreState } from '../../core/model.js';
import { createDefaultWorkspaceState } from '../../products/chat/workspace/defaults.js';
import {
  handleProviderModels,
  handleProviderRegistry,
} from '../../server/routes/providers.js';
import {
  handleTelegramStatus,
  handleTelegramWebhook,
} from '../../server/routes/telegram.js';
import { handleWorkPlaceholder } from '../../products/work/api/index.js';
import { handleCodePlaceholder } from '../../products/code/api/index.js';

export interface ServerDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  workspaceStore: WorkspaceStore;
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

function seedBossCatGreeting(
  state: WorkspaceState, channelId: string, now: Date,
): WorkspaceState {
  if (!state.bossCatId) return state;
  const channel = requireChannel(state, channelId);
  if (channel.palAssignments.length > 0 || channel.messages.length > 0) return state;
  const bossCatName = resolveOrchestratorDisplayName(state);

  return appendMessage(state, channelId, {
    senderKind: 'orchestrator',
    senderName: bossCatName,
    body: `Meow! I'm ${bossCatName}, your Boss Cat. What shall we work on?`,
  }, now).state;
}

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
    { error: { code: 'method_not_allowed', message: 'Method not allowed' } },
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

// ---------------------------------------------------------------------------
// RESTful structured error helpers (SPEC-008)
// ---------------------------------------------------------------------------

function sendRestError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  const payload: { error: { code: string; message: string; details?: Record<string, unknown> } } = {
    error: { code, message },
  };
  if (details) {
    payload.error.details = details;
  }
  sendJson(response, statusCode, payload);
}

function handleRestError(response: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Workspace not found:')) {
    sendRestError(response, 404, 'workspace_not_found', message);
    return;
  }
  if (message.startsWith('Channel not found:')) {
    sendRestError(response, 404, 'channel_not_found', message);
    return;
  }
  if (message.startsWith('Pal not found:')) {
    sendRestError(response, 404, 'pal_not_found', message);
    return;
  }
  if (message.startsWith('Channel pal assignment not found:')) {
    sendRestError(response, 404, 'assignment_not_found', message);
    return;
  }

  sendRestError(response, 400, 'bad_request', message);
}

function handleCanonicalCatError(response: ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Pal not found:')) {
    sendRestError(response, 404, 'cat_not_found', message.replace('Pal not found:', 'Cat not found:'));
    return;
  }
  if (message.startsWith('Channel pal assignment not found:')) {
    sendRestError(response, 404, 'cat_not_found', message.replace('Channel pal assignment not found:', 'Cat not found in channel:'));
    return;
  }

  handleRestError(response, error);
}

const DEFAULT_WORKSPACE_ID = 'default';

function requireValidWorkspaceId(workspaceId: string): void {
  if (workspaceId !== DEFAULT_WORKSPACE_ID) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
}

async function buildAppShell(
  dependencies: ServerDependencies,
  state?: Awaited<ReturnType<WorkspaceStore['read']>>,
): Promise<ReturnType<typeof createAppShell>> {
  const core = await dependencies.workspaceStore.readCore();
  const resolvedState = state ?? await dependencies.workspaceStore.read();
  const runtime = await dependencies.runtimeClient.getHealth();
  const now = dependencies.now?.() ?? new Date();
  return createAppShell(dependencies.config, runtime, resolvedState, now, {
    setupCompleteAt: core.setupCompleteAt,
    ownerDisplayName: core.ownerProfile.displayName,
    ownerAvatarColor: core.ownerProfile.avatarColor,
  });
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
    service: 'cats',
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
    const now = dependencies.now?.() ?? new Date();
    let nextState = createChannel(
      await dependencies.workspaceStore.read(),
      body,
      now,
    );
    if (!body.skipBossCatGreeting) {
      nextState = seedBossCatGreeting(nextState, nextState.selectedChannelId, now);
    }
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to create workspace channel',
    });
  }
}

async function handleChannelDelete(
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const currentState = await dependencies.workspaceStore.read();
    const channel = requireChannel(currentState, channelId);
    const sessionIds = [
      channel.orchestratorLease.sessionId,
      ...channel.palAssignments.map((assignment) => assignment.execution.lease.sessionId),
    ].filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.length > 0);

    await Promise.allSettled(
      sessionIds.map((sessionId) => dependencies.runtimeClient.closeSession(sessionId)),
    );

    const persisted = await dependencies.workspaceStore.write(deleteChannel(currentState, channelId));
    sendJson(response, 200, await buildAppShell(dependencies, persisted));
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to delete workspace channel',
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
    const previousInstance = existingAssignment?.execution.target.instance ?? null;
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
        || updatedAssignment.execution.target.instance !== previousInstance
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
        instance: body.instance,
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
    const state = await dependencies.workspaceStore.read();
    const payload = exportChannel(state, channelId);
    const filename = escapeContentDispositionFilename(buildChannelExportFilename(state, channelId));
    sendJson(response, 200, payload, {
      'content-disposition': `attachment; filename="${filename}"`,
    });
  } catch (error) {
    sendJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to export channel',
    });
  }
}

// ---------------------------------------------------------------------------
// RESTful resource handlers – Phase 2 (read) + Phase 3 (write/operations)
// ---------------------------------------------------------------------------

// GET /api/workspaces/:workspaceId
async function handleRestGetWorkspace(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    sendJson(response, 200, {
      workspace: {
        id: state.id,
        name: state.name,
        selectedChannelId: state.selectedChannelId,
        channelCount: state.channels.length,
        palCount: state.pals.length,
        capabilities: state.capabilities,
      },
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/workspaces/:workspaceId/preferences
async function handleRestGetPreferences(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    sendJson(response, 200, {
      preferences: {
        selectedChannelId: state.selectedChannelId,
        showVerboseMessages: state.showVerboseMessages,
      },
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// PATCH /api/workspaces/:workspaceId/preferences
async function handleRestUpdatePreferences(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<{
      selectedChannelId?: string;
      showVerboseMessages?: boolean;
    }>(request);
    let nextState = await dependencies.workspaceStore.read();
    if (body.selectedChannelId !== undefined) {
      nextState = selectChannel(
        nextState,
        body.selectedChannelId,
        dependencies.now?.() ?? new Date(),
      );
    }
    if (typeof body.showVerboseMessages === 'boolean') {
      nextState = { ...nextState, showVerboseMessages: body.showVerboseMessages };
    }
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, {
      preferences: {
        selectedChannelId: persisted.selectedChannelId,
        showVerboseMessages: persisted.showVerboseMessages,
      },
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/workspaces/:workspaceId/channels
async function handleRestListChannels(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    sendJson(response, 200, {
      channels: state.channels.map((channel) => toChannelSummary(channel)),
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// POST /api/workspaces/:workspaceId/channels
async function handleRestCreateChannel(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<CreateWorkspaceChannelInput>(request);
    const now = dependencies.now?.() ?? new Date();
    let nextState = createChannel(
      await dependencies.workspaceStore.read(),
      body,
      now,
    );
    if (!body.skipBossCatGreeting) {
      nextState = seedBossCatGreeting(nextState, nextState.selectedChannelId, now);
    }
    const persisted = await dependencies.workspaceStore.write(nextState);
    const createdChannel = persisted.channels[0];
    sendJson(response, 201, {
      channel: buildChannelView(persisted, createdChannel),
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/workspaces/:workspaceId/channels/:channelId
async function handleRestGetChannel(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    sendJson(response, 200, {
      channel: buildChannelView(state, channelId),
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// DELETE /api/workspaces/:workspaceId/channels/:channelId
async function handleRestDeleteChannel(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const currentState = await dependencies.workspaceStore.read();
    const channel = requireChannel(currentState, channelId);
    const sessionIds = [
      channel.orchestratorLease.sessionId,
      ...channel.palAssignments.map((assignment) => assignment.execution.lease.sessionId),
    ].filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.length > 0);

    await Promise.allSettled(
      sessionIds.map((sessionId) => dependencies.runtimeClient.closeSession(sessionId)),
    );

    await dependencies.workspaceStore.write(deleteChannel(currentState, channelId));
    sendJson(response, 200, { deleted: true, channelId });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/workspaces/:workspaceId/channels/:channelId/messages
async function handleRestListMessages(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    const channel = requireChannel(state, channelId);
    sendJson(response, 200, { messages: channel.messages });
  } catch (error) {
    handleRestError(response, error);
  }
}

// POST /api/workspaces/:workspaceId/channels/:channelId/messages
async function handleRestSendMessage(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<SendChannelMessageInput>(request);
    const now = dependencies.now?.() ?? new Date();
    const stateBefore = await dependencies.workspaceStore.read();
    const channelBefore = requireChannel(stateBefore, channelId);
    const messageCountBefore = channelBefore.messages.length;

    const dispatch = await routeChannelMessage(
      stateBefore,
      channelId,
      body,
      dependencies.runtimeClient,
      now,
    );
    const persisted = await dependencies.workspaceStore.write(dispatch.state);
    const channelAfter = requireChannel(persisted, channelId);
    const userMessage = channelAfter.messages[messageCountBefore] ?? null;

    sendJson(response, 200, {
      message: userMessage,
      dispatch: {
        channelId,
        results: dispatch.results,
      },
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/workspaces/:workspaceId/channels/:channelId/pal-assignments
async function handleRestListPalAssignments(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    const view = buildChannelView(state, channelId);
    sendJson(response, 200, { palAssignments: view.assignedPals });
  } catch (error) {
    handleRestError(response, error);
  }
}

// PUT /api/workspaces/:workspaceId/channels/:channelId/pal-assignments/:palId
async function handleRestAssignPal(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
  palId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<Omit<AssignChannelPalInput, 'palId'>>(request);
    const now = dependencies.now?.() ?? new Date();
    const currentState = await dependencies.workspaceStore.read();
    const currentChannel = requireChannel(currentState, channelId);
    const existingAssignment = currentChannel.palAssignments.find(
      (candidate) => candidate.palId === palId,
    );
    const isNew = !existingAssignment;
    const previousSessionId = existingAssignment?.execution.lease.sessionId ?? null;
    const previousProvider = existingAssignment?.execution.target.provider ?? null;
    const previousInstance = existingAssignment?.execution.target.instance ?? null;
    const previousModel = existingAssignment?.execution.target.model ?? null;

    let nextState = assignPalToChannel(
      currentState,
      channelId,
      { palId, ...body },
      now,
    );

    const updatedChannel = requireChannel(nextState, channelId);
    const updatedAssignment = updatedChannel.palAssignments.find(
      (candidate) => candidate.palId === palId,
    );
    const targetChanged = Boolean(
      existingAssignment
      && updatedAssignment
      && (
        updatedAssignment.execution.target.provider !== previousProvider
        || updatedAssignment.execution.target.instance !== previousInstance
        || updatedAssignment.execution.target.model !== previousModel
      ),
    );

    if (targetChanged && previousSessionId) {
      try {
        await dependencies.runtimeClient.closeSession(previousSessionId);
      } catch (closeError) {
        const pal = requirePal(nextState, palId);
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to close ${pal.name}'s previous session cleanly: ${
              closeError instanceof Error ? closeError.message : 'Unknown runtime error'
            }`,
          },
          now,
          { metadata: { event: 'session_close_failed', palId } },
        ).state;
      }
    }

    const persisted = await dependencies.workspaceStore.write(nextState);
    const view = buildChannelView(persisted, channelId);
    const assignment = view.assignedPals.find((candidate) => candidate.palId === palId);
    sendJson(response, isNew ? 201 : 200, { palAssignment: assignment });
  } catch (error) {
    handleRestError(response, error);
  }
}

// DELETE /api/workspaces/:workspaceId/channels/:channelId/pal-assignments/:palId
async function handleRestRemovePalAssignment(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
  palId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const currentState = await dependencies.workspaceStore.read();
    const channel = requireChannel(currentState, channelId);
    const assignment = channel.palAssignments.find((candidate) => candidate.palId === palId);
    if (!assignment) {
      throw new Error(`Channel pal assignment not found: ${palId}`);
    }
    const pal = requirePal(currentState, palId);
    const now = dependencies.now?.() ?? new Date();

    let nextState = removePalFromChannel(currentState, channelId, palId, now);

    if (assignment.execution.lease.sessionId) {
      try {
        await dependencies.runtimeClient.closeSession(assignment.execution.lease.sessionId);
      } catch (closeError) {
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to close ${pal.name}'s session cleanly: ${
              closeError instanceof Error ? closeError.message : 'Unknown runtime error'
            }`,
          },
          now,
          { metadata: { event: 'session_close_failed', palId } },
        ).state;
      }
    }

    await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, { removed: true, channelId, palId });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/workspaces/:workspaceId/orchestrator
async function handleRestGetOrchestrator(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    const runtime = await dependencies.runtimeClient.getHealth();
    sendJson(response, 200, {
      orchestrator: {
        ...state.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// PATCH /api/workspaces/:workspaceId/orchestrator
async function handleRestUpdateOrchestrator(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<UpdateGlobalOrchestratorInput>(request);
    const now = dependencies.now?.() ?? new Date();
    const nextState = updateGlobalOrchestrator(
      await dependencies.workspaceStore.read(),
      body,
      now,
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    const runtime = await dependencies.runtimeClient.getHealth();
    sendJson(response, 200, {
      orchestrator: {
        ...persisted.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/pals
async function handleRestListPals(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const state = await dependencies.workspaceStore.read();
    sendJson(response, 200, { pals: state.pals });
  } catch (error) {
    handleRestError(response, error);
  }
}

// POST /api/pals
async function handleRestCreatePal(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(request);
    const now = dependencies.now?.() ?? new Date();
    const nextState = createWorkspacePal(
      await dependencies.workspaceStore.read(),
      body,
      now,
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 201, { pal: persisted.pals[0] });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/pals/:palId
async function handleRestGetPal(
  response: ServerResponse,
  dependencies: ServerDependencies,
  palId: string,
): Promise<void> {
  try {
    const state = await dependencies.workspaceStore.read();
    const pal = requirePal(state, palId);
    sendJson(response, 200, { pal });
  } catch (error) {
    handleRestError(response, error);
  }
}

// POST /api/workspaces/:workspaceId/channels/:channelId/activations
async function handleRestActivateChannel(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const now = dependencies.now?.() ?? new Date();
    const activation = await activateChannelSessions(
      await dependencies.workspaceStore.read(),
      channelId,
      dependencies.runtimeClient,
      now,
    );
    await dependencies.workspaceStore.write(activation.state);
    sendJson(response, 200, {
      activation: {
        channelId,
        startedAt: now.toISOString(),
        results: activation.results,
      },
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// GET /api/workspaces/:workspaceId/channels/:channelId/exports/latest
async function handleRestGetExport(
  response: ServerResponse,
  dependencies: ServerDependencies,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await dependencies.workspaceStore.read();
    const payload = exportChannel(state, channelId);
    const filename = escapeContentDispositionFilename(buildChannelExportFilename(state, channelId));
    sendJson(response, 200, payload, {
      'content-disposition': `attachment; filename="${filename}"`,
    });
  } catch (error) {
    handleRestError(response, error);
  }
}

// ---------------------------------------------------------------------------
// Canonical cat handlers (SPEC-009)
// ---------------------------------------------------------------------------

// GET /api/cats
async function handleCanonicalListCats(
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const state = await dependencies.workspaceStore.read();
    sendJson(response, 200, { cats: state.pals });
  } catch (error) {
    handleCanonicalCatError(response, error);
  }
}

// POST /api/cats
async function handleCanonicalCreateCat(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(request);
    const now = dependencies.now?.() ?? new Date();
    const nextState = createWorkspacePal(
      await dependencies.workspaceStore.read(),
      body,
      now,
    );
    const persisted = await dependencies.workspaceStore.write(nextState);
    sendJson(response, 201, { cat: persisted.pals[0] });
  } catch (error) {
    handleCanonicalCatError(response, error);
  }
}

// GET /api/cats/:catId
async function handleCanonicalGetCat(
  response: ServerResponse,
  dependencies: ServerDependencies,
  catId: string,
): Promise<void> {
  try {
    const state = await dependencies.workspaceStore.read();
    const pal = requirePal(state, catId);
    sendJson(response, 200, { cat: pal });
  } catch (error) {
    handleCanonicalCatError(response, error);
  }
}

// DELETE /api/cats/:catId
async function handleCanonicalDeleteCat(
  response: ServerResponse,
  dependencies: ServerDependencies,
  catId: string,
): Promise<void> {
  try {
    const state = await dependencies.workspaceStore.read();
    const nextState = deletePal(state, catId);
    await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, { deleted: true, catId });
  } catch (error) {
    handleCanonicalCatError(response, error);
  }
}

// GET /api/channels/:channelId/cats
async function handleCanonicalListChannelCats(
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
): Promise<void> {
  try {
    const state = await dependencies.workspaceStore.read();
    const view = buildChannelView(state, channelId);
    const cats = view.assignedPals.map(({ palId, ...rest }) => ({ catId: palId, ...rest }));
    sendJson(response, 200, { cats });
  } catch (error) {
    handleCanonicalCatError(response, error);
  }
}

// PUT /api/channels/:channelId/cats/:catId
async function handleCanonicalAssignChannelCat(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
  catId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<Omit<AssignChannelPalInput, 'palId'>>(request);
    const now = dependencies.now?.() ?? new Date();
    const currentState = await dependencies.workspaceStore.read();
    const currentChannel = requireChannel(currentState, channelId);
    const existingAssignment = currentChannel.palAssignments.find(
      (candidate) => candidate.palId === catId,
    );
    const isNew = !existingAssignment;
    const previousSessionId = existingAssignment?.execution.lease.sessionId ?? null;
    const previousProvider = existingAssignment?.execution.target.provider ?? null;
    const previousInstance = existingAssignment?.execution.target.instance ?? null;
    const previousModel = existingAssignment?.execution.target.model ?? null;

    let nextState = assignPalToChannel(
      currentState,
      channelId,
      { palId: catId, ...body },
      now,
    );

    const updatedChannel = requireChannel(nextState, channelId);
    const updatedAssignment = updatedChannel.palAssignments.find(
      (candidate) => candidate.palId === catId,
    );
    const targetChanged = Boolean(
      existingAssignment
      && updatedAssignment
      && (
        updatedAssignment.execution.target.provider !== previousProvider
        || updatedAssignment.execution.target.instance !== previousInstance
        || updatedAssignment.execution.target.model !== previousModel
      ),
    );

    if (targetChanged && previousSessionId) {
      try {
        await dependencies.runtimeClient.closeSession(previousSessionId);
      } catch (closeError) {
        const pal = requirePal(nextState, catId);
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to close ${pal.name}'s previous session cleanly: ${
              closeError instanceof Error ? closeError.message : 'Unknown runtime error'
            }`,
          },
          now,
          { metadata: { event: 'session_close_failed', palId: catId } },
        ).state;
      }
    }

    const persisted = await dependencies.workspaceStore.write(nextState);
    const view = buildChannelView(persisted, channelId);
    const assignment = view.assignedPals.find((candidate) => candidate.palId === catId);
    const cat = assignment ? { catId: assignment.palId, ...Object.fromEntries(Object.entries(assignment).filter(([k]) => k !== 'palId')) } : assignment;
    sendJson(response, isNew ? 201 : 200, { cat });
  } catch (error) {
    handleCanonicalCatError(response, error);
  }
}

// DELETE /api/channels/:channelId/cats/:catId
async function handleCanonicalRemoveChannelCat(
  response: ServerResponse,
  dependencies: ServerDependencies,
  channelId: string,
  catId: string,
): Promise<void> {
  try {
    const currentState = await dependencies.workspaceStore.read();
    const channel = requireChannel(currentState, channelId);
    const assignment = channel.palAssignments.find((candidate) => candidate.palId === catId);
    if (!assignment) {
      throw new Error(`Channel pal assignment not found: ${catId}`);
    }
    const pal = requirePal(currentState, catId);
    const now = dependencies.now?.() ?? new Date();

    let nextState = removePalFromChannel(currentState, channelId, catId, now);

    if (assignment.execution.lease.sessionId) {
      try {
        await dependencies.runtimeClient.closeSession(assignment.execution.lease.sessionId);
      } catch (closeError) {
        nextState = appendMessage(
          nextState,
          channelId,
          {
            senderKind: 'system',
            senderName: 'Runtime',
            body: `Failed to close ${pal.name}'s session cleanly: ${
              closeError instanceof Error ? closeError.message : 'Unknown runtime error'
            }`,
          },
          now,
          { metadata: { event: 'session_close_failed', palId: catId } },
        ).state;
      }
    }

    await dependencies.workspaceStore.write(nextState);
    sendJson(response, 200, { removed: true, channelId, catId });
  } catch (error) {
    handleCanonicalCatError(response, error);
  }
}

interface SetupCompleteInput {
  ownerDisplayName: string;
  bossCatName: string;
  bossCatProvider: string;
  bossCatInstance?: string;
  bossCatModel?: string;
}

async function handleSetupComplete(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    const body = await readJsonBody<SetupCompleteInput>(request);
    const now = dependencies.now?.() ?? new Date();

    let core = await dependencies.workspaceStore.readCore();
    let workspace = await dependencies.workspaceStore.read();

    if (core.setupCompleteAt) {
      sendRestError(response, 409, 'already_complete', 'Setup has already been completed');
      return;
    }

    // Create Boss Cat
    const prevPalIds = new Set(workspace.pals.map((p) => p.id));
    workspace = createWorkspacePal(workspace, {
      name: body.bossCatName.trim() || 'Smelly',
      provider: body.bossCatProvider,
      instance: body.bossCatInstance,
      model: body.bossCatModel,
    }, now);
    const bossCat = workspace.pals.find((p) => !prevPalIds.has(p.id));
    if (!bossCat) {
      sendRestError(response, 500, 'internal_error', 'Failed to create Boss Cat');
      return;
    }
    workspace.bossCatId = bossCat.id;

    // Create first channel
    workspace = createChannel(workspace, {
      title: `Chat with ${bossCat.name}`,
      topic: 'Your first conversation.',
    }, now);
    const channelId = workspace.selectedChannelId;

    // Add greeting from Boss Cat as the visible orchestrator entrypoint.
    workspace = appendMessage(workspace, channelId, {
      senderKind: 'orchestrator',
      senderName: bossCat.name,
      body: `Meow! I'm ${bossCat.name}, your Boss Cat. What shall we work on?`,
    }, now).state;

    // Sync orchestrator execution target with Boss Cat so unmentioned
    // messages use the provider/model the user chose during setup.
    workspace = {
      ...workspace,
      globalOrchestrator: {
        ...workspace.globalOrchestrator,
        executionTarget: {
          provider: body.bossCatProvider,
          instance: body.bossCatInstance?.trim() || null,
          model: body.bossCatModel ?? null,
        },
      },
    };

    // Finalize core state
    core = {
      ...core,
      setupCompleteAt: now.toISOString(),
      ownerProfile: {
        ...core.ownerProfile,
        displayName: body.ownerDisplayName.trim() || 'Owner',
        avatarColor: core.ownerProfile.avatarColor ?? '#90A4AE',
        updatedAt: now.toISOString(),
      },
    };

    await dependencies.workspaceStore.write(workspace);
    await dependencies.workspaceStore.writeCore(core);
    sendJson(response, 200, await buildAppShell(dependencies));
  } catch (error) {
    handleRestError(response, error);
  }
}

async function handleSetupReset(
  _request: IncomingMessage,
  response: ServerResponse,
  dependencies: ServerDependencies,
): Promise<void> {
  try {
    await dependencies.workspaceStore.write(createDefaultWorkspaceState());
    const core = createDefaultCoreState();
    await dependencies.workspaceStore.writeCore(core);
    sendJson(response, 200, await buildAppShell(dependencies));
  } catch (error) {
    handleRestError(response, error);
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
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const method = request.method ?? 'GET';
  const activateMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/activate$/u);
  const messageMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/messages$/u);
  const assignPalMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)\/pals$/u);
  const deleteChannelMatch = matchRoute(url.pathname, /^\/api\/workspace\/channels\/([^/]+)$/u);
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

  if (url.pathname === '/api/work') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return dependencies.workspaceStore.readCore().then((core) => {
      handleWorkPlaceholder(response, core);
    });
  }

  if (url.pathname === '/api/code') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return dependencies.workspaceStore.readCore().then((core) => {
      handleCodePlaceholder(response, core);
    });
  }

  if (url.pathname === '/api/setup/complete') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleSetupComplete(request, response, dependencies);
  }

  if (url.pathname === '/api/setup/reset') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleSetupReset(request, response, dependencies);
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
    if (method === 'GET') {
      return handleRestGetOrchestrator(response, dependencies, 'default');
    }
    if (method === 'PATCH') {
      return handleRestUpdateOrchestrator(request, response, dependencies, 'default');
    }
    if (method === 'PUT') {
      return handleOrchestratorUpdate(request, response, dependencies);
    }
    sendMethodNotAllowed(response, ['GET', 'PATCH', 'PUT']);
    return Promise.resolve();
  }

  if (activateMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleChannelActivation(response, dependencies, activateMatch[0]);
  }

  if (deleteChannelMatch) {
    if (method !== 'DELETE') {
      sendMethodNotAllowed(response, ['DELETE']);
      return Promise.resolve();
    }
    return handleChannelDelete(response, dependencies, deleteChannelMatch[0]);
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

  // =========================================================================
  // Canonical Public Routes (SPEC-009 / PLAN-009)
  // =========================================================================

  // Static canonical paths
  if (url.pathname === '/api/cats') {
    if (method === 'GET') {
      return handleCanonicalListCats(response, dependencies);
    }
    if (method === 'POST') {
      return handleCanonicalCreateCat(request, response, dependencies);
    }
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return Promise.resolve();
  }

  if (url.pathname === '/api/channels') {
    if (method === 'GET') {
      return handleRestListChannels(response, dependencies, 'default');
    }
    if (method === 'POST') {
      return handleRestCreateChannel(request, response, dependencies, 'default');
    }
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return Promise.resolve();
  }

  if (url.pathname === '/api/preferences') {
    if (method === 'GET') {
      return handleRestGetPreferences(response, dependencies, 'default');
    }
    if (method === 'PATCH') {
      return handleRestUpdatePreferences(request, response, dependencies, 'default');
    }
    sendMethodNotAllowed(response, ['GET', 'PATCH']);
    return Promise.resolve();
  }

  if (url.pathname === '/api/providers') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleProviderRegistry(dependencies, response);
  }

  if (url.pathname === '/api/transports/telegram') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleTelegramStatus(response, {
      workspaceStore: dependencies.workspaceStore,
      telegramRelay: dependencies.telegramRelay,
    });
  }

  if (url.pathname === '/api/transports/telegram/webhook') {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleTelegramWebhook(request, response, {
      workspaceStore: dependencies.workspaceStore,
      telegramRelay: dependencies.telegramRelay,
    });
  }

  // Regex canonical paths — match longest/most-specific first
  const providerModelsMatch = matchRoute(
    url.pathname,
    /^\/api\/providers\/([^/]+)\/models$/u,
  );
  if (providerModelsMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleProviderModels(
      response,
      { runtimeClient: dependencies.runtimeClient },
      providerModelsMatch[0],
      url.searchParams.get('instance'),
    );
  }

  const canonicalCatDetailMatch = matchRoute(url.pathname, /^\/api\/cats\/([^/]+)$/u);
  if (canonicalCatDetailMatch) {
    if (method === 'GET') {
      return handleCanonicalGetCat(response, dependencies, canonicalCatDetailMatch[0]);
    }
    if (method === 'DELETE') {
      return handleCanonicalDeleteCat(response, dependencies, canonicalCatDetailMatch[0]);
    }
    sendMethodNotAllowed(response, ['GET', 'DELETE']);
    return Promise.resolve();
  }

  const canonicalChannelCatDetailMatch = matchRoute(
    url.pathname,
    /^\/api\/channels\/([^/]+)\/cats\/([^/]+)$/u,
  );
  if (canonicalChannelCatDetailMatch) {
    if (method === 'PUT') {
      return handleCanonicalAssignChannelCat(
        request, response, dependencies,
        canonicalChannelCatDetailMatch[0], canonicalChannelCatDetailMatch[1],
      );
    }
    if (method === 'DELETE') {
      return handleCanonicalRemoveChannelCat(
        response, dependencies,
        canonicalChannelCatDetailMatch[0], canonicalChannelCatDetailMatch[1],
      );
    }
    sendMethodNotAllowed(response, ['PUT', 'DELETE']);
    return Promise.resolve();
  }

  const canonicalChannelCatsMatch = matchRoute(
    url.pathname,
    /^\/api\/channels\/([^/]+)\/cats$/u,
  );
  if (canonicalChannelCatsMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleCanonicalListChannelCats(response, dependencies, canonicalChannelCatsMatch[0]);
  }

  const canonicalChannelMessagesMatch = matchRoute(
    url.pathname,
    /^\/api\/channels\/([^/]+)\/messages$/u,
  );
  if (canonicalChannelMessagesMatch) {
    if (method === 'GET') {
      return handleRestListMessages(response, dependencies, 'default', canonicalChannelMessagesMatch[0]);
    }
    if (method === 'POST') {
      return handleRestSendMessage(request, response, dependencies, 'default', canonicalChannelMessagesMatch[0]);
    }
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return Promise.resolve();
  }

  const canonicalChannelActivationsMatch = matchRoute(
    url.pathname,
    /^\/api\/channels\/([^/]+)\/activations$/u,
  );
  if (canonicalChannelActivationsMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleRestActivateChannel(response, dependencies, 'default', canonicalChannelActivationsMatch[0]);
  }

  const canonicalChannelExportMatch = matchRoute(
    url.pathname,
    /^\/api\/channels\/([^/]+)\/exports\/latest$/u,
  );
  if (canonicalChannelExportMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleRestGetExport(response, dependencies, 'default', canonicalChannelExportMatch[0]);
  }

  const canonicalChannelDetailMatch = matchRoute(
    url.pathname,
    /^\/api\/channels\/([^/]+)$/u,
  );
  if (canonicalChannelDetailMatch) {
    if (method === 'GET') {
      return handleRestGetChannel(response, dependencies, 'default', canonicalChannelDetailMatch[0]);
    }
    if (method === 'DELETE') {
      return handleRestDeleteChannel(response, dependencies, 'default', canonicalChannelDetailMatch[0]);
    }
    sendMethodNotAllowed(response, ['GET', 'DELETE']);
    return Promise.resolve();
  }

  // =========================================================================
  // RESTful Resource Routes (ADR-010 / SPEC-008 / PLAN-008 Phase 2-3)
  // =========================================================================

  // GET /api/views/app-shell (read-model alias)
  if (url.pathname === '/api/views/app-shell') {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleAppShell(response, dependencies);
  }

  // /api/pals collection
  if (url.pathname === '/api/pals') {
    if (method === 'GET') {
      return handleRestListPals(response, dependencies);
    }
    if (method === 'POST') {
      return handleRestCreatePal(request, response, dependencies);
    }
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return Promise.resolve();
  }

  // /api/pals/:palId
  const restPalDetailMatch = matchRoute(url.pathname, /^\/api\/pals\/([^/]+)$/u);
  if (restPalDetailMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleRestGetPal(response, dependencies, restPalDetailMatch[0]);
  }

  // /api/workspaces/:wid/channels/:cid/pal-assignments/:pid
  const restPalAssignmentDetailMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/pal-assignments\/([^/]+)$/u,
  );
  if (restPalAssignmentDetailMatch) {
    if (method === 'PUT') {
      return handleRestAssignPal(
        request, response, dependencies,
        restPalAssignmentDetailMatch[0], restPalAssignmentDetailMatch[1], restPalAssignmentDetailMatch[2],
      );
    }
    if (method === 'DELETE') {
      return handleRestRemovePalAssignment(
        response, dependencies,
        restPalAssignmentDetailMatch[0], restPalAssignmentDetailMatch[1], restPalAssignmentDetailMatch[2],
      );
    }
    sendMethodNotAllowed(response, ['PUT', 'DELETE']);
    return Promise.resolve();
  }

  // /api/workspaces/:wid/channels/:cid/pal-assignments
  const restPalAssignmentsMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/pal-assignments$/u,
  );
  if (restPalAssignmentsMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleRestListPalAssignments(
      response, dependencies,
      restPalAssignmentsMatch[0], restPalAssignmentsMatch[1],
    );
  }

  // /api/workspaces/:wid/channels/:cid/activations
  const restActivationsMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/activations$/u,
  );
  if (restActivationsMatch) {
    if (method !== 'POST') {
      sendMethodNotAllowed(response, ['POST']);
      return Promise.resolve();
    }
    return handleRestActivateChannel(
      response, dependencies,
      restActivationsMatch[0], restActivationsMatch[1],
    );
  }

  // /api/workspaces/:wid/channels/:cid/exports/latest
  const restExportMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/exports\/latest$/u,
  );
  if (restExportMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleRestGetExport(
      response, dependencies,
      restExportMatch[0], restExportMatch[1],
    );
  }

  // /api/workspaces/:wid/channels/:cid/messages
  const restMessagesMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/messages$/u,
  );
  if (restMessagesMatch) {
    if (method === 'GET') {
      return handleRestListMessages(
        response, dependencies,
        restMessagesMatch[0], restMessagesMatch[1],
      );
    }
    if (method === 'POST') {
      return handleRestSendMessage(
        request, response, dependencies,
        restMessagesMatch[0], restMessagesMatch[1],
      );
    }
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return Promise.resolve();
  }

  // /api/workspaces/:wid/channels/:cid
  const restChannelDetailMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)$/u,
  );
  if (restChannelDetailMatch) {
    if (method === 'GET') {
      return handleRestGetChannel(
        response, dependencies,
        restChannelDetailMatch[0], restChannelDetailMatch[1],
      );
    }
    if (method === 'DELETE') {
      return handleRestDeleteChannel(
        response, dependencies,
        restChannelDetailMatch[0], restChannelDetailMatch[1],
      );
    }
    sendMethodNotAllowed(response, ['GET', 'DELETE']);
    return Promise.resolve();
  }

  // /api/workspaces/:wid/channels
  const restChannelsMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels$/u,
  );
  if (restChannelsMatch) {
    if (method === 'GET') {
      return handleRestListChannels(response, dependencies, restChannelsMatch[0]);
    }
    if (method === 'POST') {
      return handleRestCreateChannel(request, response, dependencies, restChannelsMatch[0]);
    }
    sendMethodNotAllowed(response, ['GET', 'POST']);
    return Promise.resolve();
  }

  // /api/workspaces/:wid/preferences
  const restPreferencesMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/preferences$/u,
  );
  if (restPreferencesMatch) {
    if (method === 'GET') {
      return handleRestGetPreferences(response, dependencies, restPreferencesMatch[0]);
    }
    if (method === 'PATCH') {
      return handleRestUpdatePreferences(request, response, dependencies, restPreferencesMatch[0]);
    }
    sendMethodNotAllowed(response, ['GET', 'PATCH']);
    return Promise.resolve();
  }

  // /api/workspaces/:wid/orchestrator
  const restOrchestratorMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)\/orchestrator$/u,
  );
  if (restOrchestratorMatch) {
    if (method === 'GET') {
      return handleRestGetOrchestrator(response, dependencies, restOrchestratorMatch[0]);
    }
    if (method === 'PATCH') {
      return handleRestUpdateOrchestrator(request, response, dependencies, restOrchestratorMatch[0]);
    }
    sendMethodNotAllowed(response, ['GET', 'PATCH']);
    return Promise.resolve();
  }

  // /api/workspaces/:wid
  const restWorkspaceMatch = matchRoute(
    url.pathname,
    /^\/api\/workspaces\/([^/]+)$/u,
  );
  if (restWorkspaceMatch) {
    if (method !== 'GET') {
      sendMethodNotAllowed(response, ['GET']);
      return Promise.resolve();
    }
    return handleRestGetWorkspace(response, dependencies, restWorkspaceMatch[0]);
  }

  if (method === 'GET') {
    return tryServeWebAsset(url.pathname, response).then((served) => {
      if (!served) {
        sendJson(response, 404, { error: { code: 'not_found', message: 'Not found' } });
      }
    });
  }

  sendJson(response, 404, { error: { code: 'not_found', message: 'Not found' } });
  return Promise.resolve();
}

export function createServer(dependencies: ServerDependencies) {
  const resolvedDependencies: ResolvedServerDependencies = {
    ...dependencies,
    telegramRelay: dependencies.telegramRelay ?? createTelegramRelay({
      now: dependencies.now,
      store: dependencies.workspaceStore instanceof MemoryWorkspaceStore
        ? new InMemoryTelegramRelayStore()
        : createFileBackedTelegramRelayStore(dependencies.config.workspaceStatePath),
    }),
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
