import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useMissionsQuery } from "../../state/queries/missionsQuery.js";
import { buildWorkMissionPath } from "../../workPaths.js";
import "./missions.css";

export function MissionsListPage(): JSX.Element {
  const missionsQuery = useMissionsQuery();
  const missions = missionsQuery.data?.missions ?? [];

  return (
    <div className="missionsList">
      <header className="channelTopBar missionsListTopBar">
        <div className="channelTopBarStart missionsListTopBar__start">
          <h1 className="channelTopBarTitle missionsListTopBar__title">
            Missions
          </h1>
          <span className="missionsListTopBar__count">{missions.length}</span>
        </div>
        <div className="channelTopBarCenter missionsListTopBar__center">
          <p className="missionsListTopBar__lede">
            Agent missions — distinct from tasks. Anchored to a Work Item
            when planned, or fully internal when spawned by an agent.
          </p>
        </div>
        <div className="channelTopBarEnd missionsListTopBar__end" />
      </header>
      <main className="missionsList__main">
        {missionsQuery.isPending ? (
          <p className="missionsList__empty">Loading missions…</p>
        ) : missionsQuery.isError ? (
          <p className="missionsList__empty">
            Failed to load missions: {String((missionsQuery.error as Error).message)}
          </p>
        ) : missions.length === 0 ? (
          <p className="missionsList__empty">
            No missions yet.
          </p>
        ) : (
          <ul className="missionsList__list">
            {missions.map((mission) => (
              <li key={mission.id} className="missionsList__row">
                <Link
                  to={buildWorkMissionPath(mission.id)}
                  className="missionsList__rowLink"
                  aria-label={`Open mission ${mission.title}`}
                >
                  <div className="missionsList__rowMain">
                    <span
                      className={`missionsList__dot missionsList__dot--${mission.status}`}
                      aria-hidden="true"
                    />
                    <div className="missionsList__rowText">
                      <span className="missionsList__rowTitle">
                        {mission.title}
                      </span>
                      {mission.summary ? (
                        <span className="missionsList__rowSummary">
                          {mission.summary}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="missionsList__rowMeta">
                    {mission.managedWorkTitle ? (
                      <span className="missionsList__chip missionsList__chip--workItem">
                        {mission.managedWorkTitle}
                      </span>
                    ) : null}
                    <span className="missionsList__metric missionsList__metric--muted">
                      {formatRelative(mission.updatedAt)}
                    </span>
                    <span
                      className={`missionsList__statusPill missionsList__statusPill--${mission.status}`}
                    >
                      {mission.status.replace(/_/g, " ")}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
