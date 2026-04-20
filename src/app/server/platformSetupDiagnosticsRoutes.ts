import { readJsonBody, sendJson, sendMethodNotAllowed, type RouteContext } from '../../shared/http.js';
import type { ChatApiDependencies } from '../../products/chat/api/routeSupport.js';
import {
  appendPlatformOnboardingEvent,
  readPlatformOnboardingHistory,
} from '../../shared/platformOnboardingHistory.js';
import { normalizeAttemptId } from './platformSetupRouteSupport.js';
import { summarizePlatformIngress } from './platformIngressSummary.js';

type PlatformSetupContext = RouteContext<ChatApiDependencies>;

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

export async function routePlatformSetupDiagnosticsApi(
  context: PlatformSetupContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/platform/ingress') {
    if (context.method !== 'GET') {
      sendMethodNotAllowed(context.response, ['GET']);
      return true;
    }
    sendJson(context.response, 200, summarizePlatformIngress({
      host: context.dependencies.config.host,
      port: context.dependencies.config.port,
    }));
    return true;
  }

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

  return false;
}
