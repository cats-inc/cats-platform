import type { AppConfig } from '../../../config.js';
import { createDefaultCoreState } from '../../../core/model.js';
import type { RuntimeClient } from '../../../platform/runtime/client.js';
import {
  escapeContentDispositionFilename,
} from '../../../shared/channelPaths.js';
import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import { createDefaultWorkspaceState } from '../workspace/defaults.js';
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
  selectChannel,
  toChannelSummary,
  updateGlobalOrchestrator,
} from '../workspace/model.js';
import {
  activateChannelSessions,
  routeChannelMessage,
} from '../workspace/runtimeActions.js';
import { createAppShell } from '../workspace/shell.js';
import type { WorkspaceStore } from '../workspace/store.js';
import type {
  AssignChannelPalInput,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  SendChannelMessageInput,
  SetupCompleteInput,
  UpdateGlobalOrchestratorInput,
  UpdateSelectedChannelInput,
  WorkspaceChannelPal,
  WorkspaceState,
} from './contracts.js';

export const CHAT_API_SLICE = 'chat';

export interface ChatApiDependencies {
  config: AppConfig;
  runtimeClient: RuntimeClient;
  workspaceStore: WorkspaceStore;
  now?: () => Date;
}

const DEFAULT_WORKSPACE_ID = 'default';

function nowFrom(dependencies: ChatApiDependencies): Date {
  return dependencies.now?.() ?? new Date();
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

function sendRestError(
  context: RouteContext<ChatApiDependencies>,
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

function handleRestError(
  context: RouteContext<ChatApiDependencies>,
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

function handleCanonicalCatError(
  context: RouteContext<ChatApiDependencies>,
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

function requireValidWorkspaceId(workspaceId: string): void {
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

async function buildAppShellPayload(
  dependencies: ChatApiDependencies,
  state?: Awaited<ReturnType<WorkspaceStore['read']>>,
) {
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

async function persistCreatedChannel(
  context: RouteContext<ChatApiDependencies>,
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

async function persistDeletedChannel(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  const currentState = await context.dependencies.workspaceStore.read();
  const channel = requireChannel(currentState, channelId);
  await closeSessionIds(context.dependencies.runtimeClient, [
    channel.orchestratorLease.sessionId,
    ...channel.palAssignments.map(
      (assignment) => assignment.execution.lease.sessionId,
    ),
  ]);
  await context.dependencies.workspaceStore.write(
    deleteChannel(currentState, channelId),
  );
}

async function persistCreatedPal(
  context: RouteContext<ChatApiDependencies>,
  input: CreateWorkspacePalInput,
): Promise<WorkspaceState> {
  const nextState = createWorkspacePal(
    await context.dependencies.workspaceStore.read(),
    input,
    nowFrom(context.dependencies),
  );
  return context.dependencies.workspaceStore.write(nextState);
}

async function persistAssignmentUpdate(
  context: RouteContext<ChatApiDependencies>,
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

  return {
    persisted: await context.dependencies.workspaceStore.write(nextState),
    isNew,
  };
}

async function persistAssignmentRemoval(
  context: RouteContext<ChatApiDependencies>,
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

function mapAssignmentToCat(assignment: WorkspaceChannelPal) {
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

async function handleAppShell(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  sendJson(
    context.response,
    200,
    await buildAppShellPayload(context.dependencies),
  );
}

async function handleSelectionUpdate(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const body = await readJsonBody<UpdateSelectedChannelInput>(context.request);
    const nextState = selectChannel(
      await context.dependencies.workspaceStore.read(),
      body.selectedChannelId,
      nowFrom(context.dependencies),
    );
    const persisted = await context.dependencies.workspaceStore.write(nextState);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, persisted),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update workspace selection',
    });
  }
}

async function handleLegacyChannelCreate(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspaceChannelInput>(context.request);
    const persisted = await persistCreatedChannel(context, body);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, persisted),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create workspace channel',
    });
  }
}

async function handleLegacyChannelDelete(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  try {
    await persistDeletedChannel(context, channelId);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to delete workspace channel',
    });
  }
}

async function handleLegacyCreatePal(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(context.request);
    const persisted = await persistCreatedPal(context, body);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, persisted),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create workspace pal',
    });
  }
}

