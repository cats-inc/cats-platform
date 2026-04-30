import { useState } from "react";
import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import { NewProjectDialog } from "./NewProjectDialog";
import "./projects.css";

export function ProjectsListPage(): JSX.Element {
  const { t } = useI18n();
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data?.projects ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="projectsList">
      <header className="channelTopBar projectsListTopBar">
        <div className="channelTopBarStart projectsListTopBar__start">
          <h1 className="channelTopBarTitle projectsListTopBar__title">
            {t("workProjectsListTitle")}
          </h1>
          <span className="projectsListTopBar__count">
            {projects.length}
          </span>
        </div>
        <div className="channelTopBarCenter projectsListTopBar__center" />
        <div className="channelTopBarEnd projectsListTopBar__end">
          <button
            type="button"
            className="projectsListTopBar__addBtn"
            onClick={() => setDialogOpen(true)}
            aria-label={t("workProjectsCreateNewProjectAriaLabel")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 2v10" />
              <path d="M2 7h10" />
            </svg>
            <span>{t("workProjectsNewAction")}</span>
          </button>
        </div>
      </header>
      <main className="projectsList__main">
        {projectsQuery.isPending ? (
          <p className="projectsList__empty">{t("workProjectsListLoading")}</p>
        ) : projectsQuery.isError ? (
          <p className="projectsList__empty">
            {t("workProjectsListLoadError", {
              errorMessage: String((projectsQuery.error as Error).message),
            })}
          </p>
        ) : projects.length === 0 ? (
          <p className="projectsList__empty">
            {t("workProjectsListEmptyIntro")}{" "}
            <strong>{t("workProjectsNewAction")}</strong>{" "}
            {t("workProjectsListEmptySuffix")}
          </p>
        ) : (
          <ul className="projectsList__list">
            {projects.map((project) => (
              <li key={project.id} className="projectsList__row">
                <Link
                  to={project.id}
                  className="projectsList__rowLink"
                  aria-label={t("workProjectsOpenProjectAriaLabel", {
                    projectTitle: project.title,
                  })}
                >
                  <div className="projectsList__rowMain">
                    <span
                      className={`projectsList__dot projectsList__dot--${project.status}`}
                      aria-hidden="true"
                    />
                    <div className="projectsList__rowText">
                      <span className="projectsList__rowTitle">
                        {project.title}
                      </span>
                      {project.summary ? (
                        <span className="projectsList__rowSummary">
                          {project.summary}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="projectsList__rowMeta">
                    {project.attentionDecisionCount > 0 ? (
                      <span className="projectsList__pip projectsList__pip--decision">
                        {t("workProjectsDecisionPill", {
                          count: project.attentionDecisionCount,
                          pluralSuffix:
                            project.attentionDecisionCount === 1 ? "" : "s",
                        })}
                      </span>
                    ) : null}
                    {project.attentionBlockedCount > 0 ? (
                      <span className="projectsList__pip projectsList__pip--blocked">
                        {t("workProjectsBlockedPill", {
                          count: project.attentionBlockedCount,
                        })}
                      </span>
                    ) : null}
                    <span className="projectsList__metric">
                      <strong>{project.linkedWorkItemCount}</strong>{" "}
                      {t("workProjectsWorkItemsAbbrev")}
                    </span>
                    <span className="projectsList__metric">
                      <strong>{project.linkedTaskCount}</strong>{" "}
                      {t("workProjectsTasksLabel")}
                    </span>
                    <span className="projectsList__metric projectsList__metric--muted">
                      {formatRelative(project.updatedAt, t)}
                    </span>
                    <span
                      className={`projectsList__statusPill projectsList__statusPill--${project.status}`}
                    >
                      {getWorkObjectStatusLabel(project.status, t)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      {dialogOpen ? (
        <NewProjectDialog onClose={() => setDialogOpen(false)} />
      ) : null}
    </div>
  );
}
