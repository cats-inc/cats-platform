import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import {
  activateChannelSessions,
  routeChannelMessage,
} from '../workspace/runtimeActions.js';
import {
  assignPalToChannel,
  createWorkspacePal,
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
  buildAppShellPayload,
  errorStatusCode,
  nowFrom,
  persistAssignmentRemoval,
  persistAssignmentUpdate,
  persistCreatedChannel,
  persistCreatedPal,
  persistDeletedChannel,
  sendChannelExport,
  type ChatApiRouteContext,
} from './shared.js';

async function handleLegacyChannelCreate(
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    const now = nowFrom(context.dependencies);
    const body = await readJsonBody<CreateWorkspacePalInput>(context.request);
    let nextState = createWorkspacePal(
      await context.dependencies.workspaceStore.read(),
      body,
      now,
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
      now,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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
  context: ChatApiRouteContext,
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

async function handleLegacyChannelExport(
  context: ChatApiRouteContext,
  channelId: string,
): Promise<void> {
  try {
    sendChannelExport(
      context,
      await context.dependencies.workspaceStore.read(),
      channelId,
    );
  } catch (error) {
    sendJson(context.response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Failed to export channel',
    });
  }
}

export async function routeLegacyChatApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
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

  if (context.url.pathname === '/api/orchestrator' && context.method === 'PUT') {
    await handleLegacyOrchestratorUpdate(context);
    return true;
  }

  const activateMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/activate$/u,
  );
  if (activateMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyChannelActivation(context, activateMatch[0]);
    return true;
  }

  const messageMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/messages$/u,
  );
  if (messageMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyChannelMessage(context, messageMatch[0]);
    return true;
  }

  const assignPalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/pals$/u,
  );
  if (assignPalMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyAssignPal(context, assignPalMatch[0]);
    return true;
  }

  const removePalMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/pals\/([^/]+)$/u,
  );
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

  const addMemberMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/members$/u,
  );
  if (addMemberMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleLegacyAddMember(context, addMemberMatch[0]);
    return true;
  }

  const removeMemberMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/members\/([^/]+)$/u,
  );
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

  const deleteChannelMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)$/u,
  );
  if (deleteChannelMatch) {
    if (context.method !== 'DELETE') {
      sendMethodNotAllowed(context.response, ['DELETE']);
      return true;
    }
    await handleLegacyChannelDelete(context, deleteChannelMatch[0]);
    return true;
  }

  const exportMatch = matchRoute(
    context.url.pathname,
    /^\/api\/workspace\/channels\/([^/]+)\/export$/u,
  );
  if (exportMatch) {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleLegacyChannelExport(context, exportMatch[0]);
    return true;
  }

  return false;
}
