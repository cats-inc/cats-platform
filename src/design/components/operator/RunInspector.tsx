import {
  branchStatusLabel,
  checkpointStatusLabel,
  checkpointStatusSeverity,
  formatOperatorTimestamp,
  operatorBranchHandoffReasonLabel,
  operatorBranchStrategyLabel,
  operatorCooldownLabel,
  operatorGuardReasonLabel,
  operatorSeverityClassName,
  operatorWorkflowShapeLabel,
  operatorWorkflowStageLabel,
  outcomeStatusLabel,
  outcomeStatusSeverity,
  runStatusLabel,
  runStatusSeverity,
} from '../../operatorFormatting';
import {
  TraceList,
  type OperatorTraceListItem,
} from './TraceList';
import { useI18n } from '../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../shared/i18n/index.js';
import type { RoomWorkflowTargetStatus } from '../../../shared/roomRouting.js';

export interface OperatorRunInspectorRun {
  id: string;
  title: string;
  status: string;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
}

export interface OperatorRunInspectorCheckpoint {
  id: string;
  label: string;
  status: string;
  summary: string | null;
}

export interface OperatorRunInspectorBranchState {
  id: string;
  participantName: string;
  status: string;
  handoffReason: string | null;
  branchStrategy: string | null;
  parentCheckpointId: string | null;
  error: string | null;
}

export interface OperatorRunInspectorOutcome {
  id: string;
  title: string;
  status: string;
  summary: string | null;
}

export interface OperatorRunInspectorView {
  run: OperatorRunInspectorRun;
  traces: OperatorTraceListItem[];
  checkpoints: OperatorRunInspectorCheckpoint[];
  branchStates: OperatorRunInspectorBranchState[];
  outcomes: OperatorRunInspectorOutcome[];
  workflowStageId: string | null;
  workflowShape: string | null;
  reviewRequired: boolean;
  guardReason: string | null;
  cooldownLabel: string | null;
}

export interface OperatorRunInspectorProps {
  runs: OperatorRunInspectorRun[];
  actorNameById: Record<string, string>;
  inspector: OperatorRunInspectorView | null;
  onSelectRun: (runId: string) => void;
}

