import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import {
  activateChannelSessions,
  routeChannelMessage,
} from '../workspace/runtimeActions.js';
import {
  buildChannelView,
  requireChannel,
  requirePal,
  selectChannel,
  toChannelSummary,
  updateGlobalOrchestrator,
} from '../workspace/model.js';
import type {
  AssignChannelPalInput,
  CreateWorkspaceChannelInput,
  CreateWorkspacePalInput,
  SendChannelMessageInput,
  UpdateGlobalOrchestratorInput,
} from './contracts.js';
import {
  DEFAULT_WORKSPACE_ID,
  handleRestError,
  nowFrom,
  persistAssignmentRemoval,
  persistAssignmentUpdate,
  persistCreatedChannel,
  persistCreatedPal,
  persistDeletedChannel,
  requireValidWorkspaceId,
  sendRestError,
  sendChannelExport,
  type ChatApiRouteContext,
} from './shared.js';

const ORCHESTRATOR_ALLOWED_METHODS = ['GET', 'PATCH', 'PUT'];

function sanitizeAttachmentName(rawName: string): string {
  const basename = path.basename(rawName).trim();
  const normalized = basename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '');

  if (!normalized || normalized === '.' || normalized === '..') {
    return 'attachment';
  }

  return normalized;
}

async function resolveUniqueAttachmentName(
  directory: string,
  rawName: string,
  reservedNames: Set<string>,
): Promise<string> {
  const sanitizedName = sanitizeAttachmentName(rawName);
  const parsed = path.parse(sanitizedName);
  const baseName = parsed.name || 'attachment';
  const extension = parsed.ext;

  let attempt = 0;
  while (true) {
    const candidate = attempt === 0
      ? `${baseName}${extension}`
      : `${baseName}-${attempt + 1}${extension}`;

    if (reservedNames.has(candidate)) {
      attempt += 1;
      continue;
    }

    try {
      await access(path.join(directory, candidate));
      attempt += 1;
      continue;
    } catch {
      reservedNames.add(candidate);
      return candidate;
    }
  }
}

async function handleRestGetWorkspace(
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
  workspaceId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<CreateWorkspaceChannelInput>(context.request);
    const persisted = await persistCreatedChannel(context, body);
    const createdChannelId = persisted.selectedChannelId;
    if (!createdChannelId) {
      throw new Error('Failed to select created channel');
    }
    sendJson(context.response, 201, {
      channel: buildChannelView(persisted, createdChannelId),
    });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestGetChannel(
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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

async function handleRestUploadAttachments(
  context: ChatApiRouteContext,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    const body = await readJsonBody<{
      files: Array<{ name: string; data: string }>;
    }>(context.request);

    if (!Array.isArray(body.files) || body.files.length === 0) {
      sendRestError(
        context,
        400,
        'attachments_required',
        'No files provided.',
      );
      return;
    }

    const state = await context.dependencies.workspaceStore.read();
    const channel = requireChannel(state, channelId);
    const cwd = channel.repoPath ?? channel.workspaceCwd;

    if (!cwd) {
      sendRestError(
        context,
        409,
        'channel_cwd_required',
        'Channel has no working directory. Activate the channel first.',
      );
      return;
    }

    const attachDir = path.join(cwd, '.cats-attachments');
    await mkdir(attachDir, { recursive: true });

    const attachments: Array<{ name: string; relativePath: string }> = [];
    const reservedNames = new Set<string>();

    for (const file of body.files) {
      const safeName = await resolveUniqueAttachmentName(
        attachDir,
        file.name,
        reservedNames,
      );
      const filePath = path.join(attachDir, safeName);
      await writeFile(filePath, Buffer.from(file.data, 'base64'));
      attachments.push({
        name: safeName,
        relativePath: `.cats-attachments/${safeName}`,
      });
    }

    sendJson(context.response, 200, { attachments });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestListPalAssignments(
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
): Promise<void> {
  try {
    const state = await context.dependencies.workspaceStore.read();
    sendJson(context.response, 200, { pals: state.pals });
  } catch (error) {
    handleRestError(context, error);
  }
}

async function handleRestCreatePal(
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
  workspaceId: string,
  channelId: string,
): Promise<void> {
  try {
    requireValidWorkspaceId(workspaceId);
    sendChannelExport(
      context,
      await context.dependencies.workspaceStore.read(),
      channelId,
    );
  } catch (error) {
    handleRestError(context, error);
  }
}

export async function routeChatResourceApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
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

  if (context.url.pathname === '/api/orchestrator') {
    if (context.method === 'GET') {
      await handleRestGetOrchestrator(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    if (context.method === 'PATCH') {
      await handleRestUpdateOrchestrator(context, DEFAULT_WORKSPACE_ID);
      return true;
    }
    sendMethodNotAllowed(context.response, ORCHESTRATOR_ALLOWED_METHODS);
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

  const canonicalChannelAttachmentsMatch = matchRoute(
    context.url.pathname,
    /^\/api\/channels\/([^/]+)\/attachments$/u,
  );
  if (canonicalChannelAttachmentsMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRestUploadAttachments(
      context,
      DEFAULT_WORKSPACE_ID,
      canonicalChannelAttachmentsMatch[0],
    );
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
