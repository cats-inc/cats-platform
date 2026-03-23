import type { ChatRunInspectorView } from '../../shared/operatorLoop';
import {
  checkpointStatusLabel,
  checkpointStatusSeverity,
  formatOperatorTimestamp,
  operatorSeverityClassName,
  outcomeStatusLabel,
  outcomeStatusSeverity,
  runStatusLabel,
  runStatusSeverity,
} from './operatorUi';
import { TraceList } from './TraceList';

export interface RunInspectorProps {
  runs: ChatRunInspectorView['run'][];
  actorNameById: Record<string, string>;
  inspector: ChatRunInspectorView | null;
  onSelectRun: (runId: string) => void;
}

export function RunInspector({
  runs,
  actorNameById,
  inspector,
  onSelectRun,
}: RunInspectorProps) {
  return (
    <section className="operatorPanel">
      <div className="operatorPanelHeader">
        <div>
          <p className="operatorEyebrow">Inspector</p>
          <h2>Run inspector</h2>
        </div>
      </div>
      {runs.length === 0 || !inspector ? (
        <p className="operatorEmptyState">
          Select a room with workflow history to inspect traces and checkpoints.
        </p>
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
                <span>{runStatusLabel(run.status)}</span>
                <strong>{run.title}</strong>
              </button>
            ))}
          </div>
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <div>
                <strong>{inspector.run.title}</strong>
                <p>{inspector.run.summary ?? 'Inspect trace, checkpoint, and outcome records for this run.'}</p>
              </div>
              <span
                className={`operatorStatusBadge ${operatorSeverityClassName(runStatusSeverity(inspector.run.status))}`}
              >
                {runStatusLabel(inspector.run.status)}
              </span>
            </div>
            <div className="operatorMetaRow">
              <span>Started {formatOperatorTimestamp(inspector.run.startedAt ?? inspector.run.createdAt)}</span>
              <span>Updated {formatOperatorTimestamp(inspector.run.updatedAt)}</span>
            </div>
            {inspector.workflowStageId || inspector.workflowShape ? (
              <div className="operatorMetaRow">
                {inspector.workflowStageId ? <span>Stage: {inspector.workflowStageId}</span> : null}
                {inspector.workflowShape ? <span>Shape: {inspector.workflowShape}</span> : null}
                {inspector.reviewRequired ? <span>Review required</span> : null}
              </div>
            ) : null}
            {inspector.guardReason ? (
              <div className="operatorCallout operatorCalloutAttention">
                Guardrail: {inspector.guardReason}
              </div>
            ) : null}
            {inspector.cooldownLabel ? (
              <div className="operatorCallout operatorCalloutMuted">
                Cooldown: {inspector.cooldownLabel}
              </div>
            ) : null}
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>Trace</strong>
              </div>
              <TraceList traces={inspector.traces} actorNameById={actorNameById} />
            </div>
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>Checkpoints</strong>
              </div>
              {inspector.checkpoints.length === 0 ? (
                <p className="operatorEmptyState operatorInsetEmpty">No checkpoints recorded for this run.</p>
              ) : (
                <div className="operatorList">
                  {inspector.checkpoints.slice(0, 4).map((checkpoint) => (
                    <article key={checkpoint.id} className="operatorListItem">
                      <div className="operatorListItemHeader">
                        <strong>{checkpoint.label}</strong>
                        <span
                          className={`operatorStatusBadge ${operatorSeverityClassName(checkpointStatusSeverity(checkpoint.status))}`}
                        >
                          {checkpointStatusLabel(checkpoint.status)}
                        </span>
                      </div>
                      <p>{checkpoint.summary ?? 'Checkpoint recorded.'}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>Branches</strong>
              </div>
              {inspector.branchStates.length === 0 ? (
                <p className="operatorEmptyState operatorInsetEmpty">
                  No branch or handoff lineage recorded for this run.
                </p>
              ) : (
                <div className="operatorList">
                  {inspector.branchStates.slice(0, 6).map((branch) => (
                    <article key={branch.id} className="operatorListItem">
                      <div className="operatorListItemHeader">
                        <strong>{branch.participantName}</strong>
                        <span className="operatorMetaText">{branch.status}</span>
                      </div>
                      <p>
                        {branch.handoffReason ? `Handoff: ${branch.handoffReason}. ` : ''}
                        {branch.branchStrategy ? `Strategy: ${branch.branchStrategy}. ` : ''}
                        {branch.parentCheckpointId ? `From ${branch.parentCheckpointId}.` : 'No checkpoint lineage recorded.'}
                      </p>
                      {branch.error ? <p>{branch.error}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="operatorInspectorSection">
              <div className="operatorInspectorHeader">
                <strong>Outcomes</strong>
              </div>
              {inspector.outcomes.length === 0 ? (
                <p className="operatorEmptyState operatorInsetEmpty">No outcomes recorded for this run.</p>
              ) : (
                <div className="operatorList">
                  {inspector.outcomes.slice(0, 3).map((outcome) => (
                    <article key={outcome.id} className="operatorListItem">
                      <div className="operatorListItemHeader">
                        <strong>{outcome.title}</strong>
                        <span
                          className={`operatorStatusBadge ${operatorSeverityClassName(outcomeStatusSeverity(outcome.status))}`}
                        >
                          {outcomeStatusLabel(outcome.status)}
                        </span>
                      </div>
                      <p>{outcome.summary ?? 'Outcome recorded.'}</p>
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
