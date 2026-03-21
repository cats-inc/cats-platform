import type { AppConfig } from '../../../config.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import { escapeContentDispositionFilename } from '../../../shared/channelPaths.js';
import { sendJson, type RouteContext } from '../../../shared/http.js';
import {
  appendMessage,
  assignPalToChannel,
  buildChannelExportFilename,
  buildChannelView,
  createChannel,
  createWorkspacePal,
  deleteChannel,
  deletePal,
  exportChannel,
  requireChannel,
  requirePal,
  removePalFromChannel,
  resolveOrchestratorDisplayName,
  setChannelPalLease,
  setChannelWorkspaceCwd,
} from '../workspace/model.js';
import { formatSessionStartedMessage } from '../workspace/runtimeMessages.js';
import { createAppShell } from '../workspace/shell.js';
import type { WorkspaceStore } from '../workspace/store.js';
import type {
  AppShellPayload,
  AssignChannelPalInput,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  WorkspaceChannelPal,
  WorkspaceState,
} from './contracts.js';

export interface ChatApiDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  workspaceStore: WorkspaceStore;
  now?: () => Date;
}

export type ChatApiRouteContext = RouteContext<ChatApiDependencies>;

export const CHAT_API_SLICE = 'chat';
export const DEFAULT_WORKSPACE_ID = 'default';

export function nowFrom(dependencies: ChatApiDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

export function errorStatusCode(error: unknown): number {
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

export function sendRestError(
  context: ChatApiRouteContext,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  const payload: {
    error: { code: string; message: string; details?: Record<string, unknown> };
  } = {
    error: { code, message },
  };
  if (details) {
    payload.error.details = details;
  }
  sendJson(context.response, statusCode, payload);
}

export function handleRestError(
  context: ChatApiRouteContext,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Workspace not found:')) {
    sendRestError(context, 404, 'workspace_not_found', message);
    return;
  }
  if (message.startsWith('Channel not found:')) {
    sendRestError(context, 404, 'channel_not_found', message);
    return;
  }
  if (message.startsWith('Pal not found:')) {
    sendRestError(context, 404, 'pal_not_found', message);
    return;
  }
  if (message.startsWith('Channel pal assignment not found:')) {
    sendRestError(context, 404, 'assignment_not_found', message);
    return;
  }

  sendRestError(context, 400, 'bad_request', message);
}

export function handleCanonicalCatError(
  context: ChatApiRouteContext,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.startsWith('Pal not found:')) {
    sendRestError(
      context,
      404,
      'cat_not_found',
      message.replace('Pal not found:', 'Cat not found:'),
    );
    return;
  }
  if (message.startsWith('Channel pal assignment not found:')) {
    sendRestError(
      context,
      404,
      'cat_not_found',
      message.replace(
        'Channel pal assignment not found:',
        'Cat not found in channel:',
      ),
    );
    return;
  }

  handleRestError(context, error);
}

export function requireValidWorkspaceId(workspaceId: string): void {
  if (workspaceId !== DEFAULT_WORKSPACE_ID) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
}

function seedBossCatGreeting(
  state: WorkspaceState,
  channelId: string,
  now: Date,
): WorkspaceState {
  if (!state.bossCatId) {
    return state;
  }

  const channel = requireChannel(state, channelId);
  if (channel.palAssignments.length > 0 || channel.messages.length > 0) {
    return state;
  }

  const bossCatName = resolveOrchestratorDisplayName(state);
  return appendMessage(
    state,
    channelId,
    {
      senderKind: 'orchestrator',
      senderName: bossCatName,
      body: `Meow! I'm ${bossCatName}, your Boss Cat. What shall we work on?`,
    },
    now,
  ).state;
}

export async function buildAppShellPayload(
  dependencies: ChatApiDependencies,
  state?: Awaited<ReturnType<WorkspaceStore['read']>>,
): Promise<AppShellPayload> {
  const core = await dependencies.workspaceStore.readCore();
  const resolvedState = state ?? await dependencies.workspaceStore.read();
  const runtime = await dependencies.runtimeClient.getHealth();

  return createAppShell(
    dependencies.config,
    runtime,
    resolvedState,
    nowFrom(dependencies),
    {
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
    },
  );
}

