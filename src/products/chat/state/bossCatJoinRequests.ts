import { randomUUID } from 'node:crypto';
import type {
  BossCatJoinRequestRecord,
  BossCatJoinRequestStatus,
  ChatChannelState,
  ChatMessage,
  ChatState,
  OwnerStartedSurface,
} from '../api/contracts.js';
import { knowledgeDigest } from '../../../platform/knowledge/productKnowledge.js';
import { createTranslator, messageKeys, parseMessageLocale } from '../../../shared/i18n/index.js';
import {
  CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY,
  resolveChatMessageLocalizedBodyMetadata,
  type ChatMessageLocalizedBodyMetadata,
} from '../../../shared/chatMessageLocalization.js';
import { isCompanionCat } from '../../../shared/companionRole.js';
import { resolveChannelParticipantAssignments, resolveParticipantCatId } from '../shared/channelParticipants.js';
import { isDirectLaneChannel, resolveChannelProductScope } from '../shared/channelTopology.js';
import { deriveProductScope, productScopeIncludes } from '../../../shared/productScope.js';
import { BOSS_CAT_JOIN_PRIOR_MESSAGES, resolveBossCatJoinPolicy } from '../shared/bossCatJoins.js';
import { BOSS_CAT_JOIN_REQUEST_METADATA_KEY } from '../shared/ownerStarted.js';
import { readOwnerSetTitle } from './bossCatBoard.js';
import { reserveBossCatUsage, resolveBossCatTurnGate } from './bossCatCommon.js';
import { collaborationExecutionRevision } from './collaborationExecutionSurface.js';
import { appendMessage, assignCatToChannel } from './model/index.js';
import { resolveChannelRuntimeSessionPolicy } from './runtime-session/policy.js';

/**
 * SPEC-139 FR-10: under 「每次問我」 a join request becomes a card for the owner in the Boss Cat's
 * lane. The card carries ids, a digest and times; what joining grants is rendered from live state
 * when the owner opens it. The owner's click is rechecked here and the server joins; the model
 * supplies nothing at that point.
 */

export const BOSS_CAT_JOIN_REQUEST_TTL_MS = 24 * 60 * 60_000;
export const BOSS_CAT_JOIN_REQUEST_EVENT = 'boss_cat_join_request';

type LaneNoticeKind = 'joined' | 'left' | 'join_request';

/** The card binds what the owner allows: the target's revision, the Boss Cat, the lane, the policy. */
export function buildBossCatJoinDigest(
  state: ChatState,
  input: { laneId: string; conversationId: string; bossCatId: string },
): string {
  const boss = state.cats.find((cat) => cat.id === input.bossCatId);
  // SPEC-141: what joining grants follows the conversation's scope (Code's tools from `code` up).
  // A raise between the card and the owner's answer makes the card stale. The scope enters the
  // digest only when it differs from the origin, so a card posted before scopes existed, which
  // can only be at its origin's level, stays valid.
  const target = state.channels.find((channel) => channel.id === input.conversationId);
  const scope = target ? resolveChannelProductScope(target) : null;
  const raisedScope = target && scope !== deriveProductScope({
    originSurface: target.originSurface, directLane: isDirectLaneChannel(target) }) ? scope : null;
  return knowledgeDigest(JSON.stringify({
    conversationRevision: collaborationExecutionRevision(state, input.conversationId),
    bossCatId: input.bossCatId,
    executionTarget: boss?.defaultExecutionTarget ?? null,
    modelSelection: boss?.defaultModelSelection ?? null,
    sourceConversationId: input.laneId,
    policy: resolveBossCatJoinPolicy(state),
    ...(raisedScope ? { productScope: raisedScope } : {}),
  }));
}

