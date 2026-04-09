import type {
  ChatEffectivePolicyView,
  ChatOperatorActionView,
  ChatRunInspectorView,
} from '../../operator-loop/index.js';
import {
  ProgressSummaryPanel as SharedProgressSummaryPanel,
  type OperatorProgressSummaryPanelProps,
} from '../../../../design/components/operator/ProgressSummaryPanel.js';

export interface ProgressSummaryPanelProps {
  inspector: ChatRunInspectorView | null;
  effectivePolicy: ChatEffectivePolicyView | null;
  incidentActions: ChatOperatorActionView[];
  pendingApprovalCount: number;
  guardReason: string | null;
  cooldownLabel: string | null;
  onInspectRun: (runId: string) => void;
  onOperatorAction: (input: {
    action: 'retry' | 'acknowledge';
    taskId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
  }) => void;
}

export function ProgressSummaryPanel(props: ProgressSummaryPanelProps) {
  const sharedProps: OperatorProgressSummaryPanelProps = props;
  return <SharedProgressSummaryPanel {...sharedProps} />;
}
