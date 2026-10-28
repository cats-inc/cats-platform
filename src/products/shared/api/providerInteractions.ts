import type { RouteContext } from '../../../shared/http.js';
import { sendJson } from '../../../shared/http.js';
import type { RuntimeClient } from '../../../runtime/client.js';
import { createProviderInteractionControl, ProviderControlError, type ProviderBindingAccess } from '../../../platform/runtime/providerInteractionControl.js';
import type { BoundInteractionResponse } from '../../../shared/providerInteractions.js';
import { isLoopbackAuthHost } from '../../../platform/auth/effectiveMode.js';
import { readPlatformPreferences, writePlatformPreferences } from '../../../shared/platformPreferences.js';

export const PROVIDER_PREFERENCES_PATH = '/api/provider-interactions/preferences';

/** Claude in Chrome lets Cats act in the owner's browser, so only the local owner can change it. */
async function routeProviderPreferences(context: RouteContext<{ chatStatePath: string }>, headers: Record<string, string>) {
  const statePath = context.dependencies.chatStatePath;
  if (context.method === 'POST') {
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of context.request) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > 4 * 1024) { sendJson(context.response, 413, { error: 'provider_preferences_too_large' }, headers); return; }
      chunks.push(bytes);
    }
    let body: { claudeInChromeEnabled?: unknown } = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof body; } catch {}
    if (typeof body.claudeInChromeEnabled !== 'boolean') {
      sendJson(context.response, 400, { error: 'invalid_provider_preferences' }, headers); return;
    }
    await writePlatformPreferences(statePath, { ...await readPlatformPreferences(statePath), claudeInChromeEnabled: body.claudeInChromeEnabled });
  } else if (context.method !== 'GET') {
    sendJson(context.response, 405, { error: 'provider_method_not_allowed' }, headers); return;
  }
  sendJson(context.response, 200, { claudeInChromeEnabled: (await readPlatformPreferences(statePath)).claudeInChromeEnabled }, headers);
}

export async function routeProviderInteractions(context: RouteContext<{ bindings: (conversationId: string) => Promise<ProviderBindingAccess[]>;
  runtimeClient: RuntimeClient; chatStatePath: string }>): Promise<boolean> {
  const prefix = '/api/provider-interactions/conversations/';
  const preferences = context.url.pathname === PROVIDER_PREFERENCES_PATH;
  if (!preferences && !context.url.pathname.startsWith(prefix)) return false;
  const headers = { 'cache-control': 'no-store' };
  const remote = context.request.socket.remoteAddress?.replace(/^::ffff:/u, '');
  const forwarded = ['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-host'].some(h => context.request.headers[h] !== undefined);
  if (!remote || !isLoopbackAuthHost(remote) || !isLoopbackAuthHost(context.url.hostname) || forwarded) {
    sendJson(context.response, 403, { error: 'provider_local_host_required' }, headers); return true;
  }
  // Native approvals are local owner controls. Mobile credentials cannot opt in.
  if (!context.auth?.principal || context.auth.credentialKind !== 'browser_cookie'
    || !context.auth.principal.membership.roles.some(r => r === 'owner' || r === 'admin')) {
    sendJson(context.response, 403, { error: 'provider_owner_required' }, headers); return true;
  }
  if (preferences) { await routeProviderPreferences(context, headers); return true; }
  const control = createProviderInteractionControl({ runtime: context.dependencies.runtimeClient,
    bindings: context.dependencies.bindings });
  try {
    const parts = context.url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
    const [conversationId, sessions, sessionId, operation, id, action] = parts;
    if (!conversationId || parts.some(p => p.length > 300)) throw new ProviderControlError(400, 'invalid_provider_route');
    if (parts.length === 1 && context.method === 'GET') {
      sendJson(context.response, 200, await control.snapshot(conversationId), headers); return true;
    }
    if (sessions !== 'sessions' || !sessionId) throw new ProviderControlError(404, 'provider_route_not_found');
    if (parts.length === 4 && operation === 'capabilities' && context.method === 'GET') {
      sendJson(context.response, 200, await control.capabilities(conversationId, sessionId, context.url.searchParams.get('refresh') === 'true'), headers); return true;
    }
    if (parts.length !== 6 || operation !== 'requests' || !id || !['respond', 'url'].includes(action ?? '') || context.method !== 'POST') {
      throw new ProviderControlError(405, 'provider_method_not_allowed');
    }
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of context.request) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > 40 * 1024) throw new ProviderControlError(413, 'provider_response_too_large');
      chunks.push(bytes);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as BoundInteractionResponse;
    const result = action === 'url' ? { url: await control.url(conversationId, sessionId, id, body) }
      : await control.respond(conversationId, sessionId, id, body);
    sendJson(context.response, 200, result, headers);
  } catch (error) {
    const status = error instanceof ProviderControlError ? error.status : error instanceof SyntaxError ? 400 : 409;
    sendJson(context.response, status, { error: error instanceof ProviderControlError ? error.code : 'provider_control_unavailable' }, headers);
  }
  return true;
}
