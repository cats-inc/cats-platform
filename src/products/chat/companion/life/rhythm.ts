import type { CompanionLifeProfile } from '../contracts.js';
import { COMPANION_LIFE_DEFAULTS, parseClockMinutes } from './profile.js';

/**
 * SPEC-124 FR-4..FR-8. All clock math is host-local time: Cats runs on the
 * owner's machine, so its local day is the owner's day.
 */

export type CompanionRhythmPhase = 'awake_hours' | 'rest_hours';

export type CompanionDesiredPresence =
  | { presence: 'awake' }
  | { presence: 'sleeping'; reason: 'owner' | 'rest' };

export interface CompanionRhythm {
  phase: CompanionRhythmPhase;
  /** Today's wake time. */
  wakeAt: Date;
  /** The next wake time strictly after `now`. */
  nextWakeAt: Date;
}

type RhythmProfile = Pick<CompanionLifeProfile, 'bedtime' | 'wakeWindowStart' | 'wakeWindowEnd'>;

function clockOrDefault(value: string, fallback: string): number {
  return parseClockMinutes(value) ?? parseClockMinutes(fallback)!;
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** FNV-1a: a stable, dependency-free spread for the daily wake offset. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** FR-4: the same Cat wakes at the same minute all day, so a restart never re-rolls it. */
export function resolveCompanionWakeTime(
  life: RhythmProfile,
  catId: string,
  day: Date,
): Date {
  const start = clockOrDefault(life.wakeWindowStart, COMPANION_LIFE_DEFAULTS.wakeWindowStart);
  const end = Math.max(start, clockOrDefault(life.wakeWindowEnd, COMPANION_LIFE_DEFAULTS.wakeWindowEnd));
  const offset = hashString(`${catId}:${localDateKey(day)}`) % (end - start + 1);
  const minutes = start + offset;
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
  );
}

export function resolveCompanionRhythm(
  life: RhythmProfile,
  catId: string,
  now: Date,
): CompanionRhythm {
  const wakeAt = resolveCompanionWakeTime(life, catId, now);
  const wakeMinutes = wakeAt.getHours() * 60 + wakeAt.getMinutes();
  const bedtime = clockOrDefault(life.bedtime, COMPANION_LIFE_DEFAULTS.bedtime);
  const minutes = now.getHours() * 60 + now.getMinutes();
  // FR-5: a bedtime at or before the wake minute means bedtime is after midnight.
  const awake = bedtime > wakeMinutes
    ? minutes >= wakeMinutes && minutes < bedtime
    : minutes >= wakeMinutes || minutes < bedtime;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    phase: awake ? 'awake_hours' : 'rest_hours',
    wakeAt,
    nextWakeAt: now < wakeAt ? wakeAt : resolveCompanionWakeTime(life, catId, tomorrow),
  };
}

/** FR-8. `enabled` is the caller's concern (FR-7). */
export function resolveCompanionDesiredPresence(
  life: CompanionLifeProfile,
  catId: string,
  now: Date,
): CompanionDesiredPresence {
  if (life.sleepUntil && Date.parse(life.sleepUntil) > now.getTime()) {
    return { presence: 'sleeping', reason: 'owner' };
  }
  return resolveCompanionRhythm(life, catId, now).phase === 'rest_hours'
    ? { presence: 'sleeping', reason: 'rest' }
    : { presence: 'awake' };
}
