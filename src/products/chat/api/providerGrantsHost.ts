import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../../../shared/http.js';
import type { RuntimeClient } from '../../../runtime/client.js';
import { isDesktopHostRequest } from '../../../platform/desktopControl/routes.js';
import { collectParticipantSessionIds } from '../shared/channelParticipants.js';
import {
  channelDispatchCancellationRegistry,
  DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE,
} from '../state/runtime-dispatch/cancellation.js';
import type { ChatState } from './contracts.js';

/**
 * ADR-155: the Desktop host's Stop for standing grants. The host revokes grants in Runtime itself; this
 * route cancels the chat turns of the conversations holding those sessions, as the conversation's own
 * Stop does, so they end as stopped rather than failed. Key-authenticated like SPEC-133's host routes.
 */
export const PROVIDER_GRANTS_HOST_CANCEL_PATH = '/api/internal/provider-grants/host-cancel';
const MAX_SESSIONS = 64;

export async function routeProviderGrantsHost(request: IncomingMessage, response: ServerResponse,
  dependencies: { chatStore: { read(): Promise<ChatState> }; runtimeClient: Pick<RuntimeClient, 'cancelSession'>; now?: () => Date },
  expected: string | undefined): Promise<boolean> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== PROVIDER_GRANTS_HOST_CANCEL_PATH) return false;
  const headers = { 'cache-control': 'no-store' };
  if (!isDesktopHostRequest(request, expected)) { sendJson(response, 403, { error: 'desktop_authority_required' }, headers); return true; }
  if (request.method !== 'POST') { sendJson(response, 405, { error: 'provider_grants_method_not_allowed' }, headers); return true; }
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length;
    if (size > 16 * 1024) { sendJson(response, 413, { error: 'provider_grants_request_too_large' }, headers); return true; }
    chunks.push(bytes);
  }
  let sessionIds: string[];
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { sessionIds?: unknown };
    if (!Array.isArray(body.sessionIds) || body.sessionIds.length > MAX_SESSIONS
      || !body.sessionIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)) throw new Error('invalid');
    sessionIds = body.sessionIds as string[];
  } catch { sendJson(response, 400, { error: 'invalid_provider_grants_request' }, headers); return true; }
  const wanted = new Set(sessionIds);
  const state = await dependencies.chatStore.read();
  const nowIso = (dependencies.now?.() ?? new Date()).toISOString();
  const channels: string[] = [];
  const sessions = new Set<string>();
  for (const channel of state.channels) {
    const held = collectParticipantSessionIds(channel, { includeRemoved: true }).filter((id) => wanted.has(id));
    if (!held.length) continue;
    channels.push(channel.id);
    for (const id of held) sessions.add(id);
    if (channel.roomRouting?.workflow.activeTurn) {
      channelDispatchCancellationRegistry.request(channel.id, nowIso, DEFAULT_CHANNEL_DISPATCH_CANCELLATION_NOTE);
    }
  }
  await Promise.allSettled([...sessions].map((id) => dependencies.runtimeClient.cancelSession(id)));
  sendJson(response, 200, { channels, sessions: sessions.size }, headers);
  return true;
}
