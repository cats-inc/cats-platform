import type { CoreTraceRecord } from '../../../core/types';
import { formatOperatorTimestamp, traceKindLabel } from '../../operatorFormatting';
import { useI18n } from '../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../shared/i18n/index.js';

export type OperatorTraceListItem = Pick<
  CoreTraceRecord,
  'id' | 'kind' | 'createdAt' | 'message' | 'actorId'
>;

export interface OperatorTraceListProps {
  traces: OperatorTraceListItem[];
  actorNameById: Record<string, string>;
}

export function TraceList({ traces, actorNameById }: OperatorTraceListProps) {
  const { t } = useI18n();

  if (traces.length === 0) {
    return (
      <p className="operatorEmptyState operatorInsetEmpty">
        {t(messageKeys.sharedOperatorNoTraceRecords)}
      </p>
    );
  }

  return (
    <div className="operatorList">
      {traces.slice(0, 8).map((trace) => (
        <article key={trace.id} className="operatorListItem">
            <div className="operatorListItemHeader">
            <strong>{traceKindLabel(trace.kind, t)}</strong>
            <span>{formatOperatorTimestamp(trace.createdAt, t)}</span>
          </div>
          <p>{trace.message}</p>
          {trace.actorId ? (
            <span className="operatorMetaText">
              {actorNameById[trace.actorId] ?? trace.actorId}
            </span>
          ) : null}
        </article>
      ))}
    </div>
  );
}
