import type { ChatChannelState, ChatMessage } from '../../api/contracts.js';
import {
  resolveChannelParticipantAssignments,
  resolveParticipantCatId,
} from '../../shared/channelParticipants.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import { describeDuration, isOwnerMessage, readCompanionHeartbeatKind } from './heartbeat.js';

/**
 * SPEC-137 FR-7: what an `assist` heartbeat looks over. The Cat reviews its
 * own recent Chat conversations (its direct lane and every channel it is
 * assigned to) and follows up in its direct lane. The newest get their last
 * lines; once the budget runs short the rest keep a heading and the owner's
 * last line. Built without the model and bounded; another Cat's
 * conversations are never in it. Limits and shape match Cats Bot's
 * `src/core/life/review.ts` (cats-bot SPEC-011 FR-13).
 */

export const COMPANION_REVIEW_LOOKBACK_MS = 14 * 24 * 60 * 60_000;
export const COMPANION_REVIEW_LINES_PER_CONVERSATION = 6;
export const COMPANION_REVIEW_LINE_LIMIT = 240;
export const COMPANION_REVIEW_TEXT_LIMIT = 6_000;

export interface CompanionWorkReview {
  text: string;
  /**
   * What the review saw: the newest non-heartbeat message of each
   * conversation in it. An unchanged fingerprint means nothing happened
   * since, apart from the Cat's own unprompted messages.
   */
  fingerprint: string;
}

type ReviewChannel = Pick<
  ChatChannelState,
  'id' | 'title' | 'status' | 'originSurface' | 'messages' | 'participantAssignments' | 'catAssignments'
> & Parameters<typeof isDirectLaneChannel>[0];

function oneLine(text: string, limit: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/** SPEC-137 FR-7: Chat conversations this Cat takes part in; Work and Code are not reviewed. */
export function isCatChatConversation(channel: ReviewChannel, catId: string): boolean {
  if (channel.status !== 'active') return false;
  if (channel.originSurface && channel.originSurface !== 'chat') return false;
  return resolveChannelParticipantAssignments(channel).some((assignment) =>
    resolveParticipantCatId(assignment) === catId && assignment.status === 'active');
}

/** The owner's latest message across this Cat's conversations (SPEC-137 FR-6). */
export function findLastOwnerMessageAcross(channels: readonly ReviewChannel[], catId: string): number {
  let latest = Number.NEGATIVE_INFINITY;
  for (const channel of channels) {
    if (!isCatChatConversation(channel, catId)) continue;
    for (const message of channel.messages) {
      if (!isOwnerMessage(channel, message)) continue;
      const at = Date.parse(message.createdAt);
      if (Number.isFinite(at) && at > latest) latest = at;
    }
  }
  return latest;
}

function speaker(channel: ReviewChannel, message: ChatMessage, catId: string): string | null {
  if (message.senderKind === 'user') {
    return isOwnerMessage(channel, message)
      ? 'Owner'
      : `${oneLine(message.senderName || 'Someone', 40)} (not your owner)`;
  }
  if (message.senderKind === 'agent') {
    if (message.metadata?.targetId === catId) {
      return readCompanionHeartbeatKind(message) ? 'You (unprompted)' : 'You';
    }
    return `${oneLine(message.senderName || 'Another Cat', 40)} (another Cat)`;
  }
  if (message.senderKind === 'system') return 'Notice';
  return null;
}

function lastOwnerAt(channel: ReviewChannel): number {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    if (isOwnerMessage(channel, message)) return Date.parse(message.createdAt);
  }
  return Number.NaN;
}

/**
 * Null when there is nothing to review: no conversation of this Cat the owner
 * wrote in within the lookback.
 */
export function buildCompanionWorkReview(
  channels: readonly ReviewChannel[],
  catId: string,
  now: Date,
): CompanionWorkReview | null {
  const since = now.getTime() - COMPANION_REVIEW_LOOKBACK_MS;
  const recent = channels
    .filter((channel) => isCatChatConversation(channel, catId))
    .map((channel) => ({ channel, ownerAt: lastOwnerAt(channel) }))
    .filter((entry) => Number.isFinite(entry.ownerAt) && entry.ownerAt >= since)
    .sort((a, b) => b.ownerAt - a.ownerAt);
  if (recent.length === 0) return null;

  const blocks: string[] = [];
  const seen: string[] = [];
  let length = 0;
  let left = 0;
  recent.forEach(({ channel, ownerAt }, index) => {
    const lines = channel.messages
      .map((message) => {
        const who = speaker(channel, message, catId);
        const text = oneLine(message.body ?? '', COMPANION_REVIEW_LINE_LIMIT);
        return who && text ? { message, line: `${who}: ${text}` } : null;
      })
      .filter((item): item is { message: ChatMessage; line: string } => item !== null);
    const own = lines.filter((item) => readCompanionHeartbeatKind(item.message) === null);
    seen.push(`${channel.id}@${own.at(-1)?.message.id ?? ''}`);
    const where = isDirectLaneChannel(channel)
      ? 'Your direct conversation with your owner (this conversation)'
      : `Conversation "${oneLine(channel.title || 'Untitled', 80)}"`;
    const ago = describeDuration(ownerAt, now.getTime());
    const title = `${index + 1}. ${where}; your owner last wrote there ${ago ? `${ago} ago` : 'just now'}.`;
    const full = [title, ...lines.slice(-COMPANION_REVIEW_LINES_PER_CONVERSATION).map((item) => `   ${item.line}`)].join('\n');
    const lastOwner = [...lines].reverse().find((item) => isOwnerMessage(channel, item.message));
    const short = lastOwner ? `${title}\n   ${lastOwner.line}` : title;
    const block = [full, short].find((candidate) => length + candidate.length + 1 <= COMPANION_REVIEW_TEXT_LIMIT);
    if (!block) {
      left += 1;
      return;
    }
    blocks.push(block);
    length += block.length + 1;
  });
  if (left > 0) blocks.push(`(${left} more conversation${left === 1 ? '' : 's'} with recent messages left out.)`);

  return {
    text: [
      'Your recent conversations with your owner, most recent first (excerpts; earlier parts are left out):',
      ...blocks,
    ].join('\n'),
    fingerprint: seen.join(','),
  };
}
