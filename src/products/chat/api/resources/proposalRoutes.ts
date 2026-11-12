import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import { ChatApiError, handleRestError } from '../routeErrors.js';
import type { ChatApiRouteContext } from '../routeSupport.js';
import { isOwnerPrincipal } from './productScopeRoutes.js';
import { cleanRecordValue, fenceRecordText } from '../../../shared/conversationRecordTools.js';
import type { ConversationProposalView } from '../../../../platform/proposals/contracts.js';
import { readConversationMetadata } from '../scopedConversationState.js';

/**
 * A kind's view is built from agent-supplied content, so every text is cleaned and bounded here,
 * whatever the kind did. The folder (FR-16) is the field that matters most.
 */
function cleanView(view: ConversationProposalView | null): ConversationProposalView | null {
  if (!view) return null;
  const line = (value: string | null | undefined, limit: number) => fenceRecordText(value, limit)?.slice(1, -1) ?? null;
  return {
    title: line(view.title, 160) ?? '',
    fields: view.fields.slice(0, 40).map((field) => ({ name: line(field.name, 80) ?? '', value: line(field.value, 1000) })),
    records: view.records.slice(0, 20).map((record) => ({ kind: record.kind, id: cleanRecordValue(record.id), title: line(record.title, 160) })),
    folderWarning: view.folderWarning ? {
      folder: line(view.folderWarning.folder, 500) ?? '',
      otherConversations: Math.max(0, Math.floor(view.folderWarning.otherConversations)),
      workItems: Math.max(0, Math.floor(view.folderWarning.workItems)),
    } : null,
  };
}

/**
 * SPEC-142 FR-15 to FR-18: a proposal's card, read and answered on routes of its own. Only an
 * owner principal may do either (Desktop's cookie, with CSRF on POST, or mobile's bearer). No
 * agent tool, transport command or choice answer reaches the decision.
 */
const DETAILS = /^\/api\/channels\/([^/]+)\/proposals\/([^/]+)$/u;
const DECISION = /^\/api\/channels\/([^/]+)\/proposals\/([^/]+)\/decision$/u;

function requireOwner(context: ChatApiRouteContext): void {
  if (!isOwnerPrincipal(context.auth)) {
    throw new ChatApiError(403, 'owner_required', 'Only the owner can answer a proposal.');
  }
}

export async function routeConversationProposalResourceApi(context: ChatApiRouteContext): Promise<boolean> {
  const decision = matchRoute(context.url.pathname, DECISION);
  const details = decision ? null : matchRoute(context.url.pathname, DETAILS);
  if (!decision && !details) return false;
  try {
    const service = context.dependencies.conversationProposals;
    if (details) {
      if (context.method !== 'GET') { sendMethodNotAllowed(context.response, ['GET']); return true; }
      requireOwner(context);
      const found = service ? await service.read(details[0]!, details[1]!) : null;
      if (!found) throw new ChatApiError(404, 'proposal_not_found', 'Proposal not found.');
      const state = await readConversationMetadata(context.dependencies.chatStore, details[0]!);
      const channel = state.channels.find((entry) => entry.id === details[0]);
      const proposer = channel && found.record.proposerParticipantId
        ? resolveChannelParticipantAssignments(channel)
          .find((assignment) => assignment.participantId === found.record.proposerParticipantId) ?? null
        : null;
      sendJson(context.response, 200, {
        proposal: {
          id: found.record.id,
          kind: found.record.kind,
          status: found.status,
          outOfDate: found.outOfDate,
          createdAt: found.record.createdAt,
          expiresAt: found.record.expiresAt,
          decidedAt: found.record.decidedAt,
          refusal: found.record.refusal,
          proposer: found.record.proposerParticipantId
            ? { participantId: found.record.proposerParticipantId, name: proposer?.name ?? null }
            : null,
          view: cleanView(found.view),
        },
      }, { 'cache-control': 'no-store' });
      return true;
    }
    if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
    requireOwner(context);
    const parsed = await readJsonBody<{ decision?: unknown } | null>(context.request);
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    if (body.decision !== 'confirm' && body.decision !== 'decline') {
      throw new ChatApiError(400, 'invalid_decision', 'decision must be "confirm" or "decline".');
    }
    if (!service) throw new ChatApiError(404, 'proposal_not_found', 'Proposal not found.');
    const principal = context.auth?.principal;
    const ownerActorId = principal?.membership?.coreActorId ?? principal?.account.id ?? 'owner';
    const outcome = await service.decide(decision![0]!, decision![1]!, body.decision, ownerActorId);
    if (outcome.status === 'not_found') throw new ChatApiError(404, 'proposal_not_found', 'Proposal not found.');
    sendJson(context.response, 200, { outcome });
    return true;
  } catch (error) {
    handleRestError(context, error);
    return true;
  }
}
