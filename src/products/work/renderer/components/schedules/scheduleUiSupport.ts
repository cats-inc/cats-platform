import type {
  WorkScheduleCreateInput,
  WorkScheduleRule,
  WorkScheduleTargetRef,
  WorkScheduleTriggerReceipt,
} from '../../api/schedules.js';

export const DAILY_MORNING_GREETING_TITLE = 'Daily morning greeting';
export const DAILY_MORNING_GREETING_DEFAULT_TIME = '08:00';
export const DAILY_WORK_REVIEW_TITLE = 'Daily work review';
export const DAILY_CODE_CHECK_TITLE = 'Daily code check';
export const DAILY_MEMORY_FLUSH_TITLE = 'Daily memory flush';
export const DAILY_TRANSPORT_DIGEST_TITLE = 'Daily transport digest';

const DAILY_MORNING_GREETING_TOOLS = [
  'companion.content.list',
  'companion.content.read',
  'companion.content.post.create',
  'transport.telegram.text.send',
  'transport.telegram.media.send',
] as const;

interface ShortcutCatSummary {
  id: string;
  name: string;
  status: 'active' | 'archived';
}

interface ShortcutBotBindingSummary {
  id: string;
  platform: 'telegram' | 'line';
  botName: string;
  catId: string | null;
  status: 'active' | 'disabled';
  hasBotToken: boolean;
}

export interface ScheduleShortcutPayload {
  chat: {
    cats: ReadonlyArray<ShortcutCatSummary>;
    botBindings: ReadonlyArray<ShortcutBotBindingSummary>;
  };
}

export type DailyMorningGreetingShortcut =
  | {
      available: true;
      catId: string;
      catName: string;
      bindingId: string;
      bindingName: string;
      input: WorkScheduleCreateInput;
      existingRule: WorkScheduleRule | null;
    }
  | {
      available: false;
      reason: 'no_active_cat' | 'no_telegram_binding' | 'telegram_binding_not_ready';
      message: string;
    };

export function resolveLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function buildDailyMorningGreetingScheduleInput(input: {
  catId: string;
  bindingId: string;
  timezone?: string | null;
  time?: string | null;
}): WorkScheduleCreateInput {
  const timezone = input.timezone?.trim() || resolveLocalTimezone();
  const time = input.time?.trim() || DAILY_MORNING_GREETING_DEFAULT_TIME;

  return {
    title: DAILY_MORNING_GREETING_TITLE,
    enabled: true,
    timezone,
    schedule: {
      kind: 'daily',
      time,
    },
    missionTemplate: {
      target: {
        kind: 'cat',
        id: input.catId,
      },
      originSurface: 'schedule',
      intent: [
        'Send the owner a concise morning greeting through Telegram.',
        'Use the declared companion content tools when useful, and prefer',
        'bounded text or media delivery through the declared Telegram binding.',
      ].join(' '),
      transportTargets: [
        {
          platform: 'telegram',
          bindingId: input.bindingId,
        },
      ],
      resourceScopes: [
        {
          kind: 'companion_content',
          catId: input.catId,
        },
      ],
      toolScopes: [...DAILY_MORNING_GREETING_TOOLS],
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'fire_once',
      retryPolicy: {
        maxAttempts: 0,
        backoff: 'none',
        pauseAfterConsecutiveFailures: 3,
      },
    },
  };
}

export function buildDailyWorkReviewScheduleInput(input: {
  target: WorkScheduleTargetRef;
  timezone?: string | null;
  time?: string | null;
}): WorkScheduleCreateInput {
  return buildDailyOperationalScheduleInput({
    title: DAILY_WORK_REVIEW_TITLE,
    target: input.target,
    timezone: input.timezone,
    time: input.time ?? '17:00',
    intent: [
      'Review active Cats Work items, identify stale or blocked execution,',
      'and produce an operator-facing summary with recommended next actions.',
    ].join(' '),
  });
}

export function buildDailyCodeCheckScheduleInput(input: {
  target: WorkScheduleTargetRef;
  timezone?: string | null;
  time?: string | null;
}): WorkScheduleCreateInput {
  return buildDailyOperationalScheduleInput({
    title: DAILY_CODE_CHECK_TITLE,
    target: input.target,
    timezone: input.timezone,
    time: input.time ?? '18:00',
    intent: [
      'Review recent Cats Code execution context, check for unfinished code',
      'work, and produce a concise engineering follow-up summary.',
    ].join(' '),
  });
}

export function buildDailyMemoryFlushScheduleInput(input: {
  target: WorkScheduleTargetRef;
  timezone?: string | null;
  time?: string | null;
}): WorkScheduleCreateInput {
  return buildDailyOperationalScheduleInput({
    title: DAILY_MEMORY_FLUSH_TITLE,
    target: input.target,
    timezone: input.timezone,
    time: input.time ?? '21:00',
    intent: [
      'Review recent conversation and work context, identify durable memory',
      'candidates, and prepare a bounded owner-review summary.',
    ].join(' '),
  });
}

