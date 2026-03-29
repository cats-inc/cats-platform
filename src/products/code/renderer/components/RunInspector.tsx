import type { ChatRunInspectorView } from '../../shared/operator-loop/index';
import {
  RunInspector as SharedRunInspector,
  type OperatorRunInspectorProps,
} from '../../../../design/components/operator/RunInspector';

export interface RunInspectorProps {
  runs: ChatRunInspectorView['run'][];
  actorNameById: Record<string, string>;
  inspector: ChatRunInspectorView | null;
  onSelectRun: (runId: string) => void;
}

export function RunInspector({
  runs,
  actorNameById,
  inspector,
  onSelectRun,
}: RunInspectorProps) {
  const sharedProps: OperatorRunInspectorProps = {
    runs,
    actorNameById,
    inspector,
    onSelectRun,
  };
  return <SharedRunInspector {...sharedProps} />;
}
