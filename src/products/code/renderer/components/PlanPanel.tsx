import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';

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

const STATUS_CLASSES: Record<PlanStep['status'], string> = {
  not_started: 'codePlanStepPending',
  in_progress: 'codePlanStepRunning',
  completed: 'codePlanStepDone',
  blocked: 'codePlanStepBlocked',
};

function getStatusLabelKey(status: PlanStep['status']) {
  switch (status) {
    case 'completed':
      return messageKeys.codePlanStatusDone;
    case 'in_progress':
      return messageKeys.codePlanStatusRunning;
    case 'blocked':
      return messageKeys.codePlanStatusBlocked;
    case 'not_started':
    default:
      return messageKeys.codePlanStatusPending;
  }
}

export function PlanPanel({ plan, onReplan }: PlanPanelProps) {
  const { t } = useI18n();

  if (!plan) {
    return (
      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codePlanHeader)}</p>
            <h2>{t(messageKeys.codePlanPanelTitle)}</h2>
          </div>
        </div>
        <p className="operatorEmptyState">
          {t(messageKeys.codePlanEmpty)}
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
          <p className="operatorEyebrow">{t(messageKeys.codePlanHeader)}</p>
          <h2>{t(messageKeys.codePlanPanelTitle)}</h2>
        </div>
        <span className="operatorCountBadge">
          {completedCount}/{totalCount}
          {plan.replanCount > 0
            ? t(messageKeys.codePlanReplannedSuffix, { count: plan.replanCount })
            : ''}
        </span>
      </div>
      <div className="operatorStack">
        <ol className="codePlanStepList">
          {plan.steps.map((step) => (
            <li key={step.id} className={`codePlanStep ${STATUS_CLASSES[step.status]}`}>
              <span className="codePlanStepOrdinal">{step.ordinal + 1}.</span>
              <span className="codePlanStepTitle">{step.title}</span>
              <span className="codePlanStepStatus">{t(getStatusLabelKey(step.status))}</span>
              {step.detail ? (
                <p className="codePlanStepDetail">{step.detail}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
      {onReplan ? (
        <div className="operatorActionRow codeBuilderActionRowEnd">
          <button
            type="button"
            className="operatorActionButton"
            onClick={onReplan}
          >
            {t(messageKeys.codePlanReplan)}
          </button>
        </div>
      ) : null}
    </section>
  );
}
