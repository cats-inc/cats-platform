import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  testFireWorkSchedule,
  updateWorkSchedule,
  type WorkScheduleRule,
} from '../../api/schedules.js';
import {
  scheduleDetailQueryKey,
  SCHEDULES_QUERY_KEY,
  useScheduleDetailQuery,
} from '../../state/queries/schedulesQuery.js';
import { formatRelative } from '../topdown/shared';
import { WORK_SCHEDULES_PATH } from '../../workPaths.js';
import {
  formatDateTime,
  formatScheduleSummary,
} from './scheduleUiSupport.js';
import './schedules.css';

export function SchedulesDetailPage(): JSX.Element {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const queryClient = useQueryClient();
  const detailQuery = useScheduleDetailQuery(scheduleId);
  const rule = detailQuery.data?.rule ?? null;
  const triggerReceipts = detailQuery.data?.triggerReceipts ?? [];

  const invalidate = async () => {
    if (!scheduleId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: scheduleDetailQueryKey(scheduleId) }),
      queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY }),
    ]);
  };

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!rule) throw new Error('Schedule rule not loaded.');
      await updateWorkSchedule(rule.id, { enabled: next });
    },
    onSuccess: invalidate,
  });

  const testFireMutation = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error('Schedule rule not loaded.');
      await testFireWorkSchedule(rule.id);
    },
    onSuccess: invalidate,
  });

  const sortedReceipts = useMemo(
    () => triggerReceipts
      .slice()
      .sort((a, b) => b.actualFireAt.localeCompare(a.actualFireAt))
      .slice(0, 25),
    [triggerReceipts],
  );

  const actionError = toggleMutation.error ?? testFireMutation.error;
  const actionErrorMessage = actionError
    ? actionError instanceof Error
      ? actionError.message
      : 'Schedule action failed.'
    : null;

  if (!scheduleId) {
    return <ScheduleNotFound scheduleId={null} />;
  }
  if (detailQuery.isPending) {
    return (
      <div className="scheduleDetail">
        <ScheduleDetailTopBar
          title="Loading…"
          rule={null}
          togglePending={false}
          testFirePending={false}
          onToggle={() => undefined}
          onTestFire={() => undefined}
        />
        <main className="scheduleDetail__main">
          <p className="scheduleDetail__empty">Loading schedule…</p>
        </main>
      </div>
    );
  }
  if (detailQuery.isError || !rule) {
    const detailErrorMessage = detailQuery.error
      ? detailQuery.error instanceof Error
        ? detailQuery.error.message
        : 'Failed to load schedule.'
      : null;
    return <ScheduleNotFound scheduleId={scheduleId} message={detailErrorMessage} />;
  }

  return (
    <div className="scheduleDetail">
      <ScheduleDetailTopBar
        title={rule.title}
        rule={rule}
        togglePending={toggleMutation.isPending}
        testFirePending={testFireMutation.isPending}
        onToggle={() => toggleMutation.mutate(!rule.enabled)}
        onTestFire={() => testFireMutation.mutate()}
      />
      <main className="scheduleDetail__main">
        {actionErrorMessage ? (
          <p className="scheduleDetail__error" role="alert">
            {actionErrorMessage}
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
  togglePending: boolean;
  testFirePending: boolean;
  onToggle: () => void;
  onTestFire: () => void;
}

function ScheduleDetailTopBar({
  title,
  rule,
  togglePending,
  testFirePending,
  onToggle,
  onTestFire,
}: ScheduleDetailTopBarProps): JSX.Element {
  const busy = togglePending || testFirePending;
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
              disabled={busy}
            >
              {testFirePending ? 'Firing…' : 'Test fire'}
            </button>
            <button
              type="button"
              className="schedulesList__secondaryButton"
              onClick={onToggle}
              disabled={busy}
            >
              {togglePending
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
