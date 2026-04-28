import { readJsonBody, sendJson, sendMethodNotAllowed, type RouteContext } from '../../shared/http.js';
import { setFeatureFlag } from '../../shared/featureFlags.js';
import {
  readPersistedPlatformFeatureFlags,
  writePersistedPlatformFeatureFlags,
} from '../../shared/featureFlagsStore.js';
import { resolvePlatformFeatureFlagsPathFromChatState } from '../../shared/platformPaths.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';

type PlatformFeatureFlagContext = RouteContext<ChatApiDependencies>;

interface FeatureFlagWriteBody {
  name?: unknown;
  value?: unknown;
}

async function handleFeatureFlagWrite(
  context: PlatformFeatureFlagContext,
): Promise<void> {
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
    current,
  });

  if (result.status === 'unknown_flag') {
    sendJson(context.response, 404, {
      error: { code: 'unknown_flag', message: `Unknown feature flag: ${result.name}` },
    });
    return;
  }

  const next = { ...current, [body.name]: result.nextValue };
  await writePersistedPlatformFeatureFlags(flagsPath, next);

  sendJson(context.response, 200, {
    name: body.name,
    previousValue: result.previousValue,
    nextValue: result.nextValue,
    featureFlags: next,
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
