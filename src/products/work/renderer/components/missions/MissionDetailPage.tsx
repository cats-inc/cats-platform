import { Link, useParams } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useMissions } from "../../state/missionsStore";
import { useWorkItems } from "../../state/workItemsStore";
import {
  WORK_MISSIONS_PATH,
  buildWorkWorkItemPath,
} from "../../workPaths.js";
import "./missions.css";

export function MissionDetailPage(): JSX.Element {
  const { missionId } = useParams<{ missionId: string }>();
  const { allMissions } = useMissions();
  const { allWorkItems } = useWorkItems();

  const mission = missionId
    ? allMissions.find((m) => m.id === missionId)
    : undefined;

  if (!mission) {
    return <MissionNotFound missionId={missionId ?? null} />;
  }

  const linkedWorkItem = mission.linkedWorkItemId
    ? allWorkItems.find((wi) => wi.id === mission.linkedWorkItemId)
    : undefined;

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
            {mission.ownerRole ? (
              <div className="missionDetail__summaryRow">
                <dt>Assigned</dt>
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
                  <code className="missionDetail__monoId">
                    {mission.linkedConversationId}
                  </code>
                </dd>
              </div>
            ) : null}
          </dl>
          {mission.summary ? (
            <p className="missionDetail__summaryBody">{mission.summary}</p>
          ) : null}
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
