import type { ChatOperatorActivityItem } from '../../shared/operator-loop/index';
import {
  formatOperatorTimestamp,
  operatorActivityLabel,
  operatorSeverityClassName,
} from '../../../../design/operatorFormatting';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export interface ActivityFeedProps {
  items: ChatOperatorActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  const { t } = useI18n();

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.chatActivityFeedEyebrow)}</p>
          <h2>{t(messageKeys.chatActivityFeedLatestUpdatesTitle)}</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="operatorEmptyState">
          {t(messageKeys.chatActivityFeedEmptyState)}
        </p>
      ) : (
        <div className="operatorTimeline">
          {items.slice(0, 8).map((item) => (
            <article key={item.id} className="operatorTimelineItem">
              <div
                className={`operatorTimelineDot ${operatorSeverityClassName(item.severity)}`}
              />
              <div className="operatorTimelineBody">
                <div className="operatorTimelineHeader">
                  <strong>{operatorActivityLabel(item.label, t)}</strong>
                  <span>{formatOperatorTimestamp(item.createdAt, t)}</span>
                </div>
                <p>{item.message}</p>
                {item.actorName ? (
                  <span className="operatorMetaText">
                    {t(messageKeys.chatActivityFeedByActorLabel, { actorName: item.actorName })}
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
