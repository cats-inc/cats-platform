import type {
  ScheduleRule,
  ScheduleTriggerReason,
} from './contracts.js';

export interface ScheduleDueFire {
  scheduledFireAt: string;
  reason: ScheduleTriggerReason;
}

export function buildScheduleIdempotencyKey(input: {
  ruleId: string;
  ruleRevision: number;
  scheduledFireAt: string;
  reason: ScheduleTriggerReason;
  actualFireAt: string;
}): string {
  if (input.reason === 'manual_test') {
    return [
      'schedule-test',
      input.ruleId,
      input.ruleRevision,
      input.actualFireAt,
    ].join(':');
  }

  return [
    'schedule',
    input.ruleId,
    input.ruleRevision,
    input.scheduledFireAt,
  ].join(':');
}

export function computeNextFireAt(
  rule: ScheduleRule,
  from: Date = new Date(),
): string | null {
  if (!rule.enabled) {
    return null;
  }

  if (rule.schedule.kind === 'once') {
    const fireAt = new Date(rule.schedule.fireAt);
    return fireAt.getTime() > from.getTime() ? fireAt.toISOString() : null;
  }

  return computeNextDailyFireAt(rule.schedule.time, rule.timezone, from).toISOString();
}

export function collectDueFires(input: {
  rule: ScheduleRule;
  now: Date;
  startup?: boolean;
  maxFireAll?: number;
}): ScheduleDueFire[] {
  if (!input.rule.enabled || !input.rule.nextFireAt) {
    return [];
  }

  const nextFireAt = new Date(input.rule.nextFireAt);
  if (!Number.isFinite(nextFireAt.getTime()) || nextFireAt.getTime() > input.now.getTime()) {
    return [];
  }

  if (!input.startup) {
    return [{
      scheduledFireAt: nextFireAt.toISOString(),
      reason: 'due',
    }];
  }

  const reason = 'startup_misfire' as const;
  if (input.rule.executionPolicy.misfirePolicy === 'skip') {
    return [{
      scheduledFireAt: nextFireAt.toISOString(),
      reason,
    }];
  }

  if (
    input.rule.executionPolicy.misfirePolicy === 'fire_once'
    || input.rule.schedule.kind === 'once'
  ) {
    return [{
      scheduledFireAt: nextFireAt.toISOString(),
      reason,
    }];
  }

  const maxFireAll = input.maxFireAll ?? 32;
  const fires: ScheduleDueFire[] = [];
  let cursor: Date | null = nextFireAt;
  while (cursor && cursor.getTime() <= input.now.getTime() && fires.length < maxFireAll) {
    fires.push({
      scheduledFireAt: cursor.toISOString(),
      reason,
    });
    cursor = computeNextFireAfter(input.rule, cursor);
  }

  return fires;
}

export function computeNextFireAfter(
  rule: ScheduleRule,
  scheduledFireAt: Date,
): Date | null {
  if (rule.schedule.kind === 'once') {
    return null;
  }

  return computeNextDailyFireAt(
    rule.schedule.time,
    rule.timezone,
    new Date(scheduledFireAt.getTime() + 60_000),
  );
}

function computeNextDailyFireAt(
  time: string,
  timezone: string,
  from: Date,
): Date {
  const [hourPart, minutePart] = time.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  const local = getZonedDateParts(from, timezone);
  let candidate = zonedLocalTimeToUtc({
    year: local.year,
    month: local.month,
    day: local.day,
    hour,
    minute,
    second: 0,
    timezone,
  });

  if (candidate.getTime() <= from.getTime()) {
    const nextLocalDate = addLocalDays(local.year, local.month, local.day, 1);
    candidate = zonedLocalTimeToUtc({
      ...nextLocalDate,
      hour,
      minute,
      second: 0,
      timezone,
    });
  }

  return candidate;
}

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = new Map(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    hour: Number(parts.get('hour')),
    minute: Number(parts.get('minute')),
    second: Number(parts.get('second')),
  };
}

function zonedLocalTimeToUtc(input: ZonedDateParts & { timezone: string }): Date {
  const targetAsUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second,
  );
  let guess = targetAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getZonedDateParts(new Date(guess), input.timezone);
    const actualAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const delta = targetAsUtc - actualAsUtc;
    if (delta === 0) {
      return new Date(guess);
    }
    guess += delta;
  }

  return new Date(guess);
}

function addLocalDays(
  year: number,
  month: number,
  day: number,
  days: number,
): Pick<ZonedDateParts, 'year' | 'month' | 'day'> {
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
