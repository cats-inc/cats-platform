import type { ChatOperatorActivityItem } from '../../operator-loop/index.js';
import {
  formatOperatorTimestamp,
  operatorSeverityClassName,
} from '../../../../design/operatorFormatting.js';
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
          <p className="operatorEyebrow">
            {t(messageKeys.chatActivityEyebrow)}
          </p>
          <h2>{t(messageKeys.chatActivityLatestUpdatesHeading)}</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="operatorEmptyState">
          {t(messageKeys.chatActivityEmptyState)}
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
                  <strong>{item.label}</strong>
                  <span>{formatOperatorTimestamp(item.createdAt)}</span>
                </div>
                <p>{item.message}</p>
                {item.actorName ? (
                  <span className="operatorMetaText">
                    {t(messageKeys.chatActivityByActor, { actorName: item.actorName })}
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
