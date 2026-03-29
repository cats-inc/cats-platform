import type { CoreTraceRecord } from '../../../../core/types';
import {
  TraceList as SharedTraceList,
  type OperatorTraceListProps,
} from '../../../../design/components/operator/TraceList';

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