/** A localized notice in the Boss Cat's lane, under the board's title rule. */
export function appendBossCatLaneNotice(
  state: ChatState,
  input: {
    laneId: string;
    sourceMessageId: string;
    target: Pick<ChatChannelState, 'id' | 'title' | 'titleSource' | 'originSurface' | 'productScope' | 'channelKind' | 'roomRouting'>;
    bossName: string;
    kind: LaneNoticeKind;
    at: Date;
    extraMetadata?: Record<string, unknown>;
  },
): ChatState {
  const lane = state.channels.find((entry) => entry.id === input.laneId);
  const locale = parseMessageLocale(lane?.language) ?? parseMessageLocale(lane?.responseLanguage) ?? 'en';
  const title = input.kind === 'join_request' ? null : readOwnerSetTitle(input.target);
  const localizedBody: ChatMessageLocalizedBodyMetadata = {
    key: input.kind === 'join_request'
      ? messageKeys.chatBossCatJoinRequestNotice
      : input.kind === 'joined'
        ? title ? messageKeys.chatBossCatJoinedNotice : messageKeys.chatBossCatJoinedUntitledNotice
        : title ? messageKeys.chatBossCatLeftNotice : messageKeys.chatBossCatLeftUntitledNotice,
    values: { name: input.bossName, title: title ?? '', surface: resolveChannelProductScope(input.target) },
  };
  return appendMessage(state, input.laneId, {
    senderKind: 'system',
    senderName: 'Chat',
    body: resolveChatMessageLocalizedBodyMetadata(localizedBody, createTranslator(locale)),
  }, input.at, {
    metadata: {
      event: input.kind === 'join_request' ? BOSS_CAT_JOIN_REQUEST_EVENT
        : input.kind === 'joined' ? 'boss_cat_joined' : 'boss_cat_left',
      // Server notices never go out through a transport.
      origin: 'system',
      sourceMessageId: input.sourceMessageId,
      conversationId: input.target.id,
      [CHAT_MESSAGE_LOCALIZED_BODY_METADATA_KEY]: localizedBody,
      ...input.extraMetadata,
    },
  }).state;
}

/**
 * FR-12: an ordinary assignment; the coordinator stays, and the bound starts now. Throws when the
 * assignment is not possible (the participant limit).
 */
export function applyBossCatJoin(
  state: ChatState,
  input: {
    laneId: string;
    sourceMessageId: string;
    conversationId: string;
    bossCatId: string;
    at: Date;
    /** The card's own line already says so when the owner approved it there. */
    laneNotice?: boolean;
  },
): ChatState {
  const target = state.channels.find((entry) => entry.id === input.conversationId)!;
  const boss = state.cats.find((cat) => cat.id === input.bossCatId)!;
  let next = assignCatToChannel(state, input.conversationId, { catId: boss.id }, input.at);
  const at = input.at.toISOString();
  next.channels = next.channels.map((entry) => entry.id === input.conversationId
    ? {
        ...entry,
        coordinatorParticipantId: target.coordinatorParticipantId,
        bossCatJoins: { ...entry.bossCatJoins, [boss.id]: { since: at } },
        // FR-16: a rejoin shows as a join, like the first time.
        messages: entry.messages.map((message) => message.createdAt === at
          && message.metadata?.event === 'cat_assignment_reused' && message.metadata?.catId === boss.id
          ? { ...message, body: `${boss.name} joined the chat.`, metadata: { ...message.metadata, event: 'cat_assigned' } }
          : message),
      }
    : entry);
  if (input.laneNotice !== false) {
    next = appendBossCatLaneNotice(next, {
      laneId: input.laneId, sourceMessageId: input.sourceMessageId, target, bossName: boss.name,
      kind: 'joined', at: input.at,
    });
  }
  return next;
}

/** Only the server's own card message: a system notice with the card event. */
export function readBossCatJoinRequestRecord(message: ChatMessage): BossCatJoinRequestRecord | null {
  if (message.senderKind !== 'system' || message.metadata?.event !== BOSS_CAT_JOIN_REQUEST_EVENT) return null;
  return (message.metadata?.[BOSS_CAT_JOIN_REQUEST_METADATA_KEY] as BossCatJoinRequestRecord | undefined) ?? null;
}

function readCard(state: ChatState, laneId: string, requestId: string): { message: ChatMessage; record: BossCatJoinRequestRecord } | null {
  const lane = state.channels.find((entry) => entry.id === laneId);
  for (const message of lane?.messages ?? []) {
    const record = readBossCatJoinRequestRecord(message);
    if (record?.id === requestId) return { message, record };
  }
  return null;
}

function effectiveStatus(record: BossCatJoinRequestRecord, now: Date): BossCatJoinRequestStatus {
  return record.status === 'pending' && now.getTime() > Date.parse(record.expiresAt) ? 'expired' : record.status;
}

