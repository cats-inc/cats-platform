import type {
  WorkScheduleConcurrencyPolicy,
  WorkScheduleExecutionPolicy,
  WorkScheduleMisfirePolicy,
  WorkScheduleRule,
  WorkScheduleRetryBackoff,
  WorkScheduleTriggerReason,
  WorkScheduleTriggerReceipt,
  WorkScheduleTriggerReceiptStatus,
} from '../../api/schedules.js';
import type {
  MessageInterpolationValues,
  MessageKey,
} from '../../../../../shared/i18n/index.js';
import { createTranslator } from '../../../../../shared/i18n/index.js';

export type ScheduleUiI18n = (key: MessageKey, values?: MessageInterpolationValues) => string;

const fallbackDateI18n: ScheduleUiI18n = createTranslator('en');

export function formatScheduleSummary(
  rule: WorkScheduleRule,
  t?: ScheduleUiI18n,
): string {
  const translate = t ?? fallbackDateI18n;
  if (rule.schedule.kind === 'once') {
    return translate("workScheduleSummaryOnceAt", {
      dateTime: formatDateTime(rule.schedule.fireAt, rule.timezone, t),
    });
  }

  return translate("workScheduleSummaryDailyAt", {
    time: rule.schedule.time,
    timezone: rule.timezone,
  });
}

export function formatDateTime(
  value: string | null,
  timezone?: string | null,
  t?: ScheduleUiI18n,
): string {
  const translate = t ?? fallbackDateI18n;
  if (!value) {
    return translate("workScheduleDateNone");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone?.trim() || undefined,
  }).format(date);
}

const SCHEDULE_RECEIPT_STATUS_KEYS: Record<WorkScheduleTriggerReceiptStatus, MessageKey> = {
  claimed: "workScheduleReceiptStatusClaimed",
  admitted: "workScheduleReceiptStatusAdmitted",
  duplicate: "workScheduleReceiptStatusDuplicate",
  skipped: "workScheduleReceiptStatusSkipped",
  failed: "workScheduleReceiptStatusFailed",
};

const SCHEDULE_TRIGGER_REASON_KEYS: Record<WorkScheduleTriggerReason, MessageKey> = {
  due: "workScheduleTriggerReasonDue",
  manual_test: "workScheduleTriggerReasonManualTest",
  startup_misfire: "workScheduleTriggerReasonStartupMisfire",
  retry: "workScheduleTriggerReasonRetry",
};

const SCHEDULE_MISSION_POLICY_KEYS: Record<
  WorkScheduleExecutionPolicy["missionPolicy"],
  MessageKey
> = {
  per_fire: "workScheduleMissionPolicyPerFire",
};

const SCHEDULE_CONCURRENCY_POLICY_KEYS: Record<WorkScheduleConcurrencyPolicy, MessageKey> = {
  skip: "workScheduleConcurrencyPolicySkip",
  queue: "workScheduleConcurrencyPolicyQueue",
  replace: "workScheduleConcurrencyPolicyReplace",
};

const SCHEDULE_MISFIRE_POLICY_KEYS: Record<WorkScheduleMisfirePolicy, MessageKey> = {
  skip: "workScheduleMisfirePolicySkip",
  fire_once: "workScheduleMisfirePolicyFireOnce",
  fire_all: "workScheduleMisfirePolicyFireAll",
};

const SCHEDULE_RETRY_BACKOFF_KEYS: Record<WorkScheduleRetryBackoff, MessageKey> = {
  none: "workScheduleRetryBackoffNone",
  fixed: "workScheduleRetryBackoffFixed",
  exponential: "workScheduleRetryBackoffExponential",
};

export function getScheduleReceiptStatusLabel(
  status: WorkScheduleTriggerReceiptStatus,
  t: ScheduleUiI18n,
): string {
  return t(SCHEDULE_RECEIPT_STATUS_KEYS[status]);
}

export function getScheduleTriggerReasonLabel(
  reason: WorkScheduleTriggerReason,
  t: ScheduleUiI18n,
): string {
  return t(SCHEDULE_TRIGGER_REASON_KEYS[reason]);
}

export function getScheduleMissionPolicyLabel(
  policy: WorkScheduleExecutionPolicy["missionPolicy"],
  t: ScheduleUiI18n,
): string {
  return t(SCHEDULE_MISSION_POLICY_KEYS[policy]);
}

export function getScheduleConcurrencyPolicyLabel(
  policy: WorkScheduleConcurrencyPolicy,
  t: ScheduleUiI18n,
): string {
  return t(SCHEDULE_CONCURRENCY_POLICY_KEYS[policy]);
}

export function getScheduleMisfirePolicyLabel(
  policy: WorkScheduleMisfirePolicy,
  t: ScheduleUiI18n,
): string {
  return t(SCHEDULE_MISFIRE_POLICY_KEYS[policy]);
}

export function getScheduleRetryBackoffLabel(
  backoff: WorkScheduleRetryBackoff,
  t: ScheduleUiI18n,
): string {
  return t(SCHEDULE_RETRY_BACKOFF_KEYS[backoff]);
}

export interface ScheduleAuditExport {
  exportedAt: string;
  rules: ReadonlyArray<WorkScheduleRule>;
  triggerReceipts: ReadonlyArray<WorkScheduleTriggerReceipt>;
}

export function buildScheduleAuditExport(input: {
  exportedAt: string;
  rules: ReadonlyArray<WorkScheduleRule>;
  triggerReceipts: ReadonlyArray<WorkScheduleTriggerReceipt>;
}): ScheduleAuditExport {
  return {
    exportedAt: input.exportedAt,
    rules: input.rules.map((rule) => structuredClone(rule)),
    triggerReceipts: input.triggerReceipts.map((receipt) => structuredClone(receipt)),
  };
}

export function serializeScheduleAuditExport(exportPayload: ScheduleAuditExport): string {
  return `${JSON.stringify(exportPayload, null, 2)}\n`;
}
