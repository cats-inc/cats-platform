import { createDefaultCoreState } from '../../../core/model.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { createDefaultChatState } from '../workspace/defaults.js';
import { createCat } from '../workspace/model.js';
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
    let core = await context.dependencies.chatStore.readCore();
    let chatState = await context.dependencies.chatStore.read();

    if (core.setupCompleteAt) {
      sendRestError(
        context,
        409,
        'already_complete',
        'Setup has already been completed',
      );
      return;
    }

    const previousCatIds = new Set(chatState.cats.map((cat) => cat.id));
    chatState = createCat(
      chatState,
      {
        name: body.bossCatName.trim() || 'Smelly',
        provider: body.bossCatProvider,
        instance: body.bossCatInstance,
        model: body.bossCatModel,
      },
      now,
    );

    const bossCat = chatState.cats.find((cat) => !previousCatIds.has(cat.id));
    if (!bossCat) {
      sendRestError(context, 500, 'internal_error', 'Failed to create Boss Cat');
      return;
    }

    chatState = {
      ...chatState,
      bossCatId: bossCat.id,
    };
    chatState = {
      ...chatState,
      globalOrchestrator: {
        ...chatState.globalOrchestrator,
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

    await context.dependencies.chatStore.write(chatState);
    await context.dependencies.chatStore.writeCore(core);
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
    await context.dependencies.chatStore.write(createDefaultChatState());
    await context.dependencies.chatStore.writeCore(createDefaultCoreState());
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

