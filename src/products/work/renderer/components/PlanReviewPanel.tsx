import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { WorkIntakePlanProjection } from '../../api/intakeProjection.js';
import {
  approveIntakePlan,
  fetchIntakePlan,
  rejectIntakePlan,
} from '../api/intake.js';

const PRODUCT_LABELS: Record<string, string> = {
  work: 'Work',
  chat: 'Chat',
  code: 'Code',
};

function ProductBadge({ product }: { product: string | null }) {
  if (!product) {
    return null;
  }

  return (
    <span className={`work-plan-badge work-plan-badge--${product}`}>
      {PRODUCT_LABELS[product] ?? product}
    </span>
  );
}

function StrategyBadge({ strategy }: { strategy: string | null }) {
  if (!strategy) {
    return null;
  }

  return (
    <span className="work-plan-badge work-plan-badge--strategy">{strategy}</span>
  );
}

export function PlanReviewPanel() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<WorkIntakePlanProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetchIntakePlan(projectId, controller.signal)
      .then((projection) => {
        setPlan(projection);
        setLoading(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load plan');
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [projectId]);

  const handleApprove = useCallback(() => {
    if (!projectId || busy) {
      return;
    }

    setBusy('approving');
    setError(null);
    approveIntakePlan(projectId)
      .then((updated) => {
        setPlan(updated);
        setBusy('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to approve');
        setBusy('');
      });
  }, [projectId, busy]);

  const handleReject = useCallback(() => {
    if (!projectId || busy) {
      return;
    }

    setBusy('rejecting');
    setError(null);
    rejectIntakePlan(projectId, rejectNotes || 'Rejected by owner.')
      .then((updated) => {
        setPlan(updated);
        setBusy('');
        setShowRejectForm(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to reject');
        setBusy('');
      });
  }, [projectId, busy, rejectNotes]);

  if (loading) {
    return <div className="work-plan-loading">Loading plan...</div>;
  }

  if (!plan) {
    return (
      <div className="work-plan-empty">
        <p>{error ?? 'Plan not found.'}</p>
        <button
          type="button"
          className="work-intake-btn work-intake-btn--secondary"
          onClick={() => navigate('/work/intake')}
        >
          Back to Intake
        </button>
      </div>
    );
  }

  const isDraft = plan.planStatus === 'draft';
  const isApproved = plan.planStatus === 'approved';
  const isRejected = plan.planStatus === 'rejected';

  return (
    <div className="work-plan-review">
      <div className="work-plan-header">
        <h2 className="work-plan-title">{plan.project.title}</h2>
        <span className={`work-plan-status work-plan-status--${plan.planStatus}`}>
          {plan.planStatus}
        </span>
      </div>

      {plan.project.summary ? (
        <p className="work-plan-summary">{plan.project.summary}</p>
      ) : null}

      {plan.template ? (
        <div className="work-plan-template-info">
          Template: <strong>{plan.template.label}</strong>
        </div>
      ) : null}

      <div className="work-plan-task-list">
        <h3 className="work-plan-section-title">Generated Tasks ({plan.tasks.length})</h3>
        {plan.tasks.map((task, index) => (
          <div key={task.id} className={`work-plan-task work-plan-task--${task.status}`}>
            <div className="work-plan-task-header">
              <span className="work-plan-task-index">{index + 1}.</span>
              <span className="work-plan-task-title">{task.title}</span>
              <ProductBadge product={task.productHint} />
              <StrategyBadge strategy={task.strategyHint} />
            </div>
            {task.summary ? (
              <p className="work-plan-task-summary">{task.summary}</p>
            ) : null}
            {task.acceptanceCriteria ? (
              <p className="work-plan-task-criteria">
                <strong>Acceptance:</strong> {task.acceptanceCriteria}
              </p>
            ) : null}
            {task.dependsOnTaskIds.length > 0 ? (
              <p className="work-plan-task-deps">
                Depends on: {task.dependsOnTaskIds.length} task(s)
              </p>
            ) : null}
            <span className={`work-plan-task-approval work-plan-task-approval--${task.approval.status}`}>
              {task.approval.status.replace(/_/gu, ' ')}
            </span>
          </div>
        ))}
      </div>

      {plan.activity.latestMessages.length > 0 ? (
        <div className="work-plan-activity">
          <h3 className="work-plan-section-title">Activity</h3>
          <ul className="work-plan-activity-list">
            {plan.activity.latestMessages.map((msg, i) => (
              <li key={i} className="work-plan-activity-item">{msg}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <div className="work-intake-error">{error}</div>
      ) : null}

      {isDraft ? (
        <div className="work-plan-actions">
          <button
            type="button"
            className="work-intake-btn work-intake-btn--primary"
            onClick={handleApprove}
            disabled={Boolean(busy)}
          >
            {busy === 'approving' ? 'Approving...' : 'Approve Plan'}
          </button>
          {showRejectForm ? (
            <div className="work-plan-reject-form">
              <textarea
                className="work-intake-textarea"
                placeholder="Rejection notes (optional)"
                rows={2}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                disabled={Boolean(busy)}
              />
              <button
                type="button"
                className="work-intake-btn work-intake-btn--danger"
                onClick={handleReject}
                disabled={Boolean(busy)}
              >
                {busy === 'rejecting' ? 'Rejecting...' : 'Confirm Reject'}
              </button>
              <button
                type="button"
                className="work-intake-btn work-intake-btn--secondary"
                onClick={() => setShowRejectForm(false)}
                disabled={Boolean(busy)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="work-intake-btn work-intake-btn--secondary"
              onClick={() => setShowRejectForm(true)}
              disabled={Boolean(busy)}
            >
              Reject
            </button>
          )}
        </div>
      ) : null}

      {isApproved ? (
        <div className="work-plan-approved-notice">
          Plan approved. Tasks are being dispatched to their target products.
        </div>
      ) : null}

      {isRejected ? (
        <div className="work-plan-rejected-notice">
          Plan was rejected.
          <button
            type="button"
            className="work-intake-btn work-intake-btn--secondary"
            onClick={() => navigate('/work/intake')}
          >
            Start New Intake
          </button>
        </div>
      ) : null}
    </div>
  );
}
