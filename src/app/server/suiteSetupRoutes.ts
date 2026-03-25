import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { SuiteSetupCompleteInput } from '../../shared/suite-contract.js';
import { readSuitePreferences, writeSuitePreferences } from '../../shared/suitePreferences.js';
import { createCat } from '../../products/chat/state/model/index.js';
import {
  buildAppShellPayload,
  type ChatApiDependencies,
} from '../../products/chat/api/routeSupport.js';
import type { RouteContext } from '../../shared/http.js';

export type SuiteSetupContext = RouteContext<ChatApiDependencies>;

function reportSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-suite-setup] ${scope}: ${message}\n`);
}

async function handleSuiteSetupComplete(
  context: SuiteSetupContext,
): Promise<void> {
  let body: SuiteSetupCompleteInput;
  try {
    body = await readJsonBody<SuiteSetupCompleteInput>(context.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message },
    });
    return;
  }

  const now = context.dependencies.now?.() ?? new Date();
  let core = await context.dependencies.chatStore.readCore();
  let chatState = await context.dependencies.chatStore.read();

  if (core.setupCompleteAt) {
    sendJson(context.response, 409, {
      error: {
        code: 'already_complete',
        message: 'Setup has already been completed',
      },
    });
    return;
  }

  const ownerDisplayName = body.ownerDisplayName?.trim() || 'Owner';

  if (body.createBossCat && body.selectedProduct === 'chat') {
    const previousCatIds = new Set(chatState.cats.map((cat) => cat.id));
    chatState = createCat(
      chatState,
      {
        name: body.bossCatName?.trim() || 'Boss Cat',
        provider: body.bossCatProvider || 'claude',
        instance: body.bossCatInstance,
        model: body.bossCatModel,
        modelSelection: body.bossCatModelSelection,
        products: [...chatState.capabilities.availableSurfaces],
      },
      now,
    );

    const bossCat = chatState.cats.find((cat) => !previousCatIds.has(cat.id));
    if (!bossCat) {
      sendJson(context.response, 500, {
        error: { code: 'internal_error', message: 'Failed to create Boss Cat' },
      });
      return;
    }

    chatState = {
      ...chatState,
      bossCatId: bossCat.id,
      globalOrchestrator: {
        ...chatState.globalOrchestrator,
        executionTarget: {
          provider: body.bossCatProvider || 'claude',
          instance: body.bossCatInstance?.trim() || null,
          model: body.bossCatModel ?? null,
        },
        executionModelSelection: body.bossCatModelSelection ?? null,
      },
    };
  }

  core = {
    ...core,
    setupCompleteAt: now.toISOString(),
    ownerProfile: {
      ...core.ownerProfile,
      displayName: ownerDisplayName,
      avatarColor: core.ownerProfile.avatarColor ?? '#90A4AE',
      updatedAt: now.toISOString(),
    },
  };

  // --- Point of no return: state is committed after these writes ---
  await context.dependencies.chatStore.write(chatState);
  await context.dependencies.chatStore.writeCore(core);

  // Best-effort side effects — failures must not prevent the 200.
  try {
    await writeSuitePreferences(context.dependencies.config.chatStatePath, {
      lastProductSurface: body.selectedProduct,
    });
  } catch (error) {
    reportSyncFailure('setup_complete_prefs', error);
  }

  try {
    await context.dependencies.memoryService.flushOwnerProfile({
      reason: 'owner_profile_sync',
      now,
    });
  } catch (error) {
    reportSyncFailure('setup_complete_memory', error);
  }

  let payload: object;
  try {
    payload = await buildAppShellPayload(context.dependencies);
  } catch (error) {
    reportSyncFailure('setup_complete_payload', error);
    // Return a minimal SuiteHostEnvelope so the client knows setup committed.
    payload = {
      app: { name: 'cats', stage: 'phase-2-shell', runtimeBoundary: 'cats-runtime' },
      runtime: { baseUrl: context.dependencies.config.runtimeBaseUrl, reachable: false, status: 'warm', service: 'cats-runtime' },
      metadata: { generatedAt: now.toISOString(), host: context.dependencies.config.host, port: context.dependencies.config.port },
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
      lastProductSurface: body.selectedProduct,
    };
  }

  sendJson(context.response, 200, payload);
}

async function handleSuitePreferencesUpdate(
  context: SuiteSetupContext,
): Promise<void> {
  try {
    const body = await readJsonBody<{ lastProductSurface?: string }>(context.request);
    const surface = body.lastProductSurface;
    if (surface !== 'chat' && surface !== 'work' && surface !== 'code') {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: 'Invalid product surface' },
      });
      return;
    }

    await writeSuitePreferences(context.dependencies.config.chatStatePath, {
      lastProductSurface: surface,
    });

    sendJson(context.response, 200, { lastProductSurface: surface });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message },
    });
  }
}

export async function routeSuiteSetupApi(
  context: SuiteSetupContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/suite/setup/complete') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleSuiteSetupComplete(context);
    return true;
  }

  if (context.url.pathname === '/api/suite/preferences') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleSuitePreferencesUpdate(context);
    return true;
  }

  return false;
}
