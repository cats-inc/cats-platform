import { randomUUID } from 'node:crypto';

import { CoreValidationError } from '../../core/errors.js';
import type {
  MissionTemplate,
  ScheduleDefinition,
  ScheduleExecutionPolicy,
  ScheduleRule,
  ScheduleRuleCreateInput,
  ScheduleRuleUpdateInput,
  ScheduleTargetRef,
  ScheduleTriggerReceipt,
} from './contracts.js';
import { SCHEDULER_STATE_VERSION, type SchedulerState } from './contracts.js';

const DAILY_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new CoreValidationError(`${fieldName} must be an object.`, `${fieldName}_invalid`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CoreValidationError(`${fieldName} is required.`, `${fieldName}_required`);
  }
  return value.trim();
}

function readOptionalBoolean(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new CoreValidationError(`${fieldName} must be a boolean.`, `${fieldName}_invalid`);
  }
  return value;
}

function readOptionalRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return structuredClone(readRecord(value, fieldName));
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new CoreValidationError(`${fieldName} must be an array.`, `${fieldName}_invalid`);
  }
  return value
    .map((item, index) => readRequiredString(item, `${fieldName}.${index}`))
    .filter((item, index, items) => items.indexOf(item) === index);
}

function readOptionalRecordArray(
  value: unknown,
  fieldName: string,
): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new CoreValidationError(`${fieldName} must be an array.`, `${fieldName}_invalid`);
  }
  return value.map((item, index) => structuredClone(readRecord(item, `${fieldName}.${index}`)));
}

function assertSupportedTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new CoreValidationError('Schedule timezone is invalid.', 'schedule_timezone_invalid');
  }
}

function normalizeScheduleTarget(value: unknown): ScheduleTargetRef {
  const target = readRecord(value, 'missionTemplate.target');
  const kind = readRequiredString(target.kind, 'missionTemplate.target.kind');
  if (kind !== 'cat' && kind !== 'agent') {
    throw new CoreValidationError(
      'Mission template target kind must be cat or agent.',
      'schedule_target_kind_invalid',
    );
  }

  return {
    kind,
    id: readRequiredString(target.id, 'missionTemplate.target.id'),
  };
}

export function normalizeScheduleDefinition(value: unknown): ScheduleDefinition {
  const schedule = readRecord(value, 'schedule');
  const kind = readRequiredString(schedule.kind, 'schedule.kind');
  if (kind === 'cron') {
    throw new CoreValidationError(
      'Cron schedule rules are not supported in v1.',
      'schedule_cron_unsupported',
    );
  }
  if (kind === 'once') {
    const fireAt = readRequiredString(schedule.fireAt, 'schedule.fireAt');
    const parsed = Date.parse(fireAt);
    if (!Number.isFinite(parsed)) {
      throw new CoreValidationError('schedule.fireAt must be an ISO timestamp.', 'schedule_fire_at_invalid');
    }
    return { kind, fireAt: new Date(parsed).toISOString() };
  }
  if (kind === 'daily') {
    const time = readRequiredString(schedule.time, 'schedule.time');
    if (!DAILY_TIME_PATTERN.test(time)) {
      throw new CoreValidationError(
        'Daily schedule time must be HH:mm in 24-hour local time.',
        'schedule_daily_time_invalid',
      );
    }
    return { kind, time };
  }

  throw new CoreValidationError(
    'Schedule kind must be once or daily.',
    'schedule_kind_invalid',
  );
}

