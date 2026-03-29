export interface PlanStep {
  id: string;
  ordinal: number;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  detail: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PlanState {
  taskId: string;
  steps: PlanStep[];
  version: number;
  replanCount: number;
  updatedAt: string;
}

export interface PlanPanelProps {
  plan: PlanState | null;
  onReplan?: () => void;
}

const STATUS_LABELS: Record<PlanStep['status'], string> = {
  not_started: 'Pending',
  in_progress: 'Running',
  completed: 'Done',
  blocked: 'Blocked',
};

const STATUS_CLASSES: Record<PlanStep['status'], string> = {
  not_started: 'codePlanStepPending',
  in_progress: 'codePlanStepRunning',
  completed: 'codePlanStepDone',
  blocked: 'codePlanStepBlocked',
};

export function PlanPanel({ plan, onReplan }: PlanPanelProps) {
  if (!plan) {
    return (
      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Plan</p>
            <h2>Code Plan</h2>
          </div>
        </div>
        <p className="operatorEmptyState">
          No plan steps have been created for this task yet.
        </p>
      </section>
    );
  }

  const completedCount = plan.steps.filter((s) => s.status === 'completed').length;
  const totalCount = plan.steps.length;

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Plan</p>
          <h2>Code Plan</h2>
        </div>
        <span className="operatorBadge">
          {completedCount}/{totalCount}
          {plan.replanCount > 0 ? ` (re-planned ${plan.replanCount}x)` : ''}
        </span>
      </div>
      <div className="operatorStack">
        <ol className="codePlanStepList">
          {plan.steps.map((step) => (
            <li key={step.id} className={`codePlanStep ${STATUS_CLASSES[step.status]}`}>
              <span className="codePlanStepOrdinal">{step.ordinal + 1}.</span>
              <span className="codePlanStepTitle">{step.title}</span>
              <span className="codePlanStepStatus">{STATUS_LABELS[step.status]}</span>
              {step.detail ? (
                <p className="codePlanStepDetail">{step.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
      {onReplan ? (
        <div className="operatorPanelFooter">
          <button
            type="button"
            className="operatorAction"
            onClick={onReplan}
          >
            Re-plan
          </button>
        </div>
      ) : null}
    </section>
  );
}
