import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { WorkIntakePlanProjection } from '../../api/intakeProjection.js';
import {
  approveIntakePlan,
  fetchIntakePlan,
  patchIntakePlanTask,
  rejectIntakePlan,
  type WorkIntakePlanTaskPatch,
} from '../api/intake.js';
import {
  formatWorkExecutionProduct,
  formatWorkExecutionStrategy,
} from '../workExecutionPresentation.js';

function ProductBadge({ product }: { product: string | null }) {
  if (!product) {
    return null;
  }

  return (
    <span className={`work-plan-badge work-plan-badge--${product}`}>
      {formatWorkExecutionProduct(product)}
    </span>
  );
}

function StrategyBadge({ strategy }: { strategy: string | null }) {
  if (!strategy) {
    return null;
  }

  return (
    <span className="work-plan-badge work-plan-badge--strategy">
      {formatWorkExecutionStrategy(strategy)}
    </span>
  );
}

function HandoffBadge({
  state,
  label,
}: {
  state: 'pending_review' | 'active_here' | 'ready_for_pickup' | 'completed' | 'stopped';
  label: string;
}) {
  return (
    <span className={`work-plan-badge work-plan-badge--handoff work-plan-badge--handoff-${state}`}>
      {label}
    </span>
  );
}

type WorkPlanTaskProduct = NonNullable<WorkIntakePlanTaskPatch['productHint']>;

