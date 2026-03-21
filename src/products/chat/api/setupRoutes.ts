import { createDefaultCoreState } from '../../../core/model.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { createDefaultWorkspaceState } from '../workspace/defaults.js';
import { appendMessage, createChannel, createWorkspacePal } from '../workspace/model.js';
import type { SetupCompleteInput } from './contracts.js';
import {
  buildAppShellPayload,
  handleRestError,
  nowFrom,
  sendRestError,
  type ChatApiRouteContext,
} from './shared.js';

async function handleSetupComplete(
  context: ChatApiRouteContext,
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

    workspace = {
      ...workspace,
      bossCatId: bossCat.id,
    };
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
  context: ChatApiRouteContext,
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

export async function routeSetupApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
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

  return false;
}