export async function persistCreatedChannel(
  context: ChatApiRouteContext,
  input: CreateWorkspaceChannelInput,
): Promise<WorkspaceState> {
  const now = nowFrom(context.dependencies);
  let nextState = createChannel(
    await context.dependencies.workspaceStore.read(),
    input,
    now,
  );

  if (!input.skipBossCatGreeting) {
    nextState = seedBossCatGreeting(nextState, nextState.selectedChannelId, now);
  }

  return context.dependencies.workspaceStore.write(nextState);
}

async function closeSessionIds(
  runtimeClient: RuntimeClient,
  sessionIds: Array<string | null | undefined>,
): Promise<void> {
  const validSessionIds = sessionIds.filter(
    (sessionId): sessionId is string =>
      typeof sessionId === 'string' && sessionId.length > 0,
  );

  await Promise.allSettled(
    validSessionIds.map((sessionId) => runtimeClient.closeSession(sessionId)),
  );
}

export async function persistDeletedChannel(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  const currentState = await context.dependencies.workspaceStore.read();
  const channel = requireChannel(currentState, channelId);

  await closeSessionIds(context.dependencies.runtimeClient, [
    channel.orchestratorLease.sessionId,
    ...channel.palAssignments.map(
      (assignment) => assignment.status === 'removed'
        ? null
        : assignment.execution.lease.sessionId,
    ),
  ]);

  await context.dependencies.workspaceStore.write(
    deleteChannel(currentState, channelId),
  );
}

export async function persistCreatedPal(
  context: ChatApiRouteContext,
  input: CreateWorkspacePalInput,
): Promise<WorkspaceState> {
  const nextState = createWorkspacePal(
    await context.dependencies.workspaceStore.read(),
    input,
    nowFrom(context.dependencies),
  );

  return context.dependencies.workspaceStore.write(nextState);
}

export async function persistAssignmentUpdate(
  context: ChatApiRouteContext,
  channelId: string,
  input: AssignChannelPalInput,
): Promise<{ persisted: WorkspaceState; isNew: boolean }> {
  const now = nowFrom(context.dependencies);
  const currentState = await context.dependencies.workspaceStore.read();
  const currentChannel = requireChannel(currentState, channelId);
  const existingAssignment = currentChannel.palAssignments.find(
    (candidate) => candidate.palId === input.palId,
  );
  const isNew = !existingAssignment;
  const previousSessionId = existingAssignment?.execution.lease.sessionId ?? null;
  const previousProvider = existingAssignment?.execution.target.provider ?? null;
  const previousInstance = existingAssignment?.execution.target.instance ?? null;
  const previousModel = existingAssignment?.execution.target.model ?? null;

  let nextState = assignPalToChannel(currentState, channelId, input, now);
  const updatedChannel = requireChannel(nextState, channelId);
  const updatedAssignment = updatedChannel.palAssignments.find(
    (candidate) => candidate.palId === input.palId,
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
      await context.dependencies.runtimeClient.closeSession(previousSessionId);
    } catch (closeError) {
      const pal = requirePal(nextState, input.palId);
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
        { metadata: { event: 'session_close_failed', palId: input.palId } },
      ).state;
    }
  }

  if (targetChanged && updatedAssignment) {
    nextState = setChannelPalLease(nextState, channelId, input.palId, {
      sessionId: null,
      status: 'not_started',
      cwd: null,
      lastError: null,
      provider: updatedAssignment.execution.target.provider,
      model: updatedAssignment.execution.target.model,
      startedAt: null,
      lastUsedAt: null,
    }, now);
  }

  const refreshedChannel = requireChannel(nextState, channelId);
  const updatedPal = refreshedChannel.palAssignments.find(
    (candidate) => candidate.palId === input.palId,
  );
  const spawnCwd = (
    refreshedChannel.repoPath
    ?? refreshedChannel.workspaceCwd
    ?? refreshedChannel.orchestratorLease.cwd
    ?? null
  );
  const needsSession = updatedPal
    && !updatedPal.execution.lease.sessionId
    && (isNew || targetChanged)
    && Boolean(spawnCwd);

  if (needsSession) {
    try {
      const session = await context.dependencies.runtimeClient.createSession({
        provider: updatedPal.execution.target.provider,
        instance: updatedPal.execution.target.instance,
        model: updatedPal.execution.target.model,
        cwd: spawnCwd,
        workspaceMode: spawnCwd ? 'shared' : undefined,
      });
      const timestamp = now.toISOString();
      nextState = setChannelPalLease(nextState, channelId, input.palId, {
        sessionId: session.id,
        status: session.status === 'ready' ? 'ready' : 'initializing',
        cwd: session.cwd,
        lastError: null,
        provider: session.provider,
        model: session.model,
        startedAt: timestamp,
        lastUsedAt: timestamp,
      }, now);
      if (!spawnCwd && session.cwd) {
        nextState = setChannelWorkspaceCwd(nextState, channelId, session.cwd, now);
      }
      const pal = requirePal(nextState, input.palId);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: formatSessionStartedMessage(pal.name, session),
        },
        now,
        {
          metadata: {
            event: 'session_started',
            targetKind: 'pal',
            targetId: input.palId,
            sessionId: session.id,
            verbosity: 'verbose',
          },
        },
      ).state;
    } catch (sessionError) {
      const pal = requirePal(nextState, input.palId);
      nextState = appendMessage(
        nextState,
        channelId,
        {
          senderKind: 'system',
          senderName: 'Runtime',
          body: `Failed to start ${pal.name}: ${
            sessionError instanceof Error ? sessionError.message : 'Unknown runtime error'
          }`,
        },
        now,
        {
          metadata: {
            event: 'session_start_failed',
            targetKind: 'pal',
            targetId: input.palId,
          },
        },
      ).state;
    }
  }

  return {
    persisted: await context.dependencies.workspaceStore.write(nextState),
    isNew,
  };
}

