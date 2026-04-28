import { useMemo } from "react";
import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useMissions } from "../../state/missionsStore";
import { useWorkItems } from "../../state/workItemsStore";
import { buildWorkMissionPath } from "../../workPaths.js";
import "./missions.css";

export function MissionsListPage(): JSX.Element {
  const { allMissions } = useMissions();
  const { allWorkItems } = useWorkItems();

  const workItemTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const wi of allWorkItems) {
      map.set(wi.id, wi.title);
    }
    return map;
  }, [allWorkItems]);

  return (
    <div className="missionsList">
      <header className="channelTopBar missionsListTopBar">
        <div className="channelTopBarStart missionsListTopBar__start">
          <h1 className="channelTopBarTitle missionsListTopBar__title">
            Missions
          </h1>
          <span className="missionsListTopBar__count">{allMissions.length}</span>
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
        {allMissions.length === 0 ? (
          <p className="missionsList__empty">
            No missions yet.
          </p>
        ) : (
          <ul className="missionsList__list">
            {allMissions
              .slice()
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((mission) => {
                const workItemTitle = mission.linkedWorkItemId
                  ? workItemTitleById.get(mission.linkedWorkItemId) ?? null
                  : null;
                return (
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
                        {workItemTitle ? (
                          <span className="missionsList__chip missionsList__chip--workItem">
                            {workItemTitle}
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
                );
              })}
          </ul>
        )}
      </main>
    </div>
  );
}
