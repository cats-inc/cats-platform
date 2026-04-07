import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { PlatformSetupCompleteInput } from '../../shared/platform-contract.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import type {
  PlatformRuntimeSetupApplyInput,
  PlatformRuntimeSetupScanInput,
} from '../../shared/runtimeSetup.js';
import { toBootstrapEventError } from '../../shared/bootstrapDiagnostics.js';
import {
  appendPlatformOnboardingEvent,
  readPlatformOnboardingHistory,
} from '../../shared/platformOnboardingHistory.js';
import { listPlatformProductDescriptors } from '../../shared/platformProducts.js';
import { cloneProviderModelSelection } from '../../shared/providerSelection.js';
import { readPlatformPreferences, writePlatformPreferences } from '../../shared/platformPreferences.js';
import { RuntimeRequestError } from '../../runtime/client.js';
import {
  isRuntimeSetupReady,
  readRuntimeSetupSummary,
  summarizeRuntimeSetupReadModel,
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
}

function reportSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-platform-setup] ${scope}: ${message}\n`);
}

function normalizeProviderList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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

function sendRuntimeSetupError(
  context: PlatformSetupContext,
  error: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): void {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = error instanceof RuntimeRequestError
    ? error.status
    : 503;
  sendJson(context.response, status, {
    error: {
      code: fallbackCode,
      message,
    },
  });
}

function sendRuntimeSetupRequired(
  context: PlatformSetupContext,
  summary: Awaited<ReturnType<typeof readRuntimeSetupSummary>>,
): void {
  sendJson(context.response, 409, {
    error: {
      code: 'runtime_setup_required',
      message: summary.error ?? summary.summary,
      details: {
        runtimeSetup: summary,
      },
    },
  });
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

  const runtimeSetup = await readRuntimeSetupSummary(context.dependencies.runtimeClient);
  if (!isRuntimeSetupReady(runtimeSetup)) {
    await recordProductEvent(context, {
      now,
      attemptId: body.attemptId ?? null,
      kind: 'runtime_setup_blocked',
      status: 'degraded',
      summary: 'Packaged setup completion is blocked until Cats Runtime is ready.',
      context: {
        runtimeStatus: runtimeSetup.status,
        bootstrapRequired: runtimeSetup.bootstrapRequired,
      },
    });
    sendRuntimeSetupRequired(context, runtimeSetup);
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

  // Best-effort side effects — failures must not prevent the 200.
  try {
    const currentPrefs = await readPlatformPreferences(context.dependencies.config.chatStatePath);
    await writePlatformPreferences(context.dependencies.config.chatStatePath, {
      ...currentPrefs,
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
    // Return a minimal PlatformHostEnvelope so the client knows setup committed.
    payload = {
      app: { name: 'cats', stage: 'phase-2-shell', runtimeBoundary: 'cats-runtime' },
      products: listPlatformProductDescriptors(),
      runtime: { baseUrl: context.dependencies.config.runtimeBaseUrl, reachable: false, status: 'warm', service: 'cats-runtime' },
      runtimeSetup,
      metadata: { generatedAt: now.toISOString(), host: context.dependencies.config.host, port: context.dependencies.config.port },
      bootstrapAttemptId: body.attemptId ?? null,
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
      ownerAvatarUrl: core.ownerProfile.avatarUrl ?? null,
      guideCat: core.guideCat,
      lastProductSurface: body.selectedProduct,
      lobby: { animationMode: 'reduced' },
    };
  }

  await recordProductEvent(context, {
    now,
    attemptId: body.attemptId ?? null,
    kind: 'setup_completed',
    status: 'ok',
    summary: `Packaged setup completed for ${body.selectedProduct}.`,
    context: {
      selectedProduct: body.selectedProduct,
      createGuideCat,
      guideCatId: createdGuideCatId,
      setupCompleteAt: core.setupCompleteAt,
    },
  });

  sendJson(context.response, 200, payload);
}

async function handleRuntimeSetupState(
  context: PlatformSetupContext,
): Promise<void> {
  const summary = await readRuntimeSetupSummary(context.dependencies.runtimeClient);
  sendJson(context.response, 200, summary);
}

async function handleRuntimeSetupScan(
  context: PlatformSetupContext,
): Promise<void> {
  let body: PlatformRuntimeSetupScanInput = {};
  try {
    body = await readJsonBody<PlatformRuntimeSetupScanInput>(context.request);
  } catch {
    body = {};
  }

  try {
    const readModel = await context.dependencies.runtimeClient.scanSetup({
      manual: body.manual === true,
    });
    sendJson(context.response, 200, summarizeRuntimeSetupReadModel(readModel));
  } catch (error) {
    sendRuntimeSetupError(
      context,
      error,
      'runtime_setup_scan_failed',
      'Failed to refresh Cats Runtime setup.',
    );
  }
}

async function handleRuntimeSetupApply(
  context: PlatformSetupContext,
): Promise<void> {
  let body: PlatformRuntimeSetupApplyInput = {};
  try {
    body = await readJsonBody<PlatformRuntimeSetupApplyInput>(context.request);
  } catch {
    body = {};
  }

  const requestedProviders = normalizeProviderList(body.providers);
  let providers = requestedProviders;
  let currentSummary: Awaited<ReturnType<typeof readRuntimeSetupSummary>> | null = null;

  if (providers.length === 0) {
    currentSummary = await readRuntimeSetupSummary(context.dependencies.runtimeClient);
    providers = currentSummary.suggestedProviders;
  }

  if (providers.length === 0) {
    sendRuntimeSetupRequired(
      context,
      currentSummary ?? await readRuntimeSetupSummary(context.dependencies.runtimeClient),
    );
    return;
  }

  await recordProductEvent(context, {
    now: context.dependencies.now?.() ?? new Date(),
    attemptId: normalizeAttemptId(body.attemptId),
    kind: 'runtime_apply_requested',
    status: 'info',
    summary: `Requested runtime apply for ${providers.join(', ')}.`,
    context: {
      providers,
      providerCount: providers.length,
    },
  });

  try {
    const readModel = await context.dependencies.runtimeClient.applySetup(providers);
    const summary = summarizeRuntimeSetupReadModel(readModel);
    await recordProductEvent(context, {
      now: context.dependencies.now?.() ?? new Date(),
      attemptId: normalizeAttemptId(body.attemptId),
      kind: 'runtime_apply_confirmed',
      status: 'ok',
      summary: `Runtime apply completed for ${providers.join(', ')}.`,
      context: {
        providers,
        providerCount: providers.length,
        runtimeStatus: summary.status,
        bootstrapRequired: summary.bootstrapRequired,
      },
    });
    sendJson(context.response, 200, summary);
  } catch (error) {
    await recordProductEvent(context, {
      now: context.dependencies.now?.() ?? new Date(),
      attemptId: normalizeAttemptId(body.attemptId),
      kind: 'runtime_apply_failed',
      status: 'unavailable',
      summary: `Runtime apply failed for ${providers.join(', ')}.`,
      context: {
        providers,
        providerCount: providers.length,
      },
      error: toBootstrapEventError(error),
    });
    sendRuntimeSetupError(
      context,
      error,
      'runtime_setup_apply_failed',
      'Failed to apply Cats Runtime setup.',
    );
  }
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

  if (context.url.pathname === '/api/platform/runtime-setup') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRuntimeSetupState(context);
    return true;
  }

  if (context.url.pathname === '/api/platform/runtime-setup/scan') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRuntimeSetupScan(context);
    return true;
  }

  if (context.url.pathname === '/api/platform/runtime-setup/apply') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRuntimeSetupApply(context);
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

  return false;
}