async function handleLegacyAssignPal(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<AssignChannelPalInput>(context.request);
    const { persisted } = await persistAssignmentUpdate(context, channelId, body);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, persisted),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to assign pal to channel',
    });
  }
}

async function handleLegacyRemovePalAssignment(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
  palId: string,
): Promise<void> {
  try {
    await persistAssignmentRemoval(context, channelId, palId);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to remove channel pal',
    });
  }
}

async function handleLegacyAddMember(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(context.request);
    let nextState = createWorkspacePal(
      await context.dependencies.workspaceStore.read(),
      body,
      nowFrom(context.dependencies),
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
      nowFrom(context.dependencies),
    );

    const persisted = await context.dependencies.workspaceStore.write(nextState);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, persisted),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create and assign channel pal',
    });
  }
}

async function handleLegacyOrchestratorUpdate(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const body = await readJsonBody<UpdateGlobalOrchestratorInput>(
      context.request,
    );
    const nextState = updateGlobalOrchestrator(
      await context.dependencies.workspaceStore.read(),
      body,
      nowFrom(context.dependencies),
    );
    const persisted = await context.dependencies.workspaceStore.write(nextState);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies, persisted),
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error ? error.message : 'Failed to update orchestrator',
    });
  }
}

async function handleLegacyChannelActivation(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  try {
    const activation = await activateChannelSessions(
      await context.dependencies.workspaceStore.read(),
      channelId,
      context.dependencies.runtimeClient,
      nowFrom(context.dependencies),
    );
    const persisted = await context.dependencies.workspaceStore.write(
      activation.state,
    );
    sendJson(context.response, 200, {
      appShell: await buildAppShellPayload(context.dependencies, persisted),
      results: activation.results,
    });
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to activate workspace channel',
    });
  }
}

async function handleLegacyChannelMessage(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<SendChannelMessageInput>(context.request);
    const dispatch = await routeChannelMessage(
      await context.dependencies.workspaceStore.read(),
      channelId,
      body,
      context.dependencies.runtimeClient,
      nowFrom(context.dependencies),
    );
    const persisted = await context.dependencies.workspaceStore.write(
      dispatch.state,
    );
    sendJson(context.response, 200, {
      appShell: await buildAppShellPayload(context.dependencies, persisted),
      results: dispatch.results,
    });
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to route channel message',
    });
  }
}

async function handleChannelExport(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    const payload = exportChannel(state, channelId);
    const filename = escapeContentDispositionFilename(
      buildChannelExportFilename(state, channelId),
    );
    sendJson(context.response, 200, payload, {
      'content-disposition': `attachment; filename="${filename}"`,
    });
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to export channel',
    });
  }
}

async function handleRestGetWorkspace(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, {
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
    handleRestError(context, error);
  }
}

