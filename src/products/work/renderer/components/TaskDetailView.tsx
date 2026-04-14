import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { taskExecutionProductLabel } from '../../../../core/taskHandoff.js';
import type { WorkTaskDetailProjection } from '../../api/projection.js';
import { fetchWorkTaskDetail } from '../api/dashboard.js';

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

function formatProduct(product: string | null | undefined): string {
  if (!product) {
    return 'Unassigned';
  }

  return product === 'chat' || product === 'work' || product === 'code'
    ? taskExecutionProductLabel(product)
    : product;
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
                navigate('/work/war-room');
              });
            }}
          >
            Back to War Room
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
                <span>Product: {formatProduct(payload.inspection.planning.effectiveProduct)}</span>
                <span>Strategy: {payload.inspection.planning.effectiveStrategy ?? 'Not specified'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Conversation: {payload.task.conversationId ?? 'Detached'}</span>
                <span>Updated: {formatTimestamp(payload.task.updatedAt)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Actions: {compactList(payload.controlPlane.nextActions.map((action) => action.kind))}</span>
                <span>Attention: {compactList(payload.controlPlane.attention.reasons)}</span>
              </div>
            </article>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Planning"
              title="Planning & Runtime"
              summary={payload.inspection.runtimeBridge.product ?? 'no runtime bridge'}
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
                value={payload.inspection.runtimeBridge.request.requestedStrategy ?? 'Not specified'}
              />
              <DetailCard
                label="Correlation"
                value={[
                  payload.inspection.runtimeBridge.request.correlation?.product
                    ? formatProduct(payload.inspection.runtimeBridge.request.correlation.product)
                    : null,
                  payload.inspection.runtimeBridge.request.correlation?.workItemId ?? null,
                  payload.inspection.runtimeBridge.request.correlation?.conversationId ?? null,
                ].filter((value): value is string => Boolean(value)).join(' | ') || 'Not recorded'}
              />
            </div>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Control"
              title="Control Plane"
              summary={payload.controlPlane.runtimeDeliveryIntent?.mode ?? 'no delivery intent'}
            />
            <div className="workTaskDetailGrid">
              <DetailCard
                label="Next Actions"
                value={compactList(payload.controlPlane.nextActions.map((action) => action.kind))}
              />
              <DetailCard
                label="Delivery Gates"
                value={compactList(payload.controlPlane.runtimeDeliveryIntent?.gates ?? [])}
              />
              <DetailCard
                label="Requested Delivery"
                value={compactList(payload.controlPlane.runtimeDeliveryIntent?.requestedActions ?? [])}
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
