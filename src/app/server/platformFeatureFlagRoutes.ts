import { readJsonBody, sendJson, sendMethodNotAllowed, type RouteContext } from '../../shared/http.js';
import { BUILD_CHANNEL } from '../../shared/buildChannel.js';
import {
  coerceFeatureFlagsForRead,
  setFeatureFlag,
} from '../../shared/featureFlags.js';
import {
  readPersistedPlatformFeatureFlags,
  writePersistedPlatformFeatureFlags,
} from '../../shared/featureFlagsStore.js';
import { resolvePlatformFeatureFlagsPathFromChatState } from '../../shared/platformPaths.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';

type PlatformFeatureFlagContext = RouteContext<ChatApiDependencies>;

/**
 * Local-first desktop ownership signal. The desktop main process sets
 * `CATS_PLATFORM_HOST_OWNS_FEATURE_FLAGS=1` on the sidecar's environment
 * so the sidecar's HTTP writer here returns 410 Gone with a pointer back
 * to the desktop IPC writer; renderers in packaged Electron must call
 * the desktop preload bridge instead.
 *
 * In standalone server mode this env var is unset and the sidecar (which
 * is the only owner) keeps writing directly.
 */
function isPlatformHostOwnsFeatureFlags(): boolean {
  return process.env.CATS_PLATFORM_HOST_OWNS_FEATURE_FLAGS === '1';
}

interface FeatureFlagWriteBody {
  name?: unknown;
  value?: unknown;
}

async function handleFeatureFlagWrite(
  context: PlatformFeatureFlagContext,
): Promise<void> {
  if (isPlatformHostOwnsFeatureFlags()) {
    sendJson(context.response, 410, {
      error: {
        code: 'feature_flag_writer_disabled',
        message:
          'Feature flag writes are owned by the desktop host process. '
          + 'Use the desktop preload bridge or `npm run dev:toggle-flag` '
          + '(local dev) instead of this HTTP route.',
      },
    });
    return;
  }
  let body: FeatureFlagWriteBody;
  try {
    body = await readJsonBody<FeatureFlagWriteBody>(context.request);
  } catch (error) {
    sendJson(context.response, 400, {
      error: {
        code: 'bad_request',
        message: error instanceof Error ? error.message : 'Invalid JSON body.',
      },
    });
    return;
  }

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: '`name` must be a non-empty string.' },
    });
    return;
  }
  if (typeof body.value !== 'boolean') {
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message: '`value` must be a boolean.' },
    });
    return;
  }

  const flagsPath = resolvePlatformFeatureFlagsPathFromChatState(
    context.dependencies.config.chatStatePath,
  );
  const current = await readPersistedPlatformFeatureFlags(flagsPath);

  const result = setFeatureFlag({
    name: body.name,
    value: body.value,
    buildChannel: BUILD_CHANNEL,
    current,
  });

  if (result.status === 'unknown_flag') {
    sendJson(context.response, 404, {
      error: { code: 'unknown_flag', message: `Unknown feature flag: ${result.name}` },
    });
    return;
  }

  if (result.status === 'feature_flag_blocked') {
    sendJson(context.response, 409, {
      error: {
        code: 'feature_flag_blocked',
        message: result.reason,
        ...(result.unlockRequirement
          ? { unlockRequirement: result.unlockRequirement }
          : {}),
      },
    });
    return;
  }

  const next = { ...current, [body.name]: result.nextValue };
  await writePersistedPlatformFeatureFlags(flagsPath, next);
  const coerced = coerceFeatureFlagsForRead({
    raw: next,
    buildChannel: BUILD_CHANNEL,
  });

  sendJson(context.response, 200, {
    name: body.name,
    previousValue: result.previousValue,
    nextValue: result.nextValue,
    featureFlags: coerced,
  });
}

export async function routePlatformFeatureFlagApi(
  context: PlatformFeatureFlagContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/platform/feature-flag') {
    return false;
  }
  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }
  await handleFeatureFlagWrite(context);
  return true;
}
