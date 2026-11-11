import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { appendEvidenceEvent } from '../../../../platform/persistence/evidence.js';
import type { BossCatJoinRequestRecord } from '../contracts.js';
import { resolveOwnerStartedSurface, BOSS_CAT_JOIN_REQUEST_METADATA_KEY } from '../../shared/ownerStarted.js';
import { resolveBossCatEvidenceDataDir } from '../../state/bossCatSurface.js';
import {
  decideBossCatJoinRequest,
  readBossCatJoinRequestDetails,
  type BossCatJoinDecisionOutcome,
} from '../../state/bossCatJoinRequests.js';
import { resolveChannelCanonicalIdentity } from '../../state/model/index.js';
import { updateChatState } from '../../state/store.js';
import { ChatApiError, handleRestError } from '../routeErrors.js';
import { nowFrom, type ChatApiRouteContext } from '../routeSupport.js';
import { publishChannelMutation } from '../transportEventPublisher.js';

/**
 * SPEC-139 FR-10: the owner's join card. Both routes need the owner principal on Desktop's
 * cookie or mobile's bearer; Telegram and other transports cannot answer a card (D3).
 */
const DETAILS = /^\/api\/channels\/([^/]+)\/boss-cat\/join-requests\/([^/]+)$/u;
const DECISION = /^\/api\/channels\/([^/]+)\/boss-cat\/join-requests\/([^/]+)\/decision$/u;

function requireOwner(context: ChatApiRouteContext): void {
  if (!resolveOwnerStartedSurface(context.auth)) {
    throw new ChatApiError(403, 'owner_required', 'Only the owner can answer a Boss Cat join request.');
  }
}

export async function routeBossCatResourceApi(context: ChatApiRouteContext): Promise<boolean> {
  const decision = matchRoute(context.url.pathname, DECISION);
  const details = decision ? null : matchRoute(context.url.pathname, DETAILS);
  if (!decision && !details) return false;
  try {
    if (details) {
      if (context.method !== 'GET') { sendMethodNotAllowed(context.response, ['GET']); return true; }
      requireOwner(context);
      const request = readBossCatJoinRequestDetails(await context.dependencies.chatStore.read(), {
        laneId: details[0]!, requestId: details[1]!, now: nowFrom(context.dependencies),
      });
      if (!request) throw new ChatApiError(404, 'join_request_not_found', 'Join request not found.');
      sendJson(context.response, 200, { request }, { 'cache-control': 'no-store' });
      return true;
    }
    if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
    requireOwner(context);
    const [laneId, requestId] = [decision![0]!, decision![1]!];
    const body = await readJsonBody<{ decision?: unknown }>(context.request);
    if (body.decision !== 'approve' && body.decision !== 'decline') {
      throw new ChatApiError(400, 'invalid_decision', 'decision must be "approve" or "decline".');
    }
    const answer = body.decision;
    const state = await context.dependencies.chatStore.read();
    const record = state.channels.find((channel) => channel.id === laneId)?.messages
      .map((message) => message.metadata?.[BOSS_CAT_JOIN_REQUEST_METADATA_KEY] as BossCatJoinRequestRecord | undefined)
      .find((entry) => entry?.id === requestId);
    if (!record) throw new ChatApiError(404, 'join_request_not_found', 'Join request not found.');
    let outcome: BossCatJoinDecisionOutcome = { status: 'not_found' };
    // The join writes the other conversation, so it runs under that conversation's gate.
    await context.dependencies.mutationGate.run(record.conversationId, () =>
      updateChatState(context.dependencies.chatStore, (latest) => {
        const decided = decideBossCatJoinRequest(latest, {
          laneId, requestId, decision: answer, now: nowFrom(context.dependencies),
        });
        outcome = decided.outcome;
        return decided.state;
      }));
    publishChannelMutation(context.dependencies.eventHub, laneId, 'updated');
    if (outcome.status === 'approved') publishChannelMutation(context.dependencies.eventHub, record.conversationId, 'updated');
    // FR-16: the owner's decision, ids only.
    try {
      const laneConversationId = resolveChannelCanonicalIdentity(state, laneId).conversationId;
      appendEvidenceEvent(resolveBossCatEvidenceDataDir(context.dependencies.config.chatStatePath), laneConversationId, {
        id: `boss-cat-card:${requestId}:${answer}`,
        conversationId: laneConversationId,
        sessionId: null,
        layer: 'evidence',
        actorId: 'owner',
        kind: 'system_event',
        timestamp: nowFrom(context.dependencies).toISOString(),
        payload: { source: 'boss_cat_card', action: 'owner_decision', decision: answer, status: outcome.status,
          ...(outcome.refusal ? { refusal: outcome.refusal } : {}), requestId,
          bossCatId: record.bossCatId, targetConversationId: record.conversationId },
      });
    } catch {
      console.warn('Boss Cat card decision record not written.', { requestId });
    }
    sendJson(context.response, outcome.status === 'not_found' ? 404 : 200, { outcome });
    return true;
  } catch (error) {
    handleRestError(context, error);
    return true;
  }
}
