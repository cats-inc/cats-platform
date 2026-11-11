import type { ChannelActivationResult, ChatState } from '../../api/contracts.js';
import type { CompanionSnapshot } from '../contracts.js';
import type { CatsCoreState } from '../../../../core/types.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { isCompanionCat } from '../../../../shared/companionRole.js';
import { isAdminCat } from '../../../shared/catGroups.js';
import { buildBossCatBoard } from '../../state/bossCatBoard.js';
import { resolveLeadParticipantLease } from '../../state/model/index.js';
import { observeRuntimeSessionLiveness } from '../../state/runtime-session/sessionReuse.js';
import type { CompanionActivityStore } from '../activityStore.js';
import { createDefaultCompanionLifeProfile, parseClockMinutes } from './profile.js';
import {
  appendCompanionPresenceActivity,
  findCompanionDirectLane,
  type CompanionPresenceReason,
} from './presence.js';
import { resolveCompanionDesiredPresence, resolveCompanionRhythm } from './rhythm.js';
import {
  COMPANION_HEARTBEAT_MAX_UNANSWERED,
  countUnansweredHeartbeats,
  laneHasHeartbeatSince,
  pickCompanionHeartbeatDelayMs,
  type CompanionEffectiveInitiativeMode,
  type CompanionHeartbeatKind,
} from './heartbeat.js';
import { buildCompanionWorkReview, findLastOwnerMessageAcross } from './review.js';
import { buildBossCatPeerSection, hasNewPeerMarks, mergePeerMarks, type BossCatPeerSection } from './peerSection.js';

/** SPEC-124 FR-12: a lane quieter than this may fall asleep. */
export const COMPANION_IDLE_SLEEP_MS = 15 * 60_000;
/** SPEC-124 FR-11. */
export const COMPANION_WAKE_BACKOFF_MS = 5 * 60_000;
/** A wake that never attached a Runtime session must not wait forever. */
const WAKE_ATTACHMENT_TIMEOUT_MS = 5 * 60_000;

/** SPEC-124 FR-20: never talk over a conversation that is still going. */
export const COMPANION_HEARTBEAT_QUIET_LANE_MS = 10 * 60_000;
/** A morning greeting only makes sense this soon after the wake time. */
const WAKE_GREETING_WINDOW_MS = 3 * 60 * 60_000;
const HEARTBEAT_BUSY_RETRY_MS = 4 * 60_000;
const HEARTBEAT_FAILED_RETRY_MS = 30 * 60_000;

export interface CompanionHeartbeatRequest {
  catId: string;
  laneId: string;
  sessionId: string;
  kind: CompanionHeartbeatKind;
  now: Date;
  awakeSince: Date | null;
  lastOwnerMessageAt: Date | null;
  /** SPEC-137 FR-1. */
  mode: CompanionEffectiveInitiativeMode;
  /** SPEC-137 FR-5. */
  unanswered: number;
  /** SPEC-137 FR-7: `assist` only. */
  review: string | null;
  /** SPEC-139 FR-13: the review carries a Boss Cat's peer section. */
  peers?: boolean;
}

/** `skipped`: an `assist` heartbeat with nothing new to look over ran no turn (SPEC-137 FR-8). */
export type CompanionHeartbeatResult = 'spoke' | 'quiet' | 'busy' | 'failed' | 'skipped';

const MAX_SESSIONS_PATTERN = /\bmax sessions\b[^.]*\breached\b/iu;

export interface CompanionLifeLoopDependencies {
  readChatState(): Promise<ChatState>;
  readCompanionSnapshot(): Promise<Pick<CompanionSnapshot, 'boxes'>>;
  runtimeClient: Pick<RuntimeClient, 'observeSession' | 'getHealth'>;
  activityStore?: CompanionActivityStore;
  /** An admitted image may temporarily own this Cat's idle Runtime slot. */
  isImagePending?(catId: string): boolean;
  /** Runs the REST activation body under the lane's mutation gate. */
  activateLane(channelId: string): Promise<ChannelActivationResult[]>;
  /** Runs the REST deactivate body under the lane's mutation gate. */
  deactivateLane(channelId: string): Promise<{ closedSessionCount: number }>;
  /** SPEC-124 Phase 2: one hidden turn in the lane's session. Omitted, the loop only keeps Cats awake. */
  speak?(request: CompanionHeartbeatRequest): Promise<CompanionHeartbeatResult>;
  /** SPEC-139 FR-13: pending approvals for the Boss Cat's peer section. Omitted or failing, none are counted. */
  readCore?(): Promise<Pick<CatsCoreState, 'tasks' | 'approvalBindings'>>;
  random?(): number;
  now(): Date;
}

