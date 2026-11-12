import { matchRoute, readJsonBody, sendJson, sendMethodNotAllowed } from '../../../../shared/http.js';
import type { RouteAuthContext } from '../../../../shared/http.js';
import { readCodePreviewServersEnabled } from '../../../../shared/platformPreferences.js';
import { isProductScope, type ProductScope } from '../../../../shared/productScope.js';
import type { ChatState } from '../contracts.js';
import { appendMessage } from '../../state/model/index.js';
import {
  productScopeRaiseRefusal,
  productScopeRaiseRevision,
  raiseChannelProductScope,
  widerProductScopes,
  type ProductScopeRaiseRefusal,
} from '../../state/model/productScope.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import { resolveChannelProductScope } from '../../shared/channelTopology.js';
import { readConversationCatalog, updateConversationState } from '../scopedConversationState.js';
import { ChatApiError, handleRestError } from '../routeErrors.js';
import { nowFrom, type ChatApiRouteContext } from '../routeSupport.js';
import { buildRoomMessageMutationDetail, publishChannelMutation } from '../transportEventPublisher.js';

/**
 * SPEC-141 FR-20 to FR-24: what a raise would do, and the raise. Only an owner principal may call
 * either: an account whose membership has the `owner` or `admin` role, on Desktop's cookie (the
 * auth gate enforces CSRF for a POST) or on mobile's bearer. No agent tool, transport command,
 * schedule, heartbeat or create request reaches `raiseChannelProductScope`.
 */
const PRODUCT_SCOPE = /^\/api\/channels\/([^/]+)\/product-scope$/u;

export const PRODUCT_SCOPE_RAISED_EVENT = 'product_scope_raised';

type RaiseOutcome =
  | { refusal: ProductScopeRaiseRefusal | 'revision_stale' | 'not_found' }
  | { from: ProductScope; to: ProductScope; messageId: string };

export function isOwnerPrincipal(auth: RouteAuthContext | null | undefined): boolean {
  const roles = auth?.principal?.membership.roles ?? [];
  return (roles.includes('owner') || roles.includes('admin'))
    && (auth?.credentialKind === 'browser_cookie' || auth?.credentialKind === 'mobile_bearer');
}

function requireOwnerPrincipal(context: ChatApiRouteContext): void {
  if (!isOwnerPrincipal(context.auth)) {
    throw new ChatApiError(403, 'owner_required', "Only the owner can change a conversation's product scope.");
  }
}

function requireConversation(state: ChatState, channelId: string) {
  const channel = state.channels.find((entry) => entry.id === channelId);
  if (!channel) throw new ChatApiError(404, 'channel_not_found', 'Conversation not found.');
  return channel;
}

/** FR-23's refusals as stable codes; the state ones are conflicts with the conversation as it is. */
const REFUSAL_STATUS: Record<ProductScopeRaiseRefusal, number> = {
  invalid_scope: 400,
  not_wider: 409,
  archived: 409,
  direct_lane: 409,
  parallel_member: 409,
};

/** The refusal when no wider level exists or the conversation cannot be raised at all. */
function standingRefusal(state: ChatState, channelId: string): ProductScopeRaiseRefusal | null {
  const wider = widerProductScopes(state, channelId);
  return productScopeRaiseRefusal(state, channelId, wider[0] ?? resolveChannelProductScope(
    requireConversation(state, channelId)));
}

/** FR-21: what the confirmation shows. */
async function describeRaise(context: ChatApiRouteContext, state: ChatState, channelId: string) {
  const channel = requireConversation(state, channelId);
  const refusal = standingRefusal(state, channelId);
  return {
    channelId,
    scope: resolveChannelProductScope(channel),
    origin: channel.originSurface ?? null,
    canRaise: refusal === null,
    refusal,
    widerLevels: refusal === null ? widerProductScopes(state, channelId) : [],
    // Every active participant works under the new level from its next turn (FR-25, FR-26).
    participants: resolveChannelParticipantAssignments(channel)
      .filter((assignment) => assignment.status === 'active')
      .map((assignment) => ({ id: assignment.participantId, name: assignment.name, kind: assignment.sourceKind })),
    // A raise changes none of these (FR-24).
    workspace: {
      repoPath: channel.repoPath ?? null,
      chatCwd: channel.chatCwd ?? null,
      workspaceKind: channel.runtimeWorkspaceKind ?? null,
      workspaceAccess: channel.runtimeWorkspaceAccess ?? null,
      permissionMode: channel.runtimePermissionMode ?? null,
      executionPolicy: channel.runtimeExecutionPolicy ?? null,
    },
    livePreviewsEnabled: await readCodePreviewServersEnabled(context.dependencies.config.chatStatePath),
    revision: productScopeRaiseRevision(state, channelId),
  };
}

