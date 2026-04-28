import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import { BUILD_CHANNEL } from '../../shared/buildChannel.js';
import {
  EMPTY_PLATFORM_FEATURE_FLAGS,
  type PlatformSetupCompleteInput,
} from '../../shared/platform-contract.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import { toBootstrapEventError } from '../../shared/bootstrapDiagnostics.js';
import {
  createPlatformAppDescriptor,
  createPlatformResponseMetadata,
  createPlatformWarmRuntimeSummary,
} from '../../shared/platformEnvelopeMetadata.js';
import { appendPlatformOnboardingEvent } from '../../shared/platformOnboardingHistory.js';
import { listPlatformProductDescriptors } from '../../shared/platformProducts.js';
import { readPlatformPreferences, writePlatformPreferences } from '../../shared/platformPreferences.js';
import { cloneProviderModelSelection } from '../../shared/providerSelection.js';
import {
  readRuntimeSetupSummary,
} from '../../runtime/setup.js';
import {
  buildAppShellPayload,
  enqueueGuideCatAssistRefreshIfRuntimeReachable,
  type ChatApiDependencies,
} from '../../products/chat/api/routeSupport.js';
import type { RouteContext } from '../../shared/http.js';
import {
  buildSetupDebugContext,
} from './platformSetupRouteSupport.js';
import { routePlatformAssistantPresetApi } from './platformSetupAssistantRoutes.js';
import { routePlatformSetupDiagnosticsApi } from './platformSetupDiagnosticsRoutes.js';
import { routePlatformGuideCatApi } from './platformSetupGuideCatRoutes.js';
import { routePlatformPreferenceApi } from './platformSetupPreferenceRoutes.js';
import { resolveGuideCatSystemName } from '../../shared/guideCatIdentity.js';

export type PlatformSetupContext = RouteContext<ChatApiDependencies>;

const GUIDE_CAT_PRIMARY_ID = 'guide-cat-primary';

interface LegacyPlatformSetupCompleteInput extends PlatformSetupCompleteInput {
  createBossCat?: boolean;
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

  if (
    Object.prototype.hasOwnProperty.call(body, 'guideCatName')
    || Object.prototype.hasOwnProperty.call(body, 'bossCatName')
  ) {
    sendJson(context.response, 400, {
      error: {
        code: 'bad_request',
        message: 'Unexpected name field. Guide Cat name is system-managed.',
      },
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
  const resolvedGuideCatName = resolveGuideCatSystemName(context.request.headers['accept-language']);
  const guideCatName = createGuideCat ? resolvedGuideCatName : null;
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
          name: resolvedGuideCatName,
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
    await enqueueGuideCatAssistRefreshIfRuntimeReachable(context.dependencies, {
      guideCat: createGuideCat ? core.guideCat : null,
      ownerDisplayName: core.ownerProfile.displayName,
      now,
    });
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
        app: createPlatformAppDescriptor(),
        products: listPlatformProductDescriptors(),
        runtime: createPlatformWarmRuntimeSummary(),
        runtimeSetup: runtimeSetup ?? null,
        metadata: createPlatformResponseMetadata({
          generatedAt: now,
          host: context.dependencies.config.host,
          port: context.dependencies.config.port,
        }),
        bootstrapAttemptId: attemptId,
        buildChannel: BUILD_CHANNEL,
        featureFlags: EMPTY_PLATFORM_FEATURE_FLAGS,
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

export async function routePlatformSetupApi(
  context: PlatformSetupContext,
): Promise<boolean> {
  if (await routePlatformSetupDiagnosticsApi(context)) {
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

  if (await routePlatformPreferenceApi(context)) {
    return true;
  }

  if (await routePlatformGuideCatApi(context)) {
    return true;
  }

  if (await routePlatformAssistantPresetApi(context)) {
    return true;
  }

  return false;
}
