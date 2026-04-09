import { readJsonBody, sendJson, sendMethodNotAllowed, type RouteContext } from '../../shared/http.js';
import { readPlatformPreferences, writePlatformPreferences } from '../../shared/platformPreferences.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';
import {
  parsePlatformPreferencesUpdate,
  type PlatformPreferencesUpdateBody,
} from './platformSetupRouteSupport.js';

type PlatformSetupContext = RouteContext<ChatApiDependencies>;

async function handlePlatformPreferencesUpdate(
  context: PlatformSetupContext,
): Promise<void> {
  try {
    const body = await readJsonBody<PlatformPreferencesUpdateBody>(context.request);
    const currentPrefs = await readPlatformPreferences(context.dependencies.config.chatStatePath);
    const nextPrefsResult = parsePlatformPreferencesUpdate(body, currentPrefs);
    if (!nextPrefsResult.ok) {
      sendJson(context.response, 400, {
        error: { code: 'bad_request', message: nextPrefsResult.message },
      });
      return;
    }
    const nextPrefs = nextPrefsResult.value;

    await writePlatformPreferences(context.dependencies.config.chatStatePath, nextPrefs);

    sendJson(context.response, 200, nextPrefs);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendJson(context.response, 400, {
      error: { code: 'bad_request', message },
    });
  }
}

export async function routePlatformPreferenceApi(
  context: PlatformSetupContext,
): Promise<boolean> {
  if (context.url.pathname !== '/api/platform/preferences') {
    return false;
  }

  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  await handlePlatformPreferencesUpdate(context);
  return true;
}
