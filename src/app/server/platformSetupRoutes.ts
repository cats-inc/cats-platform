import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import type { PlatformSetupCompleteInput } from '../../shared/platform-contract.js';
import type { ProviderModelSelection } from '../../shared/providerSelection.js';
import { toBootstrapEventError } from '../../shared/bootstrapDiagnostics.js';
import {
  createPlatformAppDescriptor,
  createPlatformResponseMetadata,
  createPlatformWarmRuntimeSummary,
} from '../../shared/platformEnvelopeMetadata.js';
import { appendPlatformOnboardingEvent } from '../../shared/platformOnboardingHistory.js';
import { listPlatformProductDescriptors } from '../../shared/platformProducts.js';
import {
  readPlatformPreferences,
  writePlatformPreferences,
} from '../../shared/platformPreferences.js';
import { cloneProviderModelSelection } from '../../shared/providerSelection.js';
import {
  readRuntimeSetupSummary,
} from '../../runtime/setup.js';
import {
  buildAppShellPayload,
  enqueueGuideCatAssistRefreshIfRuntimeReachable,
  type ChatApiDependencies,
} from '../../products/chat/api/routeSupport.js';
import {
  createFirstAdminLocalAuthState,
  createPlatformAuthSecurityEvent,
  evaluatePreAuthOriginGate,
  hasExistingPlatformAdmin,
  PLATFORM_AUTH_ERROR_CODES,
  PlatformAdminCredentialError,
  PlatformFirstAdminExistsError,
  serializeAuthSessionCookie,
  validatePlatformAdminCredentials,
  describePlatformAdminCredentialRejection,
  type PlatformAdminCredentials,
  type PlatformAuthSecurityEventReporter,
  type PlatformAuthStore,
  type PlatformAuthState,
  type PreAuthOriginGateRejectionReason,
} from '../../platform/auth/index.js';
import type { PlatformAuthConfig } from '../../platform/auth/config.js';
import type { RouteContext } from '../../shared/http.js';
import {
  buildSetupDebugContext,
} from './platformSetupRouteSupport.js';
import { routePlatformAssistantPresetApi } from './platformSetupAssistantRoutes.js';
import { routePlatformSetupDiagnosticsApi } from './platformSetupDiagnosticsRoutes.js';
import { routePlatformGuideCatApi } from './platformSetupGuideCatRoutes.js';
import { routePlatformPreferenceApi } from './platformSetupPreferenceRoutes.js';
import { resolveGuideCatSystemName } from '../../shared/guideCatIdentity.js';
import { sendPlatformAuthError } from './authErrorResponses.js';

export interface PlatformSetupAuthDependencies {
  authStore: PlatformAuthStore;
  auth: PlatformAuthConfig;
  reportAuthSecurityEvent?: PlatformAuthSecurityEventReporter;
}

export type PlatformSetupContext = RouteContext<
  ChatApiDependencies & PlatformSetupAuthDependencies
>;

const GUIDE_CAT_PRIMARY_ID = 'guide-cat-primary';

interface LegacyPlatformSetupCompleteInput extends PlatformSetupCompleteInput {
  createBossCat?: boolean;
  bossCatProvider?: string;
  bossCatInstance?: string;
  bossCatModel?: string;
  bossCatModelSelection?: ProviderModelSelection | null;
  /** @deprecated No longer sent by the wizard. */
  selectedProduct?: string;
  adminIdentifier?: string;
  adminPassword?: string;
}

class PlatformSetupConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformSetupConfigurationError';
  }
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

/**
 * SPEC-113 requirement 5: first-admin creation runs inside a process-wide
 * serialized critical section. Without it two concurrent submissions can each
 * read "setup incomplete" before either writes, and the later uniqueness
 * recheck inside the auth-store mutation would be the only thing standing
 * between them and two half-built workspaces.
 */
let setupCriticalSection: Promise<unknown> = Promise.resolve();

function runExclusiveSetupOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = setupCriticalSection.then(operation, operation);
  setupCriticalSection = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function handlePlatformSetupComplete(
  context: PlatformSetupContext,
): Promise<void> {
  if (!enforceSetupPreAuthOriginGate(context)) {
    return;
  }

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

  // SPEC-113 requirements 1 and 2: Admin credentials are mandatory and are
  // rejected before any owner, Guide Cat, setup, or auth state is mutated.
  const credentialValidation = validatePlatformAdminCredentials({
    identifier: body.adminIdentifier,
    password: body.adminPassword,
  });
  if (!credentialValidation.ok) {
    sendJson(context.response, 400, {
      error: {
        code: 'invalid_admin_credentials',
        reason: credentialValidation.reason,
        message: describePlatformAdminCredentialRejection(credentialValidation.reason),
      },
    });
    return;
  }
  const adminCredentials = credentialValidation.credentials;

  await runExclusiveSetupOperation(
    () => completePlatformSetupExclusively(context, body, adminCredentials),
  );
}

async function completePlatformSetupExclusively(
  context: PlatformSetupContext,
  body: LegacyPlatformSetupCompleteInput,
  adminCredentials: PlatformAdminCredentials,
): Promise<void> {
  const now = context.dependencies.now?.() ?? new Date();
  let core = await context.dependencies.chatStore.readCore();
  let chatState = await context.dependencies.chatStore.read();
  const previousCore = structuredClone(core);
  const previousChatState = structuredClone(chatState);

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
  const resolvedGuideCatName = resolveGuideCatSystemName(
    context.request.headers['accept-language'],
  );
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
    // Auth state is persisted before the chat/core snapshot so a failure can
    // never leave `setupCompleteAt` set without a valid first Admin
    // (SPEC-113 requirement 7). The reverse order is rolled back below.
    const firstAdminSession = await createFirstAdminDuringSetup(context, {
      displayName: ownerDisplayName,
      identifier: adminCredentials.identifier,
      password: adminCredentials.password,
      now,
    });

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
    try {
      await context.dependencies.chatStore.writeSnapshot(chatState, core);
    } catch (error) {
      await rollbackFirstAdminAuthState(context, firstAdminSession.previousState);
      throw error;
    }
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
        const currentPrefs = await readPlatformPreferences(
          context.dependencies.config.chatStatePath,
        );
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
        installedApps: [],
        runtime: createPlatformWarmRuntimeSummary(),
        runtimeSetup: runtimeSetup ?? null,
        metadata: createPlatformResponseMetadata({
          generatedAt: now,
          host: context.dependencies.config.host,
          port: context.dependencies.config.port,
        }),
        bootstrapAttemptId: attemptId,
        scopeId: '',
        setupCompleteAt: core.setupCompleteAt,
        ownerDisplayName: core.ownerProfile.displayName,
        ownerAvatarColor: core.ownerProfile.avatarColor,
        ownerAvatarUrl: core.ownerProfile.avatarUrl ?? null,
        guideCat: core.guideCat,
        assistantPresets: core.assistantPresets,
        lastProductSurface: legacyProduct ?? null,
        language: {
          assistantResponseLanguage: 'unspecified',
          uiLanguagePreference: 'auto',
        },
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

    await reportSetupSecurityEvent(context, {
      kind: 'first_admin_created',
      outcome: 'success',
      now,
      accountId: firstAdminSession.accountId,
      sessionId: firstAdminSession.sessionId,
    });

    sendJson(
      context.response,
      200,
      payload,
      {
        'Set-Cookie': serializeAuthSessionCookie(
          firstAdminSession.token,
          context.dependencies.auth.sessionTtlMs,
        ),
      },
    );
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
    const responseError = resolveSetupCompleteResponseError(error);
    sendJson(context.response, responseError.status, {
      error: {
        code: responseError.code,
        message: responseError.message,
      },
    });
  }
}

function resolveSetupCompleteResponseError(error: unknown): {
  status: number;
  code: 'configuration_error' | 'internal_error' | 'already_complete' | 'invalid_admin_credentials';
  message: string;
} {
  if (error instanceof PlatformSetupConfigurationError) {
    return {
      status: 503,
      code: 'configuration_error',
      message: 'Authentication is not configured for first-admin setup.',
    };
  }
  // A concurrent submission that lost the serialized uniqueness recheck is a
  // conflict, not a server fault (SPEC-113 requirement 6).
  if (error instanceof PlatformFirstAdminExistsError) {
    return {
      status: 409,
      code: 'already_complete',
      message: 'Setup has already been completed',
    };
  }
  if (error instanceof PlatformAdminCredentialError) {
    return {
      status: 400,
      code: 'invalid_admin_credentials',
      message: error.message,
    };
  }
  return {
    status: 500,
    code: 'internal_error',
    message: 'Setup could not be completed.',
  };
}

