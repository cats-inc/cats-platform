import {
  formatOperatorTimestamp,
  operatorBudgetAlertLevelLabel,
  operatorDeliveryGateLabel,
  operatorDeliveryModeLabel,
  operatorSeverityClassName,
  operatorWorkflowShapeLabel,
  runStatusLabel,
  runStatusSeverity,
} from '../../operatorFormatting';
import { useI18n } from '../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import {
  resolveOperatorActionDescription,
  resolveOperatorActionLabel,
  resolveOperatorActionStatusLabel,
} from './actionI18n.js';

export interface OperatorProgressSummaryRun {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  summary: string | null;
}

export interface OperatorProgressSummaryInspectorView {
  run: OperatorProgressSummaryRun;
  metrics: {
    dispatchCount: number | null;
    continuationCount: number | null;
    targetCount: number | null;
  };
  workflowStageId: string | null;
  workflowShape: string | null;
  reviewRequired: boolean;
}

export interface OperatorProgressSummaryActionView {
  kind: 'retry' | 'acknowledge';
  label: string;
  description: string;
  disabled: boolean;
  statusLabel: string | null;
  taskId: string | null;
  runId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
}

export interface OperatorProgressSummaryPolicyView {
  deliveryMode: string | null;
  deliveryGates: string[];
  budgetAlertLevel: string | null;
}

