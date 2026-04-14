import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import type { WorkProjectDetailProjection } from '../../api/projection.js';
import { fetchWorkProjectDetail } from '../api/dashboard.js';

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not recorded';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function statusBadgeClassName(status: string | null | undefined): string {
  switch (status) {
    case 'blocked':
    case 'paused':
    case 'cancelled':
      return 'operatorStatusBadge isError';
    case 'planned':
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

export function ProjectDetailView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WorkProjectDetailProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProject = useCallback(async (nextProjectId: string, signal?: AbortSignal) => {
    setError('');
    const nextPayload = await fetchWorkProjectDetail(nextProjectId, signal);
    setPayload(nextPayload);
  }, []);

  useEffect(() => {
    if (!projectId) {
      setError('Project id is required.');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    loadProject(projectId, controller.signal)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load project detail.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadProject, projectId]);

  return (
    <div className="workTaskDetailView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">Project</p>
          <h1 className="codeBuilderTitle">
            {payload?.project.title ?? projectId ?? 'Work project detail'}
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
              if (!projectId) {
                return;
              }
              setLoading(true);
              void loadProject(projectId)
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Failed to refresh project detail.');
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading || !projectId}
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
          <SectionHeader eyebrow="Loading" title="Project Detail" summary="pending" />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>Loading project detail...</strong>
              <span className="operatorStatusBadge isProgress">loading</span>
            </div>
            <p>Hydrating work items, linked tasks, artifacts, and project activity.</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <SectionHeader eyebrow="Snapshot" title="Project Overview" summary={payload.project.id} />
            <article className="operatorCard">
              <div className="operatorCardHeader">
                <strong>{payload.project.title}</strong>
                <span className={statusBadgeClassName(payload.project.status)}>
                  {payload.project.status}
                </span>
              </div>
              <p>{payload.project.summary ?? 'No project summary recorded.'}</p>
              <div className="operatorMetaRow">
                <span>Owner: {payload.ownerName}</span>
                <span>Repo: {payload.project.repoPath ?? 'Not bound'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Conversation: {payload.primaryConversation?.title ?? 'No primary conversation'}</span>
                <span>Updated: {formatTimestamp(payload.project.updatedAt)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Artifacts: {payload.artifacts.readyCount} ready / {payload.artifacts.totalCount} total</span>
                <span>Activity: {payload.activity.totalCount} records</span>
              </div>
            </article>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Execution"
              title="Linked Tasks"
              summary={`${payload.linkedTasks.length} linked`}
            />
            {payload.linkedTasks.length === 0 ? (
              <article className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>No tasks linked yet.</strong>
                  <span className="operatorStatusBadge isMuted">empty</span>
                </div>
                <p>Tasks created from work intake or manual planning will appear here.</p>
              </article>
            ) : (
              <div className="workWarRoomTaskGrid">
                {payload.linkedTasks.map((task) => (
                  <article key={task.id} className="operatorCard workWarRoomTaskCard">
                    <div className="operatorCardHeader">
                      <strong>{task.title}</strong>
                      <span className={statusBadgeClassName(task.status)}>{task.status}</span>
                    </div>
                    <p>{task.summary ?? 'No task summary recorded.'}</p>
                    <div className="operatorMetaRow">
                      <span>{task.id}</span>
                      <span>{formatTimestamp(task.updatedAt)}</span>
                    </div>
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
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Managed Work"
              title="Work Items"
              summary={`${payload.workItems.length} linked`}
            />
            {payload.workItems.length === 0 ? (
              <article className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>No work items linked yet.</strong>
                  <span className="operatorStatusBadge isMuted">empty</span>
                </div>
                <p>Operational work items will appear here once the project starts executing.</p>
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
                      <span>Owner: {workItem.ownerName}</span>
                      <span>Actors: {workItem.assignedActorNames.join(', ') || 'Unassigned'}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>{workItem.taskTitle ?? 'No linked task'}</span>
                      <span>{formatTimestamp(workItem.updatedAt)}</span>
                    </div>
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
                  </article>
                ))}
              </div>
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
                  <article key={`${payload.project.id}:${index}`} className="operatorCard workWarRoomTaskCard">
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
