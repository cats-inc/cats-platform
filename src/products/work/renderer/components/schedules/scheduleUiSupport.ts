import type {
  WorkScheduleRule,
  WorkScheduleTriggerReceipt,
} from '../../api/schedules.js';

export function formatScheduleSummary(rule: WorkScheduleRule): string {
  if (rule.schedule.kind === 'once') {
    return `Once at ${formatDateTime(rule.schedule.fireAt, rule.timezone)}`;
  }

  return `Daily at ${rule.schedule.time} ${rule.timezone}`;
}

export function formatDateTime(value: string | null, timezone?: string | null): string {
  if (!value) {
    return 'None';
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