export interface OperatorProgressSummaryPanelProps {
  inspector: OperatorProgressSummaryInspectorView | null;
  effectivePolicy: OperatorProgressSummaryPolicyView | null;
  incidentActions: OperatorProgressSummaryActionView[];
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

export function ProgressSummaryPanel({
  inspector,
  effectivePolicy,
  incidentActions,
  pendingApprovalCount,
  guardReason,
  cooldownLabel,
  onInspectRun,
  onOperatorAction,
}: OperatorProgressSummaryPanelProps) {
  const { t } = useI18n();

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.sharedOperatorEyebrowProgress)}</p>
          <h2>{t(messageKeys.sharedOperatorRunStatusTitle)}</h2>
        </div>
      </div>
      {!inspector ? (
        <p className="operatorEmptyState">
          {t(messageKeys.sharedOperatorNoActiveRun)}
        </p>
      ) : (
        <div className="operatorStack">
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <div>
                <strong>{inspector.run.title}</strong>
                <p>
                  {inspector.run.summary ?? t(messageKeys.sharedOperatorProgressSummaryFallback)}
                </p>
              </div>
              <span
                className={`operatorStatusBadge ${operatorSeverityClassName(runStatusSeverity(inspector.run.status as never))}`}
              >
                {runStatusLabel(inspector.run.status as never, t)}
              </span>
            </div>
            <div className="operatorMetricGrid">
              <div className="operatorMetricCard">
                <span className="operatorMetricLabel">
                  {t(messageKeys.sharedOperatorMetricDispatches)}
                </span>
                <strong>{inspector.metrics.dispatchCount ?? '—'}</strong>
              </div>
              <div className="operatorMetricCard">
                <span className="operatorMetricLabel">
                  {t(messageKeys.sharedOperatorMetricContinuations)}
                </span>
                <strong>{inspector.metrics.continuationCount ?? '—'}</strong>
              </div>
              <div className="operatorMetricCard">
                <span className="operatorMetricLabel">
                  {t(messageKeys.sharedOperatorMetricTargets)}
                </span>
                <strong>{inspector.metrics.targetCount ?? '—'}</strong>
              </div>
            </div>
            <div className="operatorMetaRow">
              <span>
                {t(messageKeys.sharedOperatorMetaUpdated, {
                  time: formatOperatorTimestamp(inspector.run.updatedAt, t),
                })}
              </span>
              <span>
                {pendingApprovalCount === 1
                  ? t(messageKeys.sharedOperatorApprovalPendingSingular, {
                    count: pendingApprovalCount,
                  })
                  : t(messageKeys.sharedOperatorApprovalPendingPlural, {
                    count: pendingApprovalCount,
                  })}
              </span>
            </div>
            {inspector.workflowStageId || inspector.workflowShape ? (
              <div className="operatorMetaRow">
                {inspector.workflowStageId ? (
                  <span>
                    {t(messageKeys.sharedOperatorMetaStage, {
                      stage: inspector.workflowStageId,
                    })}
                  </span>
                ) : null}
                {inspector.workflowShape ? (
                  <span>
                    {t(messageKeys.sharedOperatorMetaShape, {
                      shape: operatorWorkflowShapeLabel(
                        inspector.workflowShape,
                        t,
                      ),
                    })}
                  </span>
                ) : null}
                {inspector.reviewRequired ? (
                  <span>{t(messageKeys.sharedOperatorMetaReviewRequired)}</span>
                ) : null}
              </div>
            ) : null}
            {effectivePolicy ? (
              <div className="operatorMetaRow">
                {effectivePolicy.deliveryMode ? (
                  <span>
                    {t(messageKeys.sharedOperatorDeliveryLabel, {
                      deliveryMode: operatorDeliveryModeLabel(
                        effectivePolicy.deliveryMode,
                        t,
                      ),
                    })}
                  </span>
                ) : null}
                {effectivePolicy.deliveryGates.length > 0 ? (
                  <span>
                    {t(messageKeys.sharedOperatorGatesLabel, {
                      gates: effectivePolicy.deliveryGates
                        .map((gate) => operatorDeliveryGateLabel(gate, t))
                        .join(', '),
                    })}
                  </span>
                ) : null}
                {effectivePolicy.budgetAlertLevel ? (
                  <span>
                    {t(messageKeys.sharedOperatorBudgetLabel, {
                      budgetLevel: operatorBudgetAlertLevelLabel(
                        effectivePolicy.budgetAlertLevel,
                        t,
                      ),
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}
            {guardReason ? (
              <div className="operatorCallout operatorCalloutAttention">
                {t(messageKeys.sharedOperatorMetaGuardrail, {
                  guardrail: guardReason,
                })}
              </div>
            ) : null}
            {cooldownLabel ? (
              <div className="operatorCallout operatorCalloutMuted">
                {t(messageKeys.sharedOperatorMetaCooldown, {
                  cooldown: cooldownLabel,
                })}
              </div>
            ) : null}
            <div className="operatorActionRow">
              <button
                className="operatorActionButton"
                type="button"
                onClick={() => onInspectRun(inspector.run.id)}
              >
                {t(messageKeys.sharedOperatorInspectRunButton)}
              </button>
              {incidentActions.map((action) => {
                const actionDescription = resolveOperatorActionDescription(
                  action.description,
                  t,
                );
                return (
                  <button
                    key={`${action.kind}:${action.runId ?? action.taskId ?? action.checkpointId ?? action.outcomeId ?? 'global'}`}
                    className={action.kind === 'retry'
                      ? 'operatorActionButton operatorActionButtonPrimary'
                      : 'operatorActionButton'}
                    type="button"
                    disabled={action.disabled}
                    title={actionDescription}
                    onClick={() => onOperatorAction({
                      action: action.kind,
                      taskId: action.taskId,
                      runId: action.runId,
                      checkpointId: action.checkpointId,
                      outcomeId: action.outcomeId,
                    })}
                  >
                    {resolveOperatorActionLabel(action.label, t)}
                  </button>
                );
              })}
            </div>
            {incidentActions.some((action) => action.statusLabel) ? (
              <div className="operatorMetaRow">
                {incidentActions
                  .filter((action) => action.statusLabel)
                  .map((action) => (
                    <span key={`status:${action.kind}`}>
                      {resolveOperatorActionStatusLabel(action.statusLabel, t)}
                    </span>
                  ))}
              </div>
            ) : null}
          </article>
        </div>
      )}
    </section>
  );
}
