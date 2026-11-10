import type { ChatChannelState, ChatMessage } from '../../api/contracts.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';

/**
 * SPEC-124 FR-18..FR-24: the heartbeat is one hidden turn in the Cat's own
 * direct-lane session. The Cat decides whether to speak; most turns stay quiet.
 * SPEC-137: in `companion` mode it keeps the owner company, in `assist` mode
 * it looks over the Cat's own recent conversations for unfinished work, and it
 * backs off while the owner does not answer. The prompts and the back-off match
 * Cats Bot's (cats-bot SPEC-011).
 */

export type CompanionHeartbeatKind = 'wake' | 'regular' | 'bedtime';
export type CompanionEffectiveInitiativeMode = 'assist' | 'companion';

/**
 * SPEC-137 FR-5: each unprompted message the owner leaves unanswered doubles
 * the wait before the next; after this many in a row the Cat waits for the
 * owner to write.
 */
export const COMPANION_HEARTBEAT_MAX_UNANSWERED = 5;

export const COMPANION_HEARTBEAT_QUIET_TOKEN = '[quiet]';
/** Metadata key stamped on lane messages a heartbeat produced. */
export const COMPANION_HEARTBEAT_METADATA_KEY = 'companionHeartbeat';

const MINUTE_MS = 60_000;

export interface CompanionHeartbeatPromptInput {
  kind: CompanionHeartbeatKind;
  now: Date;
  awakeSince: Date | null;
  lastOwnerMessageAt: Date | null;
  /** The same companion-memory block the Cat gets on ordinary turns, if any. */
  companionContext: string | null;
  /** FR-29: whether the Cat has a photo album it may send a picture from. */
  hasPhotoAlbum?: boolean;
  /** SPEC-137 FR-1; absent reads as `companion`. */
  mode?: CompanionEffectiveInitiativeMode;
  /** SPEC-137 FR-5: unprompted messages since the owner last wrote. */
  unanswered?: number;
  /** SPEC-137 FR-7: `assist` only, the excerpts of the Cat's recent conversations. */
  review?: string | null;
}

export function describeDuration(fromMs: number, toMs: number): string | null {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / MINUTE_MS));
  if (minutes < 1) return null;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

