import type {
  WorkScheduleCreateInput,
  WorkScheduleRule,
  WorkScheduleTriggerReceipt,
} from '../../api/schedules.js';

export const DAILY_MORNING_GREETING_TITLE = 'Daily morning greeting';
export const DAILY_MORNING_GREETING_DEFAULT_TIME = '08:00';

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
