import type {
  ChatCat,
  ChatCatGroup,
  ChatChannelState,
  ChatMessage,
  ChatState,
} from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import type { CompanionLifeProfile } from '../../../core/companionContracts.js';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  resolveChannelParticipantAssignments,
  resolveParticipantCatId,
} from '../shared/channelParticipants.js';
import { isDirectLaneChannel, resolveChannelProductScope } from '../shared/channelTopology.js';
import { resolveChatLifecycleState } from '../shared/lifecycle.js';
import {
  COMPANION_HEARTBEAT_MAX_UNANSWERED,
  countUnansweredHeartbeats,
  isOwnerMessage,
} from '../companion/life/heartbeat.js';
import { findLastOwnerMessageAcross } from '../companion/life/review.js';
import { findCompanionDirectLane } from '../companion/life/presence.js';
import { isCompanionCat } from '../../../shared/companionRole.js';
import { resolveChannelCanonicalIdentity, resolveLeadParticipantLease } from './model/index.js';

/**
 * SPEC-139 status board, built by the server without the model. Its only free text is Cat names
 * and conversation titles the owner set (FR-4). It never carries message text, prompts, choice
 * content, repository paths, error text or memory.
 */

export const BOSS_CAT_BOARD_TEXT_LIMIT = 80;
export const BOSS_CAT_BOARD_PROBLEM_WINDOW_MS = 7 * 24 * 60 * 60_000;

export interface BossCatBoardProblem {
  conversationId: string;
  failed: number;
  interrupted: number;
}

export interface BossCatBoardInitiative {
  mode: 'assist' | 'companion' | 'off';
  unanswered: number;
  waitingForOwner: boolean;
}

export interface BossCatBoardLane {
  /**
   * FR-3: awake or asleep, nothing finer. Waking and an error both read as asleep, so the
   * board does not show how a Cat's direct lane is failing.
   */
  presence: 'awake' | 'asleep';
  lastOwnerMessageAt: string | null;
  lastCatMessageAt: string | null;
}

/** A hidden Cat (FR-15) carries its name only. */
export interface BossCatBoardCat {
  catId: string;
  name: string;
  hidden: boolean;
  group?: ChatCatGroup;
  lane?: BossCatBoardLane | null;
  initiative?: BossCatBoardInitiative | null;
  turnRunning?: boolean;
  problems?: BossCatBoardProblem[];
  waitingChoices?: number;
  waitingApprovals?: number;
}

/**
 * `title` is null unless the owner set it (FR-4). A conversation whose only Cats are hidden
 * carries its surface, id and age alone (`redacted`, FR-15).
 */
export interface BossCatBoardGroup {
  conversationId: string;
  surface: PlatformSurfaceId;
  createdAt: string;
  redacted: boolean;
  title?: string | null;
  participantNames?: string[];
  bossCatIsMember?: boolean;
  lastOwnerMessageAt?: string | null;
  lastMessageAt?: string | null;
  turnRunning?: boolean;
  turnFailed?: boolean;
  waitingChoice?: boolean;
}

export interface BossCatBoard {
  generatedAt: string;
  cats: BossCatBoardCat[];
  groups: BossCatBoardGroup[];
}

export interface BuildBossCatBoardInput {
  state: Pick<ChatState, 'cats' | 'channels'>;
  bossCatId: string;
  now: Date;
  /** Own-initiative profiles by Cat id (SPEC-137). */
  lifeProfiles?: ReadonlyMap<string, Pick<CompanionLifeProfile, 'enabled' | 'mode' | 'enabledAt'>>;
  core?: Pick<CatsCoreState, 'tasks' | 'approvalBindings'> | null;
}

// Control characters, and bidirectional embeddings, overrides, isolates and marks.
const UNSAFE_TEXT = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;

/**
 * FR-4: one line, no control or bidi-override characters, at most 80 characters. Backticks
 * become quotes, so a name or title cannot close the fence the board travels in.
 */
