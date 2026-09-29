import path from 'node:path';
import { preparePlatformOwnedDataReset, removePlatformOwnedData, PlatformResetBusyError } from '../../../shared/platformDataReset.js';
import { createDefaultCoreState } from '../../../core/model/index.js';
import { readJsonBody, sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { runExclusiveSetupOperation } from '../../../shared/platformSetupOperation.js';
import {
  readPlatformPreferences,
  writePlatformPreferences,
} from '../../../shared/platformPreferences.js';
import { createDefaultChatState } from '../state/defaults.js';
import { createGlobalOrchestratorVisibleParticipant } from '../state/orchestratorHats.js';
import { createCat } from '../state/model/index.js';
import {
  AUTH_SESSION_COOKIE_NAME,
  clearAuthSessionCookie,
  createEmptyPlatformAuthState,
  hasExistingPlatformAdmin,
  resolveBrowserPrincipalFromToken,
  validateCatsCsrfToken,
  type PlatformSessionRecord,
} from '../../../platform/auth/index.js';
import { waitForGuideCatAssistRefreshIdle } from './guideCatAssist.js';
import {
  buildAppShellPayload,
  nowFrom,
  sendRestError,
  type ChatApiRouteContext,
} from './routeSupport.js';

function reportSetupRouteFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  // Keep the legacy prefix while setup/reset diagnostics still feed existing ops grep paths.
  process.stderr.write(`[cats-memory-sync] ${scope}: ${message}\n`);
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
    const withReset = context.dependencies.withPlatformDataReset
      ?? (async (operation: (clear: () => Promise<void>) => Promise<void>) => operation(async () => {}));
    await withReset(async clearCaches => {
      // Assist refreshes can write after their initiating HTTP request finishes.
      await waitForGuideCatAssistRefreshIdle(context.dependencies.config.chatStatePath);
      const chatState = await context.dependencies.chatStore.read();
      const previousCore = await context.dependencies.chatStore.readCore();
      const removal = {
        attachmentDirectories: chatState.channels.flatMap(channel => [channel.repoPath, channel.chatCwd])
          .filter((directory): directory is string => typeof directory === 'string' && Boolean(directory.trim()))
          .map(directory => path.join(directory, '.cats-attachments')),
        evidenceDirectories: context.dependencies.resetEvidenceDirectories,
      };
      await preparePlatformOwnedDataReset(context.dependencies.config.chatStatePath, removal);
      await context.dependencies.chatStore.writeSnapshot(createDefaultChatState(), createDefaultCoreState());
      try {
        await context.dependencies.authStore?.writeState(createEmptyPlatformAuthState(now));
      } catch (error) {
        // Before erasure begins, retain the authenticated workspace on failure.
        await context.dependencies.chatStore.writeSnapshot(chatState, previousCore);
        throw error;
      }
      const currentPrefs = await readPlatformPreferences(context.dependencies.config.chatStatePath);
      await writePlatformPreferences(context.dependencies.config.chatStatePath, { ...currentPrefs, lastProductSurface: null });
      await clearCaches();
      // Build the fresh shell before removing snapshots, so read-time helpers
      // cannot regenerate reset backups or memory files after the purge.
      const payload = await buildAppShellPayload(context.dependencies);
      await removePlatformOwnedData(context.dependencies.config.chatStatePath, removal);
      sendJson(context.response, 200, payload, { 'Set-Cookie': clearAuthSessionCookie() });
    });
  } catch (error) {
    reportSetupRouteFailure('setup_reset', error);
    sendJson(context.response, error instanceof PlatformResetBusyError ? 409 : 500, {
      error: { code: error instanceof PlatformResetBusyError ? 'platform_reset_busy' : 'internal_error',
        message: error instanceof PlatformResetBusyError ? error.message : 'Platform data could not be fully reset. Retry to finish removing the remaining data.' },
    });
  }
}

async function authorizeSetupReset(
  context: ChatApiRouteContext,
  setupCompleteAt: string | null,
): Promise<boolean> {
  const auth = context.dependencies.auth;
  const authStore = context.dependencies.authStore;
  if (!setupCompleteAt && (!authStore || !hasExistingPlatformAdmin(await authStore.readState()))) {
    return true;
  }
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
  if (context.url.pathname === '/api/setup/reset') {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }
    await runExclusiveSetupOperation(() => handleSetupReset(context));
    return true;
  }

  return false;
}