export function RunInspector({
  runs,
  actorNameById,
  inspector,
  onSelectRun,
}: OperatorRunInspectorProps) {
  const { t } = useI18n();

  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">{t(messageKeys.sharedOperatorEyebrowInspector)}</p>
          <h2>{t(messageKeys.sharedOperatorRunInspectorTitle)}</h2>
        </div>
      </div>
      {runs.length === 0 || !inspector ? (
        <p className="operatorEmptyState">{t(messageKeys.sharedOperatorRunInspectorNoHistory)}</p>
      ) : (
        <div className="operatorStack">
          <div className="operatorRunTabs">
            {runs.slice(0, 6).map((run) => (
              <button
                key={run.id}
                className={run.id === inspector.run.id ? 'operatorRunTab operatorRunTabActive' : 'operatorRunTab'}
                type="button"
                onClick={() => onSelectRun(run.id)}
              >
                <span>{runStatusLabel(run.status as never, t)}</span>
                <strong>{run.title}</strong>
              </button>
            ))}
          </div>
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <div>
                <strong>{inspector.run.title}</strong>
                <p>
                  {inspector.run.summary
                    ?? t(messageKeys.sharedOperatorRunInspectorSummaryFallback)}
                </p>
              </div>
              <span
                className={`operatorStatusBadge ${operatorSeverityClassName(runStatusSeverity(inspector.run.status as never))}`}
              >
                {runStatusLabel(inspector.run.status as never, t)}
              </span>
            </div>
            <div className="operatorMetaRow">
              <span>
                {t(messageKeys.sharedOperatorMetaStarted, {
                  time: formatOperatorTimestamp(inspector.run.startedAt ?? inspector.run.createdAt, t),
                })}
              </span>
              <span>
                {t(messageKeys.sharedOperatorMetaUpdated, {
                  time: formatOperatorTimestamp(inspector.run.updatedAt, t),
                })}
              </span>
            </div>
            {inspector.workflowStageId || inspector.workflowShape ? (
              <div className="operatorMetaRow">
                {inspector.workflowStageId ? (
                  <span>
                    {t(messageKeys.sharedOperatorMetaStage, {
                      stage: operatorWorkflowStageLabel(inspector.workflowStageId, t),
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
            {inspector.guardReason ? (
              <div className="operatorCallout operatorCalloutAttention">
                {t(messageKeys.sharedOperatorMetaGuardrail, {
                  guardrail: operatorGuardReasonLabel(inspector.guardReason, t),
                })}
              </div>
            ) : null}
            {inspector.cooldownLabel ? (
              <div className="operatorCallout operatorCalloutMuted">
                {t(messageKeys.sharedOperatorMetaCooldown, {
                  cooldown: operatorCooldownLabel(inspector.cooldownLabel, t),
                })}
              </div>
            ) : null}
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>{t(messageKeys.sharedOperatorSectionTrace)}</strong>
              </div>
              <TraceList traces={inspector.traces} actorNameById={actorNameById} />
            </div>
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>{t(messageKeys.sharedOperatorSectionCheckpoints)}</strong>
              </div>
              {inspector.checkpoints.length === 0 ? (
                <p className="operatorEmptyState operatorInsetEmpty">
                  {t(messageKeys.sharedOperatorNoCheckpointsRecorded)}
                </p>
              ) : (
                <div className="operatorList">
                  {inspector.checkpoints.slice(0, 4).map((checkpoint) => (
                    <article key={checkpoint.id} className="operatorListItem">
                      <div className="operatorListItemHeader">
                        <strong>{checkpoint.label}</strong>
                        <span
                          className={`operatorStatusBadge ${operatorSeverityClassName(checkpointStatusSeverity(checkpoint.status as never))}`}
                        >
                          {checkpointStatusLabel(checkpoint.status as never, t)}
                        </span>
                      </div>
                      <p>{checkpoint.summary ?? t(messageKeys.sharedOperatorCheckpointSummaryFallback)}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>{t(messageKeys.sharedOperatorSectionBranches)}</strong>
              </div>
              {inspector.branchStates.length === 0 ? (
                <p className="operatorEmptyState operatorInsetEmpty">
                  {t(messageKeys.sharedOperatorNoBranchesRecorded)}
                </p>
              ) : (
                <div className="operatorList">
                  {inspector.branchStates.slice(0, 6).map((branch) => (
                    <article key={branch.id} className="operatorListItem">
                      <div className="operatorListItemHeader">
                        <strong>{branch.participantName}</strong>
                        <span className="operatorMetaText">
                          {branchStatusLabel(branch.status as RoomWorkflowTargetStatus, t)}
                        </span>
                      </div>
                      <p>
                        {branch.handoffReason
                          ? `${t(messageKeys.sharedOperatorBranchHandoff, {
                            handoffReason: operatorBranchHandoffReasonLabel(
                              branch.handoffReason,
                              t,
                            ),
                          })} `
                          : ''}
                        {branch.branchStrategy
                          ? `${t(messageKeys.sharedOperatorBranchStrategy, {
                            strategy: operatorBranchStrategyLabel(
                              branch.branchStrategy,
                              t,
                            ),
                          })} `
                          : ''}
                        {branch.parentCheckpointId
                          ? t(messageKeys.sharedOperatorBranchFromCheckpoint, {
                            checkpointId: branch.parentCheckpointId,
                          })
                          : t(messageKeys.sharedOperatorBranchNoLineage)}
                      </p>
                      {branch.error ? <p>{branch.error}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>{t(messageKeys.sharedOperatorSectionOutcomes)}</strong>
              </div>
              {inspector.outcomes.length === 0 ? (
                <p className="operatorEmptyState operatorInsetEmpty">
                  {t(messageKeys.sharedOperatorNoOutcomesRecorded)}
                </p>
              ) : (
                <div className="operatorList">
                  {inspector.outcomes.slice(0, 3).map((outcome) => (
                    <article key={outcome.id} className="operatorListItem">
                      <div className="operatorListItemHeader">
                        <strong>{outcome.title}</strong>
                        <span
                          className={`operatorStatusBadge ${operatorSeverityClassName(outcomeStatusSeverity(outcome.status as never))}`}
                        >
                          {outcomeStatusLabel(outcome.status as never, t)}
                        </span>
                      </div>
                      <p>{outcome.summary ?? t(messageKeys.sharedOperatorOutcomeSummaryFallback)}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
