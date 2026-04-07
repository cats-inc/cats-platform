import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { PlatformSetupCompleteInput } from '../../shared/platform-contract.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import { toBootstrapEventError } from '../../shared/bootstrapDiagnostics.js';
import {
  appendPlatformOnboardingEvent,
  readPlatformOnboardingHistory,
} from '../../shared/platformOnboardingHistory.js';
import { listPlatformProductDescriptors } from '../../shared/platformProducts.js';
import { cloneProviderModelSelection } from '../../shared/providerSelection.js';
import { readPlatformPreferences, writePlatformPreferences } from '../../shared/platformPreferences.js';
import {
  readRuntimeSetupSummary,
} from '../../runtime/setup.js';
import {
  buildAppShellPayload,
  type ChatApiDependencies,
} from '../../products/chat/api/routeSupport.js';
import type { RouteContext } from '../../shared/http.js';

export type PlatformSetupContext = RouteContext<ChatApiDependencies>;

const GUIDE_CAT_PRIMARY_ID = 'guide-cat-primary';

interface LegacyPlatformSetupCompleteInput extends PlatformSetupCompleteInput {
  createBossCat?: boolean;
  bossCatName?: string;
  bossCatProvider?: string;
  bossCatInstance?: string;
  bossCatModel?: string;
  bossCatModelSelection?: ProviderModelSelection | null;
  /** @deprecated No longer sent by the wizard. */
  selectedProduct?: string;
}

function reportSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-platform-setup] ${scope}: ${message}\n`);
}

function normalizeAttemptId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function recordProductEvent(
  context: PlatformSetupContext,
  input: Parameters<typeof appendPlatformOnboardingEvent>[1],
): Promise<void> {
  try {
    await appendPlatformOnboardingEvent(context.dependencies.config.chatStatePath, input);
  } catch (error) {
    reportSyncFailure(`bootstrap_diagnostics:${input.kind}`, error);
  }
}

async function handlePlatformSetupComplete(
  context: PlatformSetupContext,
): Promise<void> {
  let body: LegacyPlatformSetupCompleteInput;
  try {
    body = await readJsonBody<LegacyPlatformSetupCompleteInput>(context.request);
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
  const createGuideCat = body.createGuideCat ?? body.createBossCat ?? false;
  const guideCatName = body.guideCatName ?? body.bossCatName;
  const guideCatProvider = body.guideCatProvider ?? body.bossCatProvider;
  const guideCatInstance = body.guideCatInstance ?? body.bossCatInstance;
  const guideCatModel = body.guideCatModel ?? body.bossCatModel;
  const guideCatModelSelection = body.guideCatModelSelection ?? body.bossCatModelSelection ?? null;
  let createdGuideCatId: string | null = null;

  if (createGuideCat) {
    const nowIso = now.toISOString();
    createdGuideCatId = core.guideCat?.id ?? GUIDE_CAT_PRIMARY_ID;
    core = {
      ...core,
      updatedAt: nowIso,
      guideCat: {
        id: createdGuideCatId,
        name: guideCatName?.trim() || 'Guide Cat',
        executionTarget: {
          provider: guideCatProvider || 'claude',
          instance: guideCatInstance?.trim() || null,
          model: guideCatModel ?? null,
        },
        modelSelection: cloneProviderModelSelection(guideCatModelSelection),
        createdAt: core.guideCat?.createdAt ?? nowIso,
        updatedAt: nowIso,
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

  // Commit chat/core as one persisted snapshot so setup cannot land in a half-written state.
  await context.dependencies.chatStore.writeSnapshot(chatState, core);

  // Best-effort: honour legacy selectedProduct if the client still sends it.
  const legacyProduct = body.selectedProduct;
  if (legacyProduct === 'chat' || legacyProduct === 'work' || legacyProduct === 'code') {
    try {
      const currentPrefs = await readPlatformPreferences(context.dependencies.config.chatStatePath);
      await writePlatformPreferences(context.dependencies.config.chatStatePath, {
        ...currentPrefs,
        lastProductSurface: legacyProduct,
      });
    } catch (error) {
      reportSyncFailure('setup_complete_prefs', error);
    }
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
    const runtimeSetup = await readRuntimeSetupSummary(context.dependencies.runtimeClient).catch(
      () => undefined,
    );
    payload = {
      app: { name: 'cats', stage: 'phase-2-shell', runtimeBoundary: 'cats-runtime' },
      products: listPlatformProductDescriptors(),
      runtime: { baseUrl: context.dependencies.config.runtimeBaseUrl, reachable: false, status: 'warm', service: 'cats-runtime' },
      runtimeSetup: runtimeSetup ?? null,
      metadata: { generatedAt: now.toISOString(), host: context.dependencies.config.host, port: context.dependencies.config.port },
      bootstrapAttemptId: body.attemptId ?? null,
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
      ownerAvatarUrl: core.ownerProfile.avatarUrl ?? null,
      guideCat: core.guideCat,
      lastProductSurface: legacyProduct ?? null,
      lobby: { animationMode: 'reduced', cats: [] },
    };
  }

  await recordProductEvent(context, {
    now,
    attemptId: body.attemptId ?? null,
    kind: 'setup_completed',
    status: 'ok',
    summary: 'Packaged setup completed.',
    context: {
      createGuideCat,
      guideCatId: createdGuideCatId,
      setupCompleteAt: core.setupCompleteAt,
    },
  });

  sendJson(context.response, 200, payload);
}

async function handlePlatformPreferencesUpdate(
  context: PlatformSetupContext,
): Promise<void> {
  try {
    const body = await readJsonBody<{
      lastProductSurface?: string;
      startAtLogin?: boolean;
      openWindowOnStartup?: boolean;
      lobbyAnimationMode?: string;
    }>(context.request);
    const currentPrefs = await readPlatformPreferences(context.dependencies.config.chatStatePath);
    const surface = body.lastProductSurface;
    if (
      surface !== undefined
      && surface !== 'chat'
      && surface !== 'work'
      && surface !== 'code'
    ) {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: 'Invalid product surface' },
      });
      return;
    }
    if (body.startAtLogin !== undefined && typeof body.startAtLogin !== 'boolean') {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: 'startAtLogin must be a boolean' },
      });
      return;
    }
    if (
      body.openWindowOnStartup !== undefined
      && typeof body.openWindowOnStartup !== 'boolean'
    ) {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: 'openWindowOnStartup must be a boolean' },
      });
      return;
    }
    if (
      body.lobbyAnimationMode !== undefined
      && body.lobbyAnimationMode !== 'off'
      && body.lobbyAnimationMode !== 'reduced'
      && body.lobbyAnimationMode !== 'full'
    ) {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: 'lobbyAnimationMode must be off, reduced, or full' },
      });
      return;
    }

    const nextPrefs = {
      lastProductSurface: surface ?? currentPrefs.lastProductSurface,
      startAtLogin: body.startAtLogin ?? currentPrefs.startAtLogin,
      openWindowOnStartup: body.openWindowOnStartup ?? currentPrefs.openWindowOnStartup,
      lobbyAnimationMode: body.lobbyAnimationMode ?? currentPrefs.lobbyAnimationMode,
    };

    await writePlatformPreferences(context.dependencies.config.chatStatePath, nextPrefs);

    sendJson(context.response, 200, nextPrefs);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message },
    });
  }
}

async function handleBootstrapDiagnosticsState(
  context: PlatformSetupContext,
): Promise<void> {
  const payload = await readPlatformOnboardingHistory(context.dependencies.config.chatStatePath);
  sendJson(context.response, 200, payload);
}

async function handleBootstrapDiagnosticsOpened(
  context: PlatformSetupContext,
): Promise<void> {
  let attemptId: string | null = null;
  try {
    const body = await readJsonBody<{ attemptId?: string | null }>(context.request);
    attemptId = normalizeAttemptId(body.attemptId);
  } catch {
    attemptId = null;
  }

  const payload = await appendPlatformOnboardingEvent(
    context.dependencies.config.chatStatePath,
    {
      now: context.dependencies.now?.() ?? new Date(),
      attemptId,
      kind: 'setup_opened',
      status: 'info',
      summary: 'Packaged platform setup was opened.',
      context: {
        route: '/setup',
      },
    },
  );
  sendJson(context.response, 200, payload);
}

async function handleGuideCatUpdate(
  context: PlatformSetupContext,
): Promise<void> {
  let body: {
    name?: string;
    provider?: string;
    instance?: string | null;
    model?: string | null;
    modelSelection?: ProviderModelSelection | null;
  };
  try {
    body = await readJsonBody<typeof body>(context.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(context.response, 400, { error: { code: 'bad_request', message } });
    return;
  }

  const name = body.name?.trim();
  if (!name) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: 'Guide Cat name is required' },
    });
    return;
  }

  const now = context.dependencies.now?.() ?? new Date();
  const nowIso = now.toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();

  const existingId = core.guideCat?.id ?? GUIDE_CAT_PRIMARY_ID;
  core = {
    ...core,
    updatedAt: nowIso,
    guideCat: {
      id: existingId,
      name,
      executionTarget: {
        provider: body.provider?.trim() || 'claude',
        instance: body.instance?.trim() || null,
        model: body.model ?? null,
      },
      modelSelection: cloneProviderModelSelection(body.modelSelection ?? null),
      createdAt: core.guideCat?.createdAt ?? nowIso,
      updatedAt: nowIso,
    },
  };

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 200, { guideCat: core.guideCat });
}

async function handleGuideCatDelete(
  context: PlatformSetupContext,
): Promise<void> {
  const now = context.dependencies.now?.() ?? new Date();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();

  core = {
    ...core,
    updatedAt: now.toISOString(),
    guideCat: null,
  };

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 200, { guideCat: null });
}

export async function routePlatformSetupApi(
  context: PlatformSetupContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/platform/bootstrap-diagnostics') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleBootstrapDiagnosticsState(context);
    return true;
  }

  if (context.url.pathname === '/api/platform/bootstrap-diagnostics/opened') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleBootstrapDiagnosticsOpened(context);
    return true;
  }

  if (context.url.pathname === '/api/platform/setup/complete') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handlePlatformSetupComplete(context);
    return true;
  }

  if (context.url.pathname === '/api/platform/preferences') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handlePlatformPreferencesUpdate(context);
    return true;
  }

  if (context.url.pathname === '/api/platform/guide-cat') {
    if (context.method === 'PUT') {
      await handleGuideCatUpdate(context);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleGuideCatDelete(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  return false;
}