export async function routeProductScopeResourceApi(context: ChatApiRouteContext): Promise<boolean> {
  const match = matchRoute(context.url.pathname, PRODUCT_SCOPE);
  if (!match) return false;
  const channelId = match[0]!;
  try {
    if (context.method === 'GET') {
      requireOwnerPrincipal(context);
      const state = await readConversationCatalog(context.dependencies.chatStore);
      sendJson(context.response, 200, await describeRaise(context, state, channelId), { 'cache-control': 'no-store' });
      return true;
    }
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['GET', 'POST']);
      return true;
    }
    requireOwnerPrincipal(context);
    const parsed = await readJsonBody<{ target?: unknown; revision?: unknown } | null>(context.request);
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    if (typeof body.revision !== 'string' || !body.revision) {
      throw new ChatApiError(400, 'revision_required', 'revision is the raise revision the owner saw.');
    }
    const revision = body.revision;
    const target = body.target;
    let outcome = { refusal: 'not_found' } as RaiseOutcome;
    // FR-22: inside the conversation's mutation gate, which waits for a turn that holds it. The
    // checks run again inside the store's lock, where every whole-state writer also waits.
    const state = await context.dependencies.mutationGate.run(channelId, () =>
      updateConversationState(context.dependencies.chatStore, channelId, (latest) => {
        const channel = latest.channels.find((entry) => entry.id === channelId);
        if (!channel) { outcome = { refusal: 'not_found' }; return latest; }
        const refusal = productScopeRaiseRefusal(latest, channelId, target);
        if (refusal) { outcome = { refusal }; return latest; }
        if (productScopeRaiseRevision(latest, channelId) !== revision) {
          outcome = { refusal: 'revision_stale' }; return latest;
        }
        const now = nowFrom(context.dependencies);
        const from = resolveChannelProductScope(channel);
        const raised = raiseChannelProductScope(latest, channelId, target, now);
        const to = target as ProductScope;
        // FR-24: the one system line, naming both levels.
        const line = appendMessage(raised, channelId, {
          senderKind: 'system',
          senderName: 'Chat',
          body: `Product scope raised from ${from} to ${to}.`,
        }, now, {
          metadata: { event: PRODUCT_SCOPE_RAISED_EVENT, verbosity: 'verbose', fromScope: from, toScope: to },
          incrementUnread: false,
          origin: 'system',
        });
        outcome = { from, to, messageId: line.message.id };
        return line.state;
      }));
    if ('refusal' in outcome) {
      const { refusal } = outcome;
      if (refusal === 'not_found') throw new ChatApiError(404, 'channel_not_found', 'Conversation not found.');
      if (refusal === 'revision_stale') {
        throw new ChatApiError(409, 'revision_stale', 'The conversation changed since the confirmation was shown.');
      }
      throw new ChatApiError(REFUSAL_STATUS[refusal], refusal, refusalMessage(refusal, target));
    }
    const raised = outcome;
    const message = requireConversation(state, channelId).messages.find((entry) => entry.id === raised.messageId);
    if (message) {
      publishChannelMutation(context.dependencies.eventHub, channelId, 'message_added',
        buildRoomMessageMutationDetail(message));
    }
    publishChannelMutation(context.dependencies.eventHub, channelId, 'updated');
    sendJson(context.response, 200, { ...(await describeRaise(context, state, channelId)),
      from: raised.from, to: raised.to });
    return true;
  } catch (error) {
    handleRestError(context, error);
    return true;
  }
}

function refusalMessage(refusal: ProductScopeRaiseRefusal, target: unknown): string {
  switch (refusal) {
    case 'invalid_scope': return 'target must be chat, code or work.';
    case 'not_wider': return `The conversation is already at ${isProductScope(target) ? target : 'that level'} or wider; a scope only rises.`;
    case 'archived': return 'An archived conversation cannot be raised.';
    case 'direct_lane': return 'A direct lane stays at chat.';
    case 'parallel_member': return 'A conversation in a parallel group cannot be raised.';
  }
}