export function normalizeMissionTemplate(value: unknown): MissionTemplate {
  const template = readRecord(value, 'missionTemplate');
  const originSurface = readRequiredString(
    template.originSurface,
    'missionTemplate.originSurface',
  );
  if (originSurface !== 'schedule') {
    throw new CoreValidationError(
      'Mission template originSurface must be schedule.',
      'schedule_origin_surface_invalid',
    );
  }

  const transportTargetsValue = template.transportTargets;
  const transportTargets = (() => {
    if (transportTargetsValue === undefined) {
      return undefined;
    }
    if (!Array.isArray(transportTargetsValue)) {
      throw new CoreValidationError(
        'missionTemplate.transportTargets must be an array.',
        'schedule_transport_targets_invalid',
      );
    }
    return transportTargetsValue.map((item, index) => {
      const target = readRecord(item, `missionTemplate.transportTargets.${index}`);
      return {
        platform: readRequiredString(target.platform, `missionTemplate.transportTargets.${index}.platform`),
        bindingId: readRequiredString(
          target.bindingId,
          `missionTemplate.transportTargets.${index}.bindingId`,
        ),
      };
    });
  })();

  const conversationTarget = (() => {
    if (template.conversationTarget === undefined || template.conversationTarget === null) {
      return null;
    }
    const target = readRecord(template.conversationTarget, 'missionTemplate.conversationTarget');
    return {
      conversationId: readRequiredString(
        target.conversationId,
        'missionTemplate.conversationTarget.conversationId',
      ),
    };
  })();

  return {
    target: normalizeScheduleTarget(template.target),
    originSurface,
    intent: readRequiredString(template.intent, 'missionTemplate.intent'),
    conversationTarget,
    ...(transportTargets === undefined ? {} : { transportTargets }),
    ...(readOptionalRecordArray(template.resourceScopes, 'missionTemplate.resourceScopes') === undefined
      ? {}
      : {
          resourceScopes: readOptionalRecordArray(
            template.resourceScopes,
            'missionTemplate.resourceScopes',
          ),
        }),
    ...(readOptionalStringArray(template.toolScopes, 'missionTemplate.toolScopes') === undefined
      ? {}
      : { toolScopes: readOptionalStringArray(template.toolScopes, 'missionTemplate.toolScopes') }),
    ...(readOptionalRecord(template.approvalPolicy, 'missionTemplate.approvalPolicy') === undefined
      ? {}
      : { approvalPolicy: readOptionalRecord(template.approvalPolicy, 'missionTemplate.approvalPolicy') }),
    ...(readOptionalRecord(template.outputPolicy, 'missionTemplate.outputPolicy') === undefined
      ? {}
      : { outputPolicy: readOptionalRecord(template.outputPolicy, 'missionTemplate.outputPolicy') }),
  };
}

export function createDefaultScheduleExecutionPolicy(): ScheduleExecutionPolicy {
  return {
    missionPolicy: 'per_fire',
    concurrencyPolicy: 'skip',
    misfirePolicy: 'skip',
    retryPolicy: {
      maxAttempts: 0,
      backoff: 'none',
    },
  };
}

export function normalizeScheduleExecutionPolicy(value: unknown): ScheduleExecutionPolicy {
  const defaults = createDefaultScheduleExecutionPolicy();
  if (value === undefined) {
    return defaults;
  }

  const policy = readRecord(value, 'executionPolicy');
  const missionPolicy = policy.missionPolicy === undefined
    ? defaults.missionPolicy
    : readRequiredString(policy.missionPolicy, 'executionPolicy.missionPolicy');
  if (missionPolicy !== 'per_fire') {
    throw new CoreValidationError(
      'Schedule missionPolicy must be per_fire in v1.',
      'schedule_mission_policy_invalid',
    );
  }

  const concurrencyPolicy = policy.concurrencyPolicy === undefined
    ? defaults.concurrencyPolicy
    : readRequiredString(policy.concurrencyPolicy, 'executionPolicy.concurrencyPolicy');
  if (
    concurrencyPolicy !== 'skip'
    && concurrencyPolicy !== 'queue'
    && concurrencyPolicy !== 'replace'
  ) {
    throw new CoreValidationError(
      'Schedule concurrencyPolicy is invalid.',
      'schedule_concurrency_policy_invalid',
    );
  }
  if (concurrencyPolicy === 'replace') {
    throw new CoreValidationError(
      [
        'Schedule concurrencyPolicy replace is not supported until supervised',
        'cancellation lands.',
      ].join(' '),
      'schedule_concurrency_replace_unsupported',
    );
  }

  const misfirePolicy = policy.misfirePolicy === undefined
    ? defaults.misfirePolicy
    : readRequiredString(policy.misfirePolicy, 'executionPolicy.misfirePolicy');
  if (misfirePolicy !== 'skip' && misfirePolicy !== 'fire_once' && misfirePolicy !== 'fire_all') {
    throw new CoreValidationError(
      'Schedule misfirePolicy is invalid.',
      'schedule_misfire_policy_invalid',
    );
  }

  const retryPolicyRecord = policy.retryPolicy === undefined
    ? {}
    : readRecord(policy.retryPolicy, 'executionPolicy.retryPolicy');
  const maxAttempts = retryPolicyRecord.maxAttempts === undefined
    ? defaults.retryPolicy.maxAttempts
    : Number(retryPolicyRecord.maxAttempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 0) {
    throw new CoreValidationError(
      'Schedule retryPolicy.maxAttempts must be a non-negative integer.',
      'schedule_retry_max_attempts_invalid',
    );
  }
  const backoff = retryPolicyRecord.backoff === undefined
    ? defaults.retryPolicy.backoff
    : readRequiredString(retryPolicyRecord.backoff, 'executionPolicy.retryPolicy.backoff');
  if (backoff !== 'none' && backoff !== 'fixed' && backoff !== 'exponential') {
    throw new CoreValidationError(
      'Schedule retryPolicy.backoff is invalid.',
      'schedule_retry_backoff_invalid',
    );
  }

  return {
    missionPolicy,
    concurrencyPolicy,
    misfirePolicy,
    retryPolicy: {
      maxAttempts,
      backoff,
    },
  };
}

