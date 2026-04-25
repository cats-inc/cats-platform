import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { WorkTaskDetailProjection } from '../../api/projection.js';
import { buildChannelPath, buildMyCatPath } from '../../shared/channelPaths.js';
import { listCatActorLinks } from '../actorLinks.js';
import { fetchWorkTaskDetail, startWorkSupervisedRun } from '../api/dashboard.js';
import {
  formatWorkCorrelation,
  formatWorkDeliveryMode,
  formatWorkExecutionProduct,
  formatWorkExecutionStrategy,
  formatWorkRuntimeBridgeProduct,
  formatWorkTokenList,
} from '../workExecutionPresentation.js';

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not recorded';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function compactList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'None';
}

function statusBadgeClassName(status: string | null | undefined): string {
  switch (status) {
    case 'blocked':
    case 'cancelled':
      return 'operatorStatusBadge isError';
    case 'pending_approval':
      return 'operatorStatusBadge isAttention';
    case 'in_progress':
      return 'operatorStatusBadge isProgress';
    case 'completed':
      return 'operatorStatusBadge isSuccess';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

function attentionBadgeClassName(severity: string | null | undefined): string {
  switch (severity) {
    case 'attention':
      return 'operatorStatusBadge isAttention';
    case 'error':
      return 'operatorStatusBadge isError';
    case 'progress':
      return 'operatorStatusBadge isProgress';
    case 'success':
      return 'operatorStatusBadge isSuccess';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

function formatSupervisionBlockers(
  blockers: NonNullable<WorkTaskDetailProjection['supervision']>['blockers'],
): string {
  return blockers.length > 0
    ? blockers.map((blocker) => `${blocker.code}: ${blocker.message}`).join(' | ')
    : 'None';
}

function formatSupervisionApprovals(
  approvals: NonNullable<WorkTaskDetailProjection['supervision']>['approvalRequests'],
): string {
  return approvals.length > 0
    ? approvals.map((approval) =>
      `${approval.requestId}: ${approval.state}${approval.gating ? ' gated' : ''}`).join(' | ')
    : 'None';
}

function SectionHeader({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary?: string | null;
}) {
  return (
    <div className="operatorPanelHeader">
      <div>
        <p className="operatorEyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {summary ? (
        <span className="operatorStatusBadge isMuted">{summary}</span>
      ) : null}
    </div>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="operatorCard workTaskDetailFact">
      <div className="operatorCardHeader">
        <strong>{label}</strong>
      </div>
      <p>{value}</p>
    </article>
  );
}

export function TaskDetailView() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WorkTaskDetailProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingSupervisedRun, setStartingSupervisedRun] = useState(false);
  const [error, setError] = useState('');

  const loadTask = useCallback(async (nextTaskId: string, signal?: AbortSignal) => {
    setError('');
    const nextPayload = await fetchWorkTaskDetail(nextTaskId, signal);
    setPayload(nextPayload);
  }, []);

  useEffect(() => {
    if (!taskId) {
      setError('Task id is required.');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    loadTask(taskId, controller.signal)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load task detail.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadTask, taskId]);

  const handleStartSupervisedRun = useCallback(() => {
    if (!taskId) {
      return;
    }

    setError('');
    setStartingSupervisedRun(true);
    void startWorkSupervisedRun(taskId)
      .then(() => loadTask(taskId))
      .catch((launchError) => {
        setError(
          launchError instanceof Error
            ? launchError.message
            : 'Failed to start supervised run.',
        );
      })
      .finally(() => setStartingSupervisedRun(false));
  }, [loadTask, taskId]);

  return (
    <div className="workTaskDetailView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">Task</p>
          <h1 className="codeBuilderTitle">
            {payload?.task.title ?? taskId ?? 'Work task detail'}
          </h1>
        </div>
        <div className="workWarRoomHeaderActions">
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => {
              startTransition(() => {
                navigate('/work/tasks');
              });
            }}
          >
            Back to Tasks
          </button>
          <button
            type="button"
            className="operatorActionButton"
            onClick={handleStartSupervisedRun}
            disabled={loading || startingSupervisedRun || !taskId}
          >
            {startingSupervisedRun ? 'Starting...' : 'Start supervised run'}
          </button>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => {
              if (!taskId) {
                return;
              }
              setLoading(true);
              void loadTask(taskId)
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Failed to refresh task detail.');
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading || !taskId}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="codeBuilderFeedback">{error}</div>
      ) : null}

      {loading && !payload ? (
        <section className="operatorPanel">
          <SectionHeader eyebrow="Loading" title="Task Detail" summary="pending" />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>Loading task detail...</strong>
              <span className="operatorStatusBadge isProgress">loading</span>
            </div>
            <p>Hydrating planning, control-plane, recovery, and timeline projections.</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <SectionHeader eyebrow="Snapshot" title="Task Overview" summary={payload.task.id} />
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>{payload.task.title}</strong>
                <div className="workWarRoomBadgeRow">
                  <span className={statusBadgeClassName(payload.task.status)}>
                    {payload.task.status}
                  </span>
                  <span className={attentionBadgeClassName(payload.controlPlane.attention.severity)}>
                    {payload.controlPlane.attention.severity}
                  </span>
                </div>
              </div>
              <p>{payload.task.summary ?? 'No task summary recorded.'}</p>
              <div className="operatorMetaRow">
                <span>Product: {formatWorkExecutionProduct(payload.inspection.planning.effectiveProduct)}</span>
                <span>Strategy: {formatWorkExecutionStrategy(payload.inspection.planning.effectiveStrategy)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Conversation: {payload.conversation?.title ?? payload.task.conversationId ?? 'Detached'}</span>
                <span>Updated: {formatTimestamp(payload.task.updatedAt)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Project: {payload.project?.title ?? 'No linked project'}</span>
                <span>Work item: {payload.workItem?.title ?? 'No linked work item'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Assigned: {compactList(payload.assignedActors.map((actor) => actor.displayName))}</span>
                <span>Task: {payload.task.id}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Actions: {formatWorkTokenList(payload.controlPlane.nextActions.map((action) => action.kind))}</span>
                <span>Attention: {compactList(payload.controlPlane.attention.reasons)}</span>
              </div>
              <div className="workWarRoomHeaderActions">
                {payload.conversation?.sourceChannelId ? (
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      startTransition(() => {
                        navigate(buildChannelPath(payload.conversation!.sourceChannelId!));
                      });
                    }}
                  >
                    Open chat thread
                  </button>
                ) : null}
                {payload.project ? (
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      startTransition(() => {
                        navigate(`/work/projects/${encodeURIComponent(payload.project!.id)}`);
                      });
                    }}
                  >
                    Open project
                  </button>
                ) : null}
                {payload.workItem ? (
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      startTransition(() => {
                        navigate(`/work/work-items/${encodeURIComponent(payload.workItem!.id)}`);
                      });
                    }}
                  >
                    Open work item
                  </button>
                ) : null}
                {listCatActorLinks(payload.assignedActors).map((actor) => (
                    <button
                      key={actor.actorId}
                      type="button"
                      className="operatorActionButton"
                      onClick={() => {
                        startTransition(() => {
                          navigate(buildMyCatPath(actor.catId));
                        });
                      }}
                    >
                      Open {actor.displayName}
                    </button>
                  ))}
              </div>
            </article>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Planning"
              title="Planning & Runtime"
              summary={formatWorkRuntimeBridgeProduct(payload.inspection.runtimeBridge.product)}
            />
            <div className="workTaskDetailGrid">
              <DetailCard
                label="Acceptance"
                value={payload.inspection.planning.acceptanceCriteria ?? 'Not specified'}
              />
              <DetailCard
                label="Depends On"
                value={compactList(payload.inspection.planning.dependsOnTaskIds)}
              />
              <DetailCard
                label="Requested Strategy"
                value={formatWorkExecutionStrategy(
                  payload.inspection.runtimeBridge.request.requestedStrategy,
                )}
              />
              <DetailCard
                label="Correlation"
                value={formatWorkCorrelation(payload.inspection.runtimeBridge.request.correlation)}
              />
            </div>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Control"
              title="Control Plane"
              summary={formatWorkDeliveryMode(payload.controlPlane.runtimeDeliveryIntent?.mode)}
            />
            <div className="workTaskDetailGrid">
              <DetailCard
                label="Next Actions"
                value={formatWorkTokenList(payload.controlPlane.nextActions.map((action) => action.kind))}
              />
              <DetailCard
                label="Delivery Gates"
                value={formatWorkTokenList(payload.controlPlane.runtimeDeliveryIntent?.gates)}
              />
              <DetailCard
                label="Requested Delivery"
                value={formatWorkTokenList(
                  payload.controlPlane.runtimeDeliveryIntent?.requestedActions,
                )}
              />
              <DetailCard
                label="Continuation"
                value={
                  payload.controlPlane.workflowContinuation
                    ? [
                      payload.controlPlane.workflowContinuation.stageId,
                      payload.controlPlane.workflowContinuation.blockedReason,
                      payload.controlPlane.workflowContinuation.replayState,
                    ].filter((value): value is string => Boolean(value)).join(' | ') || 'Recorded'
                    : 'No workflow continuation replay'
                }
              />
              <DetailCard
                label="Targets"
                value={compactList(payload.controlPlane.workflowContinuation?.targetNames ?? [])}
              />
              <DetailCard
                label="Source Identity"
                value={[
                  payload.controlPlane.workflowContinuation?.sourceTurnId,
                  payload.controlPlane.workflowContinuation?.sourceLaneId,
                  payload.controlPlane.workflowContinuation?.sourceAssistantTurnId,
                ].filter((value): value is string => Boolean(value)).join(' | ') || 'Not recorded'}
              />
            </div>
          </section>

          {payload.supervision ? (
            <section className="operatorPanel">
              <SectionHeader
                eyebrow="Supervision"
                title="Run Guardrails"
                summary={payload.supervision.primaryState}
              />
              <div className="workTaskDetailGrid">
                <DetailCard
                  label="Run State"
                  value={`${payload.supervision.run.title} | ${payload.supervision.primaryState}`}
                />
                <DetailCard
                  label="Pending Approvals"
                  value={`${payload.supervision.counts.pendingApprovals} | ${formatSupervisionApprovals(
                    payload.supervision.approvalRequests,
                  )}`}
                />
                <DetailCard
                  label="Blockers"
                  value={formatSupervisionBlockers(payload.supervision.blockers)}
                />
                <DetailCard
                  label="Policy Snapshot"
                  value={
                    payload.supervision.latestPolicySnapshot?.snapshotRef.snapshotId
                      ?? 'No policy snapshot recorded'
                  }
                />
                <DetailCard
                  label="Evidence"
                  value={
                    `${payload.supervision.counts.evidence} event(s) | ` +
                    `${payload.supervision.counts.rejectedActions} rejected`
                  }
                />
                <DetailCard
                  label="Terminal Cause"
                  value={payload.supervision.terminalCause ?? 'None'}
                />
              </div>
            </section>
          ) : null}

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Recovery"
              title="Replay Context"
              summary={payload.recovery.recoveryRequired ? 'recovery required' : 'stable'}
            />
            <div className="workTaskDetailGrid">
              <DetailCard
                label="Approval"
                value={payload.recovery.approval.status}
              />
              <DetailCard
                label="Retry"
                value={payload.recovery.canRetry ? 'Available' : 'Not available'}
              />
              <DetailCard
                label="Resume Via Approval"
                value={payload.recovery.canResumeViaApproval ? 'Available' : 'Not available'}
              />
              <DetailCard
                label="Workflow Replay"
                value={
                  payload.recovery.workflowContinuationReplay
                    ? [
                      payload.recovery.workflowContinuationReplay.workflowStageId,
                      payload.recovery.workflowContinuationReplay.blockedReason,
                      payload.recovery.workflowContinuationReplay.replayState,
                    ].filter((value): value is string => Boolean(value)).join(' | ') || 'Recorded'
                    : 'No workflow continuation replay'
                }
              />
              <DetailCard
                label="Unresolved Targets"
                value={compactList(payload.recovery.workflowContinuationReplay?.unresolvedTargets ?? [])}
              />
              <DetailCard
                label="Latest Activity"
                value={payload.recovery.latestActivity?.message ?? 'No recovery activity recorded'}
              />
            </div>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Timeline"
              title="Recent Timeline"
              summary={`${payload.timeline.summary.returned} of ${payload.timeline.summary.matching}`}
            />
            {payload.timeline.view.items.length === 0 ? (
              <article className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>No timeline items yet.</strong>
                  <span className="operatorStatusBadge isMuted">empty</span>
                </div>
                <p>This task has not emitted runs, checkpoints, outcomes, or activities yet.</p>
              </article>
            ) : (
              <div className="workWarRoomTaskGrid">
                {payload.timeline.view.items.map((item) => (
                  <article key={item.timelineId} className="operatorCard workWarRoomTaskCard">
                    <div className="operatorCardHeader">
                      <strong>{item.title}</strong>
                      <div className="workWarRoomBadgeRow">
                        <span className="operatorStatusBadge isMuted">{item.category}</span>
                        <span className="operatorStatusBadge isMuted">{item.kind}</span>
                      </div>
                    </div>
                    <p>{item.summary ?? 'No summary recorded.'}</p>
                    <div className="operatorMetaRow">
                      <span>Status: {item.status ?? 'n/a'}</span>
                      <span>{formatTimestamp(item.timestamp)}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
