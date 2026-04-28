import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useMissions } from "../../state/missionsStore";
import { useRuns } from "../../state/runsStore";
import { useTasks } from "../../state/tasksStore";
import { useWorkItems } from "../../state/workItemsStore";
import {
  WORK_MISSIONS_PATH,
  buildWorkRunPath,
  buildWorkTaskPath,
  buildWorkWorkItemPath,
} from "../../workPaths.js";
import "./missions.css";

export function MissionDetailPage(): JSX.Element {
  const { missionId } = useParams<{ missionId: string }>();
  const { allMissions } = useMissions();
  const { allWorkItems } = useWorkItems();
  const { allTasks } = useTasks();
  const { allRuns } = useRuns();

  const mission = missionId
    ? allMissions.find((m) => m.id === missionId)
    : undefined;

  const linkedWorkItem = mission?.linkedWorkItemId
    ? allWorkItems.find((wi) => wi.id === mission.linkedWorkItemId)
    : undefined;

  const transitiveTasks = useMemo(() => {
    if (!linkedWorkItem) return [];
    return allTasks
      .filter((t) => t.linkedWorkItemId === linkedWorkItem.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [allTasks, linkedWorkItem]);

  const transitiveRuns = useMemo(() => {
    if (transitiveTasks.length === 0) return [];
    const taskIds = new Set(transitiveTasks.map((t) => t.id));
    return allRuns
      .filter((r) => r.linkedTaskId && taskIds.has(r.linkedTaskId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [allRuns, transitiveTasks]);

  if (!mission) {
    return <MissionNotFound missionId={missionId ?? null} />;
  }

  return (
    <div className="missionDetail">
      <header className="channelTopBar missionDetailTopBar">
        <div className="channelTopBarStart missionDetailTopBar__start">
          <Link
            to={WORK_MISSIONS_PATH}
            className="missionDetailTopBar__back"
            aria-label="Back to missions"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7.5 2L3.5 6l4 4" />
            </svg>
            <span>Missions</span>
          </Link>
          <span className="missionDetailTopBar__sep">›</span>
          <h1 className="channelTopBarTitle missionDetailTopBar__title">
            {mission.title}
          </h1>
        </div>
        <div className="channelTopBarCenter missionDetailTopBar__center" />
        <div className="channelTopBarEnd missionDetailTopBar__end">
          <span
            className={`missionDetail__statusPill missionDetail__statusPill--${mission.status}`}
          >
            {mission.status.replace(/_/g, " ")}
          </span>
        </div>
      </header>

      <main className="missionDetail__main">
        <section className="missionDetail__section">
          <h2 className="missionDetail__sectionHeading">Mission summary</h2>
          <dl className="missionDetail__summary">
            <div className="missionDetail__summaryRow">
              <dt>Status</dt>
              <dd>{mission.status.replace(/_/g, " ")}</dd>
            </div>
            {mission.assignedActorTitles &&
            mission.assignedActorTitles.length > 0 ? (
              <div className="missionDetail__summaryRow">
                <dt>Assigned agent</dt>
                <dd>{mission.assignedActorTitles.join(", ")}</dd>
              </div>
            ) : mission.ownerRole ? (
              <div className="missionDetail__summaryRow">
                <dt>Owner role</dt>
                <dd>{mission.ownerRole}</dd>
              </div>
            ) : null}
            <div className="missionDetail__summaryRow">
              <dt>Updated</dt>
              <dd>{formatRelative(mission.updatedAt)}</dd>
            </div>
            {linkedWorkItem ? (
              <div className="missionDetail__summaryRow">
                <dt>Work Item</dt>
                <dd>
                  <Link
                    to={buildWorkWorkItemPath(linkedWorkItem.id)}
                    className="missionDetail__crumbLink"
                  >
                    {linkedWorkItem.title}
                  </Link>
                </dd>
              </div>
            ) : null}
            {mission.linkedConversationId ? (
              <div className="missionDetail__summaryRow">
                <dt>Conversation</dt>
                <dd>
                  {mission.linkedConversationTitle ?? (
                    <code className="missionDetail__monoId">
                      {mission.linkedConversationId}
                    </code>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {mission.summary ? (
            <p className="missionDetail__summaryBody">{mission.summary}</p>
          ) : null}
        </section>

        <section className="missionDetail__section">
          <h2 className="missionDetail__sectionHeading">
            Tasks under this work item{" "}
            <span className="missionDetail__count">{transitiveTasks.length}</span>
          </h2>
          {!linkedWorkItem ? (
            <p className="missionDetail__empty">
              Mission is ad-hoc — no work item to scope tasks against.
            </p>
          ) : transitiveTasks.length === 0 ? (
            <p className="missionDetail__empty">
              The linked work item has no tasks yet.
            </p>
          ) : (
            <ul className="missionDetail__transitiveList">
              {transitiveTasks.map((task) => (
                <li key={task.id} className="missionDetail__transitiveRow">
                  <Link
                    to={buildWorkTaskPath(task.id)}
                    className="missionDetail__transitiveLink"
                  >
                    <span className="missionDetail__transitiveTitle">
                      {task.title}
                    </span>
                    <span
                      className={`missionDetail__transitiveStatus missionDetail__transitiveStatus--${task.status}`}
                    >
                      {task.status.replace(/_/g, " ")}
                    </span>
                    <span className="missionDetail__transitiveTime">
                      {formatRelative(task.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="missionDetail__section">
          <h2 className="missionDetail__sectionHeading">
            Runs from those tasks{" "}
            <span className="missionDetail__count">{transitiveRuns.length}</span>
          </h2>
          {!linkedWorkItem ? (
            <p className="missionDetail__empty">
              Mission is ad-hoc — no transitive runs.
            </p>
          ) : transitiveRuns.length === 0 ? (
            <p className="missionDetail__empty">
              No runs dispatched from these tasks yet.
            </p>
          ) : (
            <ul className="missionDetail__transitiveList">
              {transitiveRuns.map((run) => (
                <li key={run.id} className="missionDetail__transitiveRow">
                  <Link
                    to={buildWorkRunPath(run.linkedTaskId ?? "orphan", run.id)}
                    className="missionDetail__transitiveLink"
                  >
                    <span className="missionDetail__transitiveTitle">
                      {run.title}
                    </span>
                    {run.linkedTaskTitle ? (
                      <span className="missionDetail__transitiveParent">
                        ↳ {run.linkedTaskTitle}
                      </span>
                    ) : null}
                    <span
                      className={`missionDetail__transitiveStatus missionDetail__transitiveStatus--${run.status}`}
                    >
                      {run.status.replace(/_/g, " ")}
                    </span>
                    <span className="missionDetail__transitiveTime">
                      {formatRelative(run.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function MissionNotFound({
  missionId,
}: {
  missionId: string | null;
}): JSX.Element {
  return (
    <div className="missionDetail">
      <header className="channelTopBar missionDetailTopBar">
        <div className="channelTopBarStart missionDetailTopBar__start">
          <Link
            to={WORK_MISSIONS_PATH}
            className="missionDetailTopBar__back"
          >
            <span>Missions</span>
          </Link>
        </div>
      </header>
      <main className="missionDetail__main">
        <p className="missionDetail__empty">
          {missionId ? `Mission ${missionId} not found.` : "No mission id provided."}
        </p>
      </main>
    </div>
  );
}