export async function persistAssignmentRemoval(
  context: ChatApiRouteContext,
  channelId: string,
  palId: string,
): Promise<void> {
  const currentState = await context.dependencies.workspaceStore.read();
  const channel = requireChannel(currentState, channelId);
  const assignment = channel.palAssignments.find(
    (candidate) => candidate.palId === palId,
  );
  if (!assignment) {
    throw new Error(`Channel pal assignment not found: ${palId}`);
  }

  const pal = requirePal(currentState, palId);
  const now = nowFrom(context.dependencies);
  let nextState = removePalFromChannel(currentState, channelId, palId, now);

  if (assignment.execution.lease.sessionId) {
    try {
      await context.dependencies.runtimeClient.closeSession(
        assignment.execution.lease.sessionId,
      );
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

  await context.dependencies.workspaceStore.write(nextState);
}

export function mapAssignmentToCat(assignment: WorkspaceChannelPal) {
  return {
    catId: assignment.palId,
    name: assignment.name,
    roles: structuredClone(assignment.roles),
    skillProfile: assignment.skillProfile,
    mcpProfile: assignment.mcpProfile,
    status: assignment.status,
    joinedAt: assignment.joinedAt,
    leftAt: assignment.leftAt,
    avatarColor: assignment.avatarColor,
    execution: structuredClone(assignment.execution),
    memory: structuredClone(assignment.memory),
  };
}

export function sendChannelExport(
  context: ChatApiRouteContext,
  state: WorkspaceState,
  channelId: string,
): void {
  const payload = exportChannel(state, channelId);
  const filename = escapeContentDispositionFilename(
    buildChannelExportFilename(state, channelId),
  );

  sendJson(context.response, 200, payload, {
    'content-disposition': `attachment; filename="${filename}"`,
  });
}

export async function persistDeletedCat(
  context: ChatApiRouteContext,
  catId: string,
): Promise<void> {
  const nextState = deletePal(await context.dependencies.workspaceStore.read(), catId);
  await context.dependencies.workspaceStore.write(nextState);
}