interface WorkPlanTaskEditorDraft {
  acceptanceCriteria: string;
  productHint: WorkPlanTaskProduct;
  strategyHint: string;
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<WorkPlanTaskEditorDraft>({
    acceptanceCriteria: '',
    productHint: 'work',
    strategyHint: '',
  });

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
    if (!projectId || busy || editingTaskId) {
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
  }, [projectId, busy, editingTaskId]);

  const handleStartTaskEdit = useCallback((
    task: WorkIntakePlanProjection['tasks'][number],
  ) => {
    setEditingTaskId(task.id);
    setTaskDraft({
      acceptanceCriteria: task.acceptanceCriteria ?? '',
      productHint: task.productHint ?? task.handoff.targetProduct,
      strategyHint: task.strategyHint ?? '',
    });
    setError(null);
  }, []);

  const handleCancelTaskEdit = useCallback(() => {
    setEditingTaskId(null);
    setTaskDraft({
      acceptanceCriteria: '',
      productHint: 'work',
      strategyHint: '',
    });
    setError(null);
  }, []);

  const handleSaveTaskEdit = useCallback(() => {
    if (!projectId || !editingTaskId || busy) {
      return;
    }

    setBusy(`saving:${editingTaskId}`);
    setError(null);
    patchIntakePlanTask(projectId, editingTaskId, {
      acceptanceCriteria: taskDraft.acceptanceCriteria.trim() || null,
      productHint: taskDraft.productHint,
      strategyHint: taskDraft.strategyHint.trim() || null,
    })
      .then((updated) => {
        setPlan(updated);
        setEditingTaskId(null);
        setBusy('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to update task');
        setBusy('');
      });
  }, [projectId, editingTaskId, busy, taskDraft]);

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
  const handoffSummary = [
    (() => {
      const activeHereCount = plan.tasks.filter((task) => task.handoff.state === 'active_here').length;
      return activeHereCount > 0
        ? `${activeHereCount} continue in Work`
        : null;
    })(),
    (() => {
      const readyCodeCount = plan.tasks.filter(
        (task) => task.handoff.state === 'ready_for_pickup' && task.handoff.targetProduct === 'code',
      ).length;
      return readyCodeCount > 0
        ? `${readyCodeCount} ready for Code pickup`
        : null;
    })(),
    (() => {
      const readyChatCount = plan.tasks.filter(
        (task) => task.handoff.state === 'ready_for_pickup' && task.handoff.targetProduct === 'chat',
      ).length;
      return readyChatCount > 0
        ? `${readyChatCount} ready for Chat pickup`
        : null;
    })(),
  ].filter((value): value is string => Boolean(value));

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
          {plan.template.description ? (
            <span className="work-plan-template-description"> — {plan.template.description}</span>
          ) : null}
        </div>
      ) : null}

      {plan.intent ? (
        <section className="work-plan-intent" aria-label="Planning intent">
          <h3 className="work-plan-section-title">Planning intent</h3>
          {plan.intent.desiredOutcome ? (
            <p className="work-plan-intent-outcome">
              <strong>Desired outcome:</strong> {plan.intent.desiredOutcome}
            </p>
          ) : null}
          {plan.intent.brief ? (
            <p className="work-plan-intent-brief">
              <strong>Context:</strong> {plan.intent.brief}
            </p>
          ) : null}
          {(plan.intent.deadline || plan.intent.priority) ? (
            <ul className="work-plan-intent-meta">
              {plan.intent.deadline ? (
                <li><strong>Deadline:</strong> {plan.intent.deadline}</li>
              ) : null}
              {plan.intent.priority ? (
                <li><strong>Priority:</strong> {plan.intent.priority}</li>
              ) : null}
            </ul>
          ) : null}
        </section>
      ) : null}

      {plan.roles.length > 0 ? (
        <section className="work-plan-roles" aria-label="Roles and product routing">
          <h3 className="work-plan-section-title">Roles &amp; product routing</h3>
          <p className="work-plan-roles-intro">
            Each task is owned by a template role and routed to the product where the role's
            work happens. You can override product routing per task below.
          </p>
          <ul className="work-plan-role-list">
            {plan.roles.map((role) => (
              <li
                key={role.key}
                className={`work-plan-role work-plan-role--${role.required ? 'required' : 'optional'}`}
              >
                <div className="work-plan-role-header">
                  <span className="work-plan-role-label">{role.label}</span>
                  {role.required ? null : (
                    <span className="work-plan-role-flag">optional</span>
                  )}
                  {role.defaultProductHint ? (
                    <ProductBadge product={role.defaultProductHint} />
                  ) : null}
                  {role.defaultStrategyHint ? (
                    <StrategyBadge strategy={role.defaultStrategyHint} />
                  ) : null}
                </div>
                {role.tasks.length > 0 ? (
                  <ul className="work-plan-role-tasks">
                    {role.tasks.map((task) => (
                      <li key={task.taskId} className="work-plan-role-task">
                        {task.title}
                        <span className="work-plan-role-task-target">
                          → {formatWorkExecutionProduct(task.targetProduct)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="work-plan-role-empty">
                    No tasks assigned to this role in the generated plan.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
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
              <HandoffBadge state={task.handoff.state} label={task.handoff.label} />
              {isDraft ? (
                <button
                  type="button"
                  className="work-plan-task-edit-btn"
                  onClick={() => handleStartTaskEdit(task)}
                  disabled={Boolean(busy)}
                >
                  Edit
                </button>
              ) : null}
            </div>
            {task.summary ? (
              <p className="work-plan-task-summary">{task.summary}</p>
            ) : null}
            {isDraft && editingTaskId === task.id ? (
              <div className="work-plan-task-editor">
                <label className="work-intake-label" htmlFor={`task-${task.id}-acceptance`}>
                  Acceptance
                </label>
                <textarea
                  id={`task-${task.id}-acceptance`}
                  className="work-intake-textarea"
                  rows={3}
                  value={taskDraft.acceptanceCriteria}
                  onChange={(e) =>
                    setTaskDraft((draft) => ({
                      ...draft,
                      acceptanceCriteria: e.target.value,
                    }))}
                  disabled={Boolean(busy)}
                />
                <div className="work-plan-task-editor-row">
                  <label className="work-intake-label" htmlFor={`task-${task.id}-product`}>
                    Product
                    <select
                      id={`task-${task.id}-product`}
                      className="work-intake-select"
                      value={taskDraft.productHint ?? 'work'}
                      onChange={(e) =>
                        setTaskDraft((draft) => ({
                          ...draft,
                          productHint: e.target.value as WorkPlanTaskProduct,
                        }))}
                      disabled={Boolean(busy)}
                    >
                      <option value="work">Work</option>
                      <option value="chat">Chat</option>
                      <option value="code">Code</option>
                    </select>
                  </label>
                  <label className="work-intake-label" htmlFor={`task-${task.id}-strategy`}>
                    Strategy
                    <input
                      id={`task-${task.id}-strategy`}
                      className="work-intake-input"
                      value={taskDraft.strategyHint ?? ''}
                      onChange={(e) =>
                        setTaskDraft((draft) => ({
                          ...draft,
                          strategyHint: e.target.value,
                        }))}
                      disabled={Boolean(busy)}
                    />
                  </label>
                </div>
                <div className="work-plan-task-editor-actions">
                  <button
                    type="button"
                    className="work-intake-btn work-intake-btn--primary"
                    onClick={handleSaveTaskEdit}
                    disabled={Boolean(busy)}
                  >
                    {busy === `saving:${task.id}` ? 'Saving...' : 'Save Task'}
                  </button>
                  <button
                    type="button"
                    className="work-intake-btn work-intake-btn--secondary"
                    onClick={handleCancelTaskEdit}
                    disabled={Boolean(busy)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              task.acceptanceCriteria ? (
                <p className="work-plan-task-criteria">
                  <strong>Acceptance:</strong> {task.acceptanceCriteria}
                </p>
              ) : null
            )}
            {task.dependsOnTaskIds.length > 0 ? (
              <p className="work-plan-task-deps">
                Depends on: {task.dependsOnTaskIds.length} task(s)
              </p>
            ) : null}
            <p className="work-plan-task-next-action">
              <strong>Next:</strong> {task.handoff.nextAction}
            </p>
            <span className={`work-plan-task-approval work-plan-task-approval--${task.approval.status}`}>
              {task.approval.status.replace(/_/gu, ' ')}
            </span>
          </div>
        ))}
      </div>

      {plan.activity.latestMessages.length > 0 || plan.activity.backgroundCount > 0 ? (
        <div className="work-plan-activity">
          <h3 className="work-plan-section-title">Activity</h3>
          {plan.activity.latestMessages.length > 0 ? (
            <ul className="work-plan-activity-list">
              {plan.activity.latestMessages.map((msg, i) => (
                <li key={i} className="work-plan-activity-item">{msg}</li>
              ))}
            </ul>
          ) : (
            <p className="work-plan-activity-empty">
              No operator-facing activity yet for this plan.
            </p>
          )}
          {plan.activity.backgroundCount > 0 ? (
            <p className="work-plan-activity-background-note">
              {plan.activity.backgroundCount} background activity entr{plan.activity.backgroundCount === 1 ? 'y' : 'ies'} hidden (template/agent plumbing).
            </p>
          ) : null}
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
            disabled={Boolean(busy) || Boolean(editingTaskId)}
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
          Plan approved. {handoffSummary.length > 0
            ? `${handoffSummary.join('. ')}.`
            : 'Tasks are now ready for their downstream product flow.'}
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
