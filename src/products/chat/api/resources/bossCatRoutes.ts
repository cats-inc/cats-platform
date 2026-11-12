import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { appendEvidenceEvent } from '../../../../platform/persistence/evidence.js';
import { resolveOwnerStartedSurface } from '../../shared/ownerStarted.js';
import { resolveBossCatEvidenceDataDir } from '../../state/bossCatSurface.js';
import {
  decideBossCatJoinRequest,
  readBossCatJoinRequestRecord,
  readBossCatJoinRequestDetails,
  type BossCatJoinDecisionOutcome,
} from '../../state/bossCatJoinRequests.js';
import { resolveChannelCanonicalIdentity } from '../../state/model/index.js';
import type { ChatStore } from '../../state/store.js';
import type { ChatState } from '../contracts.js';
import { readConversationCatalog, readConversationsState, updateConversationsState } from '../scopedConversationState.js';
import { assertConversationWritable } from '../../shared/conversationArchive.js';
import { shouldHydrateCompanionSession } from '../../companion/hydration.js';
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
      const state = await readJoinCardState(context.dependencies.chatStore, details[0]!, details[1]!);
      const now = nowFrom(context.dependencies);
      // What the Boss Cat brings in: the same predicate hydration uses, with its box.
      const record = state.channels.find((channel) => channel.id === details[0])?.messages
        .map(readBossCatJoinRequestRecord)
        .find((entry) => entry?.id === details[1]);
      const boss = record ? state.cats.find((cat) => cat.id === record.bossCatId) : undefined;
      const target = record ? state.channels.find((channel) => channel.id === record.conversationId) : undefined;
      const companionMemory = boss && target && context.dependencies.companionStore
        ? shouldHydrateCompanionSession(boss, (await context.dependencies.companionStore.getBoxSummary(boss.id, now)).box, target)
        : undefined;
      const request = readBossCatJoinRequestDetails(state, {
        laneId: details[0]!, requestId: details[1]!, now, companionMemory,
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
    const state = await readConversationsState(context.dependencies.chatStore, [laneId], { archivedMetadataOnly: true });
    const lane = state.channels.find(channel => channel.id === laneId);
    if (lane) assertConversationWritable(lane);
    const record = state.channels.find((channel) => channel.id === laneId)?.messages
      .map(readBossCatJoinRequestRecord)
      .find((entry) => entry?.id === requestId);
    if (!record) throw new ChatApiError(404, 'join_request_not_found', 'Join request not found.');
    let outcome: BossCatJoinDecisionOutcome = { status: 'not_found' };
    // The join writes the other conversation, so it runs under that conversation's gate.
    let coldHeaders: ChatState['channels'] = [];
    await context.dependencies.mutationGate.run(record.conversationId, () =>
      updateConversationsState(context.dependencies.chatStore, [laneId, record.conversationId], (latest) => {
        const current = latest.channels.find(channel => channel.id === laneId)?.messages
          .map(readBossCatJoinRequestRecord)
          .find(entry => entry?.id === requestId);
        if (current && current.conversationId !== record.conversationId) {
          throw new ChatApiError(409, 'conversation_changed', 'The join request changed. Reload and try again.');
        }
        const selected = new Set(latest.channels.map(channel => channel.id));
        const decided = decideBossCatJoinRequest({ ...latest, channels: [...latest.channels, ...coldHeaders] }, {
          laneId, requestId, decision: answer, now: nowFrom(context.dependencies),
        });
        outcome = decided.outcome;
        return { ...decided.state, channels: decided.state.channels.filter(channel => selected.has(channel.id)) };
      }, { excludeArchived: true, preflight(headers) {
        const lane = headers.channels.find(channel => channel.id === laneId);
        if (lane) assertConversationWritable(lane);
        coldHeaders = headers.channels.filter(channel => channel.status === 'archived');
      } }));
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


/** Owner details need only their card and routing headers, including cold card readback. */
async function readJoinCardState(store: ChatStore, laneId: string, requestId: string): Promise<ChatState> {
  const state = await readConversationsState(store, [laneId], { archivedMetadataOnly: true });
  const lane = state.channels.find(channel => channel.id === laneId);
  if (lane?.status === 'archived' && store.readMessagePage) {
    let cursor: string | undefined;
    do {
      const page = await store.readMessagePage(laneId, 200, cursor);
      const card = page.messages.find(message => readBossCatJoinRequestRecord(message)?.id === requestId);
      if (card) lane.messages = [card];
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  const catalog = await readConversationCatalog(store);
  return { ...catalog, channels: catalog.channels.map(header => header.id === laneId && lane ? lane : header) };
}
