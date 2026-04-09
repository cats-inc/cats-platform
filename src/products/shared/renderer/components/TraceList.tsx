import type { CoreTraceRecord } from '../../../../core/types.js';
import {
  TraceList as SharedTraceList,
  type OperatorTraceListProps,
} from '../../../../design/components/operator/TraceList.js';

export interface TraceListProps {
  traces: CoreTraceRecord[];
  actorNameById: Record<string, string>;
}

export function TraceList({ traces, actorNameById }: TraceListProps) {
  const sharedProps: OperatorTraceListProps = {
    traces,
    actorNameById,
  };
  return <SharedTraceList {...sharedProps} />;
}
