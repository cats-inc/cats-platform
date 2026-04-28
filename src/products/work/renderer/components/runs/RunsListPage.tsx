import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useRuns } from "../../state/runsStore";
import { buildWorkRunPath } from "../../workPaths.js";
import "./runs.css";

export function RunsListPage(): JSX.Element {
  const { allRuns } = useRuns();

  return (
    <div className="runsList">
      <header className="channelTopBar runsListTopBar">
        <div className="channelTopBarStart runsListTopBar__start">
          <h1 className="channelTopBarTitle runsListTopBar__title">Runs</h1>
          <span className="runsListTopBar__count">{allRuns.length}</span>
        </div>
        <div className="channelTopBarCenter runsListTopBar__center">
          <p className="runsListTopBar__lede">
            Every Core run, flat. Click into a run to inspect its trace
            and sub-runs. Runs are created by orchestrator dispatch — not
            from this page.
          </p>
        </div>
        <div className="channelTopBarEnd runsListTopBar__end" />
      </header>
      <main className="runsList__main">
        {allRuns.length === 0 ? (
          <p className="runsList__empty">
            No runs yet. Runs are created when an orchestrator dispatches a
            task or a sub-run.
          </p>
        ) : (
          <ul className="runsList__list">
            {allRuns
              .slice()
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((run) => {
                const taskTitle = run.linkedTaskTitle ?? null;
                const taskId = run.linkedTaskId ?? "orphan";
                return (
                  <li key={run.id} className="runsList__row">
                    <Link
                      to={buildWorkRunPath(taskId, run.id)}
                      className="runsList__rowLink"
                      aria-label={`Open run ${run.title}`}
                    >
                      <div className="runsList__rowMain">
                        <span
                          className={`runsList__dot runsList__dot--${run.status}`}
                          aria-hidden="true"
                        />
                        <div className="runsList__rowText">
                          <span className="runsList__rowTitle">{run.title}</span>
                          {run.summary ? (
                            <span className="runsList__rowSummary">
                              {run.summary}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="runsList__rowMeta">
                        {taskTitle ? (
                          <span className="runsList__chip runsList__chip--task">
                            {taskTitle}
                          </span>
                        ) : null}
                        {run.parentRunId ? (
                          <span className="runsList__chip runsList__chip--parentRun">
                            sub-run
                          </span>
                        ) : null}
                        <span className="runsList__metric runsList__metric--muted">
                          {formatRelative(run.updatedAt)}
                        </span>
                        <span
                          className={`runsList__statusPill runsList__statusPill--${run.status}`}
                        >
                          {run.status.replace(/_/g, " ")}
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