function describeLocalTime(now: Date): string {
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${date}, ${hours}:${minutes}`;
}

function describeMoment(input: CompanionHeartbeatPromptInput): string {
  if (input.kind === 'wake') {
    return 'You have just woken up for the day.';
  }
  if (input.kind === 'bedtime') {
    return 'It is your bedtime; you are about to go to sleep.';
  }
  const awakeFor = input.awakeSince
    ? describeDuration(input.awakeSince.getTime(), input.now.getTime())
    : null;
  return awakeFor ? `You have been awake for about ${awakeFor}.` : 'You are awake.';
}

function describeUnanswered(unanswered: number): string | null {
  if (unanswered <= 0) return null;
  return unanswered === 1
    ? 'Your owner has not answered the last unprompted message you sent. Only speak again if it is worth it.'
    : `Your owner has not answered the last ${unanswered} unprompted messages you sent. Only speak again if it is clearly worth it.`;
}

export function buildCompanionHeartbeatPrompt(input: CompanionHeartbeatPromptInput): string {
  const sinceOwner = input.lastOwnerMessageAt
    ? describeDuration(input.lastOwnerMessageAt.getTime(), input.now.getTime())
    : null;
  const ownerLine = !input.lastOwnerMessageAt
    ? 'Your owner has not written to you yet.'
    : `Your owner last wrote to you ${sinceOwner ? `${sinceOwner} ago` : 'just now'}.`;
  const unanswered = describeUnanswered(input.unanswered ?? 0);
  const facts = [
    '[Cats heartbeat. This is not a message from your owner, and your owner cannot see it.]',
    `Local time: ${describeLocalTime(input.now)}.`,
    describeMoment(input),
    ownerLine,
    ...(unanswered ? [unanswered] : []),
    ...(input.companionContext ? ['', input.companionContext, ''] : []),
  ];
  const quiet = `If you would rather stay quiet, reply with exactly ${COMPANION_HEARTBEAT_QUIET_TOKEN} and nothing else.`;
  if (input.mode === 'assist') {
    return [
      ...facts,
      'This heartbeat is for helping your owner get their work done, not for small talk.',
      ...(input.review ? ['', input.review, ''] : []),
      'Look for something your owner asked for or started that is not finished: work you stopped part-way,',
      'a turn that failed or was interrupted, a question still waiting for an answer, or something they said',
      'they would come back to. If you find one, reply with only a short message (one to three sentences) that',
      'names it, suggests one concrete next step and offers to continue; name the conversation when it is not',
      'this one. Write it in your own voice. It is sent to your owner exactly as you write it.',
      'Do not start the work now, and do not repeat a suggestion you already made unless something changed.',
      `If nothing is unfinished, or you would only repeat yourself, reply with exactly ${COMPANION_HEARTBEAT_QUIET_TOKEN}.`,
      quiet,
    ].join('\n');
  }
  return [
    ...facts,
    'If you feel like saying something to your owner right now (a greeting, a passing thought,',
    'something you noticed), reply with only that message, in your own voice, one to three',
    'short sentences. It is sent to your owner exactly as you write it.',
    'Do not repeat what you already said in an earlier unprompted message.',
    // The album and its [photo: ...] syntax are part of the companion context above.
    ...(input.hasPhotoAlbum
      ? ['If a photo from your album fits the moment, you may send one along with it.']
      : []),
    quiet,
  ].join('\n');
}

export function parseCompanionHeartbeatReply(
  text: string,
): { quiet: true } | { quiet: false; body: string } {
  const body = text.trim();
  return body.length === 0 || body.toLowerCase() === COMPANION_HEARTBEAT_QUIET_TOKEN
    ? { quiet: true }
    : { quiet: false, body };
}

/**
 * FR-18/FR-19 delays; `random` is injectable so tests are deterministic.
 * SPEC-137 FR-5: the regular wait doubles with each unanswered message; wake waits do not.
 */
export function pickCompanionHeartbeatDelayMs(
  kind: 'wake' | 'regular',
  random: () => number,
  unanswered = 0,
): number {
  const [min, max] = kind === 'wake' ? [2, 10] : [30, 120];
  const factor = kind === 'wake'
    ? 1
    : 2 ** Math.max(0, Math.min(unanswered, COMPANION_HEARTBEAT_MAX_UNANSWERED - 1));
  return Math.round((min + (max - min) * random()) * MINUTE_MS * factor);
}

function readHeartbeatKind(message: ChatChannelState['messages'][number]): CompanionHeartbeatKind | null {
  const stamp = message.metadata?.[COMPANION_HEARTBEAT_METADATA_KEY];
  const kind = stamp && typeof stamp === 'object' ? (stamp as Record<string, unknown>).kind : null;
  return kind === 'wake' || kind === 'regular' || kind === 'bedtime' ? kind : null;
}

/** Restart-safe: whether the lane already carries a heartbeat message since `since`. */
export function laneHasHeartbeatSince(
  lane: Pick<ChatChannelState, 'messages'>,
  since: Date,
  kinds: readonly CompanionHeartbeatKind[],
): boolean {
  const sinceMs = since.getTime();
  return lane.messages.some((message) => {
    const kind = readHeartbeatKind(message);
    return kind !== null && kinds.includes(kind) && Date.parse(message.createdAt) >= sinceMs;
  });
}

/** Whether a lane message is a heartbeat the Cat said, and of which kind. */
export function readCompanionHeartbeatKind(message: ChatMessage): CompanionHeartbeatKind | null {
  return readHeartbeatKind(message);
}

type OwnerChannel = Pick<ChatChannelState, 'messages'> & Parameters<typeof isDirectLaneChannel>[0];

/**
 * SPEC-137 FR-6: a message from the owner. Typed in Cats, or sent through a
 * transport into a direct lane; in a channel bound to a group chat a
 * transport message may come from someone else, so it is not the owner's.
 */
export function isOwnerMessage(channel: OwnerChannel, message: ChatMessage): boolean {
  if (message.senderKind !== 'user') return false;
  return !message.metadata?.transport || isDirectLaneChannel(channel);
}

export function findLastOwnerMessageAt(lane: OwnerChannel): Date | null {
  for (let index = lane.messages.length - 1; index >= 0; index -= 1) {
    const message = lane.messages[index]!;
    if (isOwnerMessage(lane, message)) {
      const at = Date.parse(message.createdAt);
      return Number.isFinite(at) ? new Date(at) : null;
    }
  }
  return null;
}

/**
 * SPEC-137 FR-5: unprompted messages in the lane after `since` (the owner's
 * latest message, or turning own initiative on). The lane is the record, so a
 * restart is never an answer. A good night expects no answer and is not counted.
 */
export function countUnansweredHeartbeats(lane: Pick<ChatChannelState, 'messages'>, since: number): number {
  let count = 0;
  for (const message of lane.messages) {
    const kind = readHeartbeatKind(message);
    if ((kind === 'wake' || kind === 'regular') && Date.parse(message.createdAt) > since) count += 1;
  }
  return count;
}
