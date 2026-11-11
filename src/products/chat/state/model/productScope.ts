import { createHash } from 'node:crypto';

import type { ChatState } from '../../api/contracts.js';
import {
  compareProductScopes,
  isProductScope,
  PRODUCT_SCOPES,
  type ProductScope,
} from '../../../../shared/productScope.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import {
  isDirectLaneChannel,
  resolveChannelProductScope,
} from '../../shared/channelTopology.js';
import { cloneState, isoAt, requireChannel } from './shared.js';

/** SPEC-141 FR-23: why a raise is refused. Each value is a stable code for callers to map. */
export type ProductScopeRaiseRefusal =
  | 'invalid_scope'
  | 'archived'
  | 'direct_lane'
  | 'parallel_member'
  | 'not_wider';

export class ProductScopeRaiseError extends Error {
  constructor(readonly code: ProductScopeRaiseRefusal, message: string) {
    // The code stays in the message so plain logs keep the structured signal.
    super(`[${code}] ${message}`);
    this.name = 'ProductScopeRaiseError';
  }
}

/**
 * SPEC-141: a parallel member belongs to an active group, which Recents lists as one entry.
 * The members of a group that is not active are listed as ordinary conversations, and a
 * conversation whose group was dissolved, or no longer lists it, is one again.
 */
function isParallelMember(state: ChatState, channelId: string): boolean {
  return state.parallelChatGroups.some((group) =>
    group.status === 'active' && group.memberChannelIds.includes(channelId));
}

/**
 * SPEC-141 FR-4: the one place a conversation's product scope changes after creation. It only
 * raises: an equal or lower level is refused, and so are a direct lane and a parallel member
 * (FR-5). Who may call it, and what the owner saw first, are the caller's checks (FR-20 to
 * FR-23). A conversation that does not exist throws from `requireChannel`, as in every model
 * function, and is the caller's to map as well.
 */
export function raiseChannelProductScope(
  state: ChatState,
  channelId: string,
  target: unknown,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const refusal = productScopeRaiseRefusal(nextState, channelId, target);
  if (refusal) {
    throw new ProductScopeRaiseError(refusal, PRODUCT_SCOPE_RAISE_REFUSAL_MESSAGES[refusal](
      resolveChannelProductScope(channel)));
  }
  channel.productScope = target as ProductScope;
  channel.updatedAt = isoAt(now);
  return nextState;
}

const PRODUCT_SCOPE_RAISE_REFUSAL_MESSAGES: Record<ProductScopeRaiseRefusal, (current: ProductScope) => string> = {
  invalid_scope: () => 'The product scope must be chat, code or work.',
  archived: () => 'An archived conversation cannot be raised.',
  direct_lane: () => 'A direct lane stays at chat.',
  parallel_member: () => 'A conversation in a parallel group cannot be raised.',
  not_wider: (current) => `The conversation is already at ${current}; a product scope can only be raised.`,
};

/**
 * SPEC-141 D2: a scope is never lowered. A writer that read the whole chat state before a raise
 * and writes its copy back, such as a continuation replay or a setup route, would otherwise put
 * the conversation back at its old level, and loading keeps a valid stored value as it is
 * (FR-3). The store keeps the wider stored value instead. No caller lowers a scope on purpose.
 *
 * Returns the incoming state with those scopes kept, and the conversations it kept them for.
 */
export function keepRaisedProductScopes(
  stored: ChatState,
  incoming: ChatState,
): { state: ChatState; keptChannelIds: string[] } {
  const storedById = new Map(stored.channels.map((channel) => [channel.id, channel]));
  const keptChannelIds: string[] = [];
  let next = incoming;
  incoming.channels.forEach((channel, index) => {
    const previous = storedById.get(channel.id);
    if (!previous || !isProductScope(previous.productScope)) return;
    const storedScope = resolveChannelProductScope(previous);
    if (compareProductScopes(storedScope, resolveChannelProductScope(channel)) <= 0) return;
    if (next === incoming) next = { ...incoming, channels: [...incoming.channels] };
    next.channels[index] = { ...channel, productScope: previous.productScope };
    keptChannelIds.push(channel.id);
  });
  return { state: next, keptChannelIds };
}

/**
 * SPEC-141 FR-7: the revision a raise is bound to. It digests what the raise confirmation
 * shows about this conversation and nothing else, so an unrelated change, such as another
 * Cat's settings, does not make it stale. `collaborationExecutionRevision` stays as it is.
 */
export function productScopeRaiseRevision(state: ChatState, channelId: string): string {
  const channel = requireChannel(state, channelId);
  const scope: ProductScope = resolveChannelProductScope(channel);
  return createHash('sha256').update(JSON.stringify({
    id: channel.id,
    scope,
    directLane: isDirectLaneChannel(channel),
    parallelMember: isParallelMember(state, channelId),
    archived: channel.status === 'archived',
    participants: resolveChannelParticipantAssignments(channel).map((assignment) => ({
      id: assignment.participantId,
      status: assignment.status,
    })),
    // The owner's folder and the kind of workspace. `chatCwd` is left out: a first session
    // fills it in for a sandbox, which changes nothing the confirmation says.
    repoPath: channel.repoPath,
    workspaceKind: channel.runtimeWorkspaceKind ?? null,
    workspaceAccess: channel.runtimeWorkspaceAccess ?? null,
    permissionMode: channel.runtimePermissionMode ?? null,
    // The permission chip is drawn from the mode and the execution policy. The policy's values
    // are listed in a fixed order: the stored object's key order is not normalized.
    executionPolicy: executionPolicyRevisionValues(channel.runtimeExecutionPolicy),
  })).digest('hex');
}

function executionPolicyRevisionValues(
  policy: ChatState['channels'][number]['runtimeExecutionPolicy'],
): unknown[] | null {
  if (!policy) return null;
  return policy.mode === 'provider'
    ? ['provider', policy.version, policy.constraints.maxAccess, policy.constraints.network]
    : ['explicit', policy.version, policy.access, policy.network, policy.approval];
}

/**
 * SPEC-141 FR-23: why a raise to `target` would be refused now, or null when it would go
 * through. The read route reports it, and the raise rechecks it inside the store's lock.
 */
export function productScopeRaiseRefusal(
  state: ChatState,
  channelId: string,
  target: unknown,
): ProductScopeRaiseRefusal | null {
  const channel = requireChannel(state, channelId);
  if (!isProductScope(target)) return 'invalid_scope';
  if (channel.status === 'archived') return 'archived';
  if (isDirectLaneChannel(channel)) return 'direct_lane';
  if (isParallelMember(state, channelId)) return 'parallel_member';
  if (compareProductScopes(target, resolveChannelProductScope(channel)) <= 0) return 'not_wider';
  return null;
}

/** The levels a conversation could be raised to, narrowest first. */
export function widerProductScopes(state: ChatState, channelId: string): ProductScope[] {
  const current = resolveChannelProductScope(requireChannel(state, channelId));
  return PRODUCT_SCOPES.filter((scope) => compareProductScopes(scope, current) > 0);
}
