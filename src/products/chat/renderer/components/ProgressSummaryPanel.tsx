import type { ChatRunInspectorView } from '../../shared/operatorLoop';
import {
  formatOperatorTimestamp,
  operatorSeverityClassName,
  runStatusLabel,
  runStatusSeverity,
} from './operatorUi';

export interface ProgressSummaryPanelProps {
  inspector: ChatRunInspectorView | null;
  pendingApprovalCount: number;
  guardReason: string | null;
  cooldownLabel: string | null;
  onInspectRun: (runId: string) => void;
}

export function ProgressSummaryPanel({
  inspector,
  pendingApprovalCount,
  guardReason,
  cooldownLabel,
  onInspectRun,
}: ProgressSummaryPanelProps) {
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Progress</p>
          <h2>Run status</h2>
        </div>
      </div>
      {!inspector ? (
        <p className="operatorEmptyState">
          No active room run yet. Start or continue the chat to inspect dispatch state.
        </p>
      ) : (
        <div className="operatorStack">
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <div>
                <strong>{inspector.run.title}</strong>
                <p>{inspector.run.summary ?? 'Room orchestration state is available for inspection.'}</p>
              </div>
              <span
                className={`operatorStatusBadge ${operatorSeverityClassName(runStatusSeverity(inspector.run.status))}`}
              >
                {runStatusLabel(inspector.run.status)}
              </span>
            </div>
            <div className="operatorMetricGrid">
              <div className="operatorMetricCard">
                <span className="operatorMetricLabel">Dispatches</span>
                <strong>{inspector.metrics.dispatchCount ?? '—'}</strong>
              </div>
              <div className="operatorMetricCard">
                <span className="operatorMetricLabel">Continuations</span>
                <strong>{inspector.metrics.continuationCount ?? '—'}</strong>
              </div>
              <div className="operatorMetricCard">
                <span className="operatorMetricLabel">Targets</span>
                <strong>{inspector.metrics.targetCount ?? '—'}</strong>
              </div>
            </div>
            <div className="operatorMetaRow">
              <span>Updated {formatOperatorTimestamp(inspector.run.updatedAt)}</span>
              <span>{pendingApprovalCount} approval{pendingApprovalCount === 1 ? '' : 's'} pending</span>
            </div>
            {guardReason ? (
              <div className="operatorCallout operatorCalloutAttention">
                Guardrail: {guardReason}
              </div>
            ) : null}
            {cooldownLabel ? (
              <div className="operatorCallout operatorCalloutMuted">
                Cooldown: {cooldownLabel}
              </div>
            ) : null}
            <div className="operatorActionRow">
              <button
                className="operatorActionButton"
                type="button"
                onClick={() => onInspectRun(inspector.run.id)}
              >
                Inspect run
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
