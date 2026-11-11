import { createHash } from 'node:crypto';

import type { ChatState } from '../../api/contracts.js';
import {
  compareProductScopes,
  isProductScope,
  type ProductScope,
} from '../../../../shared/productScope.js';
import { resolveChannelParticipantAssignments } from '../../shared/channelParticipants.js';
import {
  isDirectLaneChannel,
  resolveChannelProductScope,
} from '../../shared/channelTopology.js';
import { findParallelChatGroupByChannelId } from './channelGroups.js';
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
 * A member of any parallel group, whatever the group's status: the group's Recents entry still
 * lists it. A conversation stops being one when its group is dissolved or no longer lists it.
 */
function isParallelMember(state: ChatState, channelId: string): boolean {
  return findParallelChatGroupByChannelId(state, channelId) !== null;
}

/**
 * SPEC-141 FR-4: the one place a conversation's product scope changes after creation. It only
 * raises: an equal or lower level is refused, and so are a direct lane and a parallel member
 * (FR-5). Who may call it, and what the owner saw first, are the caller's checks (FR-20 to
 * FR-23).
 */
export function raiseChannelProductScope(
  state: ChatState,
  channelId: string,
  target: unknown,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  if (!isProductScope(target)) {
    throw new ProductScopeRaiseError('invalid_scope', 'The product scope must be chat, code or work.');
  }
  if (channel.status === 'archived') {
    throw new ProductScopeRaiseError('archived', 'An archived conversation cannot be raised.');
  }
  if (isDirectLaneChannel(channel)) {
    throw new ProductScopeRaiseError('direct_lane', 'A direct lane stays at chat.');
  }
  if (isParallelMember(nextState, channelId)) {
    throw new ProductScopeRaiseError(
      'parallel_member',
      'A conversation in a parallel group cannot be raised.',
    );
  }
  const current = resolveChannelProductScope(channel);
  if (compareProductScopes(target, current) <= 0) {
    throw new ProductScopeRaiseError(
      'not_wider',
      `The conversation is already at ${current}; a product scope can only be raised.`,
    );
  }
  channel.productScope = target;
  channel.updatedAt = isoAt(now);
  return nextState;
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
  })).digest('hex');
}
