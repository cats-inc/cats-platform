import type { CoreApprovalQueueItem } from '../../../../core/types';
import { formatOperatorTimestamp } from '../../../../design/operatorFormatting';
import {
  isApprovalBusy,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';

export interface ApprovalQueuePanelProps {
  approvals: CoreApprovalQueueItem[];
  actorNameById: Record<string, string>;
  busy: WorkspaceBusyState;
  onDecision: (taskId: string, action: 'approve' | 'reroute' | 'reject') => void;
}

export function ApprovalQueuePanel({
  approvals,
  actorNameById,
  busy,
  onDecision,
}: ApprovalQueuePanelProps) {
  const { t } = useI18n();
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.chatApprovalQueueEyebrow)}</p>
          <h2>{t(messageKeys.chatApprovalQueuePendingTitle)}</h2>
        </div>
        <span className="operatorCountBadge">{approvals.length}</span>
      </div>
      {approvals.length === 0 ? (
        <p className="operatorEmptyState">
          {t(messageKeys.chatApprovalQueueEmptyState)}
        </p>
      ) : (
        <div className="operatorStack">
          {approvals.map((approval) => {
            const isBusy = isApprovalBusy(busy, approval.taskId);
            const requestedBy = approval.requestedByActorId
              ? actorNameById[approval.requestedByActorId] ?? 'Orchestrator'
              : t(messageKeys.chatApprovalQueueDefaultRequester);

            return (
              <article key={approval.id} className="operatorCard approvalCard">
                <div className="operatorCardHeader">
                  <div>
                    <strong>{approval.title}</strong>
                    <p>{approval.summary ?? t(messageKeys.chatApprovalQueueDefaultSummary)}</p>
                  </div>
                  <span className="operatorMetaText">
                    {formatOperatorTimestamp(approval.requestedAt)}
                  </span>
                </div>
                <div className="operatorMetaRow">
                  <span>{t(messageKeys.chatApprovalQueueRequestedByPrefix, { requestedBy })}</span>
                  {approval.notes ? <span>{approval.notes}</span> : null}
                </div>
                <div className="operatorActionRow">
                  {approval.decisionOptions.map((option) => (
                    <button
                      key={`${approval.id}:${option.action}`}
                      className={option.action === 'approve'
                        ? 'operatorActionButton operatorActionButtonPrimary'
                        : 'operatorActionButton'}
                      type="button"
                      disabled={isBusy}
                      title={option.description}
                      onClick={() => onDecision(approval.taskId, option.action)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
