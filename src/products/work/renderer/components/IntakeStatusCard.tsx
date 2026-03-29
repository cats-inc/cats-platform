import type { WorkIntakeSummaryItem, WorkPendingPlanItem } from '../../api/projection.js';

export interface IntakeStatusCardProps {
  intakeItems: WorkIntakeSummaryItem[];
  pendingPlans: WorkPendingPlanItem[];
  onViewPlan: (projectId: string) => void;
  onStartIntake: () => void;
}

export function IntakeStatusCard({
  intakeItems,
  pendingPlans,
  onViewPlan,
  onStartIntake,
}: IntakeStatusCardProps) {
  return (
    <div className="work-intake-status-card">
      <div className="work-intake-status-header">
        <h3 className="work-intake-status-title">Work Intake</h3>
        <button
          type="button"
          className="work-intake-btn work-intake-btn--small"
          onClick={onStartIntake}
        >
          + Start Work
        </button>
      </div>

      {pendingPlans.length > 0 ? (
        <div className="work-intake-status-section">
          <h4 className="work-intake-status-subtitle">Pending Review ({pendingPlans.length})</h4>
          <ul className="work-intake-status-list">
            {pendingPlans.map((plan) => (
              <li key={plan.projectId} className="work-intake-status-item">
                <button
                  type="button"
                  className="work-intake-status-link"
                  onClick={() => onViewPlan(plan.projectId)}
                >
                  {plan.projectTitle}
                </button>
                <span className="work-intake-status-meta">
                  {plan.draftTaskCount} draft &middot; {plan.pendingApprovalCount} pending
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {intakeItems.length > 0 ? (
        <div className="work-intake-status-section">
          <h4 className="work-intake-status-subtitle">All Initiatives ({intakeItems.length})</h4>
          <ul className="work-intake-status-list">
            {intakeItems.map((item) => (
              <li key={item.projectId} className="work-intake-status-item">
                <button
                  type="button"
                  className="work-intake-status-link"
                  onClick={() => onViewPlan(item.projectId)}
                >
                  {item.projectTitle}
                </button>
                <span className="work-intake-status-meta">
                  {item.templateLabel ?? item.templateId} &middot; {item.taskCount} tasks &middot; {item.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {intakeItems.length === 0 && pendingPlans.length === 0 ? (
        <p className="work-intake-status-empty">
          No work initiatives yet. Start one to generate a plan.
        </p>
      ) : null}
    </div>
  );
}