function serializeAdmissionFields(rule: Pick<
  ScheduleRule,
  'timezone' | 'schedule' | 'missionTemplate' | 'executionPolicy'
>): string {
  return JSON.stringify({
    timezone: rule.timezone,
    schedule: rule.schedule,
    missionTemplate: rule.missionTemplate,
    executionPolicy: rule.executionPolicy,
  });
}

export function createScheduleRule(
  input: ScheduleRuleCreateInput,
  now: Date = new Date(),
): ScheduleRule {
  const nowIso = now.toISOString();
  const title = readRequiredString(input.title, 'title');
  const timezone = readRequiredString(input.timezone, 'timezone');
  assertSupportedTimezone(timezone);

  return {
    id: input.id?.trim() || `schedule-${randomUUID()}`,
    title,
    enabled: readOptionalBoolean(input.enabled, true, 'enabled'),
    revision: 1,
    timezone,
    schedule: normalizeScheduleDefinition(input.schedule),
    missionTemplate: normalizeMissionTemplate(input.missionTemplate),
    executionPolicy: normalizeScheduleExecutionPolicy(input.executionPolicy),
    createdAt: nowIso,
    updatedAt: nowIso,
    createdByActorId: readRequiredString(input.createdByActorId, 'createdByActorId'),
    nextFireAt: null,
    lastFireAt: null,
    lastRunId: null,
    lastFailure: null,
  };
}

export function updateScheduleRule(
  existing: ScheduleRule,
  input: ScheduleRuleUpdateInput,
  now: Date = new Date(),
): ScheduleRule {
  const beforeAdmissionFields = serializeAdmissionFields(existing);
  const timezone = input.timezone === undefined
    ? existing.timezone
    : readRequiredString(input.timezone, 'timezone');
  assertSupportedTimezone(timezone);

  const next: ScheduleRule = {
    ...existing,
    title: input.title === undefined ? existing.title : readRequiredString(input.title, 'title'),
    enabled: readOptionalBoolean(input.enabled, existing.enabled, 'enabled'),
    timezone,
    schedule: input.schedule === undefined
      ? structuredClone(existing.schedule)
      : normalizeScheduleDefinition(input.schedule),
    missionTemplate: input.missionTemplate === undefined
      ? structuredClone(existing.missionTemplate)
      : normalizeMissionTemplate(input.missionTemplate),
    executionPolicy: input.executionPolicy === undefined
      ? structuredClone(existing.executionPolicy)
      : normalizeScheduleExecutionPolicy(input.executionPolicy),
    updatedAt: now.toISOString(),
    lastFailure: input.enabled === true ? null : existing.lastFailure,
  };
  const afterAdmissionFields = serializeAdmissionFields(next);

  return {
    ...next,
    revision: beforeAdmissionFields === afterAdmissionFields
      ? existing.revision
      : existing.revision + 1,
  };
}

export function createEmptySchedulerState(now: Date = new Date()): SchedulerState {
  return {
    version: SCHEDULER_STATE_VERSION,
    updatedAt: now.toISOString(),
    rules: [],
    triggerReceipts: [],
  };
}

export function normalizeSchedulerState(value: unknown, now: Date = new Date()): SchedulerState {
  if (!isRecord(value)) {
    return createEmptySchedulerState(now);
  }
  const rules = Array.isArray(value.rules)
    ? value.rules.filter(isScheduleRule)
    : [];
  const triggerReceipts = Array.isArray(value.triggerReceipts)
    ? value.triggerReceipts.filter(isScheduleTriggerReceipt)
    : [];

  return {
    version: SCHEDULER_STATE_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now.toISOString(),
    rules: structuredClone(rules),
    triggerReceipts: structuredClone(triggerReceipts),
  };
}

function isScheduleRule(value: unknown): value is ScheduleRule {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.enabled === 'boolean'
    && typeof value.revision === 'number'
    && typeof value.timezone === 'string'
    && isRecord(value.schedule)
    && isRecord(value.missionTemplate)
    && isRecord(value.executionPolicy)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && typeof value.createdByActorId === 'string';
}

function isScheduleTriggerReceipt(value: unknown): value is ScheduleTriggerReceipt {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.ruleId === 'string'
    && typeof value.ruleRevision === 'number'
    && typeof value.scheduledFireAt === 'string'
    && typeof value.actualFireAt === 'string'
    && typeof value.idempotencyKey === 'string'
    && typeof value.reason === 'string'
    && typeof value.status === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}
