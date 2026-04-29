import { useState } from "react";
import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import { NewProjectDialog } from "./NewProjectDialog";
import "./projects.css";

export function ProjectsListPage(): JSX.Element {
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data?.projects ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="projectsList">
      <header className="channelTopBar projectsListTopBar">
        <div className="channelTopBarStart projectsListTopBar__start">
          <h1 className="channelTopBarTitle projectsListTopBar__title">
            Projects
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
            aria-label="Create new project"
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
            <span>New project</span>
          </button>
        </div>
      </header>
      <main className="projectsList__main">
        {projectsQuery.isPending ? (
          <p className="projectsList__empty">Loading projects…</p>
        ) : projectsQuery.isError ? (
          <p className="projectsList__empty">
            Failed to load projects: {String((projectsQuery.error as Error).message)}
          </p>
        ) : projects.length === 0 ? (
          <p className="projectsList__empty">
            No projects yet. Click <strong>New project</strong> to start one.
          </p>
        ) : (
          <ul className="projectsList__list">
            {projects.map((project) => (
              <li key={project.id} className="projectsList__row">
                <Link
                  to={project.id}
                  className="projectsList__rowLink"
                  aria-label={`Open project ${project.title}`}
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
                        {project.attentionDecisionCount} decision
                        {project.attentionDecisionCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {project.attentionBlockedCount > 0 ? (
                      <span className="projectsList__pip projectsList__pip--blocked">
                        {project.attentionBlockedCount} blocked
                      </span>
                    ) : null}
                    <span className="projectsList__metric">
                      <strong>{project.linkedWorkItemCount}</strong> WI
                    </span>
                    <span className="projectsList__metric">
                      <strong>{project.linkedTaskCount}</strong> tasks
                    </span>
                    <span className="projectsList__metric projectsList__metric--muted">
                      {formatRelative(project.updatedAt)}
                    </span>
                    <span
                      className={`projectsList__statusPill projectsList__statusPill--${project.status}`}
                    >
                      {project.status.replace(/_/g, " ")}
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
