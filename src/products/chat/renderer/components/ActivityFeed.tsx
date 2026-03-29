import type { ChatOperatorActivityItem } from '../../shared/operator-loop/index';
import {
  formatOperatorTimestamp,
  operatorSeverityClassName,
} from '../../../../design/operatorFormatting';

export interface ActivityFeedProps {
  items: ChatOperatorActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Activity</p>
          <h2>Latest updates</h2>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="operatorEmptyState">
          Activity appears here when the room lead or other Cats start moving.
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
                  <span className="operatorMetaText">By {item.actorName}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