export function sanitizeBoardText(value: string | null | undefined): string | null {
  const flat = (value ?? '').replace(UNSAFE_TEXT, ' ').replace(/`/gu, "'").replace(/\s+/gu, ' ').trim();
  if (!flat) return null;
  const characters = Array.from(flat);
  return characters.length > BOSS_CAT_BOARD_TEXT_LIMIT
    ? `${characters.slice(0, BOSS_CAT_BOARD_TEXT_LIMIT - 1).join('')}…`
    : flat;
}

/**
 * FR-4: only a title the owner set by renaming (`owner`). `manual` is only the creation default
 * (K3 uses the owner's goal text, older data was normalized to it), and drafted, Catlas-set and
 * Boss-Cat-set titles count as message text. A transport's sender name lives in the topic, which
 * the board never reads.
 */
export function readOwnerSetTitle(channel: Pick<ChatChannelState, 'title' | 'titleSource'>): string | null {
  return channel.titleSource === 'owner' ? sanitizeBoardText(channel.title) : null;
}

export function isHiddenFromBossCat(cat: Pick<ChatCat, 'hiddenFromBossCat'> | null | undefined): boolean {
  return cat?.hiddenFromBossCat === true;
}

/** An active conversation that is not a direct lane, on Chat, Code or Work. */
export function isBossCatGroupConversation(channel: ChatChannelState): boolean {
  return channel.status !== 'archived' && !isDirectLaneChannel(channel);
}

function activeCatIds(channel: ChatChannelState): string[] {
  return resolveChannelParticipantAssignments(channel)
    .filter((assignment) => assignment.status === 'active')
    .map((assignment) => resolveParticipantCatId(assignment))
    .filter((catId): catId is string => Boolean(catId));
}

function lastMessageAt(
  channel: ChatChannelState,
  predicate: (message: ChatMessage) => boolean = () => true,
): string | null {
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    if (predicate(message)) return message.createdAt;
  }
  return null;
}

function isTurnRunning(channel: ChatChannelState): boolean {
  const status = channel.roomRouting?.workflow?.activeTurn?.status;
  return status === 'running' || status === 'pending';
}

function isLatestTurnFailed(channel: ChatChannelState): boolean {
  const routing = channel.roomRouting;
  const latest = routing?.workflow?.activeTurn ?? routing?.workflow?.turnHistory?.[0] ?? null;
  return latest?.status === 'failed' || latest?.status === 'blocked'
    || (!routing?.workflow?.activeTurn && routing?.lastOutcome?.status === 'error');
}

/**
 * Choice cards nobody answered and the owner has not written past. When `catId` is given,
 * only cards that Cat posted.
 */
function countWaitingChoices(channel: ChatChannelState, catId?: string): number {
  const answered = new Set(channel.messages
    .map((message) => message.choiceResponse?.sourceMessageId)
    .filter((id): id is string => Boolean(id)));
  let count = 0;
  for (let index = channel.messages.length - 1; index >= 0; index -= 1) {
    const message = channel.messages[index]!;
    if (isOwnerMessage(channel, message)) break;
    if (!message.choices?.length || answered.has(message.id) || message.senderKind === 'user') continue;
    if (catId && message.metadata?.targetId !== catId) continue;
    count += 1;
  }
  return count;
}

function countPendingApprovals(
  core: BuildBossCatBoardInput['core'],
  conversationIds: ReadonlySet<string>,
): number {
  if (!core || conversationIds.size === 0) return 0;
  const pending = core.tasks.filter((task) => task.approval?.status === 'pending');
  const pendingIds = new Set(pending.map((task) => task.id));
  return new Set([
    ...pending.filter((task) => task.conversationId && conversationIds.has(task.conversationId))
      .map((task) => task.id),
    ...core.approvalBindings
      .filter((binding) => binding.conversationId && conversationIds.has(binding.conversationId)
        && pendingIds.has(binding.approvalTaskId))
      .map((binding) => binding.approvalTaskId),
  ]).size;
}

function catProblems(channels: ChatChannelState[], catId: string, since: number): BossCatBoardProblem[] {
  const problems: BossCatBoardProblem[] = [];
  for (const channel of channels) {
    const workflow = channel.roomRouting?.workflow;
    const turns = [...(workflow?.activeTurn ? [workflow.activeTurn] : []), ...(workflow?.turnHistory ?? [])];
    let failed = 0;
    let interrupted = 0;
    // Newest first. A later completed turn for this Cat settles the earlier problems
    // (as in Cats Bot SPEC-012 FR-2).
    for (const turn of turns) {
      if (!(Date.parse(turn.startedAt) >= since)) break;
      const own = turn.targetStatuses.filter((target) => target.participant.participantId === catId
        || target.participant.participantId === `cat:${catId}`);
      if (own.some((target) => target.status === 'completed')) break;
      if (own.some((target) => target.status === 'failed' || target.status === 'blocked')) failed += 1;
      else if (own.some((target) => target.status === 'cancelled')) interrupted += 1;
    }
    if (failed || interrupted) problems.push({ conversationId: channel.id, failed, interrupted });
  }
  return problems;
}

function readInitiative(
  cat: ChatCat,
  lane: ChatChannelState | null,
  channels: ChatChannelState[],
  life: Pick<CompanionLifeProfile, 'enabled' | 'mode' | 'enabledAt'> | undefined,
): BossCatBoardInitiative | null {
  if (!isCompanionCat(cat) || !lane) return null;
  if (!life?.enabled) return { mode: 'off', unanswered: 0, waitingForOwner: false };
  const mode = life.mode === 'assist' || life.mode === 'companion'
    ? life.mode
    : cat.group === 'admin' ? 'assist' : 'companion';
  const enabledAt = life.enabledAt ? Date.parse(life.enabledAt) : Number.NaN;
  const answeredAt = Math.max(
    findLastOwnerMessageAcross(channels, cat.id),
    Number.isFinite(enabledAt) ? enabledAt : Number.NEGATIVE_INFINITY,
  );
  const unanswered = countUnansweredHeartbeats(lane, answeredAt);
  return { mode, unanswered, waitingForOwner: unanswered >= COMPANION_HEARTBEAT_MAX_UNANSWERED };
}

export function buildBossCatBoard(input: BuildBossCatBoardInput): BossCatBoard {
  const since = input.now.getTime() - BOSS_CAT_BOARD_PROBLEM_WINDOW_MS;
  const channels = input.state.channels;
  const catsById = new Map(input.state.cats.map((cat) => [cat.id, cat]));
  const conversationIdOf = (channel: ChatChannelState) =>
    resolveChannelCanonicalIdentity({ channels } as ChatState, channel.id).conversationId;

  const cats: BossCatBoardCat[] = input.state.cats
    .filter((cat) => cat.status === 'active' && cat.id !== input.bossCatId)
    .map((cat) => {
      const name = sanitizeBoardText(cat.name) ?? 'Cat';
      if (isHiddenFromBossCat(cat)) return { catId: cat.id, name, hidden: true };
      const lane = findCompanionDirectLane(input.state, cat.id);
      // FR-3 and Privacy: a direct lane leaves its Cat only as its presence, its message times
      // and the Cat's own-initiative state, so running and failed turns, choices and approvals
      // count in group conversations only.
      const own = channels.filter((channel) => isBossCatGroupConversation(channel)
        && activeCatIds(channel).includes(cat.id));
      return {
        catId: cat.id,
        name,
        hidden: false,
        group: cat.group,
        lane: lane
          ? {
              presence: resolveChatLifecycleState(resolveLeadParticipantLease(lane)?.status) === 'awake' ? 'awake' : 'asleep',
              lastOwnerMessageAt: lastMessageAt(lane, (message) => isOwnerMessage(lane, message)),
              lastCatMessageAt: lastMessageAt(lane, (message) => message.senderKind === 'agent'),
            }
          : null,
        initiative: readInitiative(cat, lane, channels, input.lifeProfiles?.get(cat.id)),
        turnRunning: own.some(isTurnRunning),
        problems: catProblems(own, cat.id, since),
        waitingChoices: own.reduce((total, channel) => total + countWaitingChoices(channel, cat.id), 0),
        waitingApprovals: countPendingApprovals(input.core, new Set(own.map(conversationIdOf))),
      };
    });

  const groups: BossCatBoardGroup[] = channels
    .filter(isBossCatGroupConversation)
    .map((channel) => {
      const catIds = activeCatIds(channel);
      const visibleNames = catIds
        .filter((catId) => catId !== input.bossCatId)
        .map((catId) => catsById.get(catId))
        .filter((cat): cat is ChatCat => Boolean(cat) && !isHiddenFromBossCat(cat))
        .map((cat) => sanitizeBoardText(cat.name) ?? 'Cat');
      const otherCatIds = catIds.filter((catId) => catId !== input.bossCatId);
      const identity = {
        conversationId: channel.id,
        surface: resolveChannelProductScope(channel),
        createdAt: channel.createdAt,
      };
      if (otherCatIds.length > 0 && visibleNames.length === 0) return { ...identity, redacted: true };
      return {
        ...identity,
        redacted: false,
        title: readOwnerSetTitle(channel),
        participantNames: visibleNames,
        bossCatIsMember: catIds.includes(input.bossCatId),
        lastOwnerMessageAt: lastMessageAt(channel, (message) => isOwnerMessage(channel, message)),
        lastMessageAt: lastMessageAt(channel),
        turnRunning: isTurnRunning(channel),
        turnFailed: isLatestTurnFailed(channel),
        waitingChoice: countWaitingChoices(channel) > 0,
      };
    });

  return { generatedAt: input.now.toISOString(), cats, groups };
}
