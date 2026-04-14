import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { WorkWorkItemDetailProjection } from '../../api/projection.js';
import { buildChannelPath, buildMyCatPath } from '../../shared/channelPaths.js';
import { listCatActorLinks } from '../actorLinks.js';
import { fetchWorkItemDetail } from '../api/dashboard.js';

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
    case 'paused':
    case 'cancelled':
      return 'operatorStatusBadge isError';
    case 'planned':
    case 'ready':
    case 'pending_approval':
      return 'operatorStatusBadge isAttention';
    case 'active':
    case 'in_progress':
      return 'operatorStatusBadge isProgress';
    case 'completed':
    case 'archived':
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

export function WorkItemDetailView() {
  const { workItemId } = useParams<{ workItemId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WorkWorkItemDetailProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWorkItem = useCallback(async (nextWorkItemId: string, signal?: AbortSignal) => {
    setError('');
    const nextPayload = await fetchWorkItemDetail(nextWorkItemId, signal);
    setPayload(nextPayload);
  }, []);

  useEffect(() => {
    if (!workItemId) {
      setError('Work item id is required.');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    loadWorkItem(workItemId, controller.signal)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load work item detail.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadWorkItem, workItemId]);

  return (
    <div className="workTaskDetailView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">Work Item</p>
          <h1 className="codeBuilderTitle">
            {payload?.workItem.title ?? workItemId ?? 'Work item detail'}
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
              if (!workItemId) {
                return;
              }
              setLoading(true);
              void loadWorkItem(workItemId)
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Failed to refresh work item detail.');
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading || !workItemId}
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
          <SectionHeader eyebrow="Loading" title="Work Item Detail" summary="pending" />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>Loading work item detail...</strong>
              <span className="operatorStatusBadge isProgress">loading</span>
            </div>
            <p>Hydrating owner, assignments, linked task, artifacts, and work-item activity.</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <SectionHeader eyebrow="Snapshot" title="Work Item Overview" summary={payload.workItem.id} />
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>{payload.workItem.title}</strong>
                <span className={statusBadgeClassName(payload.workItem.status)}>
                  {payload.workItem.status}
                </span>
              </div>
              <p>{payload.workItem.summary ?? 'No work-item summary recorded.'}</p>
              <div className="operatorMetaRow">
                <span>Owner: {payload.ownerName}</span>
                <span>Updated: {formatTimestamp(payload.workItem.updatedAt)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Project: {payload.project?.title ?? 'No linked project'}</span>
                <span>Conversation: {payload.conversation?.title ?? 'No linked conversation'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Assigned: {compactList(payload.assignedActors.map((actor) => actor.displayName))}</span>
                <span>Artifacts: {payload.artifacts.readyCount} ready / {payload.artifacts.totalCount} total</span>
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
                    Open briefing thread
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

          {payload.project ? (
            <section className="operatorPanel">
              <SectionHeader eyebrow="Context" title="Linked Project" summary={payload.project.id} />
              <article className="operatorCard workWarRoomTaskCard">
                <div className="operatorCardHeader">
                  <strong>{payload.project.title}</strong>
                  <span className={statusBadgeClassName(payload.project.status)}>
                    {payload.project.status}
                  </span>
                </div>
                <p>{payload.project.summary ?? 'No project summary recorded.'}</p>
                <div className="operatorMetaRow">
                  <span>Owner: {payload.project.ownerName}</span>
                  <span>Repo: {payload.project.repoPath ?? 'Not bound'}</span>
                </div>
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
              </article>
            </section>
          ) : null}

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Execution"
              title="Linked Task"
              summary={payload.linkedTask?.task.id ?? 'none'}
            />
            {payload.linkedTask ? (
              <article className="operatorCard workWarRoomTaskCard">
                <div className="operatorCardHeader">
                  <strong>{payload.linkedTask.task.title}</strong>
                  <span className={statusBadgeClassName(payload.linkedTask.task.status)}>
                    {payload.linkedTask.task.status}
                  </span>
                </div>
                <p>{payload.linkedTask.task.summary ?? 'No task summary recorded.'}</p>
                <div className="operatorMetaRow">
                  <span>Strategy: {payload.linkedTask.inspection.planning.effectiveStrategy ?? 'Not specified'}</span>
                  <span>Delivery: {payload.linkedTask.controlPlane.runtimeDeliveryIntent?.mode ?? 'Not specified'}</span>
                </div>
                <div className="operatorMetaRow">
                  <span>Next: {compactList(payload.linkedTask.controlPlane.nextActions.map((action) => action.kind))}</span>
                  <span>Recovery: {payload.linkedTask.recovery.workflowContinuationReplay?.blockedReason ?? 'No replay block'}</span>
                </div>
                <button
                  type="button"
                  className="operatorActionButton"
                  onClick={() => {
                    startTransition(() => {
                      navigate(`/work/tasks/${encodeURIComponent(payload.linkedTask!.task.id)}`);
                    });
                  }}
                >
                  Open task
                </button>
              </article>
            ) : (
              <article className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>No linked task.</strong>
                  <span className="operatorStatusBadge isMuted">empty</span>
                </div>
                <p>This work item has not been bound to a shared task yet.</p>
              </article>
            )}
          </section>

          {payload.activity.latestMessages.length > 0 ? (
            <section className="operatorPanel">
              <SectionHeader
                eyebrow="Activity"
                title="Latest Messages"
                summary={`${payload.activity.latestMessages.length} shown`}
              />
              <div className="workWarRoomTaskGrid">
                {payload.activity.latestMessages.map((message, index) => (
                  <article key={`${payload.workItem.id}:${index}`} className="operatorCard workWarRoomTaskCard">
                    <div className="operatorCardHeader">
                      <strong>Activity {index + 1}</strong>
                      <span className="operatorStatusBadge isMuted">latest</span>
                    </div>
                    <p>{message}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
