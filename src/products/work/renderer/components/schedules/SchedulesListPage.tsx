import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

import type {
  WorkScheduleRule,
  WorkScheduleTriggerReceipt,
} from '../../api/schedules.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { useSchedulesQuery } from '../../state/queries/schedulesQuery.js';
import { formatRelative } from '../topdown/shared';
import { buildWorkSchedulePath } from '../../workPaths.js';
import {
  buildScheduleAuditExport,
  formatDateTime,
  formatScheduleSummary,
  getScheduleReceiptStatusLabel,
  serializeScheduleAuditExport,
} from './scheduleUiSupport.js';
import './schedules.css';

export function SchedulesListPage(): JSX.Element {
  const { t } = useI18n();
  const schedulesQuery = useSchedulesQuery();
  const rules = schedulesQuery.data?.rules ?? [];
  const triggerReceipts = schedulesQuery.data?.triggerReceipts ?? [];

  const latestReceiptByRule = useMemo(() => {
    const map = new Map<string, WorkScheduleTriggerReceipt>();
    for (const receipt of triggerReceipts) {
      const existing = map.get(receipt.ruleId);
      if (!existing || receipt.actualFireAt.localeCompare(existing.actualFireAt) > 0) {
        map.set(receipt.ruleId, receipt);
      }
    }
    return map;
  }, [triggerReceipts]);

  const exportAudit = useCallback(() => {
    const payload = buildScheduleAuditExport({
      exportedAt: new Date().toISOString(),
      rules,
      triggerReceipts,
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
  }, [rules, triggerReceipts]);

  const sortedRules = useMemo(
    () => rules.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [rules],
  );

  const errorMessage = schedulesQuery.error
    ? schedulesQuery.error instanceof Error
      ? schedulesQuery.error.message
      : t('workSchedulesListLoadErrorFallback')
    : null;

  return (
    <div className="schedulesList">
      <header className="channelTopBar schedulesListTopBar">
        <div className="channelTopBarStart schedulesListTopBar__start">
          <h1 className="channelTopBarTitle schedulesListTopBar__title">
            {t('workSchedulesListTitle')}
          </h1>
          <span className="schedulesListTopBar__count">{sortedRules.length}</span>
        </div>
        <div className="channelTopBarCenter schedulesListTopBar__center">
          <p className="schedulesListTopBar__lede">
            {t('workSchedulesListLede')}
          </p>
        </div>
        <div className="channelTopBarEnd schedulesListTopBar__end">
          <button
            type="button"
            className="schedulesList__secondaryButton"
            onClick={exportAudit}
            disabled={rules.length === 0 && triggerReceipts.length === 0}
          >
            {t('workSchedulesExportAction')}
          </button>
        </div>
      </header>

      <main className="schedulesList__main">
        {errorMessage ? (
          <p className="schedulesList__error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {schedulesQuery.isPending ? (
          <p className="schedulesList__empty">{t('workSchedulesListLoading')}</p>
        ) : sortedRules.length === 0 ? (
          <p className="schedulesList__empty">
            {t('workSchedulesListEmpty')}
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
  const { t } = useI18n();
  const summary = formatScheduleSummary(rule, t);
  const nextFireText = rule.nextFireAt
    ? t('workScheduleNextFireChip', {
      dateTime: formatDateTime(rule.nextFireAt, rule.timezone, t),
    })
    : null;
  const triggerChip = latestReceipt
    ? t('workScheduleReceiptChip', {
      status: getScheduleReceiptStatusLabel(latestReceipt.status, t),
      relativeTime: formatRelative(latestReceipt.actualFireAt, t),
    })
    : null;
  const enabledClass = rule.enabled ? 'enabled' : 'disabled';
  const enabledLabel = rule.enabled
    ? t('workScheduleEnabledStatus')
    : t('workScheduleDisabledStatus');

  return (
    <li className="schedulesList__row">
      <Link
        to={buildWorkSchedulePath(rule.id)}
        className="schedulesList__rowLink"
        aria-label={t('workScheduleOpenAriaLabel', { scheduleTitle: rule.title })}
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
            {formatRelative(rule.updatedAt, t)}
          </span>
          <span
            className={`schedulesList__statusPill schedulesList__statusPill--${enabledClass}`}
          >
            {enabledLabel}
          </span>
        </div>
      </Link>
    </li>
  );
}