export function buildDailyTransportDigestScheduleInput(input: {
  target: WorkScheduleTargetRef;
  bindingId: string;
  timezone?: string | null;
  time?: string | null;
}): WorkScheduleCreateInput {
  const intent = [
    'Prepare a concise transport digest for the owner and send it through',
    'the declared Telegram binding when there is actionable activity.',
  ].join(' ');
  const base = buildDailyOperationalScheduleInput({
    title: DAILY_TRANSPORT_DIGEST_TITLE,
    target: input.target,
    timezone: input.timezone,
    time: input.time ?? '18:30',
    intent,
  });

  return {
    ...base,
    missionTemplate: {
      ...base.missionTemplate,
      transportTargets: [
        {
          platform: 'telegram',
          bindingId: input.bindingId,
        },
      ],
      toolScopes: ['transport.telegram.text.send'],
    },
  };
}

function buildDailyOperationalScheduleInput(input: {
  title: string;
  target: WorkScheduleTargetRef;
  intent: string;
  timezone?: string | null;
  time?: string | null;
}): WorkScheduleCreateInput {
  return {
    title: input.title,
    enabled: true,
    timezone: input.timezone?.trim() || resolveLocalTimezone(),
    schedule: {
      kind: 'daily',
      time: input.time?.trim() || '17:00',
    },
    missionTemplate: {
      target: input.target,
      originSurface: 'schedule',
      intent: input.intent,
    },
    executionPolicy: {
      missionPolicy: 'per_fire',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'fire_once',
      retryPolicy: {
        maxAttempts: 1,
        backoff: 'fixed',
        pauseAfterConsecutiveFailures: 3,
      },
    },
  };
}

export function resolveDailyMorningGreetingShortcut(input: {
  payload: ScheduleShortcutPayload;
  rules: ReadonlyArray<WorkScheduleRule>;
  timezone?: string | null;
}): DailyMorningGreetingShortcut {
  const activeCats = input.payload.chat.cats.filter((cat) => cat.status === 'active');
  if (activeCats.length === 0) {
    return {
      available: false,
      reason: 'no_active_cat',
      message: 'Add an active Cat before creating a daily greeting schedule.',
    };
  }

  const activeCatIds = new Set(activeCats.map((cat) => cat.id));
  const activeTelegramBindings = input.payload.chat.botBindings.filter((binding) =>
    binding.platform === 'telegram' &&
    binding.status === 'active' &&
    binding.catId !== null &&
    activeCatIds.has(binding.catId),
  );
  if (activeTelegramBindings.length === 0) {
    return {
      available: false,
      reason: 'no_telegram_binding',
      message: 'Connect an active Telegram binding to a Cat first.',
    };
  }

  const readyBinding = activeTelegramBindings.find((binding) => binding.hasBotToken);
  if (!readyBinding) {
    return {
      available: false,
      reason: 'telegram_binding_not_ready',
      message: 'The Telegram binding needs a bot token before it can send greetings.',
    };
  }

  const cat = activeCats.find((candidate) => candidate.id === readyBinding.catId) ?? activeCats[0];
  const binding = activeTelegramBindings.find((candidate) =>
    candidate.catId === cat.id && candidate.hasBotToken,
  ) ?? readyBinding;
  const existingRule = findDailyMorningGreetingRule(input.rules, {
    catId: cat.id,
    bindingId: binding.id,
  });

  return {
    available: true,
    catId: cat.id,
    catName: cat.name,
    bindingId: binding.id,
    bindingName: binding.botName,
    input: buildDailyMorningGreetingScheduleInput({
      catId: cat.id,
      bindingId: binding.id,
      timezone: input.timezone,
    }),
    existingRule,
  };
}

export function findDailyMorningGreetingRule(
  rules: ReadonlyArray<WorkScheduleRule>,
  target: { catId: string; bindingId: string },
): WorkScheduleRule | null {
  return rules.find((rule) =>
    rule.title === DAILY_MORNING_GREETING_TITLE &&
    rule.schedule.kind === 'daily' &&
    rule.missionTemplate.target.kind === 'cat' &&
    rule.missionTemplate.target.id === target.catId &&
    (rule.missionTemplate.transportTargets ?? []).some((transportTarget) =>
      transportTarget.platform === 'telegram' &&
      transportTarget.bindingId === target.bindingId,
    ),
  ) ?? null;
}

export function receiptsForRule(
  receipts: ReadonlyArray<WorkScheduleTriggerReceipt>,
  ruleId: string,
): WorkScheduleTriggerReceipt[] {
  return receipts
    .filter((receipt) => receipt.ruleId === ruleId)
    .slice()
    .sort((a, b) => b.actualFireAt.localeCompare(a.actualFireAt));
}

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