async function handleRestGetPreferences(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, {
      preferences: {
        selectedChannelId: state.selectedChannelId,
        showVerboseMessages: state.showVerboseMessages,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestUpdatePreferences(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<{
      selectedChannelId?: string;
      showVerboseMessages?: boolean;
    }>(context.request);
    let nextState = await context.dependencies.workspaceStore.read();

    if (body.selectedChannelId !== undefined) {
      nextState = selectChannel(
        nextState,
        body.selectedChannelId,
        nowFrom(context.dependencies),
      );
    }

    if (typeof body.showVerboseMessages === 'boolean') {
      nextState = {
        ...nextState,
        showVerboseMessages: body.showVerboseMessages,
      };
    }

    const persisted = await context.dependencies.workspaceStore.write(nextState);
    sendJson(context.response, 200, {
      preferences: {
        selectedChannelId: persisted.selectedChannelId,
        showVerboseMessages: persisted.showVerboseMessages,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestListChannels(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, {
      channels: state.channels.map((channel) => toChannelSummary(channel)),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestCreateChannel(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<CreateWorkspaceChannelInput>(context.request);
    const persisted = await persistCreatedChannel(context, body);
    sendJson(context.response, 201, {
      channel: buildChannelView(persisted, persisted.channels[0]),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestGetChannel(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, {
      channel: buildChannelView(state, channelId),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestDeleteChannel(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    await persistDeletedChannel(context, channelId);
    sendJson(context.response, 200, { deleted: true, channelId });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestListMessages(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, {
      messages: requireChannel(state, channelId).messages,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestSendMessage(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<SendChannelMessageInput>(context.request);
    const stateBefore = await context.dependencies.workspaceStore.read();
    const messageCountBefore = requireChannel(stateBefore, channelId).messages.length;
    const dispatch = await routeChannelMessage(
      stateBefore,
      channelId,
      body,
      context.dependencies.runtimeClient,
      nowFrom(context.dependencies),
    );
    const persisted = await context.dependencies.workspaceStore.write(
      dispatch.state,
    );
    const userMessage =
      requireChannel(persisted, channelId).messages[messageCountBefore] ?? null;

    sendJson(context.response, 200, {
      message: userMessage,
      dispatch: {
        channelId,
        results: dispatch.results,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestListPalAssignments(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, {
      palAssignments: buildChannelView(state, channelId).assignedPals,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestAssignPal(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
  palId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<Omit<AssignChannelPalInput, 'palId'>>(
      context.request,
    );
    const { persisted, isNew } = await persistAssignmentUpdate(context, channelId, {
      palId,
      ...body,
    });
    const assignment = buildChannelView(persisted, channelId).assignedPals.find(
      (candidate) => candidate.palId === palId,
    );
    sendJson(context.response, isNew ? 201 : 200, {
      palAssignment: assignment,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestRemovePalAssignment(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
  palId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    await persistAssignmentRemoval(context, channelId, palId);
    sendJson(context.response, 200, { removed: true, channelId, palId });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestGetOrchestrator(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const [state, runtime] = await Promise.all([
      context.dependencies.workspaceStore.read(),
      context.dependencies.runtimeClient.getHealth(),
    ]);
    sendJson(context.response, 200, {
      orchestrator: {
        ...state.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestUpdateOrchestrator(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<UpdateGlobalOrchestratorInput>(
      context.request,
    );
    const nextState = updateGlobalOrchestrator(
      await context.dependencies.workspaceStore.read(),
      body,
      nowFrom(context.dependencies),
    );
    const [persisted, runtime] = await Promise.all([
      context.dependencies.workspaceStore.write(nextState),
      context.dependencies.runtimeClient.getHealth(),
    ]);
    sendJson(context.response, 200, {
      orchestrator: {
        ...persisted.globalOrchestrator,
        status: runtime.reachable ? 'ready' : 'warming',
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestListPals(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, { pals: state.pals });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestCreatePal(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(context.request);
    const persisted = await persistCreatedPal(context, body);
    sendJson(context.response, 201, { pal: persisted.pals[0] });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestGetPal(
  context: RouteContext<ChatApiDependencies>,
  palId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, { pal: requirePal(state, palId) });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestActivateChannel(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const now = nowFrom(context.dependencies);
    const activation = await activateChannelSessions(
      await context.dependencies.workspaceStore.read(),
      channelId,
      context.dependencies.runtimeClient,
      now,
    );
    await context.dependencies.workspaceStore.write(activation.state);
    sendJson(context.response, 200, {
      activation: {
        channelId,
        startedAt: now.toISOString(),
        results: activation.results,
      },
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestGetExport(
  context: RouteContext<ChatApiDependencies>,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const state = await context.dependencies.workspaceStore.read();
    const payload = exportChannel(state, channelId);
    const filename = escapeContentDispositionFilename(
      buildChannelExportFilename(state, channelId),
    );
    sendJson(context.response, 200, payload, {
      'content-disposition': `attachment; filename="${filename}"`,
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleCanonicalListCats(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, { cats: state.pals });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalCreateCat(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const body = await readJsonBody<CreateWorkspacePalInput>(context.request);
    const persisted = await persistCreatedPal(context, body);
    sendJson(context.response, 201, { cat: persisted.pals[0] });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalGetCat(
  context: RouteContext<ChatApiDependencies>,
  catId: string,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, { cat: requirePal(state, catId) });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalDeleteCat(
  context: RouteContext<ChatApiDependencies>,
  catId: string,
): Promise<void> {
  try {
    const nextState = deletePal(
      await context.dependencies.workspaceStore.read(),
      catId,
    );
    await context.dependencies.workspaceStore.write(nextState);
    sendJson(context.response, 200, { deleted: true, catId });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalListChannelCats(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
): Promise<void> {
  try {
    const view = buildChannelView(
      await context.dependencies.workspaceStore.read(),
      channelId,
    );
    sendJson(context.response, 200, {
      cats: view.assignedPals.map(mapAssignmentToCat),
    });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalAssignChannelCat(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
  catId: string,
): Promise<void> {
  try {
    const body = await readJsonBody<Omit<AssignChannelPalInput, 'palId'>>(
      context.request,
    );
    const { persisted, isNew } = await persistAssignmentUpdate(context, channelId, {
      palId: catId,
      ...body,
    });
    const assignment = buildChannelView(persisted, channelId).assignedPals.find(
      (candidate) => candidate.palId === catId,
    );
    sendJson(context.response, isNew ? 201 : 200, {
      cat: assignment ? mapAssignmentToCat(assignment) : null,
    });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleCanonicalRemoveChannelCat(
  context: RouteContext<ChatApiDependencies>,
  channelId: string,
  catId: string,
): Promise<void> {
  try {
    await persistAssignmentRemoval(context, channelId, catId);
    sendJson(context.response, 200, { removed: true, channelId, catId });
  } catch (error) {
    handleCanonicalCatError(context, error);
  }
}

async function handleSetupComplete(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    const body = await readJsonBody<SetupCompleteInput>(context.request);
    const now = nowFrom(context.dependencies);
    let core = await context.dependencies.workspaceStore.readCore();
    let workspace = await context.dependencies.workspaceStore.read();

    if (core.setupCompleteAt) {
      sendRestError(
        context,
        409,
        'already_complete',
        'Setup has already been completed',
      );
      return;
    }

    const previousPalIds = new Set(workspace.pals.map((pal) => pal.id));
    workspace = createWorkspacePal(
      workspace,
      {
        name: body.bossCatName.trim() || 'Smelly',
        provider: body.bossCatProvider,
        instance: body.bossCatInstance,
        model: body.bossCatModel,
      },
      now,
    );
    const bossCat = workspace.pals.find((pal) => !previousPalIds.has(pal.id));
    if (!bossCat) {
      sendRestError(context, 500, 'internal_error', 'Failed to create Boss Cat');
      return;
    }

    workspace.bossCatId = bossCat.id;
    workspace = createChannel(
      workspace,
      {
        title: `Chat with ${bossCat.name}`,
        topic: 'Your first conversation.',
      },
      now,
    );
    const channelId = workspace.selectedChannelId;
    workspace = appendMessage(
      workspace,
      channelId,
      {
        senderKind: 'orchestrator',
        senderName: bossCat.name,
        body: `Meow! I'm ${bossCat.name}, your Boss Cat. What shall we work on?`,
      },
      now,
    ).state;
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

    await context.dependencies.workspaceStore.write(workspace);
    await context.dependencies.workspaceStore.writeCore(core);
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies),
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleSetupReset(
  context: RouteContext<ChatApiDependencies>,
): Promise<void> {
  try {
    await context.dependencies.workspaceStore.write(createDefaultWorkspaceState());
    await context.dependencies.workspaceStore.writeCore(createDefaultCoreState());
    sendJson(
      context.response,
      200,
      await buildAppShellPayload(context.dependencies),
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatApi(
  context: RouteContext<ChatApiDependencies>,
): Promise<boolean> {
  const activateMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/activate$/u,
  );
  const legacyMessageMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/messages$/u,
  );
  const assignPalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/pals$/u,
  );
  const deleteChannelMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)$/u,
  );
  const removePalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/pals\/([^/]+)$/u,
  );
  const addMemberMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/members$/u,
  );
  const removeMemberMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/members\/([^/]+)$/u,
  );
  const exportMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/export$/u,
  );

  if (context.url.pathname === '/api/app-shell') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleAppShell(context);
    return true;
  }

  if (context.url.pathname === '/api/setup/complete') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleSetupComplete(context);
    return true;
  }

  if (context.url.pathname === '/api/setup/reset') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleSetupReset(context);
    return true;
  }

  if (context.url.pathname === '/api/workspace/selection') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleSelectionUpdate(context);
    return true;
  }

  if (context.url.pathname === '/api/workspace/channels') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyChannelCreate(context);
    return true;
  }

  if (context.url.pathname === '/api/workspace/pals') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyCreatePal(context);
    return true;
  }

  if (context.url.pathname === '/api/orchestrator') {
    if (context.method === 'GET') {
      await handleRestGetOrchestrator(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleRestUpdateOrchestrator(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    if (context.method === 'PUT') {
      await handleLegacyOrchestratorUpdate(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH', 'PUT']);
    return true;
  }

  if (activateMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyChannelActivation(context, activateMatch[0]);
    return true;
  }

  if (deleteChannelMatch) {
    if (context.method !== 'DELETE') {
      sendMethodNotAllowed(context.response, ['DELETE']);
      return true;
    }
    await handleLegacyChannelDelete(context, deleteChannelMatch[0]);
    return true;
  }

  if (legacyMessageMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyChannelMessage(context, legacyMessageMatch[0]);
    return true;
  }

  if (assignPalMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyAssignPal(context, assignPalMatch[0]);
    return true;
  }

  if (removePalMatch) {
    if (context.method !== 'DELETE') {
      sendMethodNotAllowed(context.response, ['DELETE']);
      return true;
    }
    await handleLegacyRemovePalAssignment(
      context,
      removePalMatch[0],
      removePalMatch[1],
    );
    return true;
  }

  if (addMemberMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyAddMember(context, addMemberMatch[0]);
    return true;
  }

  if (removeMemberMatch) {
    if (context.method !== 'DELETE') {
      sendMethodNotAllowed(context.response, ['DELETE']);
      return true;
    }
    await handleLegacyRemovePalAssignment(
      context,
      removeMemberMatch[0],
      removeMemberMatch[1],
    );
    return true;
  }

  if (exportMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleChannelExport(context, exportMatch[0]);
    return true;
  }

  if (context.url.pathname === '/api/cats') {
    if (context.method === 'GET') {
      await handleCanonicalListCats(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCanonicalCreateCat(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/channels') {
    if (context.method === 'GET') {
      await handleRestListChannels(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    if (context.method === 'POST') {
      await handleRestCreateChannel(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  if (context.url.pathname === '/api/preferences') {
    if (context.method === 'GET') {
      await handleRestGetPreferences(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleRestUpdatePreferences(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
    return true;
  }

  const canonicalCatDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/cats\/([^/]+)$/u,
  );
  if (canonicalCatDetailMatch) {
    if (context.method === 'GET') {
      await handleCanonicalGetCat(context, canonicalCatDetailMatch[0]);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleCanonicalDeleteCat(context, canonicalCatDetailMatch[0]);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'DELETE']);
    return true;
  }

  const canonicalChannelCatDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/cats\/([^/]+)$/u,
  );
  if (canonicalChannelCatDetailMatch) {
    if (context.method === 'PUT') {
      await handleCanonicalAssignChannelCat(
        context,
        canonicalChannelCatDetailMatch[0],
        canonicalChannelCatDetailMatch[1],
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleCanonicalRemoveChannelCat(
        context,
        canonicalChannelCatDetailMatch[0],
        canonicalChannelCatDetailMatch[1],
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  const canonicalChannelCatsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/cats$/u,
  );
  if (canonicalChannelCatsMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleCanonicalListChannelCats(context, canonicalChannelCatsMatch[0]);
    return true;
  }

  const canonicalChannelMessagesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/messages$/u,
  );
  if (canonicalChannelMessagesMatch) {
    if (context.method === 'GET') {
      await handleRestListMessages(
        context,
        DEFAULT_WORKSPACE_ID,
        canonicalChannelMessagesMatch[0],
      );
      return true;
    }
    if (context.method === 'POST') {
      await handleRestSendMessage(
        context,
        DEFAULT_WORKSPACE_ID,
        canonicalChannelMessagesMatch[0],
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const canonicalChannelActivationsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/activations$/u,
  );
  if (canonicalChannelActivationsMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestActivateChannel(
      context,
      DEFAULT_WORKSPACE_ID,
      canonicalChannelActivationsMatch[0],
    );
    return true;
  }

  const canonicalChannelExportMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/exports\/latest$/u,
  );
  if (canonicalChannelExportMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestGetExport(
      context,
      DEFAULT_WORKSPACE_ID,
      canonicalChannelExportMatch[0],
    );
    return true;
  }

  const canonicalChannelDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)$/u,
  );
  if (canonicalChannelDetailMatch) {
    if (context.method === 'GET') {
      await handleRestGetChannel(
        context,
        DEFAULT_WORKSPACE_ID,
        canonicalChannelDetailMatch[0],
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleRestDeleteChannel(
        context,
        DEFAULT_WORKSPACE_ID,
        canonicalChannelDetailMatch[0],
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'DELETE']);
    return true;
  }

  if (context.url.pathname === '/api/views/app-shell') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleAppShell(context);
    return true;
  }

  if (context.url.pathname === '/api/pals') {
    if (context.method === 'GET') {
      await handleRestListPals(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleRestCreatePal(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const restPalDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/pals\/([^/]+)$/u,
  );
  if (restPalDetailMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestGetPal(context, restPalDetailMatch[0]);
    return true;
  }

  const restPalAssignmentDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/pal-assignments\/([^/]+)$/u,
  );
  if (restPalAssignmentDetailMatch) {
    if (context.method === 'PUT') {
      await handleRestAssignPal(
        context,
        restPalAssignmentDetailMatch[0],
        restPalAssignmentDetailMatch[1],
        restPalAssignmentDetailMatch[2],
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleRestRemovePalAssignment(
        context,
        restPalAssignmentDetailMatch[0],
        restPalAssignmentDetailMatch[1],
        restPalAssignmentDetailMatch[2],
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  const restPalAssignmentsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/pal-assignments$/u,
  );
  if (restPalAssignmentsMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestListPalAssignments(
      context,
      restPalAssignmentsMatch[0],
      restPalAssignmentsMatch[1],
    );
    return true;
  }

  const restActivationsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/activations$/u,
  );
  if (restActivationsMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestActivateChannel(
      context,
      restActivationsMatch[0],
      restActivationsMatch[1],
    );
    return true;
  }

  const restExportMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/exports\/latest$/u,
  );
  if (restExportMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestGetExport(
      context,
      restExportMatch[0],
      restExportMatch[1],
    );
    return true;
  }

  const restMessagesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)\/messages$/u,
  );
  if (restMessagesMatch) {
    if (context.method === 'GET') {
      await handleRestListMessages(
        context,
        restMessagesMatch[0],
        restMessagesMatch[1],
      );
      return true;
    }
    if (context.method === 'POST') {
      await handleRestSendMessage(
        context,
        restMessagesMatch[0],
        restMessagesMatch[1],
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const restChannelDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels\/([^/]+)$/u,
  );
  if (restChannelDetailMatch) {
    if (context.method === 'GET') {
      await handleRestGetChannel(
        context,
        restChannelDetailMatch[0],
        restChannelDetailMatch[1],
      );
      return true;
    }
    if (context.method === 'DELETE') {
      await handleRestDeleteChannel(
        context,
        restChannelDetailMatch[0],
        restChannelDetailMatch[1],
      );
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'DELETE']);
    return true;
  }

  const restChannelsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/channels$/u,
  );
  if (restChannelsMatch) {
    if (context.method === 'GET') {
      await handleRestListChannels(context, restChannelsMatch[0]);
      return true;
    }
    if (context.method === 'POST') {
      await handleRestCreateChannel(context, restChannelsMatch[0]);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const restPreferencesMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/preferences$/u,
  );
  if (restPreferencesMatch) {
    if (context.method === 'GET') {
      await handleRestGetPreferences(context, restPreferencesMatch[0]);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleRestUpdatePreferences(context, restPreferencesMatch[0]);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
    return true;
  }

  const restOrchestratorMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)\/orchestrator$/u,
  );
  if (restOrchestratorMatch) {
    if (context.method === 'GET') {
      await handleRestGetOrchestrator(context, restOrchestratorMatch[0]);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleRestUpdateOrchestrator(context, restOrchestratorMatch[0]);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'PATCH']);
    return true;
  }

  const restWorkspaceMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspaces\/([^/]+)$/u,
  );
  if (restWorkspaceMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRestGetWorkspace(context, restWorkspaceMatch[0]);
    return true;
  }

  return false;
}