function updateCard(
  state: ChatState,
  laneId: string,
  requestId: string,
  patch: Partial<BossCatJoinRequestRecord>,
): ChatState {
  return {
    ...state,
    channels: state.channels.map((channel) => channel.id !== laneId ? channel : {
      ...channel,
      messages: channel.messages.map((message) => {
        const record = readBossCatJoinRequestRecord(message);
        return record?.id === requestId
          ? { ...message, metadata: { ...message.metadata, [BOSS_CAT_JOIN_REQUEST_METADATA_KEY]: { ...record, ...patch } } }
          : message;
      }),
    }),
  };
}

/** One pending card per conversation, within the join-request limit. Pure; run it atomically. */
export function postBossCatJoinRequest(
  latest: ChatState,
  input: {
    laneId: string;
    sourceMessageId: string;
    conversationId: string;
    bossCatId: string;
    requestedVia: OwnerStartedSurface;
    at: Date;
  },
): { state: ChatState; requestId: string } | { refusal: 'card_pending' | 'rate_limited' } {
  // One pending card per conversation, across every Boss Cat's lane.
  const pending = latest.channels.some((channel) => channel.messages.some((message) => {
    const record = readBossCatJoinRequestRecord(message);
    return record?.conversationId === input.conversationId && effectiveStatus(record, input.at) === 'pending';
  }));
  if (pending) return { refusal: 'card_pending' };
  const reserved = reserveBossCatUsage(latest, 'join_request', input.at);
  if (!reserved.allowed) return { refusal: 'rate_limited' };
  const record: BossCatJoinRequestRecord = {
    id: randomUUID(),
    bossCatId: input.bossCatId,
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    requestedVia: input.requestedVia,
    digest: buildBossCatJoinDigest(latest, input),
    createdAt: input.at.toISOString(),
    expiresAt: new Date(input.at.getTime() + BOSS_CAT_JOIN_REQUEST_TTL_MS).toISOString(),
    status: 'pending',
  };
  const target = latest.channels.find((entry) => entry.id === input.conversationId)!;
  const boss = latest.cats.find((cat) => cat.id === input.bossCatId)!;
  return {
    requestId: record.id,
    state: appendBossCatLaneNotice(reserved.state, {
      laneId: input.laneId, sourceMessageId: input.sourceMessageId, target, bossName: boss.name,
      kind: 'join_request', at: input.at, extraMetadata: { [BOSS_CAT_JOIN_REQUEST_METADATA_KEY]: record },
    }),
  };
}

export interface BossCatJoinDecisionOutcome {
  status: BossCatJoinRequestStatus | 'not_found';
  refusal?: string;
  conversationId?: string;
  bossCatId?: string;
}

/**
 * The owner's click. Consumed once: only a pending, unexpired card is decided. An approval
 * rechecks the policy (still 「每次問我」), the gate on the original owner message, the target and
 * the digest, then joins. Pure; run it atomically.
 */
