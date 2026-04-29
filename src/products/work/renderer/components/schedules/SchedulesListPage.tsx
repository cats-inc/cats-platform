import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppShellPayload } from '../../../api/contracts.js';
import {
  createWorkSchedule,
  listWorkSchedules,
  testFireWorkSchedule,
  updateWorkSchedule,
  type WorkScheduleRule,
  type WorkScheduleTriggerReceipt,
} from '../../api/schedules.js';
import { formatRelative } from '../topdown/shared';
import {
  formatDateTime,
  formatScheduleSummary,
  receiptsForRule,
  resolveDailyMorningGreetingShortcut,
  resolveLocalTimezone,
} from './scheduleUiSupport.js';
import './schedules.css';

interface SchedulesListPageProps {
  payload: AppShellPayload;
}

type FetchStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ScheduleSnapshot {
  rules: WorkScheduleRule[];
  triggerReceipts: WorkScheduleTriggerReceipt[];
}

const EMPTY_SNAPSHOT: ScheduleSnapshot = {
  rules: [],
  triggerReceipts: [],
};

export function SchedulesListPage({ payload }: SchedulesListPageProps): JSX.Element {
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setStatus('loading');
    setError(null);
    try {
      const next = await listWorkSchedules(signal);
      setSnapshot({
        rules: next.rules,
        triggerReceipts: next.triggerReceipts,
      });
      setStatus('ready');
    } catch (err) {
      if (signal?.aborted) {
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load schedules.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const timezone = useMemo(resolveLocalTimezone, []);
  const shortcut = useMemo(() =>
    resolveDailyMorningGreetingShortcut({
      payload,
      rules: snapshot.rules,
      timezone,
    }),
  [payload, snapshot.rules, timezone]);

  const receiptsByRule = useMemo(() => {
    const map = new Map<string, WorkScheduleTriggerReceipt[]>();
    for (const rule of snapshot.rules) {
      map.set(rule.id, receiptsForRule(snapshot.triggerReceipts, rule.id));
    }
    return map;
  }, [snapshot.rules, snapshot.triggerReceipts]);

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    setBusyAction(key);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Schedule action failed.');
    } finally {
      setBusyAction(null);
    }
  }, [load]);

  const createMorningGreeting = useCallback(() => {
    if (!shortcut.available || shortcut.existingRule) {
      return;
    }
    void runAction('create-morning-greeting', async () => {
      await createWorkSchedule(shortcut.input);
    });
  }, [runAction, shortcut]);

  const toggleRule = useCallback((rule: WorkScheduleRule) => {
    void runAction(`toggle:${rule.id}`, async () => {
      await updateWorkSchedule(rule.id, { enabled: !rule.enabled });
    });
  }, [runAction]);

  const testFireRule = useCallback((rule: WorkScheduleRule) => {
    void runAction(`test:${rule.id}`, async () => {
      await testFireWorkSchedule(rule.id);
    });
  }, [runAction]);

  const createDisabled =
    !shortcut.available ||
    Boolean(shortcut.available && shortcut.existingRule) ||
    busyAction !== null;

  return (
    <div className="schedulesList">
      <header className="channelTopBar schedulesListTopBar">
        <div className="channelTopBarStart schedulesListTopBar__start">
          <h1 className="channelTopBarTitle schedulesListTopBar__title">Schedules</h1>
          <span className="schedulesListTopBar__count">{snapshot.rules.length}</span>
        </div>
        <div className="channelTopBarCenter schedulesListTopBar__center">
          <p className="schedulesListTopBar__lede">
            Scheduled execution fires only while Cats is running in v1.
          </p>
        </div>
        <div className="channelTopBarEnd schedulesListTopBar__end">
          <button
            type="button"
            className="schedulesList__secondaryButton"
            onClick={() => void load()}
            disabled={busyAction !== null || status === 'loading'}
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="schedulesList__main">
        <section className="schedulesList__shortcutBand" aria-label="Schedule shortcuts">
          <div className="schedulesList__shortcutText">
            <h2 className="schedulesList__sectionTitle">Daily greeting</h2>
            <p className="schedulesList__sectionCopy">
              Creates a generic daily schedule that launches a Cat mission with
              declared companion-content and Telegram delivery tools.
            </p>
            {shortcut.available ? (
              <p className="schedulesList__shortcutMeta">
                {shortcut.catName} · {shortcut.bindingName} · {timezone}
              </p>
            ) : (
              <p className="schedulesList__shortcutMeta">{shortcut.message}</p>
            )}
          </div>
          <button
            type="button"
            className="schedulesList__primaryButton"
            onClick={createMorningGreeting}
            disabled={createDisabled}
          >
            {shortcut.available && shortcut.existingRule
              ? 'Daily greeting exists'
              : busyAction === 'create-morning-greeting'
                ? 'Creating...'
                : 'Create daily greeting'}
          </button>
        </section>

        {actionError ? (
          <p className="schedulesList__error" role="alert">
            {actionError}
          </p>
        ) : null}
        {status === 'error' && error ? (
          <p className="schedulesList__error" role="alert">
            {error}
          </p>
        ) : null}

        {status === 'loading' && snapshot.rules.length === 0 ? (
          <p className="schedulesList__empty">Loading schedules...</p>
        ) : snapshot.rules.length === 0 ? (
          <p className="schedulesList__empty">
            No schedules yet. Create the daily greeting shortcut or add a rule through the API.
          </p>
        ) : (
          <ul className="schedulesList__list">
            {snapshot.rules
              .slice()
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((rule) => (
                <ScheduleRow
                  key={rule.id}
                  rule={rule}
                  receipts={receiptsByRule.get(rule.id) ?? []}
                  busyAction={busyAction}
                  onToggle={toggleRule}
                  onTestFire={testFireRule}
                />
              ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function ScheduleRow({
  rule,
  receipts,
  busyAction,
  onToggle,
  onTestFire,
}: {
  rule: WorkScheduleRule;
  receipts: readonly WorkScheduleTriggerReceipt[];
  busyAction: string | null;
  onToggle: (rule: WorkScheduleRule) => void;
  onTestFire: (rule: WorkScheduleRule) => void;
}): JSX.Element {
  const latestReceipt = receipts[0] ?? null;
  const lastRunId = rule.lastRunId ?? latestReceipt?.runId ?? null;
  const lastFailure = rule.lastFailure ??
    (latestReceipt?.status === 'failed' ? latestReceipt.message : null);
  const skippedReceipt = latestReceipt?.status === 'skipped' ? latestReceipt : null;
  const toggleBusy = busyAction === `toggle:${rule.id}`;
  const testBusy = busyAction === `test:${rule.id}`;

  return (
    <li className="schedulesList__row">
      <div className="schedulesList__rowHead">
        <div className="schedulesList__rowTitleBlock">
          <span
            className={
              'schedulesList__dot' +
              (rule.enabled ? ' schedulesList__dot--enabled' : ' schedulesList__dot--disabled')
            }
            aria-hidden="true"
          />
          <div className="schedulesList__rowText">
            <span className="schedulesList__rowTitle">{rule.title}</span>
            <span className="schedulesList__rowSummary">{formatScheduleSummary(rule)}</span>
          </div>
        </div>
        <div className="schedulesList__actions">
          <button
            type="button"
            className="schedulesList__secondaryButton"
            onClick={() => onTestFire(rule)}
            disabled={busyAction !== null}
          >
            {testBusy ? 'Firing...' : 'Test fire'}
          </button>
          <button
            type="button"
            className="schedulesList__secondaryButton"
            onClick={() => onToggle(rule)}
            disabled={busyAction !== null}
          >
            {toggleBusy ? 'Updating...' : rule.enabled ? 'Disable' : 'Enable'}
          </button>
          <span
            className={
              'schedulesList__statusPill' +
              (rule.enabled
                ? ' schedulesList__statusPill--enabled'
                : ' schedulesList__statusPill--disabled')
            }
          >
            {rule.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>
      </div>

      <dl className="schedulesList__metrics">
        <Metric label="Next fire" value={formatDateTime(rule.nextFireAt, rule.timezone)} />
        <Metric label="Last scheduled fire" value={formatDateTime(rule.lastFireAt, rule.timezone)} />
        <Metric label="Last run" value={lastRunId ?? 'None'} mono={Boolean(lastRunId)} />
        <Metric label="Revision" value={`r${rule.revision}`} />
      </dl>

      <div className="schedulesList__diagnostics">
        {!rule.enabled ? (
          <DiagnosticPill tone="muted" text="Disabled: no future fires will be evaluated." />
        ) : null}
        {lastFailure ? (
          <DiagnosticPill tone="bad" text={`Last failure: ${lastFailure}`} />
        ) : null}
        {skippedReceipt ? (
          <DiagnosticPill
            tone="warn"
            text={`Skipped ${skippedReceipt.reason}: ${skippedReceipt.message ?? 'no detail'}`}
          />
        ) : null}
        {latestReceipt ? (
          <DiagnosticPill
            tone={latestReceipt.status === 'failed'
              ? 'bad'
              : latestReceipt.status === 'skipped'
                ? 'warn'
                : 'ok'}
            text={`Last trigger ${latestReceipt.status} · ${latestReceipt.reason} · ${
              formatRelative(latestReceipt.actualFireAt)
            }`}
          />
        ) : (
          <DiagnosticPill tone="muted" text="No trigger history yet." />
        )}
      </div>
    </li>
  );
}

function Metric({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="schedulesList__metric">
      <dt>{label}</dt>
      <dd className={mono ? 'schedulesList__metricValue--mono' : undefined}>
        {value}
      </dd>
    </div>
  );
}

function DiagnosticPill({
  tone,
  text,
}: {
  tone: 'ok' | 'warn' | 'bad' | 'muted';
  text: string;
}): JSX.Element {
  return (
    <span className={`schedulesList__diagnostic schedulesList__diagnostic--${tone}`}>
      {text}
    </span>
  );
}
