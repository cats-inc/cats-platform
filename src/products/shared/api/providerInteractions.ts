import type { RouteContext } from '../../../shared/http.js';
import { sendJson } from '../../../shared/http.js';
import type { ChatStore } from '../../chat/state/store.js';
import type { RuntimeClient } from '../../../runtime/client.js';
import { resolveChannelParticipantAssignments, resolveParticipantLeaseAttachment } from '../../chat/shared/channelParticipants.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { createProviderInteractionControl, ProviderControlError, type ProviderBindingAccess } from '../../../platform/runtime/providerInteractionControl.js';
import type { BoundInteractionResponse } from '../../../shared/providerInteractions.js';
import { isLoopbackAuthHost } from '../../../platform/auth/effectiveMode.js';
import type { CoreStore } from '../../../core/store.js';
import { canControlProviderRun, providerRunSession } from '../../../platform/runtime/providerInteractionAdmission.js';

export async function currentProviderBindings(store: ChatStore, conversationId: string, coreStore: CoreStore = store): Promise<ProviderBindingAccess[]> {
  const state = await store.read();
  const core = await coreStore.readCore();
  const owner = core.ownerProfile.actorId;
  const conversation = core.conversations.find(c => c.id === conversationId);
  const channel = state.channels.find(c => buildChatConversationId(c.id) === conversationId || c.id === conversation?.sourceChannelId);
  if (!channel || channel.status === 'archived' || channel.ownerActorId !== owner || conversation?.status === 'archived') {
    throw new ProviderControlError(404, 'provider_conversation_unavailable');
  }
  const turn = channel.roomRouting?.workflow?.activeTurn;
  const rows: ProviderBindingAccess[] = [];
  for (const p of resolveChannelParticipantAssignments(channel).filter(p => p.status === 'active')) {
    const lease = resolveParticipantLeaseAttachment(channel, p.participantId);
    if (!lease?.sessionId) continue;
    const target = turn?.targetStatuses.find(t => t.participant.participantId === p.participantId && t.sessionId === lease.sessionId
      && !['completed', 'failed', 'cancelled', 'skipped'].includes(t.status));
    rows.push({ binding: { conversationId, sessionId: lease.sessionId, participantId: p.participantId,
      laneId: target?.laneId ?? lease.laneId, turnId: turn?.id ?? null, runId: null, label: p.name },
      canRespond: !!target && !turn?.completedAt && !['completed', 'failed', 'cancelled'].includes(turn?.status ?? '') });
  }
  const runs = core.runs.filter(r => r.conversationId === conversationId && providerRunSession(r));
  const liveRuns = runs.filter(r => canControlProviderRun(core, r));
  const terminalRuns = runs.filter(r => !canControlProviderRun(core, r)).slice(-Math.max(0, Math.min(4, 32 - rows.length - liveRuns.length)));
  for (const run of [...liveRuns, ...(rows.length + liveRuns.length >= 32 ? [] : terminalRuns)]) {
    const sessionId = providerRunSession(run);
    if (!sessionId || rows.some(row => row.binding.sessionId === sessionId)) continue;
    rows.push({ binding: { conversationId, sessionId, participantId: run.orchestratorActorId,
      laneId: null, turnId: null, runId: run.id, label: run.title }, canRespond: canControlProviderRun(core, run) });
  }
  return rows;
}

export async function routeProviderInteractions(context: RouteContext<{ chatStore: ChatStore; coreStore?: CoreStore; runtimeClient: RuntimeClient }>): Promise<boolean> {
  const prefix = '/api/provider-interactions/conversations/';
  if (!context.url.pathname.startsWith(prefix)) return false;
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
  const control = createProviderInteractionControl({ runtime: context.dependencies.runtimeClient,
    bindings: id => currentProviderBindings(context.dependencies.chatStore, id, context.dependencies.coreStore) });
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