export type CompanionLifeOutcome =
  | 'awake'
  | 'woke'
  | 'waking'
  | 'wake_failed'
  | 'backoff'
  | 'asleep'
  | 'slept'
  | 'sleep_deferred'
  | 'runtime_unknown';

export interface CompanionLifeTickEntry {
  catId: string;
  laneId: string;
  outcome: CompanionLifeOutcome;
  reason?: CompanionPresenceReason;
  heartbeat?: { kind: CompanionHeartbeatKind; result: CompanionHeartbeatResult };
}

interface CatLifeMemory {
  backoffUntil: number;
  failureRecorded: boolean;
  awakeSince: number | null;
  nextHeartbeatAt: number | null;
  heartbeatKind: 'wake' | 'regular';
  waitingForSessionSince: number | null;
  /** SPEC-137 FR-5: the unanswered count the next heartbeat was drawn with, and when. */
  drawnWith: number;
  drawnAt: number;
  /** SPEC-137 FR-8: the review fingerprint the last quiet `assist` heartbeat saw. */
  reviewedThrough: string | null;
  /** SPEC-139 FR-14: per other Cat, the peer section's marks the last quiet look saw. */
  reviewedPeers: Map<string, string[]>;
}

/** What one tick knows about a Cat's own initiative (SPEC-137). */
interface CatInitiative {
  mode: CompanionEffectiveInitiativeMode;
  /** The owner's latest message across the Cat's conversations, or turning it on. */
  answeredAt: number;
  lastOwnerAt: number;
  unanswered: number;
}

/** The most recent local bedtime at or before `now`. */
function resolveRestStartedAt(bedtime: string, now: Date): Date {
  const minutes = parseClockMinutes(bedtime) ?? 0;
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  );
  return today <= now
    ? today
    : new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, today.getHours(), today.getMinutes());
}

