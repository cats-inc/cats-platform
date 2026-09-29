import type { ChatChannelState } from '../../api/contracts.js';

/**
 * SPEC-124 FR-18..FR-24: the heartbeat is one hidden turn in the Cat's own
 * direct-lane session. The Cat decides whether to speak; most turns stay quiet.
 */

export type CompanionHeartbeatKind = 'wake' | 'regular' | 'bedtime';

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
  /** FR-29: file names from the owner's photo folder the Cat may attach. */
  photoCandidates?: readonly string[];
}

function describeDuration(fromMs: number, toMs: number): string | null {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / MINUTE_MS));
  if (minutes < 1) return null;
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
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

export function buildCompanionHeartbeatPrompt(input: CompanionHeartbeatPromptInput): string {
  const sinceOwner = input.lastOwnerMessageAt
    ? describeDuration(input.lastOwnerMessageAt.getTime(), input.now.getTime())
    : null;
  const ownerLine = !input.lastOwnerMessageAt
    ? 'Your owner has not written to you yet in this conversation.'
    : `Your owner last wrote to you ${sinceOwner ? `${sinceOwner} ago` : 'just now'}.`;
  return [
    '[Cats heartbeat. This is not a message from your owner, and your owner cannot see it.]',
    `Local time: ${describeLocalTime(input.now)}.`,
    describeMoment(input),
    ownerLine,
    ...(input.companionContext ? ['', input.companionContext, ''] : []),
    'If you feel like saying something to your owner right now (a greeting, a passing thought,',
    'something you noticed), reply with only that message, in your own voice, one to three',
    'short sentences. It is sent to your owner exactly as you write it.',
    ...(input.photoCandidates && input.photoCandidates.length > 0
      ? [
          'You may also send one photo from your album. You cannot see these pictures, so choose',
          'by file name, and add a line [photo: <file name>] with the exact name:',
          ...input.photoCandidates.map((name) => `- ${name}`),
        ]
      : []),
    `If you would rather stay quiet, reply with exactly ${COMPANION_HEARTBEAT_QUIET_TOKEN} and nothing else.`,
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

/** FR-18/FR-19 delays; `random` is injectable so tests are deterministic. */
export function pickCompanionHeartbeatDelayMs(
  kind: 'wake' | 'regular',
  random: () => number,
): number {
  const [min, max] = kind === 'wake' ? [2, 10] : [30, 120];
  return Math.round((min + (max - min) * random()) * MINUTE_MS);
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

export function findLastOwnerMessageAt(lane: Pick<ChatChannelState, 'messages'>): Date | null {
  for (let index = lane.messages.length - 1; index >= 0; index -= 1) {
    const message = lane.messages[index]!;
    if (message.senderKind === 'user') {
      const at = Date.parse(message.createdAt);
      return Number.isFinite(at) ? new Date(at) : null;
    }
  }
  return null;
}
