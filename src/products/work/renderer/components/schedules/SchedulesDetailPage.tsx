import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  removeWorkSchedule,
  testFireWorkSchedule,
  updateWorkSchedule,
  type WorkScheduleRule,
} from '../../api/schedules.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
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
  getScheduleConcurrencyPolicyLabel,
  getScheduleMisfirePolicyLabel,
  getScheduleMissionPolicyLabel,
  getScheduleReceiptStatusLabel,
  getScheduleRetryBackoffLabel,
  getScheduleTriggerReasonLabel,
} from './scheduleUiSupport.js';
import './schedules.css';

export function SchedulesDetailPage(): JSX.Element {
  const { t } = useI18n();
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
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
      if (!rule) throw new Error(t('workScheduleRuleNotLoadedError'));
      await updateWorkSchedule(rule.id, { enabled: next });
    },
    onSuccess: invalidate,
  });

  const testFireMutation = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error(t('workScheduleRuleNotLoadedError'));
      await testFireWorkSchedule(rule.id);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error(t('workScheduleRuleNotLoadedError'));
      await removeWorkSchedule(rule.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
      if (scheduleId) {
        queryClient.removeQueries({ queryKey: scheduleDetailQueryKey(scheduleId) });
      }
      navigate(WORK_SCHEDULES_PATH);
    },
  });

  const handleDelete = () => {
    if (!rule) return;
    if (
      !window.confirm(
        t('workScheduleDeleteConfirmation', { scheduleTitle: rule.title }),
      )
    ) {
      return;
    }
    deleteMutation.mutate();
  };

  const sortedReceipts = useMemo(
    () => triggerReceipts
      .slice()
      .sort((a, b) => b.actualFireAt.localeCompare(a.actualFireAt))
      .slice(0, 25),
    [triggerReceipts],
  );

  const actionError =
    toggleMutation.error ?? testFireMutation.error ?? deleteMutation.error;
  const actionErrorMessage = actionError
    ? actionError instanceof Error
      ? actionError.message
      : t('workScheduleActionFailed')
    : null;

  if (!scheduleId) {
    return <ScheduleNotFound scheduleId={null} />;
  }
  if (detailQuery.isPending) {
    return (
      <div className="scheduleDetail">
        <ScheduleDetailTopBar
          title={t('workScheduleLoadingTitle')}
          rule={null}
          togglePending={false}
          testFirePending={false}
          deletePending={false}
          onToggle={() => undefined}
          onTestFire={() => undefined}
          onDelete={() => undefined}
        />
        <main className="scheduleDetail__main">
          <p className="scheduleDetail__empty">{t('workScheduleLoadingLabel')}</p>
        </main>
      </div>
    );
  }
  if (detailQuery.isError || !rule) {
    const detailErrorMessage = detailQuery.error
      ? detailQuery.error instanceof Error
        ? detailQuery.error.message
        : t('workScheduleLoadFailed')
      : null;
    return <ScheduleNotFound scheduleId={scheduleId} message={detailErrorMessage} />;
  }

  const targetKindLabel = rule.missionTemplate.target.kind === 'cat'
    ? t('workScheduleTargetKindCat')
    : t('workScheduleTargetKindAgent');

  return (
    <div className="scheduleDetail">
      <ScheduleDetailTopBar
        title={rule.title}
        rule={rule}
        togglePending={toggleMutation.isPending}
        testFirePending={testFireMutation.isPending}
        deletePending={deleteMutation.isPending}
        onToggle={() => toggleMutation.mutate(!rule.enabled)}
        onTestFire={() => testFireMutation.mutate()}
        onDelete={handleDelete}
      />
      <main className="scheduleDetail__main">
        {actionErrorMessage ? (
          <p className="scheduleDetail__error" role="alert">
            {actionErrorMessage}
          </p>
        ) : null}

        <section className="scheduleDetail__section">
          <h2 className="scheduleDetail__sectionHeading">
            {t('workScheduleOverviewTitle')}
          </h2>
          <dl className="scheduleDetail__summary">
            <SummaryRow
              label={t('workScheduleScheduleLabel')}
              value={formatScheduleSummary(rule, t)}
            />
            <SummaryRow label={t('workScheduleTimezoneLabel')} value={rule.timezone} />
            <SummaryRow
              label={t('workScheduleRevisionLabel')}
              value={`r${rule.revision}`}
              mono
            />
            <SummaryRow
              label={t('workScheduleTargetLabel')}
              value={`${targetKindLabel}:${rule.missionTemplate.target.id}`}
              mono
            />
            <SummaryRow
              label={t('workScheduleOriginLabel')}
              value={t('workScheduleOriginSchedule')}
            />
            <SummaryRow
              label={t('workScheduleMissionPolicyLabel')}
              value={getScheduleMissionPolicyLabel(
                rule.executionPolicy.missionPolicy,
                t,
              )}
            />
            <SummaryRow
              label={t('workScheduleConcurrencyLabel')}
              value={getScheduleConcurrencyPolicyLabel(
                rule.executionPolicy.concurrencyPolicy,
                t,
              )}
            />
            <SummaryRow
              label={t('workScheduleMisfireLabel')}
              value={getScheduleMisfirePolicyLabel(
                rule.executionPolicy.misfirePolicy,
                t,
              )}
            />
            <SummaryRow
              label={t('workScheduleRetryLabel')}
              value={
                rule.executionPolicy.retryPolicy.maxAttempts === 0
                  ? t('workScheduleRetryNone')
                  : t('workScheduleRetryPolicyValue', {
                    maxAttempts: rule.executionPolicy.retryPolicy.maxAttempts,
                    backoff: getScheduleRetryBackoffLabel(
                      rule.executionPolicy.retryPolicy.backoff,
                      t,
                    ),
                  })
              }
            />
          </dl>
          {rule.missionTemplate.intent ? (
            <p className="scheduleDetail__summaryBody">{rule.missionTemplate.intent}</p>
          ) : null}
        </section>

        <section className="scheduleDetail__section">
          <h2 className="scheduleDetail__sectionHeading">
            {t('workScheduleDiagnosticsTitle')}
          </h2>
          <dl className="scheduleDetail__summary">
            <SummaryRow
              label={t('workScheduleNextFireLabel')}
              value={formatDateTime(rule.nextFireAt, rule.timezone, t)}
            />
            <SummaryRow
              label={t('workScheduleLastScheduledFireLabel')}
              value={formatDateTime(rule.lastFireAt, rule.timezone, t)}
            />
            <SummaryRow
              label={t('workScheduleLastRunLabel')}
              value={rule.lastRunId ?? t('workScheduleDateNone')}
              mono={Boolean(rule.lastRunId)}
            />
            <SummaryRow
              label={t('workScheduleConsecutiveFailuresLabel')}
              value={String(rule.consecutiveFailures ?? 0)}
            />
          </dl>
          <div className="scheduleDetail__diagnostics">
            {!rule.enabled ? (
              <DiagnosticPill
                tone={rule.pausedAt ? 'bad' : 'muted'}
                text={
                  rule.pauseReason ?? t('workScheduleDisabledDiagnosticFallback')
                }
              />
            ) : null}
            {rule.retryState ? (
              <DiagnosticPill
                tone="warn"
                text={t('workScheduleRetryStatePill', {
                  attempt: rule.retryState.attempt,
                  maxAttempts: rule.retryState.maxAttempts,
                  dateTime: formatDateTime(rule.retryState.nextRetryAt, rule.timezone, t),
                })}
              />
            ) : null}
            {rule.lastFailure ? (
              <DiagnosticPill
                tone="bad"
                text={t('workScheduleLastFailurePill', {
                  failure: rule.lastFailure,
                })}
              />
            ) : null}
          </div>
        </section>

        <section className="scheduleDetail__section">
          <h2 className="scheduleDetail__sectionHeading">
            {t('workScheduleRecentTriggersTitle', {
              count: sortedReceipts.length,
            })}
          </h2>
          {sortedReceipts.length === 0 ? (
            <p className="scheduleDetail__empty">
              {t('workScheduleNoTriggerReceipts')}
            </p>
          ) : (
            <ol className="scheduleDetail__triggerList">
              {sortedReceipts.map((receipt) => (
                <li key={receipt.id} className="scheduleDetail__triggerRow">
                  <span
                    className={`scheduleDetail__triggerStatus scheduleDetail__triggerStatus--${receipt.status}`}
                  >
                    {getScheduleReceiptStatusLabel(receipt.status, t)}
                  </span>
                  <span className="scheduleDetail__triggerReason">
                    {getScheduleTriggerReasonLabel(receipt.reason, t)}
                    {typeof receipt.metadata.retryAttempt === 'number'
                      ? t('workScheduleRetryAttemptSuffix', {
                        attempt: receipt.metadata.retryAttempt,
                      })
                      : ''}
                  </span>
                  <span className="scheduleDetail__triggerWhen">
                    {formatRelative(receipt.actualFireAt, t)}
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
  deletePending: boolean;
  onToggle: () => void;
  onTestFire: () => void;
  onDelete: () => void;
}

function ScheduleDetailTopBar({
  title,
  rule,
  togglePending,
  testFirePending,
  deletePending,
  onToggle,
  onTestFire,
  onDelete,
}: ScheduleDetailTopBarProps): JSX.Element {
  const { t } = useI18n();
  const busy = togglePending || testFirePending || deletePending;
  return (
    <header className="channelTopBar scheduleDetailTopBar">
      <div className="channelTopBarStart scheduleDetailTopBar__start">
        <Link
          to={WORK_SCHEDULES_PATH}
          className="scheduleDetailTopBar__back"
          aria-label={t('workScheduleBackArrowLabel')}
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
          <span>{t('workScheduleBackLabel')}</span>
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
              {testFirePending
                ? t('workScheduleTestFireBusyLabel')
                : t('workScheduleTestFireLabel')}
            </button>
            <button
              type="button"
              className="schedulesList__secondaryButton"
              onClick={onToggle}
              disabled={busy}
            >
              {togglePending
                ? t('workScheduleUpdatingLabel')
                : rule.enabled
                  ? t('workScheduleDisableLabel')
                  : t('workScheduleEnableLabel')}
            </button>
            <button
              type="button"
              className="schedulesList__destructiveButton"
              onClick={onDelete}
              disabled={busy}
              aria-label={t('workScheduleDeleteAriaLabel')}
            >
              {deletePending
                ? t('workScheduleDeleteBusyLabel')
                : t('workScheduleDeleteLabel')}
            </button>
            <span
              className={
                'schedulesList__statusPill' +
                (rule.enabled
                  ? ' schedulesList__statusPill--enabled'
                  : ' schedulesList__statusPill--disabled')
              }
            >
              {rule.enabled
                ? t('workScheduleEnabledStatus')
                : t('workScheduleDisabledStatus')}
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
  const { t } = useI18n();
  const missingScheduleId = scheduleId ?? t('workScheduleMissingIdLabel');

  return (
    <div className="scheduleDetail">
      <header className="channelTopBar scheduleDetailTopBar">
        <div className="channelTopBarStart scheduleDetailTopBar__start">
          <Link
            to={WORK_SCHEDULES_PATH}
            className="scheduleDetailTopBar__back"
          >
            <span>{t('workScheduleBackArrowLabel')}</span>
          </Link>
        </div>
        <div className="channelTopBarCenter scheduleDetailTopBar__center">
          <h1 className="channelTopBarTitle scheduleDetailTopBar__title">
            {t('workScheduleNotFoundTitle')}
          </h1>
        </div>
      </header>
      <main className="scheduleDetail__main">
        <p className="scheduleDetail__empty">
          {message ?? (
            <>
              {t('workScheduleNotFoundPrefix')}{' '}
              <code>{missingScheduleId}</code>{' '}
              {t('workScheduleNotFoundSuffix')}
            </>
          )}
        </p>
      </main>
    </div>
  );
}
