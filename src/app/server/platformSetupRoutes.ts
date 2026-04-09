import { randomUUID } from 'node:crypto';

import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
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

interface AssistantPresetBody {
  name?: string;
  provider?: string;
  instance?: string | null;
  model?: string | null;
  modelSelection?: ProviderModelSelection | null;
  roleHint?: string | null;
}

function reportSyncFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[cats-platform-setup] ${scope}: ${message}\n`);
}

function buildSetupDebugContext(input: {
  ownerDisplayName: string;
  createGuideCat: boolean;
  guideCatName?: string | null;
  guideCatProvider?: string | null;
  guideCatInstance?: string | null;
  guideCatModel?: string | null;
  guideCatModelSelection?: ProviderModelSelection | null;
  guideCatId?: string | null;
  setupCompleteAt?: string | null;
  attemptId?: string | null;
}): Record<string, unknown> {
  const createGuideCat = input.createGuideCat;
  return {
    ownerDisplayName: input.ownerDisplayName,
    createGuideCat,
    guideCatId: input.guideCatId ?? null,
    guideCatName: createGuideCat ? input.guideCatName?.trim() || 'Guide Cat' : null,
    guideCatProvider: createGuideCat ? input.guideCatProvider?.trim() || 'claude' : null,
    guideCatInstance: createGuideCat ? input.guideCatInstance?.trim() || null : null,
    guideCatModel: createGuideCat ? input.guideCatModel ?? null : null,
    hasGuideCatModelSelection: createGuideCat ? Boolean(input.guideCatModelSelection) : false,
    setupCompleteAt: input.setupCompleteAt ?? null,
    attemptId: input.attemptId ?? null,
  };
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
  const legacyProduct = body.selectedProduct;
  const attemptId = body.attemptId ?? null;

  await recordProductEvent(context, {
    now,
    attemptId,
    kind: 'setup_started',
    status: 'info',
    summary: 'Packaged setup submission started.',
    context: buildSetupDebugContext({
      attemptId,
      ownerDisplayName,
      createGuideCat,
      guideCatName,
      guideCatProvider,
      guideCatInstance,
      guideCatModel,
      guideCatModelSelection,
    }),
  });

  try {
    if (createGuideCat) {
      const nowIso = now.toISOString();
      createdGuideCatId = core.guideCat?.id ?? GUIDE_CAT_PRIMARY_ID;
      core = {
        ...core,
        updatedAt: nowIso,
        guideCat: {
          id: createdGuideCatId,
          name: guideCatName?.trim() || 'Guide Cat',
          status: core.guideCat?.status ?? 'active',
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
    await recordProductEvent(context, {
      now,
      attemptId,
      kind: 'setup_state_persisted',
      status: 'info',
      summary: 'Setup state snapshot persisted.',
      context: buildSetupDebugContext({
        attemptId,
        ownerDisplayName,
        createGuideCat,
        guideCatId: createdGuideCatId,
        guideCatName,
        guideCatProvider,
        guideCatInstance,
        guideCatModel,
        guideCatModelSelection,
        setupCompleteAt: core.setupCompleteAt,
      }),
    });

    // Best-effort: honour legacy selectedProduct if the client still sends it.
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
      await recordProductEvent(context, {
        now,
        attemptId,
        kind: 'setup_payload_fallback',
        status: 'degraded',
        summary: 'Setup completed but app shell payload used a fallback envelope.',
        context: buildSetupDebugContext({
          attemptId,
          ownerDisplayName,
          createGuideCat,
          guideCatId: createdGuideCatId,
          guideCatName,
          guideCatProvider,
          guideCatInstance,
          guideCatModel,
          guideCatModelSelection,
          setupCompleteAt: core.setupCompleteAt,
        }),
        error: toBootstrapEventError(error),
      });
      const runtimeSetup = await readRuntimeSetupSummary(context.dependencies.runtimeClient).catch(
        () => undefined,
      );
      payload = {
        app: { name: 'cats-platform', stage: 'phase-2-shell', runtimeBoundary: 'cats-runtime' },
        products: listPlatformProductDescriptors(),
        runtime: { baseUrl: context.dependencies.config.runtimeBaseUrl, reachable: false, status: 'warm', service: 'cats-runtime' },
        runtimeSetup: runtimeSetup ?? null,
        metadata: { generatedAt: now.toISOString(), host: context.dependencies.config.host, port: context.dependencies.config.port },
        bootstrapAttemptId: attemptId,
        setupCompleteAt: core.setupCompleteAt,
        ownerDisplayName: core.ownerProfile.displayName,
        ownerAvatarColor: core.ownerProfile.avatarColor,
        ownerAvatarUrl: core.ownerProfile.avatarUrl ?? null,
        guideCat: core.guideCat,
        assistantPresets: core.assistantPresets,
        lastProductSurface: legacyProduct ?? null,
        lobby: { animationMode: 'reduced', cats: [] },
      };
    }

    await recordProductEvent(context, {
      now,
      attemptId,
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
  } catch (error) {
    reportSyncFailure('setup_complete', error);
    await recordProductEvent(context, {
      now,
      attemptId,
      kind: 'setup_failed',
      status: 'unavailable',
      summary: 'Packaged setup failed before completion response was returned.',
      context: buildSetupDebugContext({
        attemptId,
        ownerDisplayName,
        createGuideCat,
        guideCatId: createdGuideCatId,
        guideCatName,
        guideCatProvider,
        guideCatInstance,
        guideCatModel,
        guideCatModelSelection,
        setupCompleteAt: core.setupCompleteAt,
      }),
      error: toBootstrapEventError(error),
    });
    sendJson(context.response, 500, {
      error: {
        code: 'internal_error',
        message: error instanceof Error ? error.message : 'Unexpected server error',
      },
    });
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
      guideCatSidecarSeen?: boolean;
      guideCatSidecarMode?: string;
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

    if (body.guideCatSidecarSeen !== undefined && typeof body.guideCatSidecarSeen !== 'boolean') {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: 'guideCatSidecarSeen must be a boolean' },
      });
      return;
    }

    if (
      body.guideCatSidecarMode !== undefined
      && body.guideCatSidecarMode !== 'auto'
      && body.guideCatSidecarMode !== 'drawer'
      && body.guideCatSidecarMode !== 'bubble'
    ) {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: 'guideCatSidecarMode must be auto, drawer, or bubble' },
      });
      return;
    }

    const nextPrefs = {
      lastProductSurface: surface ?? currentPrefs.lastProductSurface,
      startAtLogin: body.startAtLogin ?? currentPrefs.startAtLogin,
      openWindowOnStartup: body.openWindowOnStartup ?? currentPrefs.openWindowOnStartup,
      lobbyAnimationMode: body.lobbyAnimationMode ?? currentPrefs.lobbyAnimationMode,
      guideCatSidecarSeen: body.guideCatSidecarSeen ?? currentPrefs.guideCatSidecarSeen,
      guideCatSidecarMode: body.guideCatSidecarMode ?? currentPrefs.guideCatSidecarMode,
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

async function readAssistantPresetBody(
  context: PlatformSetupContext,
): Promise<{
  name: string;
  provider: string;
  instance: string | null;
  model: string;
  modelSelection: ProviderModelSelection | null;
  roleHint: string | null;
} | null> {
  let body: AssistantPresetBody;
  try {
    body = await readJsonBody<AssistantPresetBody>(context.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(context.response, 400, { error: { code: 'bad_request', message } });
    return null;
  }

  const name = body.name?.trim();
  if (!name) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: 'Assistant name is required' },
    });
    return null;
  }

  const provider = body.provider?.trim();
  if (!provider) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: 'Assistant provider is required' },
    });
    return null;
  }

  const model = body.model?.trim();
  if (!model) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: 'Assistant model is required' },
    });
    return null;
  }

  return {
    name,
    provider,
    instance: body.instance?.trim() || null,
    model,
    modelSelection: cloneProviderModelSelection(body.modelSelection ?? null),
    roleHint: body.roleHint?.trim() || null,
  };
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
      status: core.guideCat?.status ?? 'active',
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

async function handleGuideCatStatusUpdate(
  context: PlatformSetupContext,
): Promise<void> {
  let body: { status?: string };
  try {
    body = await readJsonBody<typeof body>(context.request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(context.response, 400, { error: { code: 'bad_request', message } });
    return;
  }

  if (body.status !== 'active' && body.status !== 'dismissed') {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: 'status must be active or dismissed' },
    });
    return;
  }

  const now = context.dependencies.now?.() ?? new Date();
  const nowIso = now.toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();

  if (!core.guideCat) {
    sendJson(context.response, 404, {
      error: { code: 'not_found', message: 'No Guide Cat exists' },
    });
    return;
  }

  core = {
    ...core,
    updatedAt: nowIso,
    guideCat: {
      ...core.guideCat,
      status: body.status,
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

async function handleAssistantPresetList(
  context: PlatformSetupContext,
): Promise<void> {
  const core = await context.dependencies.chatStore.readCore();
  sendJson(context.response, 200, { assistants: core.assistantPresets });
}

async function handleAssistantPresetCreate(
  context: PlatformSetupContext,
): Promise<void> {
  const body = await readAssistantPresetBody(context);
  if (!body) {
    return;
  }

  const nowIso = (context.dependencies.now?.() ?? new Date()).toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  const assistant = {
    id: randomUUID(),
    name: body.name,
    executionTarget: {
      provider: body.provider,
      instance: body.instance,
      model: body.model,
    },
    modelSelection: body.modelSelection,
    roleHint: body.roleHint,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  core = {
    ...core,
    updatedAt: nowIso,
    assistantPresets: [...core.assistantPresets, assistant],
  };

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 201, {
    assistant,
    assistants: core.assistantPresets,
  });
}

async function handleAssistantPresetUpdate(
  context: PlatformSetupContext,
  assistantId: string,
): Promise<void> {
  const body = await readAssistantPresetBody(context);
  if (!body) {
    return;
  }

  const nowIso = (context.dependencies.now?.() ?? new Date()).toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  const existingAssistant = core.assistantPresets.find((assistant) => assistant.id === assistantId);

  if (!existingAssistant) {
    sendJson(context.response, 404, {
      error: { code: 'not_found', message: 'Assistant not found' },
    });
    return;
  }

  const assistant = {
    ...existingAssistant,
    name: body.name,
    executionTarget: {
      provider: body.provider,
      instance: body.instance,
      model: body.model,
    },
    modelSelection: body.modelSelection,
    roleHint: body.roleHint,
    updatedAt: nowIso,
  };

  core = {
    ...core,
    updatedAt: nowIso,
    assistantPresets: core.assistantPresets.map((candidate) =>
      candidate.id === assistantId ? assistant : candidate
    ),
  };

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 200, {
    assistant,
    assistants: core.assistantPresets,
  });
}

async function handleAssistantPresetDelete(
  context: PlatformSetupContext,
  assistantId: string,
): Promise<void> {
  const nowIso = (context.dependencies.now?.() ?? new Date()).toISOString();
  let core = await context.dependencies.chatStore.readCore();
  const chatState = await context.dependencies.chatStore.read();
  const nextAssistants = core.assistantPresets.filter((assistant) => assistant.id !== assistantId);

  if (nextAssistants.length === core.assistantPresets.length) {
    sendJson(context.response, 404, {
      error: { code: 'not_found', message: 'Assistant not found' },
    });
    return;
  }

  core = {
    ...core,
    updatedAt: nowIso,
    assistantPresets: nextAssistants,
  };

  await context.dependencies.chatStore.writeSnapshot(chatState, core);
  sendJson(context.response, 200, {
    deletedId: assistantId,
    assistants: core.assistantPresets,
  });
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
    if (context.method === 'PATCH') {
      await handleGuideCatStatusUpdate(context);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleGuideCatDelete(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'PATCH', 'DELETE']);
    return true;
  }

  if (context.url.pathname === '/api/platform/assistants') {
    if (context.method === 'GET') {
      await handleAssistantPresetList(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleAssistantPresetCreate(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  const assistantPresetDetailMatch = matchRoute(
    context.url.pathname,
    /^\/api\/platform\/assistants\/([^/]+)$/u,
  );
  if (assistantPresetDetailMatch) {
    if (context.method === 'PUT') {
      await handleAssistantPresetUpdate(context, assistantPresetDetailMatch[0]!);
      return true;
    }
    if (context.method === 'DELETE') {
      await handleAssistantPresetDelete(context, assistantPresetDetailMatch[0]!);
      return true;
    }
    sendMethodNotAllowed(context.response, ['PUT', 'DELETE']);
    return true;
  }

  return false;
}
