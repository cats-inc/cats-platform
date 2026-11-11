import type { BossCatTurnRecord, BossCatUsageKind, ChatMessage, ChatState } from '../api/contracts.js';
import { resolveChannelParticipantAssignments, resolveParticipantCatId } from '../shared/channelParticipants.js';
import { isDirectLaneChannel } from '../shared/channelTopology.js';
import { BOSS_CAT_TURN_METADATA_KEY, readOwnerStarted } from '../shared/ownerStarted.js';
import { isAdminCoordinator } from './coordinator.js';
import { resolveRoomRoutingState } from './room-routing/index.js';

/** SPEC-139 pieces shared by the Boss Cat tools and the owner's join card. */

/** Per owner, across every Boss Cat, within the last hour (FR-2, FR-7, FR-9). */
export const BOSS_CAT_HOURLY_LIMITS: Readonly<Record<BossCatUsageKind, number>> = {
  board: 30,
  group: 5,
  join_request: 10,
};
const HOUR_MS = 60 * 60_000;

export interface BossCatTurnGate {
  bossCatId: string;
  participantId: string;
}

/**
 * FR-1, rechecked by every handler: the Boss Cat's own direct lane, a turn the owner started on
 * Desktop or mobile, and the Boss Cat as that lane's admin coordinator.
 */
export function resolveBossCatTurnGate(
  state: Pick<ChatState, 'channels' | 'cats'>,
  channelId: string,
  message: ChatMessage | null | undefined,
): BossCatTurnGate | null {
  const channel = state.channels.find((entry) => entry.id === channelId);
  if (!channel || channel.status === 'archived' || !isDirectLaneChannel(channel)) return null;
  if (!message || message.channelId !== channelId || !readOwnerStarted(message)) return null;
  if (message.body.trimStart().startsWith('/')) return null;
  const participantId = channel.coordinatorParticipantId;
  if (!participantId || !isAdminCoordinator(state as ChatState, channelId, participantId)) return null;
  const assignment = resolveChannelParticipantAssignments(channel)
    .find((entry) => entry.participantId === participantId && entry.status === 'active');
  const bossCatId = assignment ? resolveParticipantCatId(assignment) : null;
  const cat = state.cats.find((entry) => entry.id === bossCatId && entry.status === 'active');
  const laneCatId = resolveRoomRoutingState(channel.roomRouting).defaultRecipientId;
  if (!cat || (laneCatId !== cat.id && laneCatId !== participantId)) return null;
  return { bossCatId: cat.id, participantId };
}

export function attachBossCatTurnRecord(
  state: ChatState,
  channelId: string,
  messageId: string,
  record: BossCatTurnRecord,
): ChatState {
  const next = structuredClone(state);
  const message = next.channels.find((entry) => entry.id === channelId)?.messages
    .find((entry) => entry.id === messageId);
  if (message) message.metadata = { ...message.metadata, [BOSS_CAT_TURN_METADATA_KEY]: record };
  return next;
}

export function countBossCatUsage(
  state: Pick<ChatState, 'bossCatUsage'>,
  kind: BossCatUsageKind,
  now: Date,
): number {
  const since = now.getTime() - HOUR_MS;
  return (state.bossCatUsage ?? []).filter((entry) => entry.kind === kind && Date.parse(entry.at) > since).length;
}

/** Records one use if the hourly limit allows it. Pure; run it inside an atomic store update. */
export function reserveBossCatUsage(
  state: ChatState,
  kind: BossCatUsageKind,
  now: Date,
): { state: ChatState; allowed: boolean } {
  if (countBossCatUsage(state, kind, now) >= BOSS_CAT_HOURLY_LIMITS[kind]) return { state, allowed: false };
  const since = now.getTime() - HOUR_MS;
  return {
    allowed: true,
    state: {
      ...state,
      bossCatUsage: [
        ...(state.bossCatUsage ?? []).filter((entry) => Date.parse(entry.at) > since),
        { kind, at: now.toISOString() },
      ],
    },
  };
}
