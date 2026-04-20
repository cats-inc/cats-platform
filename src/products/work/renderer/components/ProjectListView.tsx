import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import type { WorkProjectListProjection } from '../../api/projection.js';
import { buildChannelPath } from '../../shared/channelPaths.js';
import { fetchWorkProjectList } from '../api/dashboard.js';
import {
  buildWorkIntakePath,
  buildWorkProjectPath,
  WORK_WAR_ROOM_PATH,
} from '../workPaths.js';

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

export function ProjectListView() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WorkProjectListProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    setError('');
    const nextPayload = await fetchWorkProjectList(signal);
    setPayload(nextPayload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadProjects(controller.signal)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load projects.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadProjects]);

  return (
    <div className="workTaskDetailView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">Portfolio</p>
          <h1 className="codeBuilderTitle">Projects</h1>
        </div>
        <div className="workWarRoomHeaderActions">
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => {
              startTransition(() => {
                navigate(WORK_WAR_ROOM_PATH);
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
              void loadProjects()
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Failed to refresh projects.');
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="operatorActionButton operatorActionButtonPrimary"
            onClick={() => {
              startTransition(() => {
                navigate(buildWorkIntakePath());
              });
            }}
          >
            Start intake
          </button>
        </div>
      </div>

      {error ? (
        <div className="codeBuilderFeedback">{error}</div>
      ) : null}

      {loading && !payload ? (
        <section className="operatorPanel">
          <SectionHeader eyebrow="Loading" title="Projects" summary="pending" />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>Loading project portfolio...</strong>
              <span className="operatorStatusBadge isProgress">loading</span>
            </div>
            <p>Collecting shared-core projects and their linked work counts.</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Snapshot"
              title="Portfolio Summary"
              summary={`${payload.summary.returned} of ${payload.summary.totalAvailable}`}
            />
            <div className="workTaskDetailGrid">
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Active</strong>
                  <span className="operatorStatusBadge isProgress">{payload.summary.activeCount}</span>
                </div>
                <p>Projects currently moving through active execution.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Paused</strong>
                  <span className="operatorStatusBadge isAttention">{payload.summary.pausedCount}</span>
                </div>
                <p>Projects waiting on intake review, approval, or external unblockers.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Archived</strong>
                  <span className="operatorStatusBadge isMuted">{payload.summary.archivedCount}</span>
                </div>
                <p>Historical portfolio records still available for inspection.</p>
              </article>
              <article className="operatorCard workTaskDetailFact">
                <div className="operatorCardHeader">
                  <strong>Linked Work</strong>
                  <span className="operatorStatusBadge isMuted">{payload.summary.linkedWorkItemCount}</span>
                </div>
                <p>Work items currently attached across the portfolio.</p>
              </article>
            </div>
          </section>

          <section className="operatorPanel">
            <SectionHeader
              eyebrow="Projects"
              title="Project List"
              summary={`${payload.projects.length} visible`}
            />
            {payload.projects.length === 0 ? (
              <article className="operatorCard">
                <div className="operatorCardHeader">
                  <strong>No projects recorded yet.</strong>
                  <span className="operatorStatusBadge isMuted">empty</span>
                </div>
                <p>Projects created from intake or work planning will appear here.</p>
              </article>
            ) : (
              <div className="workWarRoomTaskGrid">
                {payload.projects.map((project) => (
                  <article key={project.id} className="operatorCard workWarRoomTaskCard">
                    <div className="operatorCardHeader">
                      <strong>{project.title}</strong>
                      <span className={statusBadgeClassName(project.status)}>{project.status}</span>
                    </div>
                    <p>{project.summary ?? 'No project summary recorded.'}</p>
                    <div className="operatorMetaRow">
                      <span>Owner: {project.ownerName}</span>
                      <span>Repo: {project.repoPath ?? 'Not bound'}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>Work items: {project.linkedWorkItemCount}</span>
                      <span>Tasks: {project.linkedTaskCount}</span>
                    </div>
                    <div className="operatorMetaRow">
                      <span>Conversation: {project.primaryConversationTitle ?? 'No primary conversation'}</span>
                      <span>{formatTimestamp(project.updatedAt)}</span>
                    </div>
                    <div className="workWarRoomHeaderActions">
                      <button
                        type="button"
                        className="operatorActionButton"
                        onClick={() => {
                          startTransition(() => {
                            navigate(buildWorkProjectPath(project.id));
                          });
                        }}
                      >
                        Open project
                      </button>
                      {project.primaryConversationSourceChannelId ? (
                        <button
                          type="button"
                          className="operatorActionButton"
                          onClick={() => {
                            startTransition(() => {
                              navigate(buildChannelPath(project.primaryConversationSourceChannelId!));
                            });
                          }}
                        >
                          Open briefing thread
                        </button>
                      ) : null}
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
