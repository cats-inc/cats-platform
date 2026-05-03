import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import {
  labelCodeBlockedReasonForLocale,
  labelCodeDeliveryModeForLocale,
  labelCodeTaskStrategyForLocale,
} from './codeStatusLabels.js';

export interface CodeExecutionSummaryPanelProps {
  taskId: string | null;
  taskStatus: string | null;
  effectiveStrategy: string | null;
  deliveryMode: string | null;
  deliveryRequiresOwnerDecision: boolean;
  deliveryApprovalPending: boolean;
  continuationBlockedReason: string | null;
  continuationTargetNames: string[];
  sessionId: string | null;
  sessionStatus: string | null;
  provider: string | null;
  model: string | null;
}

function statusBadgeClass(status: string | null): string {
  switch (status) {
    case 'completed':
    case 'closed':
    case 'ready':
      return 'operatorStatusBadge isSuccess';
    case 'in_progress':
    case 'running':
      return 'operatorStatusBadge isAttention';
    case 'blocked':
    case 'failed':
    case 'error':
      return 'operatorStatusBadge isError';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

function formatStatusLabel(
  status: string | null,
  t: ReturnType<typeof useI18n>['t'],
  idleKey: typeof messageKeys.codeExecutionNotStarted | typeof messageKeys.codeExecutionRuntimeIdle,
): string {
  switch (status) {
    case 'completed':
    case 'closed':
    case 'ready':
      return t(messageKeys.codeExecutionStatusDoneLabel);
    case 'in_progress':
    case 'running':
      return t(messageKeys.codeExecutionStatusRunningLabel);
    case 'blocked':
    case 'failed':
    case 'error':
      return t(messageKeys.codeExecutionStatusBlockedLabel);
    case null:
      return t(idleKey);
    default:
      return status.trim() || t(messageKeys.codeExecutionStatusUnknown);
  }
}

export function CodeExecutionSummaryPanel({
  taskId,
  taskStatus,
  effectiveStrategy,
  deliveryMode,
  deliveryRequiresOwnerDecision,
  deliveryApprovalPending,
  continuationBlockedReason,
  continuationTargetNames,
  sessionId,
  sessionStatus,
  provider,
  model,
}: CodeExecutionSummaryPanelProps) {
  const { t } = useI18n();
  const controlBadgeClass = continuationBlockedReason
    ? 'operatorStatusBadge isError'
    : deliveryMode
      ? 'operatorStatusBadge isAttention'
      : 'operatorStatusBadge isMuted';
  const controlBadgeLabel = continuationBlockedReason
    ? t(messageKeys.codeExecutionStatusBlockedLabel)
    : deliveryMode
      ? t(messageKeys.codeExecutionStatusActiveLabel)
      : t(messageKeys.codeExecutionStatusIdleLabel);
  const formattedDeliveryMode = labelCodeDeliveryModeForLocale(deliveryMode, t);
  const formattedBlockedReason = labelCodeBlockedReasonForLocale(continuationBlockedReason, t);
  const formattedTaskStrategy = labelCodeTaskStrategyForLocale(effectiveStrategy, t);
  const modelLabel = model?.trim() ? model : t(messageKeys.codeExecutionDefaultModel);

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.codeExecutionExecutionHeader)}</p>
          <h2>{t(messageKeys.codeExecutionPanelTitle)}</h2>
        </div>
      </div>

      <div className="operatorStack">
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t(messageKeys.codeExecutionTaskHeader)}</strong>
            <span className={statusBadgeClass(taskStatus)}>
              {formatStatusLabel(taskStatus, t, messageKeys.codeExecutionNotStarted)}
            </span>
          </div>
          <div className="operatorMetaRow">
            {taskId ? (
              <span>{t(messageKeys.codeExecutionTaskId, { taskId })}</span>
            ) : (
              <span>{t(messageKeys.codeExecutionNoTask)}</span>
            )}
            {formattedTaskStrategy ? (
              <span>
                {t(messageKeys.codeExecutionTaskStrategy, { strategy: formattedTaskStrategy })}
              </span>
            ) : null}
          </div>
        </article>

        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t(messageKeys.codeExecutionRuntimeHeader)}</strong>
            <span className={statusBadgeClass(sessionStatus)}>
              {formatStatusLabel(sessionStatus, t, messageKeys.codeExecutionRuntimeIdle)}
            </span>
          </div>
          <div className="operatorMetaRow">
            {provider ? <span>{t(messageKeys.codeExecutionProvider, { provider })}</span> : null}
            <span>{t(messageKeys.codeExecutionModel, { model: modelLabel })}</span>
            {sessionId ? (
              <span>{t(messageKeys.codeExecutionSession, { sessionId })}</span>
            ) : (
              <span>{t(messageKeys.codeExecutionNoActiveSession)}</span>
            )}
          </div>
        </article>

        {deliveryMode || continuationBlockedReason ? (
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>{t(messageKeys.codeExecutionControlHeader)}</strong>
              <span className={controlBadgeClass}>{controlBadgeLabel}</span>
            </div>
            <div className="operatorMetaRow">
              {formattedDeliveryMode ? (
                <span>
                  {t(messageKeys.codeExecutionControlDelivery, {
                    deliveryMode: formattedDeliveryMode,
                  })}
                </span>
              ) : null}
              {deliveryRequiresOwnerDecision ? (
                <span>{t(messageKeys.codeExecutionOwnerDecisionRequired)}</span>
              ) : null}
              {deliveryApprovalPending ? (
                <span>{t(messageKeys.codeExecutionControlApprovalPending)}</span>
              ) : null}
            </div>
            {formattedBlockedReason ? (
              <p>
                {t(messageKeys.codeExecutionControlBlockedBy, {
                  reason: formattedBlockedReason,
                })}
              </p>
            ) : null}
            {continuationTargetNames.length > 0 ? (
              <p>
                {t(messageKeys.codeExecutionControlTargets, {
                  targets: continuationTargetNames.join(', '),
                })}
              </p>
            ) : null}
          </article>
        ) : null}
      </div>
    </section>
  );
}
