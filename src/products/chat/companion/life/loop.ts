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
import { resolveCompanionDesiredPresence } from './rhythm.js';

/** SPEC-124 FR-12: a lane quieter than this may fall asleep. */
export const COMPANION_IDLE_SLEEP_MS = 15 * 60_000;
/** SPEC-124 FR-11. */
export const COMPANION_WAKE_BACKOFF_MS = 5 * 60_000;

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
}

interface CatLifeMemory {
  backoffUntil: number;
  failureRecorded: boolean;
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

  function rememberFor(catId: string): CatLifeMemory {
    let entry = memory.get(catId);
    if (!entry) {
      entry = { backoffUntil: 0, failureRecorded: false };
      memory.set(catId, entry);
    }
    return entry;
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
            record('awake');
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
      record('slept', reason);
    }
    return entries;
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
