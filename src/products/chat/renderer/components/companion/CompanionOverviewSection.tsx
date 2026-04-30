import type { CompanionBoxSummary, CompanionMemoryRecord } from '../../../companion/contracts.js';
import type { CompanionPresenceInfo } from '../../hooks/useCompanionPresence.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

export interface CompanionOverviewSectionProps {
  summary: CompanionBoxSummary | null;
  recentMemory: CompanionMemoryRecord[];
  presence: CompanionPresenceInfo;
  onWake: () => void;
  onSleep: () => void;
  loading: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function CompanionOverviewSection({
  summary,
  recentMemory,
  presence,
  onWake,
  onSleep,
  loading,
}: CompanionOverviewSectionProps) {
  const { t } = useI18n();

  if (loading && !summary) {
    return (
      <div className="companionSection companionLoading">
        {t(messageKeys.chatCompanionOverviewLoadingState)}
      </div>
    );
  }

  const recentSlice = recentMemory.slice(0, 5);

  return (
    <div className="companionSection companionOverview">
        <div className="companionCard companionPresenceCard">
        <div className="companionCardHeader">
          {t(messageKeys.chatCompanionOverviewPresenceTitle)}
        </div>
        <div className="companionPresenceRow">
          <span className={`companionPresenceLarge ${presence.className}`}>
            <span className="companionPresenceDot" />
            {presence.label}
          </span>
          {presence.canWake && (
            <button
              type="button"
              className="companionActionButton"
              onClick={onWake}
            >
              {t(messageKeys.chatCompanionOverviewPresenceWakeButton)}
            </button>
          )}
          {presence.canSleep && (
            <button
              type="button"
              className="companionActionButton companionActionSecondary"
              onClick={onSleep}
            >
              {t(messageKeys.chatCompanionOverviewPresenceSleepButton)}
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="companionCard companionStatsCard">
          <div className="companionCardHeader">
            {t(messageKeys.chatCompanionOverviewSummaryTitle)}
          </div>
          <ul className="companionStatsList">
            <li>
              <strong>{summary.sourceCount}</strong>
              {' '}
              {t(messageKeys.chatCompanionOverviewSummaryResourceLabel)}
            </li>
            <li>
              <strong>{summary.derivedCount}</strong>
              {' '}
              {t(messageKeys.chatCompanionOverviewSummaryCreationLabel)}
            </li>
            <li>
              <strong>{summary.memoryCount}</strong>
              {' '}
              {t(messageKeys.chatCompanionOverviewSummaryMemoryLabel)}
            </li>
          </ul>
        </div>
      )}

      <div className="companionCard companionRecentMemoryCard">
        <div className="companionCardHeader">
          {t(messageKeys.chatCompanionOverviewRecentMemoriesTitle)}
        </div>
        {recentSlice.length === 0 ? (
          <p className="companionEmpty">
            {t(messageKeys.chatCompanionOverviewEmptyState)}
          </p>
        ) : (
          <ul className="companionMemoryList">
            {recentSlice.map((record) => (
              <li key={record.id} className="companionMemoryItem">
                <span className="companionMemoryCategory">{record.category}</span>
                <span className="companionMemoryContent">{record.content}</span>
                <span className="companionMemoryDate">{formatDate(record.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
