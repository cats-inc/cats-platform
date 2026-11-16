import { RuntimeRequestError, type RuntimeClient } from '../../runtime/client.js';
import type { BoundInteractionResponse, BoundProviderInteraction, BoundStandingGrants, ProviderConversationSnapshot,
  ProviderInteractionBinding, SessionCapabilitiesSnapshot } from '../../shared/providerInteractions.js';
import { standingGrantSends } from './standingGrantSends.js';

export class ProviderControlError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export interface ProviderBindingAccess {
  binding: ProviderInteractionBinding;
  canRespond: boolean;
}
export interface ProviderControlPort {
  runtime: RuntimeClient;
  bindings(conversationId: string): Promise<ProviderBindingAccess[]>;
}
const same = (a: ProviderInteractionBinding, b: ProviderInteractionBinding) =>
  ['conversationId', 'sessionId', 'participantId', 'laneId', 'turnId', 'runId'].every(k => a[k as keyof ProviderInteractionBinding] === b[k as keyof ProviderInteractionBinding]);

/** Stateless control path: prompts/answers never enter Core, transcripts or a task queue. */
export function createProviderInteractionControl(port: ProviderControlPort) {
  async function binding(conversationId: string, sessionId: string, expected?: ProviderInteractionBinding, responding = false) {
    const row = (await port.bindings(conversationId)).find(r => r.binding.sessionId === sessionId);
    if (!row || responding && !row.canRespond || expected && !same(expected, row.binding)) throw new ProviderControlError(409, 'provider_binding_changed');
    return row;
  }
  async function live(conversationId: string, sessionId: string, id: string, response: BoundInteractionResponse) {
    if (!response || !response.binding || typeof response.workerGeneration !== 'string' || typeof response.executionId !== 'string') {
      throw new ProviderControlError(400, 'invalid_provider_response');
    }
    await binding(conversationId, sessionId, response.binding, true);
    if (!port.runtime.getSessionInteractions) throw new ProviderControlError(409, 'provider_interactions_unsupported');
    const snapshot = await port.runtime.getSessionInteractions(sessionId);
    const interaction = snapshot.interactions.find(i => i.interactionId === id);
    if (!interaction || interaction.sessionId !== sessionId || interaction.workerGeneration !== response.workerGeneration
      || snapshot.workerGeneration !== response.workerGeneration || interaction.executionId !== response.executionId) {
      throw new ProviderControlError(409, 'provider_request_changed');
    }
    await binding(conversationId, sessionId, response.binding, true);
    return interaction;
  }
  return {
    async snapshot(conversationId: string): Promise<ProviderConversationSnapshot> {
      const rows = await port.bindings(conversationId);
      if (rows.length > 32) throw new ProviderControlError(409, 'provider_session_limit');
      const result: ProviderConversationSnapshot = { version: 1, conversationId, supported: false, interactions: [], sessions: rows.map(r => r.binding) };
      if (!port.runtime.getSessionInteractions) { result.reason = 'runtime_unsupported'; return result; }
      const grants: BoundStandingGrants[] = [];
      const snapshots = await Promise.all(rows.map(async row => {
        try {
          const snapshot = await port.runtime.getSessionInteractions!(row.binding.sessionId);
          const latest = await binding(conversationId, row.binding.sessionId, row.binding);
          // ADR-155: the grants each session holds, for the conversation's bar and Stop.
          if (snapshot.standingGrants?.length) grants.push({ binding: row.binding, standingGrants: snapshot.standingGrants });
          return snapshot.interactions.filter(i => i.sessionId === row.binding.sessionId).map(i => ({ ...i,
            ...(!latest.canRespond && ['pending', 'responding'].includes(i.status) ? { status: 'interrupted' as const, prompt: undefined, reason: 'owner_execution_ended' } : {}),
            binding: row.binding,
          }));
        } catch { return null; }
      }));
      result.supported = snapshots.some(s => s !== null);
      result.interactions = snapshots.flatMap(s => s ?? []);
      if (grants.length) result.standingGrants = grants;
      if (snapshots.some(s => s === null) || rows.length === 0) result.reason = rows.length ? 'some_sessions_unavailable' : 'no_current_session';
      return result;
    },
    async respond(conversationId: string, sessionId: string, id: string, response: BoundInteractionResponse,
      access: { owner: boolean } = { owner: false }): Promise<BoundProviderInteraction> {
      // ADR-155: only the owner may allow a kind of request once for longer; an admin answers one request.
      if (response?.answer?.standingGrant !== undefined && !access.owner) throw new ProviderControlError(403, 'standing_grant_owner_only');
      await live(conversationId, sessionId, id, response);
      if (!port.runtime.respondSessionInteraction) throw new ProviderControlError(409, 'provider_interactions_unsupported');
      // Runtime owns answer validation, deadlines, revisions and idempotency. A
      // resolved matching receipt may therefore confirm an identical retry.
      const receipt = await port.runtime.respondSessionInteraction(sessionId, id, {
        expectedRevision: response.expectedRevision, idempotencyKey: response.idempotencyKey, answer: response.answer,
      });
      return { ...receipt, binding: response.binding };
    },
    async url(conversationId: string, sessionId: string, id: string, response: BoundInteractionResponse): Promise<string> {
      const request = await live(conversationId, sessionId, id, response);
      if (request.kind !== 'mcp_url' || request.status !== 'pending' || request.revision !== response.expectedRevision
        || Date.parse(request.expiresAt) <= Date.now() || !request.prompt?.url) throw new ProviderControlError(409, 'provider_request_changed');
      const url = new URL(request.prompt.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ProviderControlError(400, 'provider_url_unsupported');
      return url.href;
    },
    /**
     * ADR-155: Stop. Ends the standing grants of every session in the conversation at once. No send is
     * marked to use grants meanwhile. Only Runtime's answer counts: an empty list, or 404 for a session
     * Runtime no longer has. Anything else throws, so the owner's Stop stays in view.
     */
    async stopStandingGrants(conversationId: string): Promise<ProviderConversationSnapshot> {
      const rows = await port.bindings(conversationId);
      if (!port.runtime.revokeStandingGrants) throw new ProviderControlError(409, 'provider_interactions_unsupported');
      const results = await standingGrantSends.whileStopping(() => Promise.all(rows.map(async row => {
        try { return !(await port.runtime.revokeStandingGrants!(row.binding.sessionId)).standingGrants?.length; }
        catch (error) { return error instanceof RuntimeRequestError && error.status === 404; }
      })));
      if (results.includes(false)) throw new ProviderControlError(409, 'standing_grants_unconfirmed');
      return this.snapshot(conversationId);
    },
    async capabilities(conversationId: string, sessionId: string, refresh: boolean): Promise<SessionCapabilitiesSnapshot> {
      const current = await binding(conversationId, sessionId);
      if (!port.runtime.getSessionCapabilities) return { version: 1, sessionId, workerGeneration: null, supported: false, reason: 'runtime_unsupported' };
      const result = await port.runtime.getSessionCapabilities(sessionId, refresh);
      await binding(conversationId, sessionId, current.binding);
      return result;
    },
  };
}