export function decideBossCatJoinRequest(
  latest: ChatState,
  input: { laneId: string; requestId: string; decision: 'approve' | 'decline'; now: Date },
): { state: ChatState; outcome: BossCatJoinDecisionOutcome } {
  const card = readCard(latest, input.laneId, input.requestId);
  if (!card) return { state: latest, outcome: { status: 'not_found' } };
  const { record } = card;
  const ids = { conversationId: record.conversationId, bossCatId: record.bossCatId };
  const decidedAt = input.now.toISOString();
  const status = effectiveStatus(record, input.now);
  if (status === 'expired' && record.status === 'pending') {
    return {
      state: updateCard(latest, input.laneId, input.requestId, { status: 'expired', decidedAt }),
      outcome: { status: 'expired', refusal: 'card_expired', ...ids },
    };
  }
  if (status !== 'pending') return { state: latest, outcome: { status, refusal: 'card_consumed', ...ids } };
  if (input.decision === 'decline') {
    return {
      state: updateCard(latest, input.laneId, input.requestId, { status: 'declined', decidedAt }),
      outcome: { status: 'declined', ...ids },
    };
  }
  const refuse = (refusal: string) => ({
    state: updateCard(latest, input.laneId, input.requestId, { status: 'refused', decidedAt, refusal }),
    outcome: { status: 'refused' as const, refusal, ...ids },
  });
  if (resolveBossCatJoinPolicy(latest) !== 'ask') return refuse('policy_changed');
  const lane = latest.channels.find((entry) => entry.id === input.laneId);
  const source = lane?.messages.find((entry) => entry.id === record.sourceMessageId);
  if (resolveBossCatTurnGate(latest, input.laneId, source)?.bossCatId !== record.bossCatId) return refuse('not_permitted');
  const target = latest.channels.find((entry) => entry.id === record.conversationId);
  if (!target || isDirectLaneChannel(target)) return refuse('conversation_not_joinable');
  if (target.status === 'archived') return refuse('conversation_archived');
  if (resolveChannelParticipantAssignments(target)
    .some((entry) => entry.status === 'active' && resolveParticipantCatId(entry) === record.bossCatId)) {
    return refuse('already_member');
  }
  if (buildBossCatJoinDigest(latest, { laneId: input.laneId, ...ids }) !== record.digest) return refuse('card_stale');
  let next: ChatState;
  try {
    next = applyBossCatJoin(latest, {
      laneId: input.laneId, sourceMessageId: record.sourceMessageId, at: input.now, laneNotice: false, ...ids,
    });
  } catch {
    return refuse('participant_limit');
  }
  return {
    state: updateCard(next, input.laneId, input.requestId, { status: 'approved', decidedAt }),
    outcome: { status: 'approved', ...ids },
  };
}

export interface BossCatJoinRequestDetails {
  id: string;
  status: BossCatJoinRequestStatus;
  requestedVia: OwnerStartedSurface;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  refusal: string | null;
  conversation: {
    id: string;
    title: string;
    surface: string;
    participantNames: string[];
    archived: boolean;
  } | null;
  grants: {
    repoPath: string | null;
    workspaceAccess: string;
    permissionMode: string;
    codeTools: boolean;
  } | null;
  bossCat: {
    id: string;
    name: string;
    provider: string;
    model: string | null;
    mcpProfile: string | null;
    skillProfile: string | null;
    companionMemory: boolean;
  } | null;
  history: { messagesBeforeJoin: number };
}

/** For the owner's card only, from live state. Never given to a model or a transport. */
export function readBossCatJoinRequestDetails(
  state: ChatState,
  input: {
    laneId: string;
    requestId: string;
    now: Date;
    /** Whether hydration would load the Boss Cat's companion memory there; the route knows the box. */
    companionMemory?: boolean;
  },
): BossCatJoinRequestDetails | null {
  const card = readCard(state, input.laneId, input.requestId);
  if (!card) return null;
  const { record } = card;
  const target = state.channels.find((entry) => entry.id === record.conversationId) ?? null;
  const boss = state.cats.find((cat) => cat.id === record.bossCatId) ?? null;
  const policy = target ? resolveChannelRuntimeSessionPolicy(target) : null;
  return {
    id: record.id,
    status: effectiveStatus(record, input.now),
    requestedVia: record.requestedVia,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    decidedAt: record.decidedAt ?? null,
    refusal: record.refusal ?? null,
    conversation: target
      ? {
          id: target.id,
          title: target.title,
          surface: resolveChannelProductScope(target),
          participantNames: resolveChannelParticipantAssignments(target)
            .filter((entry) => entry.status === 'active').map((entry) => entry.name),
          archived: target.status === 'archived',
        }
      : null,
    grants: target && policy
      ? {
          repoPath: target.repoPath ?? null,
          workspaceAccess: policy.workspaceAccess,
          permissionMode: policy.permissionMode,
          // Work includes Code (ADR-149 D5): joining a Work conversation brings Code's tools too.
          codeTools: productScopeIncludes(resolveChannelProductScope(target), 'code'),
        }
      : null,
    bossCat: boss
      ? {
          id: boss.id,
          name: boss.name,
          provider: boss.defaultExecutionTarget.provider,
          model: boss.defaultExecutionTarget.model ?? null,
          mcpProfile: boss.mcpProfile,
          skillProfile: boss.skillProfile,
          companionMemory: input.companionMemory ?? isCompanionCat(boss),
        }
      : null,
    history: { messagesBeforeJoin: BOSS_CAT_JOIN_PRIOR_MESSAGES },
  };
}
