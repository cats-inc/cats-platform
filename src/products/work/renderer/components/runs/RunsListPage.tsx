import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import { useRunsQuery } from "../../state/queries/runsQuery.js";
import { buildWorkRunPath } from "../../workPaths.js";
import "./runs.css";

export function RunsListPage(): JSX.Element {
  const runsQuery = useRunsQuery();
  const runs = runsQuery.data?.runs ?? [];
  const { t } = useI18n();

  return (
    <div className="runsList">
      <header className="channelTopBar runsListTopBar">
        <div className="channelTopBarStart runsListTopBar__start">
          <h1 className="channelTopBarTitle runsListTopBar__title">
            {t("workRunsListTitle")}
          </h1>
          <span className="runsListTopBar__count">{runs.length}</span>
        </div>
        <div className="channelTopBarCenter runsListTopBar__center">
          <p className="runsListTopBar__lede">
            {t("workRunsListLede")}
          </p>
        </div>
        <div className="channelTopBarEnd runsListTopBar__end" />
      </header>
      <main className="runsList__main">
        {runsQuery.isPending ? (
          <p className="runsList__empty">{t("workRunsListLoading")}</p>
        ) : runsQuery.isError ? (
          <p className="runsList__empty">
            {t("workRunsListLoadError", {
              errorMessage: String((runsQuery.error as Error).message),
            })}
          </p>
        ) : runs.length === 0 ? (
          <p className="runsList__empty">
            {t("workRunsListNoRunsIntro")}
          </p>
        ) : (
          <ul className="runsList__list">
            {runs.map((run) => {
              const taskRouteId = run.taskId ?? "orphan";
              return (
                <li key={run.id} className="runsList__row">
                  <Link
                    to={buildWorkRunPath(taskRouteId, run.id)}
                    className="runsList__rowLink"
                    aria-label={t("workRunOpenAriaLabel", { runTitle: run.title })}
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
                      {run.taskTitle ? (
                        <span className="runsList__chip runsList__chip--task">
                          {run.taskTitle}
                        </span>
                      ) : null}
                      {run.parentRunId ? (
                        <span className="runsList__chip runsList__chip--parentRun">
                          {t("workRunSubRunChip")}
                        </span>
                      ) : null}
                      <span className="runsList__metric runsList__metric--muted">
                        {formatRelative(run.updatedAt, t)}
                      </span>
                      <span
                        className={`runsList__statusPill runsList__statusPill--${run.status}`}
                      >
                        {getWorkObjectStatusLabel(run.status, t)}
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
