import type { ChannelActivationResult, ChatState } from '../../api/contracts.js';
import type { CompanionSnapshot } from '../contracts.js';
import type { RuntimeClient } from '../../../../platform/runtime/client.js';
import { isCompanionCat } from '../../../../shared/companionRole.js';
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
  findLastOwnerMessageAt,
  laneHasHeartbeatSince,
  pickCompanionHeartbeatDelayMs,
  type CompanionHeartbeatKind,
} from './heartbeat.js';

/** SPEC-124 FR-12: a lane quieter than this may fall asleep. */
export const COMPANION_IDLE_SLEEP_MS = 15 * 60_000;
/** SPEC-124 FR-11. */
export const COMPANION_WAKE_BACKOFF_MS = 5 * 60_000;

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
}

export type CompanionHeartbeatResult = 'spoke' | 'quiet' | 'busy' | 'failed';

const MAX_SESSIONS_PATTERN = /\bmax sessions\b[^.]*\breached\b/iu;

export interface CompanionLifeLoopDependencies {
  readChatState(): Promise<ChatState>;
  readCompanionSnapshot(): Promise<Pick<CompanionSnapshot, 'boxes'>>;
  runtimeClient: Pick<RuntimeClient, 'observeSession' | 'getHealth'>;
  activityStore?: CompanionActivityStore;
  /** Runs the REST activation body under the lane's mutation gate. */
  activateLane(channelId: string): Promise<ChannelActivationResult[]>;
  /** Runs the REST deactivate body under the lane's mutation gate. */
  deactivateLane(channelId: string): Promise<{ closedSessionCount: number }>;
  /** SPEC-124 Phase 2: one hidden turn in the lane's session. Omitted, the loop only keeps Cats awake. */
  speak?(request: CompanionHeartbeatRequest): Promise<CompanionHeartbeatResult>;
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
      };
      memory.set(catId, entry);
    }
    return entry;
  }

  function scheduleHeartbeat(remembered: CatLifeMemory, kind: 'wake' | 'regular', fromMs: number): void {
    remembered.heartbeatKind = kind;
    remembered.nextHeartbeatAt = fromMs + pickCompanionHeartbeatDelayMs(kind, random);
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
  ): void {
    const greetable = now.getTime() - wakeAt.getTime() < WAKE_GREETING_WINDOW_MS
      && !laneHasHeartbeatSince(lane, wakeAt, ['wake']);
    scheduleHeartbeat(remembered, greetable ? 'wake' : 'regular', now.getTime());
  }

  function forgetAwake(remembered: CatLifeMemory): void {
    remembered.awakeSince = null;
    remembered.nextHeartbeatAt = null;
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

      if (desired.presence === 'awake') {
        if (lease?.status === 'initializing') {
          record('waking');
          continue;
        }
        if (lease?.status === 'ready' && lease.sessionId) {
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
            if (remembered.nextHeartbeatAt === null) {
              scheduleFirstHeartbeat(remembered, lane, resolveCompanionRhythm(life, cat.id, now).wakeAt, now);
            }
            const heartbeat = await maybeSpeak({
              remembered,
              catId: cat.id,
              lane,
              sessionId: lease.sessionId,
              now,
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
          scheduleFirstHeartbeat(remembered, lane, resolveCompanionRhythm(life, cat.id, now).wakeAt, now);
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
            lastOwnerMessageAt: findLastOwnerMessageAt(lane),
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
  async function maybeSpeak(input: {
    remembered: CatLifeMemory;
    catId: string;
    lane: ChatState['channels'][number];
    sessionId: string;
    now: Date;
  }): Promise<CompanionLifeTickEntry['heartbeat'] | undefined> {
    const { remembered, lane, now } = input;
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
      scheduleHeartbeat(remembered, 'regular', lastMessageAt + COMPANION_HEARTBEAT_QUIET_LANE_MS);
      return undefined;
    }
    const kind = remembered.heartbeatKind;
    const result = await dependencies.speak({
      catId: input.catId,
      laneId: lane.id,
      sessionId: input.sessionId,
      kind,
      now,
      awakeSince: remembered.awakeSince === null ? null : new Date(remembered.awakeSince),
      lastOwnerMessageAt: findLastOwnerMessageAt(lane),
    });
    if (result === 'busy') {
      remembered.nextHeartbeatAt = now.getTime() + HEARTBEAT_BUSY_RETRY_MS;
    } else if (result === 'failed') {
      remembered.heartbeatKind = 'regular';
      remembered.nextHeartbeatAt = now.getTime() + HEARTBEAT_FAILED_RETRY_MS;
    } else {
      scheduleHeartbeat(remembered, 'regular', now.getTime());
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
): () => void {
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
  return () => {
    stopped = true;
    clearTimeout(startup);
    clearInterval(timer);
  };
}
