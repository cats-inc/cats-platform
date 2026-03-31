import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { SuiteSetupCompleteInput } from '../../shared/suite-contract.js';
import type {
  SuiteRuntimeSetupApplyInput,
  SuiteRuntimeSetupScanInput,
} from '../../shared/runtimeSetup.js';
import { toBootstrapEventError } from '../../shared/bootstrapDiagnostics.js';
import {
  appendSuiteOnboardingEvent,
  readSuiteOnboardingHistory,
} from '../../shared/suiteOnboardingHistory.js';
import { listSuiteProductDescriptors } from '../../shared/suiteProducts.js';
import { defaultCatProducts, normalizeSuiteSurfaceList } from '../../shared/suiteSurfaces.js';
import { readSuitePreferences, writeSuitePreferences } from '../../shared/suitePreferences.js';
import { createCat } from '../../products/chat/state/model/index.js';
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

export type SuiteSetupContext = RouteContext<ChatApiDependencies>;

function reportSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-suite-setup] ${scope}: ${message}\n`);
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
  context: SuiteSetupContext,
  input: Parameters<typeof appendSuiteOnboardingEvent>[1],
): Promise<void> {
  try {
    await appendSuiteOnboardingEvent(context.dependencies.config.chatStatePath, input);
  } catch (error) {
    reportSyncFailure(`bootstrap_diagnostics:${input.kind}`, error);
  }
}

function sendRuntimeSetupError(
  context: SuiteSetupContext,
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
  context: SuiteSetupContext,
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
        products: normalizeSuiteSurfaceList([body.selectedProduct], {
          fallback: defaultCatProducts(),
        }),
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

  // Commit chat/core as one persisted snapshot so setup cannot land in a half-written state.
  await context.dependencies.chatStore.writeSnapshot(chatState, core);

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
      products: listSuiteProductDescriptors(),
      runtime: { baseUrl: context.dependencies.config.runtimeBaseUrl, reachable: false, status: 'warm', service: 'cats-runtime' },
      runtimeSetup,
      metadata: { generatedAt: now.toISOString(), host: context.dependencies.config.host, port: context.dependencies.config.port },
      bootstrapAttemptId: body.attemptId ?? null,
      setupCompleteAt: core.setupCompleteAt,
      ownerDisplayName: core.ownerProfile.displayName,
      ownerAvatarColor: core.ownerProfile.avatarColor,
      ownerAvatarUrl: core.ownerProfile.avatarUrl ?? null,
      lastProductSurface: body.selectedProduct,
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
      createBossCat: body.createBossCat,
      setupCompleteAt: core.setupCompleteAt,
    },
  });

  sendJson(context.response, 200, payload);
}

async function handleRuntimeSetupState(
  context: SuiteSetupContext,
): Promise<void> {
  const summary = await readRuntimeSetupSummary(context.dependencies.runtimeClient);
  sendJson(context.response, 200, summary);
}

async function handleRuntimeSetupScan(
  context: SuiteSetupContext,
): Promise<void> {
  let body: SuiteRuntimeSetupScanInput = {};
  try {
    body = await readJsonBody<SuiteRuntimeSetupScanInput>(context.request);
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
  context: SuiteSetupContext,
): Promise<void> {
  let body: SuiteRuntimeSetupApplyInput = {};
  try {
    body = await readJsonBody<SuiteRuntimeSetupApplyInput>(context.request);
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

async function handleBootstrapDiagnosticsState(
  context: SuiteSetupContext,
): Promise<void> {
  const payload = await readSuiteOnboardingHistory(context.dependencies.config.chatStatePath);
  sendJson(context.response, 200, payload);
}

async function handleBootstrapDiagnosticsOpened(
  context: SuiteSetupContext,
): Promise<void> {
  let attemptId: string | null = null;
  try {
    const body = await readJsonBody<{ attemptId?: string | null }>(context.request);
    attemptId = normalizeAttemptId(body.attemptId);
  } catch {
    attemptId = null;
  }

  const payload = await appendSuiteOnboardingEvent(
    context.dependencies.config.chatStatePath,
    {
      now: context.dependencies.now?.() ?? new Date(),
      attemptId,
      kind: 'setup_opened',
      status: 'info',
      summary: 'Packaged suite setup was opened.',
      context: {
        route: '/setup',
      },
    },
  );
  sendJson(context.response, 200, payload);
}

export async function routeSuiteSetupApi(
  context: SuiteSetupContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/suite/bootstrap-diagnostics') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleBootstrapDiagnosticsState(context);
    return true;
  }

  if (context.url.pathname === '/api/suite/bootstrap-diagnostics/opened') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleBootstrapDiagnosticsOpened(context);
    return true;
  }

  if (context.url.pathname === '/api/suite/runtime-setup') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    await handleRuntimeSetupState(context);
    return true;
  }

  if (context.url.pathname === '/api/suite/runtime-setup/scan') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRuntimeSetupScan(context);
    return true;
  }

  if (context.url.pathname === '/api/suite/runtime-setup/apply') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await handleRuntimeSetupApply(context);
    return true;
  }

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