export function createCompanionLifeLoop(dependencies: CompanionLifeLoopDependencies) {
  const memory = new Map<string, CatLifeMemory>();
  const random = dependencies.random ?? Math.random;

  function rememberFor(catId: string): CatLifeMemory {
    let entry = memory.get(catId);
    if (!entry) {
      entry = {
        backoffUntil: 0,
        failureRecorded: false,
        awakeSince: null,
        nextHeartbeatAt: null,
        heartbeatKind: 'regular',
        waitingForSessionSince: null,
        drawnWith: 0,
        drawnAt: 0,
        reviewedThrough: null,
        reviewedPeers: new Map(),
      };
      memory.set(catId, entry);
    }
    return entry;
  }

  function scheduleHeartbeat(
    remembered: CatLifeMemory,
    kind: 'wake' | 'regular',
    fromMs: number,
    unanswered: number,
    nowMs: number,
  ): void {
    remembered.drawnWith = unanswered;
    remembered.drawnAt = nowMs;
    if (unanswered >= COMPANION_HEARTBEAT_MAX_UNANSWERED) {
      // SPEC-137 FR-5: stopped until the owner writes; nothing is drawn meanwhile.
      remembered.heartbeatKind = 'regular';
      remembered.nextHeartbeatAt = null;
      return;
    }
    remembered.heartbeatKind = kind;
    remembered.nextHeartbeatAt = fromMs + pickCompanionHeartbeatDelayMs(kind, random, unanswered);
  }

  /**
   * FR-19: greet once per morning. The lane is the record, so a restart after
   * the greeting schedules an ordinary heartbeat instead of a second one.
   */
  function scheduleFirstHeartbeat(
    remembered: CatLifeMemory,
    lane: Pick<ChatState['channels'][number], 'messages'>,
    wakeAt: Date,
    now: Date,
    initiative: CatInitiative,
  ): void {
    // SPEC-137 FR-5: no good morning while a message is unanswered.
    const greetable = initiative.unanswered === 0
      && now.getTime() - wakeAt.getTime() < WAKE_GREETING_WINDOW_MS
      && !laneHasHeartbeatSince(lane, wakeAt, ['wake']);
    scheduleHeartbeat(remembered, greetable ? 'wake' : 'regular', now.getTime(), initiative.unanswered, now.getTime());
  }

  /** SPEC-137 FR-1, FR-5, FR-6: the mode and the unanswered count, read from the lanes. */
  function readInitiative(
    state: ChatState,
    cat: ChatState['cats'][number],
    lane: ChatState['channels'][number],
    life: { mode: string; enabledAt: string | null },
  ): CatInitiative {
    const mode: CompanionEffectiveInitiativeMode = life.mode === 'assist' || life.mode === 'companion'
      ? life.mode
      : cat.group === 'admin' ? 'assist' : 'companion';
    const lastOwnerAt = findLastOwnerMessageAcross(state.channels, cat.id);
    const enabledAt = life.enabledAt ? Date.parse(life.enabledAt) : Number.NaN;
    const answeredAt = Math.max(lastOwnerAt, Number.isFinite(enabledAt) ? enabledAt : Number.NEGATIVE_INFINITY);
    return { mode, answeredAt, lastOwnerAt, unanswered: countUnansweredHeartbeats(lane, answeredAt) };
  }

  function forgetAwake(remembered: CatLifeMemory): void {
    remembered.awakeSince = null;
    remembered.nextHeartbeatAt = null;
    remembered.waitingForSessionSince = null;
  }

  async function tick(): Promise<CompanionLifeTickEntry[]> {
    const [state, snapshot] = await Promise.all([
      dependencies.readChatState(),
      dependencies.readCompanionSnapshot(),
    ]);
    const entries: CompanionLifeTickEntry[] = [];
    let runtimeReachable: boolean | null = null;
    const ensureRuntimeReachable = async (): Promise<boolean> => {
      if (runtimeReachable === null) {
        runtimeReachable = await dependencies.runtimeClient.getHealth().then(() => true, () => false);
      }
      return runtimeReachable;
    };

    for (const cat of state.cats) {
      if (cat.status !== 'active' || !isCompanionCat(cat)) {
        continue;
      }
      const lane = findCompanionDirectLane(state, cat.id);
      if (!lane) {
        continue;
      }
      const now = dependencies.now();
      const life = snapshot.boxes.find((box) => box.catId === cat.id)?.life
        ?? createDefaultCompanionLifeProfile(now.toISOString());
      if (!life.enabled) {
        continue;
      }
      const record = (outcome: CompanionLifeOutcome, reason?: CompanionPresenceReason) => {
        entries.push({ catId: cat.id, laneId: lane.id, outcome, ...(reason ? { reason } : {}) });
      };
      const desired = resolveCompanionDesiredPresence(life, cat.id, now);
      const lease = resolveLeadParticipantLease(lane);
      const remembered = rememberFor(cat.id);
      const initiative = readInitiative(state, cat, lane, life);

      if (desired.presence === 'awake') {
        if (dependencies.isImagePending?.(cat.id)) { record('awake'); continue; }
        if (lease?.status === 'initializing' && !lease.sessionId) {
          remembered.waitingForSessionSince ??= now.getTime();
          if (lane.roomRouting?.workflow?.activeTurn
            || now.getTime() - remembered.waitingForSessionSince < WAKE_ATTACHMENT_TIMEOUT_MS) {
            record('waking');
            continue;
          }
        } else {
          remembered.waitingForSessionSince = null;
        }
        // Native CLI sessions may stay initializing until their first message.
        // The heartbeat itself must be able to perform that first turn.
        if ((lease?.status === 'ready' || lease?.status === 'initializing') && lease.sessionId) {
          const liveness = await observeRuntimeSessionLiveness(
            dependencies.runtimeClient,
            lease.sessionId,
          );
          if (liveness === 'unknown') {
            record('runtime_unknown');
            continue;
          }
          if (liveness === 'live') {
            remembered.backoffUntil = 0;
            remembered.failureRecorded = false;
            remembered.awakeSince ??= now.getTime();
            const waiting = initiative.unanswered >= COMPANION_HEARTBEAT_MAX_UNANSWERED;
            if (waiting) {
              remembered.nextHeartbeatAt = null;
            } else if (
              remembered.nextHeartbeatAt === null
              // SPEC-137 FR-5: the owner answered a backed-off Cat: back to the ordinary pace.
              || (remembered.drawnWith > 0 && initiative.answeredAt > remembered.drawnAt)
            ) {
              scheduleFirstHeartbeat(remembered, lane, resolveCompanionRhythm(life, cat.id, now).wakeAt, now, initiative);
            }
            const heartbeat = waiting ? undefined : await maybeSpeak({
              remembered,
              catId: cat.id,
              bossCat: isAdminCat(cat),
              lane,
              sessionId: lease.sessionId,
              now,
              initiative,
              state,
            });
            entries.push({
              catId: cat.id,
              laneId: lane.id,
              outcome: 'awake',
              ...(heartbeat ? { heartbeat } : {}),
            });
            continue;
          }
        }
        if (remembered.backoffUntil > now.getTime()) {
          record('backoff');
          continue;
        }
        if (!(await ensureRuntimeReachable())) {
          record('runtime_unknown');
          continue;
        }
        // A `ready` lease whose session died was already "awake" in the UI.
        const wakeReason: CompanionPresenceReason = lease?.status === 'ready' ? 'keep_alive' : 'rhythm';
        const results = await dependencies.activateLane(lane.id);
        const result = results.find((candidate) => candidate.targetKind === 'cat');
        if (!result || result.status === 'error') {
          const reason: CompanionPresenceReason = MAX_SESSIONS_PATTERN.test(result?.error ?? '')
            ? 'no_capacity'
            : 'wake_failed';
          remembered.backoffUntil = now.getTime() + COMPANION_WAKE_BACKOFF_MS;
          if (!remembered.failureRecorded) {
            remembered.failureRecorded = true;
            await appendCompanionPresenceActivity(dependencies.activityStore, {
              catId: cat.id,
              laneId: lane.id,
              presence: 'sleeping',
              reason,
              now,
            });
          }
          record('wake_failed', reason);
          continue;
        }
        remembered.backoffUntil = 0;
        remembered.failureRecorded = false;
        if (wakeReason === 'rhythm') {
          remembered.awakeSince = now.getTime();
          scheduleFirstHeartbeat(remembered, lane, resolveCompanionRhythm(life, cat.id, now).wakeAt, now, initiative);
        }
        if (result.status === 'started') {
          await appendCompanionPresenceActivity(dependencies.activityStore, {
            catId: cat.id,
            laneId: lane.id,
            presence: 'awake',
            reason: wakeReason,
            now,
          });
        }
        record('woke', wakeReason);
        continue;
      }

      if (lease?.status !== 'ready' && lease?.status !== 'initializing') {
        forgetAwake(remembered);
        record('asleep');
        continue;
      }
      const lastMessageAt = lane.lastMessageAt ? Date.parse(lane.lastMessageAt) : Number.NaN;
      if (
        Boolean(lane.roomRouting?.workflow?.activeTurn)
        || (Number.isFinite(lastMessageAt) && now.getTime() - lastMessageAt < COMPANION_IDLE_SLEEP_MS)
      ) {
        record('sleep_deferred');
        continue;
      }
      // Awake past bedtime only because someone talked to him counts as dozing off again.
      const reason: CompanionPresenceReason = desired.reason === 'owner'
        || (Number.isFinite(lastMessageAt)
          && lastMessageAt >= resolveRestStartedAt(life.bedtime, now).getTime())
        ? 'idle'
        : 'rest';
      // FR-24: a Cat going to bed on its own rhythm may say good night first.
      let bedtime: CompanionLifeTickEntry['heartbeat'];
      if (
        reason === 'rest'
        && dependencies.speak
        && lease.status === 'ready'
        && lease.sessionId
        // SPEC-137 FR-9: only `companion` says good night, and not while a message is unanswered.
        && initiative.mode === 'companion'
        && initiative.unanswered === 0
        && !laneHasHeartbeatSince(lane, resolveRestStartedAt(life.bedtime, now), ['bedtime'])
      ) {
        bedtime = {
          kind: 'bedtime',
          result: await dependencies.speak({
            catId: cat.id,
            laneId: lane.id,
            sessionId: lease.sessionId,
            kind: 'bedtime',
            now,
            awakeSince: remembered.awakeSince === null ? null : new Date(remembered.awakeSince),
            lastOwnerMessageAt: Number.isFinite(initiative.lastOwnerAt) ? new Date(initiative.lastOwnerAt) : null,
            mode: initiative.mode,
            unanswered: 0,
            review: null,
          }),
        };
      }
      forgetAwake(remembered);
      const deactivation = await dependencies.deactivateLane(lane.id);
      if (deactivation.closedSessionCount > 0) {
        await appendCompanionPresenceActivity(dependencies.activityStore, {
          catId: cat.id,
          laneId: lane.id,
          presence: 'sleeping',
          reason,
          now,
        });
      }
      entries.push({
        catId: cat.id,
        laneId: lane.id,
        outcome: 'slept',
        reason,
        ...(bedtime ? { heartbeat: bedtime } : {}),
      });
    }
    return entries;
  }

  /** FR-18..FR-20: speak when due, unless the lane is mid-conversation. */
  /**
   * SPEC-139 FR-13: the other Cats on the board, for a Boss Cat's `assist`
   * heartbeat that is due. Built without the model; a Core that cannot be read
   * only leaves approvals out.
   */
  async function readPeerSection(
    state: ChatState,
    bossCatId: string,
    now: Date,
    seen: ReadonlyMap<string, readonly string[]>,
  ): Promise<BossCatPeerSection> {
    let core: Pick<CatsCoreState, 'tasks' | 'approvalBindings'> | null = null;
    if (dependencies.readCore) {
      try {
        core = await dependencies.readCore();
      } catch {
        core = null;
      }
    }
    const board = buildBossCatBoard({ state, bossCatId, now, core });
    return buildBossCatPeerSection({ board, state, core, now, seen });
  }

  async function maybeSpeak(input: {
    remembered: CatLifeMemory;
    catId: string;
    /** SPEC-139: an admin Cat. */
    bossCat: boolean;
    lane: ChatState['channels'][number];
    sessionId: string;
    now: Date;
    initiative: CatInitiative;
    state: ChatState;
  }): Promise<CompanionLifeTickEntry['heartbeat'] | undefined> {
    const { remembered, lane, now, initiative } = input;
    const nowMs = now.getTime();
    if (
      !dependencies.speak
      || remembered.nextHeartbeatAt === null
      || now.getTime() < remembered.nextHeartbeatAt
    ) {
      return undefined;
    }
    if (lane.roomRouting?.workflow?.activeTurn) {
      remembered.nextHeartbeatAt = now.getTime() + HEARTBEAT_BUSY_RETRY_MS;
      return undefined;
    }
    const lastMessageAt = lane.lastMessageAt ? Date.parse(lane.lastMessageAt) : Number.NaN;
    if (Number.isFinite(lastMessageAt) && now.getTime() - lastMessageAt < COMPANION_HEARTBEAT_QUIET_LANE_MS) {
      // Already talking: a later good-morning would be odd, so fall back to an ordinary beat.
      scheduleHeartbeat(remembered, 'regular', lastMessageAt + COMPANION_HEARTBEAT_QUIET_LANE_MS, initiative.unanswered, nowMs);
      return undefined;
    }
    const kind = remembered.heartbeatKind;
    let review: string | null = null;
    let fingerprint: string | null = null;
    let peerMarks: Map<string, string[]> | null = null;
    let peersShown = false;
    if (initiative.mode === 'assist') {
      // SPEC-137 FR-7 / FR-8: no turn when there is nothing to look over, or nothing new since a quiet look.
      // SPEC-139 FR-13 / FR-14: a Boss Cat's review leaves other Cats' lines out and gains the peer
      // section; only an item there that the last quiet look did not see is news.
      const built = buildCompanionWorkReview(input.state.channels, input.catId, now, { leaveOutOtherCats: input.bossCat });
      // A board that cannot be built costs this Cat its peer section, never the tick.
      const peers = input.bossCat
        ? await readPeerSection(input.state, input.catId, now, remembered.reviewedPeers).catch(() => null)
        : null;
      const ownNew = built !== null && built.fingerprint !== remembered.reviewedThrough;
      const peersNew = peers !== null && peers.text !== null && hasNewPeerMarks(peers.marks, remembered.reviewedPeers);
      if (!ownNew && !peersNew) {
        // An item that is gone is forgotten, so it is news if it comes back.
        if (peers) remembered.reviewedPeers = mergePeerMarks(peers.marks, remembered.reviewedPeers);
        scheduleHeartbeat(remembered, 'regular', nowMs, initiative.unanswered, nowMs);
        return { kind, result: 'skipped' };
      }
      review = [built?.text, peers?.text].filter((part): part is string => Boolean(part)).join('\n\n');
      fingerprint = built?.fingerprint ?? null;
      // A Cat the bounds left out was not seen by this look, so it stays news.
      peerMarks = peers
        ? new Map([...peers.marks].filter(([catId]) => !peers.omitted.has(catId)))
        : null;
      peersShown = Boolean(peers?.text);
    }
    const result = await dependencies.speak({
      catId: input.catId,
      laneId: lane.id,
      sessionId: input.sessionId,
      kind,
      now,
      awakeSince: remembered.awakeSince === null ? null : new Date(remembered.awakeSince),
      lastOwnerMessageAt: Number.isFinite(initiative.lastOwnerAt) ? new Date(initiative.lastOwnerAt) : null,
      mode: initiative.mode,
      unanswered: initiative.unanswered,
      review,
      ...(peersShown ? { peers: true } : {}),
    });
    if (result === 'busy') {
      remembered.nextHeartbeatAt = nowMs + HEARTBEAT_BUSY_RETRY_MS;
    } else if (result === 'failed') {
      remembered.heartbeatKind = 'regular';
      remembered.nextHeartbeatAt = nowMs + HEARTBEAT_FAILED_RETRY_MS;
    } else {
      if (result === 'quiet' && fingerprint !== null) remembered.reviewedThrough = fingerprint;
      if (result === 'quiet' && peerMarks !== null) remembered.reviewedPeers = mergePeerMarks(peerMarks, remembered.reviewedPeers);
      // SPEC-137 FR-5: a spoken heartbeat is one more message the owner has not answered yet.
      scheduleHeartbeat(remembered, 'regular', nowMs, initiative.unanswered + (result === 'spoke' ? 1 : 0), nowMs);
    }
    return { kind, result };
  }

  return { tick };
}

