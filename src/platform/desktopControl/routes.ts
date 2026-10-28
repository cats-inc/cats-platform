import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RouteContext } from '../../shared/http.js';
import { sendJson } from '../../shared/http.js';
import { PLATFORM_DESKTOP_AUTH_KEY_HEADER } from '../../shared/nativeGoogleAuth.js';
import { isLoopbackAuthHost } from '../auth/effectiveMode.js';
import type { DesktopControlService } from './service.js';

/** SPEC-133 "Platform owner API". Desktop control acts on this computer, so only its local owner may use it. */
export const DESKTOP_CONTROL_API_PREFIX = '/api/desktop-control/';

const FORWARDING_HEADERS = ['forwarded', 'x-forwarded-for', 'x-real-ip', 'x-forwarded-host'];

/**
 * A local owner request: loopback socket and host, no forwarding headers and an owner or admin
 * signed in with a browser cookie, so Mobile credentials and tunnelled requests never qualify.
 * The channel message route uses the same test to stamp owner-present turns (DC-05).
 */
export function isLocalOwnerRequest(context: Pick<RouteContext<unknown>, 'request' | 'url' | 'auth'>): boolean {
  const remote = context.request.socket.remoteAddress?.replace(/^::ffff:/u, '');
  if (!remote || !isLoopbackAuthHost(remote) || !isLoopbackAuthHost(context.url.hostname)) return false;
  if (FORWARDING_HEADERS.some((header) => context.request.headers[header] !== undefined)) return false;
  return context.auth?.credentialKind === 'browser_cookie'
    && Boolean(context.auth.principal?.membership.roles.some((role) => role === 'owner' || role === 'admin'));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > 4 * 1024) return null;
    chunks.push(bytes);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function routeDesktopControl(context: RouteContext<{ desktopControl?: DesktopControlService }>): Promise<boolean> {
  const { pathname } = context.url;
  if (!pathname.startsWith(DESKTOP_CONTROL_API_PREFIX)) return false;
  const headers = { 'cache-control': 'no-store' };
  const service = context.dependencies.desktopControl;
  if (!isLocalOwnerRequest(context)) { sendJson(context.response, 403, { error: 'desktop_control_local_owner_required' }, headers); return true; }
  if (!service) { sendJson(context.response, 404, { error: 'desktop_control_not_configured' }, headers); return true; }
  const parts = pathname.slice(DESKTOP_CONTROL_API_PREFIX.length).split('/').map(decodeURIComponent);
  if (parts.some((part) => part.length > 300)) { sendJson(context.response, 400, { error: 'invalid_desktop_control_route' }, headers); return true; }
  const [resource, id] = parts;

  if (resource === 'state' && parts.length === 1 && context.method === 'GET') {
    const channelId = context.url.searchParams.get('channelId') ?? undefined;
    sendJson(context.response, 200, await service.state(channelId || undefined), headers);
    return true;
  }
  if (context.method !== 'PUT' && context.method !== 'POST') {
    sendJson(context.response, 405, { error: 'desktop_control_method_not_allowed' }, headers); return true;
  }
  const body = await readBody(context.request);
  if (!body) { sendJson(context.response, 400, { error: 'invalid_desktop_control_body' }, headers); return true; }

  if (resource === 'settings' && parts.length === 1 && context.method === 'PUT' && typeof body.enabled === 'boolean') {
    await service.setEnabled(body.enabled);
  } else if (resource === 'conversations' && id && parts.length === 2 && context.method === 'PUT' && typeof body.enabled === 'boolean') {
    await service.setConversation(id, body.enabled);
  } else if (resource === 'grant-requests' && id && parts.length === 2 && context.method === 'POST'
    && (body.decision === 'allow' || body.decision === 'deny')) {
    if (!service.decideGrant(id, body.decision, typeof body.channelId === 'string' ? body.channelId : undefined)) {
      sendJson(context.response, 409, { error: 'desktop_control_request_closed' }, headers); return true;
    }
  } else if (resource === 'stop' && parts.length === 1 && context.method === 'POST'
    && (body.channelId === undefined || typeof body.channelId === 'string')) {
    service.stop(typeof body.channelId === 'string' ? body.channelId : undefined);
  } else {
    sendJson(context.response, 400, { error: 'invalid_desktop_control_request' }, headers); return true;
  }
  const channelId = typeof body.channelId === 'string' ? body.channelId : resource === 'conversations' ? id : undefined;
  sendJson(context.response, 200, await service.state(channelId), headers);
  return true;
}

/** SPEC-133 DC-11, DC-12: the Desktop host reads hold state for its notice and tray and stops from them. */
export const DESKTOP_CONTROL_HOST_STATE_PATH = '/api/internal/desktop-control/host-state';
export const DESKTOP_CONTROL_HOST_STOP_PATH = '/api/internal/desktop-control/host-stop';

/** Only the local Desktop host holds the key; the ingress listener strips this header and refuses the path. */
export async function routeDesktopControlHost(request: IncomingMessage, response: ServerResponse,
  service: Pick<DesktopControlService, 'hostState' | 'stop'>, expected: string | undefined): Promise<boolean> {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname !== DESKTOP_CONTROL_HOST_STATE_PATH && pathname !== DESKTOP_CONTROL_HOST_STOP_PATH) return false;
  const headers = { 'cache-control': 'no-store' };
  const supplied = request.headers[PLATFORM_DESKTOP_AUTH_KEY_HEADER];
  const address = request.socket.remoteAddress?.replace(/^::ffff:/u, '');
  if (request.headers.origin !== undefined || !['127.0.0.1', '::1'].includes(address ?? '')
    || typeof supplied !== 'string' || !expected || expected.length < 32
    || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    sendJson(response, 403, { error: 'desktop_authority_required' }, headers);
    return true;
  }
  if (pathname === DESKTOP_CONTROL_HOST_STATE_PATH && request.method === 'GET') {
    sendJson(response, 200, service.hostState(), headers);
  } else if (pathname === DESKTOP_CONTROL_HOST_STOP_PATH && request.method === 'POST') {
    service.stop();
    sendJson(response, 200, service.hostState(), headers);
  } else {
    sendJson(response, 405, { error: 'desktop_control_method_not_allowed' }, headers);
  }
  return true;
}
