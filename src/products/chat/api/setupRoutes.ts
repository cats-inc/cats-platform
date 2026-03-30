import { createDefaultCoreState } from '../../../core/model/index.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { writeSuitePreferences } from '../../../shared/suitePreferences.js';
import { createDefaultChatState } from '../state/defaults.js';
import { createCat } from '../state/model/index.js';
import type { SetupCompleteInput } from './contracts.js';
import { isRuntimeSetupReady, readRuntimeSetupSummary } from '../../../runtime/setup.js';
import {
  buildAppShellPayload,
  handleRestError,
  nowFrom,
  sendRestError,
  type ChatApiRouteContext,
} from './routeSupport.js';

function reportOwnerMemorySyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-memory-sync] ${scope}: ${message}\n`);
}

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

    const runtimeSetup = await readRuntimeSetupSummary(context.dependencies.runtimeClient);
    if (!isRuntimeSetupReady(runtimeSetup)) {
      sendRestError(
        context,
        409,
        'runtime_setup_required',
        runtimeSetup.error ?? runtimeSetup.summary,
        { runtimeSetup },
      );
      return;
    }

    const previousCatIds = new Set(chatState.cats.map((cat) => cat.id));
    chatState = createCat(
      chatState,
      {
        name: body.bossCatName?.trim() || 'Boss Cat',
        provider: body.bossCatProvider,
        instance: body.bossCatInstance,
        model: body.bossCatModel,
        modelSelection: body.bossCatModelSelection,
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
        executionModelSelection: body.bossCatModelSelection ?? null,
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

    await context.dependencies.chatStore.writeSnapshot(chatState, core);
    try {
      await context.dependencies.memoryService.flushOwnerProfile({
        reason: 'owner_profile_sync',
        now,
      });
    } catch (error) {
      reportOwnerMemorySyncFailure('setup_complete', error);
    }
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
    const now = nowFrom(context.dependencies);
    await context.dependencies.chatStore.writeSnapshot(
      createDefaultChatState(),
      createDefaultCoreState(),
    );
    try {
      await writeSuitePreferences(context.dependencies.config.chatStatePath, {
        lastProductSurface: null,
      });
    } catch (error) {
      reportOwnerMemorySyncFailure('setup_reset_prefs', error);
    }
    try {
      await context.dependencies.memoryService.flushOwnerProfile({
        reason: 'owner_profile_sync',
        now,
      });
    } catch (error) {
      reportOwnerMemorySyncFailure('setup_reset', error);
    }
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