export type CompanionLifeLoop = ReturnType<typeof createCompanionLifeLoop>;

export interface StartCompanionLifeLoopOptions {
  intervalMs?: number;
  startupDelayMs?: number;
  report?(line: string): void;
}

/** SPEC-124 FR-9: first pass shortly after startup, then every minute, never overlapping. */
export function startCompanionLifeLoop(
  loop: CompanionLifeLoop,
  options: StartCompanionLifeLoopOptions = {},
): (() => void) & { isIdle(): boolean } {
  let stopped = false;
  let ticking = false;
  const report = options.report ?? ((line: string) => {
    process.stderr.write(`[cats-platform-companion-life] ${line}\n`);
  });

  async function runTick(): Promise<void> {
    if (stopped || ticking) {
      return;
    }
    ticking = true;
    try {
      for (const entry of await loop.tick()) {
        if (entry.outcome === 'woke' || entry.outcome === 'slept' || entry.outcome === 'wake_failed') {
          report(`${entry.outcome} cat=${entry.catId} lane=${entry.laneId} reason=${entry.reason ?? ''}`);
        }
        if (entry.heartbeat) {
          report(`heartbeat cat=${entry.catId} lane=${entry.laneId} kind=${entry.heartbeat.kind} result=${entry.heartbeat.result}`);
        }
      }
    } catch (error) {
      report(`tick_failed ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally {
      ticking = false;
    }
  }

  const startup = setTimeout(() => { void runTick(); }, options.startupDelayMs ?? 5_000);
  startup.unref?.();
  const timer = setInterval(() => { void runTick(); }, options.intervalMs ?? 60_000);
  timer.unref?.();
  return Object.assign(() => {
    stopped = true;
    clearTimeout(startup);
    clearInterval(timer);
  }, { isIdle: () => !ticking });
}
