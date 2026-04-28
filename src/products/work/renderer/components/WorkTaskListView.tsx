import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import type { WorkTaskListProjection } from '../../api/projection.js';
import { buildChannelPath, buildMyCatPath } from '../../shared/channelPaths.js';
import { listCatActorLinks } from '../actorLinks.js';
import { fetchWorkTaskList } from '../api/dashboard.js';
import { formatWorkTokenList } from '../workExecutionPresentation.js';

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
    case 'approved':
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

export function WorkTaskListView() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WorkTaskListProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadTasks = useCallback(async (signal?: AbortSignal) => {
    setError('');
    const nextPayload = await fetchWorkTaskList(signal);
    setPayload(nextPayload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadTasks(controller.signal)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load tasks.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadTasks]);

  return (
    <div className="workTaskDetailView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">Execution</p>
          <h1 className="codeBuilderTitle">Tasks</h1>
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
              setLoading(true);
              void loadTasks()
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Failed to refresh tasks.');
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
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
          <SectionHeader eyebrow="Loading" title="Tasks" summary="pending" />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>Loading work tasks...</strong>
              <span className="operatorStatusBadge isProgress">loading</span>
            </div>
            <p>Collecting shared-core tasks and their linked project, work-item, and control context.</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Snapshot"
              title="Task Summary"
              summary={`${payload.summary.returned} of ${payload.summary.totalAvailable}`}
            />
            <div className="workTaskDetailGrid">
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Pending Approval</strong>
                  <span className="operatorStatusBadge isAttention">{payload.summary.pendingApprovalCount}</span>
                </div>
                <p>Tasks waiting on owner confirmation before execution can continue.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>In Progress</strong>
                  <span className="operatorStatusBadge isProgress">{payload.summary.inProgressCount}</span>
                </div>
                <p>Tasks actively executing across the shared Work surface.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Attention</strong>
                  <span className="operatorStatusBadge isError">{payload.summary.needsOperatorAttentionCount}</span>
                </div>
                <p>Tasks currently surfacing operator actions or attention signals.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Recovery</strong>
                  <span className="operatorStatusBadge isMuted">{payload.summary.recoveryCount}</span>
                </div>
                <p>Tasks with replay, retry, or recovery context still attached.</p>
              </article>
            </div>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Execution"
              title="Task List"
              summary={`${payload.tasks.length} visible`}
            />
            {payload.tasks.length === 0 ? (
              <article className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>No tasks recorded yet.</strong>
                  <span className="operatorStatusBadge isMuted">empty</span>
                </div>
                <p>Tasks created manually or from the New work chat flow will appear here.</p>
              </article>
            ) : (
              <div className="workWarRoomTaskGrid">
                {payload.tasks.map((task) => (
                  <article key={task.id} className="operatorCard workWarRoomTaskCard">
                    <div className="operatorCardHeader">
                      <strong>{task.title}</strong>
                      <span className={statusBadgeClassName(task.status)}>{task.status}</span>
                    </div>
                    <p>{task.summary ?? 'No task summary recorded.'}</p>
                    <div className="operatorMetaRow">
                      <span>Project: {task.projectTitle ?? 'No linked project'}</span>
                      <span>Work item: {task.workItemTitle ?? 'No linked work item'}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>Owner: {task.ownerName}</span>
                      <span>Actors: {compactList(task.assignedActors.map((actor) => actor.displayName))}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>Attention: {compactList(task.controlPlane.attention.reasons)}</span>
                      <span>Next: {formatWorkTokenList(task.controlPlane.nextActions.map((action) => action.kind))}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>Conversation: {task.conversationTitle ?? 'No linked conversation'}</span>
                      <span>{formatTimestamp(task.updatedAt)}</span>
                    </div>
                    <div className="workWarRoomHeaderActions">
                      <button
                        type="button"
                        className="operatorActionButton"
                        onClick={() => {
                          startTransition(() => {
                            navigate(`/work/tasks/${encodeURIComponent(task.id)}`);
                          });
                        }}
                      >
                        Open task
                      </button>
                      {task.projectId ? (
                        <button
                          type="button"
                          className="operatorActionButton"
                          onClick={() => {
                            startTransition(() => {
                              navigate(`/work/projects/${encodeURIComponent(task.projectId!)}`);
                            });
                          }}
                        >
                          Open project
                        </button>
                      ) : null}
                      {task.workItemId ? (
                        <button
                          type="button"
                          className="operatorActionButton"
                          onClick={() => {
                            startTransition(() => {
                              navigate(`/work/work-items/${encodeURIComponent(task.workItemId!)}`);
                            });
                          }}
                        >
                          Open work item
                        </button>
                      ) : null}
                      {task.conversationSourceChannelId ? (
                        <button
                          type="button"
                          className="operatorActionButton"
                          onClick={() => {
                            startTransition(() => {
                              navigate(buildChannelPath(task.conversationSourceChannelId!));
                            });
                          }}
                        >
                          Open briefing thread
                        </button>
                      ) : null}
                      {listCatActorLinks(task.assignedActors).map((actor) => (
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
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
