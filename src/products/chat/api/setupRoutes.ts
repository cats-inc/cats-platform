import { createDefaultCoreState } from '../../../core/model/index.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { clearGuideCatAssistCache } from '../../../shared/guideCatAssistStore.js';
import { resetPlatformOnboardingHistory } from '../../../shared/platformOnboardingHistory.js';
import {
  readPlatformPreferences,
  writePlatformPreferences,
} from '../../../shared/platformPreferences.js';
import { createDefaultChatState } from '../state/defaults.js';
import { createGlobalOrchestratorVisibleParticipant } from '../state/orchestratorHats.js';
import { createCat } from '../state/model/index.js';
import {
  AUTH_SESSION_COOKIE_NAME,
  resolveBrowserPrincipalFromToken,
  validateCatsCsrfToken,
  type PlatformSessionRecord,
} from '../../../platform/auth/index.js';
import type { SetupCompleteInput } from './contracts.js';
import { waitForGuideCatAssistRefreshIdle } from './guideCatAssist.js';
import {
  buildAppShellPayload,
  handleRestError,
  nowFrom,
  sendRestError,
  type ChatApiRouteContext,
} from './routeSupport.js';

function reportSetupRouteFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  // Keep the legacy prefix while setup/reset diagnostics still feed existing ops grep paths.
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
    const orchestratorExecutionTarget = {
      provider: body.bossCatProvider,
      instance: body.bossCatInstance?.trim() || null,
      model: body.bossCatModel ?? null,
    };
    const orchestratorExecutionModelSelection = body.bossCatModelSelection ?? null;
    chatState = {
      ...chatState,
      globalOrchestrator: {
        ...chatState.globalOrchestrator,
        visibleParticipant: createGlobalOrchestratorVisibleParticipant({
          displayName: bossCat.name,
          executionTarget: orchestratorExecutionTarget,
          executionModelSelection: orchestratorExecutionModelSelection,
        }),
        executionTarget: orchestratorExecutionTarget,
        executionModelSelection: orchestratorExecutionModelSelection,
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
      reportSetupRouteFailure('setup_complete', error);
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
    const core = await context.dependencies.chatStore.readCore();
    if (!(await authorizeSetupReset(context, core.setupCompleteAt))) {
      return;
    }
    await context.dependencies.chatStore.writeSnapshot(
      createDefaultChatState(),
      createDefaultCoreState(),
    );
    try {
      await waitForGuideCatAssistRefreshIdle(context.dependencies.config.chatStatePath);
      await clearGuideCatAssistCache(context.dependencies.config.chatStatePath, now);
    } catch (error) {
      reportSetupRouteFailure('setup_reset_assist_cache', error);
    }
    try {
      const currentPrefs = await readPlatformPreferences(context.dependencies.config.chatStatePath);
      await writePlatformPreferences(context.dependencies.config.chatStatePath, {
        ...currentPrefs,
        lastProductSurface: null,
      });
    } catch (error) {
      reportSetupRouteFailure('setup_reset_prefs', error);
    }
    try {
      await context.dependencies.memoryService.flushOwnerProfile({
        reason: 'owner_profile_sync',
        now,
      });
    } catch (error) {
      reportSetupRouteFailure('setup_reset', error);
    }
    try {
      await resetPlatformOnboardingHistory(context.dependencies.config.chatStatePath);
    } catch (error) {
      reportSetupRouteFailure('setup_reset_history', error);
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

async function authorizeSetupReset(
  context: ChatApiRouteContext,
  setupCompleteAt: string | null,
): Promise<boolean> {
  if (!setupCompleteAt) {
    return true;
  }
  const auth = context.dependencies.auth;
  const authStore = context.dependencies.authStore;
  const sessionSecret = auth?.sessionSecret;
  if (!auth || !authStore || !sessionSecret) {
    sendSetupAuthError(context, 401, 'E_UNAUTHENTICATED', 'Authentication is required.');
    return false;
  }

  const token = readCookie(context.request, AUTH_SESSION_COOKIE_NAME);
  if (!token) {
    sendSetupAuthError(context, 401, 'E_UNAUTHENTICATED', 'Authentication is required.');
    return false;
  }
  const principal = resolveBrowserPrincipalFromToken(await authStore.readState(), {
    token,
    sessionSecret,
    now: nowFrom(context.dependencies),
  });
  if (!principal) {
    sendSetupAuthError(context, 401, 'E_UNAUTHENTICATED', 'Authentication is required.');
    return false;
  }
  if (!principal.membership.roles.includes('admin')) {
    sendSetupAuthError(context, 403, 'E_FORBIDDEN', 'Admin role is required.');
    return false;
  }
  if (!validateSetupResetCsrf(context, principal.session)) {
    return false;
  }
  return true;
}

function validateSetupResetCsrf(
  context: ChatApiRouteContext,
  session: PlatformSessionRecord,
): boolean {
  const auth = context.dependencies.auth;
  const token = context.request.headers['x-cats-csrf-token'];
  const decision = validateCatsCsrfToken({
    session,
    sessionSecret: auth?.sessionSecret ?? null,
    token: typeof token === 'string' ? token : undefined,
  });
  if (!decision.ok) {
    sendSetupAuthError(
      context,
      403,
      'E_CSRF_MISMATCH',
      'CSRF token is missing or invalid.',
    );
    return false;
  }
  return true;
}

function readCookie(request: ChatApiRouteContext['request'], name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
}

function sendSetupAuthError(
  context: ChatApiRouteContext,
  statusCode: 401 | 403,
  code: 'E_UNAUTHENTICATED' | 'E_FORBIDDEN' | 'E_CSRF_MISMATCH',
  message: string,
): void {
  sendJson(context.response, statusCode, {
    error: {
      code,
      message,
    },
  });
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
