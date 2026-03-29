import type { CoreTraceRecord } from '../../../core/types';
import { formatOperatorTimestamp, traceKindLabel } from '../../operatorFormatting';

export type OperatorTraceListItem = Pick<
  CoreTraceRecord,
  'id' | 'kind' | 'createdAt' | 'message' | 'actorId'
>;

export interface OperatorTraceListProps {
  traces: OperatorTraceListItem[];
  actorNameById: Record<string, string>;
}

export function TraceList({ traces, actorNameById }: OperatorTraceListProps) {
  if (traces.length === 0) {
    return (
      <p className="operatorEmptyState operatorInsetEmpty">
        No trace records yet for this run.
      </p>
    );
  }

  return (
    <div className="operatorList">
      {traces.slice(0, 8).map((trace) => (
        <article key={trace.id} className="operatorListItem">
          <div className="operatorListItemHeader">
            <strong>{traceKindLabel(trace.kind)}</strong>
            <span>{formatOperatorTimestamp(trace.createdAt)}</span>
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
