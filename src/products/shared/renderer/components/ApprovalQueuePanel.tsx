import type { CoreApprovalQueueItem } from '../../../../core/types.js';
import { formatOperatorTimestamp } from '../../../../design/operatorFormatting.js';
import {
  isApprovalBusy,
  type WorkspaceBusyState,
} from '../../../../shared/workspaceBusy.js';

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
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Approval</p>
          <h2>Pending approvals</h2>
        </div>
        <span className="operatorCountBadge">{approvals.length}</span>
      </div>
      {approvals.length === 0 ? (
        <p className="operatorEmptyState">
          The room can keep moving until a plan asks for an owner decision.
        </p>
      ) : (
        <div className="operatorStack">
          {approvals.map((approval) => {
            const isBusy = isApprovalBusy(busy, approval.taskId);
            const requestedBy = approval.requestedByActorId
              ? actorNameById[approval.requestedByActorId] ?? 'Orchestrator'
              : 'Orchestrator';

            return (
              <article key={approval.id} className="operatorCard approvalCard">
                <div className="operatorCardHeader">
                  <div>
                    <strong>{approval.title}</strong>
                    <p>{approval.summary ?? 'Review this dispatch before Cats continue.'}</p>
                  </div>
                  <span className="operatorMetaText">
                    {formatOperatorTimestamp(approval.requestedAt)}
                  </span>
                </div>
                <div className="operatorMetaRow">
                  <span>Requested by {requestedBy}</span>
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