function enforceSetupPreAuthOriginGate(context: PlatformSetupContext): boolean {
  if (!context.dependencies.auth.enabled) {
    return true;
  }

  const decision = evaluatePreAuthOriginGate({
    origin: context.request.headers.origin,
    fetchSite: context.request.headers['sec-fetch-site'],
    method: context.method,
    allowedBrowserOrigins: context.dependencies.auth.allowedBrowserOrigins,
  });
  if (!decision.allowed) {
    sendPlatformAuthError(
      context.response,
      403,
      PLATFORM_AUTH_ERROR_CODES.forbidden,
      setupPreAuthOriginGateMessage(decision.reason),
    );
    return false;
  }
  return true;
}

function setupPreAuthOriginGateMessage(reason: PreAuthOriginGateRejectionReason): string {
  switch (reason) {
    case 'origin_not_allowed':
      return 'Origin is not allowed.';
    case 'fetch_site_not_allowed':
      return 'Fetch site is not allowed.';
    case 'origin_required':
      return 'Origin is required.';
  }
}

interface FirstAdminSetupResult {
  previousState: PlatformAuthState;
  token: string;
  accountId: string;
  sessionId: string;
}

/**
 * SPEC-113 requirements 5 and 6: the uniqueness recheck and the record writes
 * happen inside one serialized auth-store mutation, so a concurrent loser can
 * never create a second Account, Identity, Membership, or Session.
 */
async function createFirstAdminDuringSetup(
  context: PlatformSetupContext,
  input: {
    displayName: string;
    identifier: string;
    password: string;
    now: Date;
  },
): Promise<FirstAdminSetupResult> {
  const sessionSecret = context.dependencies.auth.sessionSecret;
  if (!sessionSecret) {
    throw new PlatformSetupConfigurationError(
      'CATS_AUTH_SESSION_SECRET is required to create the first admin session.',
    );
  }

  let previousState: PlatformAuthState | null = null;
  let token: string | null = null;
  let accountId: string | null = null;
  let sessionId: string | null = null;

  await context.dependencies.authStore.updateState(async (state) => {
    if (hasExistingPlatformAdmin(state)) {
      throw new PlatformFirstAdminExistsError();
    }
    previousState = structuredClone(state);
    const created = await createFirstAdminLocalAuthState({
      state,
      displayName: input.displayName,
      identifier: input.identifier,
      password: input.password,
      sessionSecret,
      sessionTtlMs: context.dependencies.auth.sessionTtlMs,
      now: input.now,
    });
    token = created.session.token;
    accountId = created.account.id;
    sessionId = created.session.session.id;
    return created.state;
  });

  if (previousState === null || token === null || accountId === null || sessionId === null) {
    throw new Error('First admin creation did not produce a session.');
  }
  return { previousState, token, accountId, sessionId };
}

async function rollbackFirstAdminAuthState(
  context: PlatformSetupContext,
  previousState: PlatformAuthState,
): Promise<void> {
  try {
    await context.dependencies.authStore.writeState(previousState);
  } catch (error) {
    // The caller is already unwinding; surface this in diagnostics rather than
    // masking the original persistence failure.
    reportSyncFailure('setup_complete_auth_rollback', error);
  }
}

async function reportSetupSecurityEvent(
  context: PlatformSetupContext,
  input: Parameters<typeof createPlatformAuthSecurityEvent>[0],
): Promise<void> {
  const reporter = context.dependencies.reportAuthSecurityEvent;
  if (!reporter) {
    return;
  }
  try {
    await reporter(createPlatformAuthSecurityEvent(input));
  } catch (error) {
    reportSyncFailure('setup_complete_security_event', error);
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
    try {
      await handlePlatformSetupComplete(context);
    } catch (error) {
      // State reads happen before the transactional setup block has enough
      // context to record a detailed onboarding event. Keep those diagnostics
      // server-side too instead of falling through to the global error handler,
      // which includes raw exception messages in its response.
      reportSyncFailure('setup_complete_route', error);
      const responseError = resolveSetupCompleteResponseError(error);
      sendJson(context.response, responseError.status, {
        error: {
          code: responseError.code,
          message: responseError.message,
        },
      });
    }
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
