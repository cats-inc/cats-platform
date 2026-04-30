import type { CatStatusIndicator } from '../../shared/catStatusResolution.js';
import { catInitials } from '../chatUtils.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export interface CatStatusRowProps {
  indicators: CatStatusIndicator[];
  onInspect: (catId: string) => void;
}

function statusDotClass(status: CatStatusIndicator['status']): string {
  switch (status) {
    case 'active': return 'catStatusDot catStatusDotActive';
    case 'blocked': return 'catStatusDot catStatusDotBlocked';
    case 'waiting_for_review': return 'catStatusDot catStatusDotReview';
    case 'error': return 'catStatusDot catStatusDotError';
    case 'sleeping': return 'catStatusDot catStatusDotSleeping';
    case 'idle':
    default: return 'catStatusDot catStatusDotIdle';
  }
}

export function CatStatusRow({ indicators, onInspect }: CatStatusRowProps) {
  const { t } = useI18n();
  if (indicators.length === 0) return null;

  const showCompact = indicators.length > 3;

  if (showCompact) {
    const activeCount = indicators.filter((i) => i.status === 'active').length;
    const blockedCount = indicators.filter(
      (i) => i.status === 'blocked' || i.status === 'waiting_for_review' || i.status === 'error',
    ).length;
    const sleepingCount = indicators.filter((i) => i.status === 'sleeping' || i.status === 'idle').length;

    return (
      <div className="catStatusRow catStatusRowCompact">
        {activeCount > 0 && (
          <span className="catStatusCompactBadge catStatusCompactActive">
            {activeCount} {t(messageKeys.chatCatStatusCompactActiveLabel)}
          </span>
        )}
        {blockedCount > 0 && (
          <span className="catStatusCompactBadge catStatusCompactBlocked">
            {blockedCount} {t(messageKeys.chatCatStatusCompactNeedAttentionLabel)}
          </span>
        )}
        {sleepingCount > 0 && (
          <span className="catStatusCompactBadge catStatusCompactSleeping">
            {sleepingCount} {t(messageKeys.chatCatStatusCompactSleepingLabel)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="catStatusRow">
      {indicators.map((indicator) => (
        <button
          key={indicator.catId}
          type="button"
          className={`catStatusBadge ${indicator.busy ? 'catStatusBadgeBusy' : ''}`}
          onClick={() => onInspect(indicator.catId)}
          title={`${indicator.catName}: ${indicator.statusLabel}`}
        >
          <span
            className="catStatusAvatar"
            style={indicator.avatarColor ? { background: indicator.avatarColor } : undefined}
          >
            {catInitials(indicator.catName)}
          </span>
          <span className={statusDotClass(indicator.status)} />
          <span className="catStatusName">{indicator.catName}</span>
        </button>
      ))}
    </div>
  );
}
