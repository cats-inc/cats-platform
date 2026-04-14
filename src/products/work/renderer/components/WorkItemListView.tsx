import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import type { WorkWorkItemListProjection } from '../../api/projection.js';
import { buildChannelPath, buildMyCatPath } from '../../shared/channelPaths.js';
import { readCatIdFromActorId } from '../actorLinks.js';
import { fetchWorkItemList } from '../api/dashboard.js';

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

export function WorkItemListView() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WorkWorkItemListProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWorkItems = useCallback(async (signal?: AbortSignal) => {
    setError('');
    const nextPayload = await fetchWorkItemList(signal);
    setPayload(nextPayload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadWorkItems(controller.signal)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load work items.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadWorkItems]);

  return (
    <div className="workTaskDetailView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">Managed Work</p>
          <h1 className="codeBuilderTitle">Work Items</h1>
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
              void loadWorkItems()
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Failed to refresh work items.');
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
          <SectionHeader eyebrow="Loading" title="Work Items" summary="pending" />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>Loading work items...</strong>
              <span className="operatorStatusBadge isProgress">loading</span>
            </div>
            <p>Collecting shared-core work items and their linked task context.</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Snapshot"
              title="Work Item Summary"
              summary={`${payload.summary.returned} of ${payload.summary.totalAvailable}`}
            />
            <div className="workTaskDetailGrid">
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Ready</strong>
                  <span className="operatorStatusBadge isAttention">{payload.summary.readyCount}</span>
                </div>
                <p>Items prepared for owner review or initial execution.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>In Progress</strong>
                  <span className="operatorStatusBadge isProgress">{payload.summary.inProgressCount}</span>
                </div>
                <p>Managed work currently being executed or coordinated.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Blocked</strong>
                  <span className="operatorStatusBadge isError">{payload.summary.blockedCount}</span>
                </div>
                <p>Items waiting on approvals, operators, or downstream recovery.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Linked Tasks</strong>
                  <span className="operatorStatusBadge isMuted">{payload.summary.linkedTaskCount}</span>
                </div>
                <p>Work items with attached shared-core task execution state.</p>
              </article>
            </div>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Managed Work"
              title="Work Item List"
              summary={`${payload.workItems.length} visible`}
            />
            {payload.workItems.length === 0 ? (
              <article className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>No work items recorded yet.</strong>
                  <span className="operatorStatusBadge isMuted">empty</span>
                </div>
                <p>Operational work items will appear here as projects begin execution.</p>
              </article>
            ) : (
              <div className="workWarRoomTaskGrid">
                {payload.workItems.map((workItem) => (
                  <article key={workItem.id} className="operatorCard workWarRoomTaskCard">
                    <div className="operatorCardHeader">
                      <strong>{workItem.title}</strong>
                      <span className={statusBadgeClassName(workItem.status)}>{workItem.status}</span>
                    </div>
                    <p>{workItem.summary ?? 'No work-item summary recorded.'}</p>
                    <div className="operatorMetaRow">
                      <span>Project: {workItem.projectTitle ?? 'No linked project'}</span>
                      <span>Task: {workItem.taskTitle ?? 'No linked task'}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>Owner: {workItem.ownerName}</span>
                      <span>Actors: {compactList(workItem.assignedActors.map((actor) => actor.displayName))}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>Conversation: {workItem.conversationTitle ?? 'No linked conversation'}</span>
                      <span>{formatTimestamp(workItem.updatedAt)}</span>
                    </div>
                    <div className="workWarRoomHeaderActions">
                      <button
                        type="button"
                        className="operatorActionButton"
                        onClick={() => {
                          startTransition(() => {
                            navigate(`/work/work-items/${encodeURIComponent(workItem.id)}`);
                          });
                        }}
                      >
                        Open work item
                      </button>
                      {workItem.projectId ? (
                        <button
                          type="button"
                          className="operatorActionButton"
                          onClick={() => {
                            startTransition(() => {
                              navigate(`/work/projects/${encodeURIComponent(workItem.projectId!)}`);
                            });
                          }}
                        >
                          Open project
                        </button>
                      ) : null}
                      {workItem.taskId ? (
                        <button
                          type="button"
                          className="operatorActionButton"
                          onClick={() => {
                            startTransition(() => {
                              navigate(`/work/tasks/${encodeURIComponent(workItem.taskId!)}`);
                            });
                          }}
                        >
                          Open task
                        </button>
                      ) : null}
                      {workItem.conversationSourceChannelId ? (
                        <button
                          type="button"
                          className="operatorActionButton"
                          onClick={() => {
                            startTransition(() => {
                              navigate(buildChannelPath(workItem.conversationSourceChannelId!));
                            });
                          }}
                        >
                          Open briefing thread
                        </button>
                      ) : null}
                      {workItem.assignedActors
                        .map((actor) => ({
                          ...actor,
                          catId: readCatIdFromActorId(actor.actorId),
                        }))
                        .filter((actor): actor is typeof actor & { catId: string } => actor.catId !== null)
                        .map((actor) => (
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
