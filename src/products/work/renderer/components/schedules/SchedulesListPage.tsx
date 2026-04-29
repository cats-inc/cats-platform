import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AppShellPayload } from '../../../api/contracts.js';
import {
  createWorkSchedule,
  listWorkSchedules,
  type WorkScheduleRule,
  type WorkScheduleTriggerReceipt,
} from '../../api/schedules.js';
import { formatRelative } from '../topdown/shared';
import { buildWorkSchedulePath } from '../../workPaths.js';
import {
  buildScheduleAuditExport,
  formatDateTime,
  formatScheduleSummary,
  resolveDailyMorningGreetingShortcut,
  resolveLocalTimezone,
  serializeScheduleAuditExport,
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

  const latestReceiptByRule = useMemo(() => {
    const map = new Map<string, WorkScheduleTriggerReceipt>();
    for (const receipt of snapshot.triggerReceipts) {
      const existing = map.get(receipt.ruleId);
      if (!existing || receipt.actualFireAt.localeCompare(existing.actualFireAt) > 0) {
        map.set(receipt.ruleId, receipt);
      }
    }
    return map;
  }, [snapshot.triggerReceipts]);

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

  const exportAudit = useCallback(() => {
    const payload = buildScheduleAuditExport({
      exportedAt: new Date().toISOString(),
      rules: snapshot.rules,
      triggerReceipts: snapshot.triggerReceipts,
    });
    const blob = new Blob([serializeScheduleAuditExport(payload)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cats-work-schedules-audit-${payload.exportedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [snapshot.rules, snapshot.triggerReceipts]);

  const sortedRules = useMemo(
    () => snapshot.rules.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [snapshot.rules],
  );

  const createButtonLabel = !shortcut.available
    ? 'Daily greeting'
    : shortcut.existingRule
      ? 'Daily greeting exists'
      : busyAction === 'create-morning-greeting'
        ? 'Creating…'
        : '+ Daily greeting';
  const createDisabled =
    !shortcut.available ||
    Boolean(shortcut.available && shortcut.existingRule) ||
    busyAction !== null;
  const createTooltip =
    shortcut.available
      ? `${shortcut.catName} · ${shortcut.bindingName} · ${timezone}`
      : shortcut.message;

  return (
    <div className="schedulesList">
      <header className="channelTopBar schedulesListTopBar">
        <div className="channelTopBarStart schedulesListTopBar__start">
          <h1 className="channelTopBarTitle schedulesListTopBar__title">Schedules</h1>
          <span className="schedulesListTopBar__count">{sortedRules.length}</span>
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
            onClick={exportAudit}
            disabled={
              busyAction !== null ||
              (snapshot.rules.length === 0 && snapshot.triggerReceipts.length === 0)
            }
          >
            Export
          </button>
          <button
            type="button"
            className="schedulesList__secondaryButton"
            onClick={() => void load()}
            disabled={busyAction !== null || status === 'loading'}
          >
            Refresh
          </button>
          <button
            type="button"
            className="schedulesList__primaryButton"
            onClick={createMorningGreeting}
            disabled={createDisabled}
            title={createTooltip}
          >
            {createButtonLabel}
          </button>
        </div>
      </header>

      <main className="schedulesList__main">
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

        {status === 'loading' && sortedRules.length === 0 ? (
          <p className="schedulesList__empty">Loading schedules…</p>
        ) : sortedRules.length === 0 ? (
          <p className="schedulesList__empty">
            No schedules yet. Click <strong>+ Daily greeting</strong> to add one,
            or POST to <code>/api/work/schedules</code>.
          </p>
        ) : (
          <ul className="schedulesList__list">
            {sortedRules.map((rule) => (
              <ScheduleRow
                key={rule.id}
                rule={rule}
                latestReceipt={latestReceiptByRule.get(rule.id) ?? null}
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
  latestReceipt,
}: {
  rule: WorkScheduleRule;
  latestReceipt: WorkScheduleTriggerReceipt | null;
}): JSX.Element {
  const summary = formatScheduleSummary(rule);
  const nextFireText = rule.nextFireAt
    ? `next ${formatDateTime(rule.nextFireAt, rule.timezone)}`
    : null;
  const triggerChip = latestReceipt
    ? `${latestReceipt.status} · ${formatRelative(latestReceipt.actualFireAt)}`
    : null;
  const enabledClass = rule.enabled ? 'enabled' : 'disabled';

  return (
    <li className="schedulesList__row">
      <Link
        to={buildWorkSchedulePath(rule.id)}
        className="schedulesList__rowLink"
        aria-label={`Open schedule ${rule.title}`}
      >
        <div className="schedulesList__rowMain">
          <span
            className={`schedulesList__dot schedulesList__dot--${enabledClass}`}
            aria-hidden="true"
          />
          <div className="schedulesList__rowText">
            <span className="schedulesList__rowTitle">{rule.title}</span>
            <span className="schedulesList__rowSummary">{summary}</span>
          </div>
        </div>
        <div className="schedulesList__rowMeta">
          {nextFireText ? (
            <span className="schedulesList__chip">{nextFireText}</span>
          ) : null}
          {triggerChip ? (
            <span
              className={`schedulesList__chip schedulesList__chip--${
                latestReceipt!.status
              }`}
            >
              {triggerChip}
            </span>
          ) : null}
          <span className="schedulesList__metric--muted">
            {formatRelative(rule.updatedAt)}
          </span>
          <span
            className={`schedulesList__statusPill schedulesList__statusPill--${enabledClass}`}
          >
            {enabledClass}
          </span>
        </div>
      </Link>
    </li>
  );
}
