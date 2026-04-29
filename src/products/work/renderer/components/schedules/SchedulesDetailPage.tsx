import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  buildWorkApiSchedulePath,
} from '../../../shared/apiPaths.js';
import { expectJson } from '../../api/http.js';
import {
  testFireWorkSchedule,
  updateWorkSchedule,
  type WorkScheduleRule,
  type WorkScheduleRuleResponse,
  type WorkScheduleTriggerReceipt,
} from '../../api/schedules.js';
import { formatRelative } from '../topdown/shared';
import { WORK_SCHEDULES_PATH } from '../../workPaths.js';
import {
  formatDateTime,
  formatScheduleSummary,
} from './scheduleUiSupport.js';
import './schedules.css';

type FetchStatus = 'idle' | 'loading' | 'ready' | 'error';

export function SchedulesDetailPage(): JSX.Element {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const [rule, setRule] = useState<WorkScheduleRule | null>(null);
  const [triggerReceipts, setTriggerReceipts] = useState<WorkScheduleTriggerReceipt[]>([]);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    if (!scheduleId) {
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const response = await fetch(buildWorkApiSchedulePath(scheduleId), { signal });
      const payload = await expectJson<WorkScheduleRuleResponse>(
        response,
        'Failed to load schedule.',
      );
      setRule(payload.rule);
      setTriggerReceipts(payload.triggerReceipts);
      setStatus('ready');
    } catch (err) {
      if (signal?.aborted) {
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to load schedule.');
    }
  }, [scheduleId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

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

  const toggleRule = useCallback(() => {
    if (!rule) return;
    void runAction('toggle', async () => {
      await updateWorkSchedule(rule.id, { enabled: !rule.enabled });
    });
  }, [runAction, rule]);

  const testFireRule = useCallback(() => {
    if (!rule) return;
    void runAction('test', async () => {
      await testFireWorkSchedule(rule.id);
    });
  }, [runAction, rule]);

  const sortedReceipts = useMemo(
    () => triggerReceipts
      .slice()
      .sort((a, b) => b.actualFireAt.localeCompare(a.actualFireAt))
      .slice(0, 25),
    [triggerReceipts],
  );

  if (!scheduleId) {
    return <ScheduleNotFound scheduleId={null} />;
  }
  if (status === 'loading' && !rule) {
    return (
      <div className="scheduleDetail">
        <ScheduleDetailTopBar
          title="Loading…"
          rule={null}
          busyAction={busyAction}
          onToggle={toggleRule}
          onTestFire={testFireRule}
        />
        <main className="scheduleDetail__main">
          <p className="scheduleDetail__empty">Loading schedule…</p>
        </main>
      </div>
    );
  }
  if (status === 'error' || !rule) {
    return <ScheduleNotFound scheduleId={scheduleId} message={error} />;
  }

  return (
    <div className="scheduleDetail">
      <ScheduleDetailTopBar
        title={rule.title}
        rule={rule}
        busyAction={busyAction}
        onToggle={toggleRule}
        onTestFire={testFireRule}
      />
      <main className="scheduleDetail__main">
        {actionError ? (
          <p className="scheduleDetail__error" role="alert">
            {actionError}
          </p>
        ) : null}

        <section className="scheduleDetail__section">
          <h2 className="scheduleDetail__sectionHeading">Overview</h2>
          <dl className="scheduleDetail__summary">
            <SummaryRow label="Schedule" value={formatScheduleSummary(rule)} />
            <SummaryRow label="Timezone" value={rule.timezone} />
            <SummaryRow label="Revision" value={`r${rule.revision}`} mono />
            <SummaryRow
              label="Target"
              value={`${rule.missionTemplate.target.kind}:${rule.missionTemplate.target.id}`}
              mono
            />
            <SummaryRow
              label="Origin"
              value={rule.missionTemplate.originSurface}
            />
            <SummaryRow
              label="Mission policy"
              value={rule.executionPolicy.missionPolicy}
            />
            <SummaryRow
              label="Concurrency"
              value={rule.executionPolicy.concurrencyPolicy}
            />
            <SummaryRow
              label="Misfire"
              value={rule.executionPolicy.misfirePolicy}
            />
            <SummaryRow
              label="Retry"
              value={
                rule.executionPolicy.retryPolicy.maxAttempts === 0
                  ? 'none'
                  : `${rule.executionPolicy.retryPolicy.maxAttempts}× ${rule.executionPolicy.retryPolicy.backoff}`
              }
            />
          </dl>
          {rule.missionTemplate.intent ? (
            <p className="scheduleDetail__summaryBody">{rule.missionTemplate.intent}</p>
          ) : null}
        </section>

        <section className="scheduleDetail__section">
          <h2 className="scheduleDetail__sectionHeading">Diagnostics</h2>
          <dl className="scheduleDetail__summary">
            <SummaryRow
              label="Next fire"
              value={formatDateTime(rule.nextFireAt, rule.timezone)}
            />
            <SummaryRow
              label="Last scheduled fire"
              value={formatDateTime(rule.lastFireAt, rule.timezone)}
            />
            <SummaryRow
              label="Last run"
              value={rule.lastRunId ?? 'None'}
              mono={Boolean(rule.lastRunId)}
            />
            <SummaryRow
              label="Consecutive failures"
              value={String(rule.consecutiveFailures ?? 0)}
            />
          </dl>
          <div className="scheduleDetail__diagnostics">
            {!rule.enabled ? (
              <DiagnosticPill
                tone={rule.pausedAt ? 'bad' : 'muted'}
                text={rule.pauseReason ?? 'Disabled: no future fires will be evaluated.'}
              />
            ) : null}
            {rule.retryState ? (
              <DiagnosticPill
                tone="warn"
                text={[
                  `Retry ${rule.retryState.attempt}/${rule.retryState.maxAttempts}`,
                  formatDateTime(rule.retryState.nextRetryAt, rule.timezone),
                ].join(' at ')}
              />
            ) : null}
            {rule.lastFailure ? (
              <DiagnosticPill tone="bad" text={`Last failure: ${rule.lastFailure}`} />
            ) : null}
          </div>
        </section>

        <section className="scheduleDetail__section">
          <h2 className="scheduleDetail__sectionHeading">
            Recent triggers
            <span className="scheduleDetail__count">{sortedReceipts.length}</span>
          </h2>
          {sortedReceipts.length === 0 ? (
            <p className="scheduleDetail__empty">No trigger receipts yet.</p>
          ) : (
            <ol className="scheduleDetail__triggerList">
              {sortedReceipts.map((receipt) => (
                <li key={receipt.id} className="scheduleDetail__triggerRow">
                  <span
                    className={`scheduleDetail__triggerStatus scheduleDetail__triggerStatus--${receipt.status}`}
                  >
                    {receipt.status}
                  </span>
                  <span className="scheduleDetail__triggerReason">
                    {receipt.reason}
                    {typeof receipt.metadata.retryAttempt === 'number'
                      ? ` #${receipt.metadata.retryAttempt}`
                      : ''}
                  </span>
                  <span className="scheduleDetail__triggerWhen">
                    {formatRelative(receipt.actualFireAt)}
                  </span>
                  {receipt.runId ? (
                    <code className="scheduleDetail__triggerRun">{receipt.runId}</code>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}

interface ScheduleDetailTopBarProps {
  title: string;
  rule: WorkScheduleRule | null;
  busyAction: string | null;
  onToggle: () => void;
  onTestFire: () => void;
}

function ScheduleDetailTopBar({
  title,
  rule,
  busyAction,
  onToggle,
  onTestFire,
}: ScheduleDetailTopBarProps): JSX.Element {
  return (
    <header className="channelTopBar scheduleDetailTopBar">
      <div className="channelTopBarStart scheduleDetailTopBar__start">
        <Link
          to={WORK_SCHEDULES_PATH}
          className="scheduleDetailTopBar__back"
          aria-label="Back to schedules"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7.5 2L3.5 6l4 4" />
          </svg>
          <span>Schedules</span>
        </Link>
      </div>
      <div className="channelTopBarCenter scheduleDetailTopBar__center">
        {rule ? (
          <span
            className={
              'schedulesList__dot' +
              (rule.enabled
                ? ' schedulesList__dot--enabled'
                : ' schedulesList__dot--disabled')
            }
            aria-hidden="true"
          />
        ) : null}
        <h1 className="channelTopBarTitle scheduleDetailTopBar__title">{title}</h1>
      </div>
      <div className="channelTopBarEnd scheduleDetailTopBar__end">
        {rule ? (
          <>
            <button
              type="button"
              className="schedulesList__secondaryButton"
              onClick={onTestFire}
              disabled={busyAction !== null}
            >
              {busyAction === 'test' ? 'Firing…' : 'Test fire'}
            </button>
            <button
              type="button"
              className="schedulesList__secondaryButton"
              onClick={onToggle}
              disabled={busyAction !== null}
            >
              {busyAction === 'toggle'
                ? 'Updating…'
                : rule.enabled
                  ? 'Disable'
                  : 'Enable'}
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
          </>
        ) : null}
      </div>
    </header>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="scheduleDetail__summaryRow">
      <dt>{label}</dt>
      <dd className={mono ? 'scheduleDetail__monoValue' : undefined}>{value}</dd>
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

function ScheduleNotFound({
  scheduleId,
  message,
}: {
  scheduleId: string | null;
  message?: string | null;
}): JSX.Element {
  return (
    <div className="scheduleDetail">
      <header className="channelTopBar scheduleDetailTopBar">
        <div className="channelTopBarStart scheduleDetailTopBar__start">
          <Link
            to={WORK_SCHEDULES_PATH}
            className="scheduleDetailTopBar__back"
          >
            <span>← Schedules</span>
          </Link>
        </div>
        <div className="channelTopBarCenter scheduleDetailTopBar__center">
          <h1 className="channelTopBarTitle scheduleDetailTopBar__title">Not found</h1>
        </div>
      </header>
      <main className="scheduleDetail__main">
        <p className="scheduleDetail__empty">
          {message ?? (
            <>
              Schedule <code>{scheduleId ?? '(missing id)'}</code> is not in the current
              state.
            </>
          )}
        </p>
      </main>
    </div>
  );
}
