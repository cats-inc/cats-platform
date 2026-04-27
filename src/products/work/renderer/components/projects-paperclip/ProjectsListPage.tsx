import { useMemo } from "react";
import { Link } from "react-router-dom";

import { MOCK_WORK_GRAPH } from "../topdown/mock";
import { formatRelative } from "../topdown/shared";
import "./projects-paperclip.css";

interface ProjectCounts {
  workItems: number;
  tasks: number;
  activities: number;
  needsDecision: number;
  blocked: number;
}

export function ProjectsListPage(): JSX.Element {
  const graph = MOCK_WORK_GRAPH;

  const projects = useMemo(
    () => graph.objects.filter((o) => o.kind === "project"),
    [graph],
  );

  const countsById = useMemo(() => {
    const map = new Map<string, ProjectCounts>();
    for (const project of projects) {
      const workItems = graph.objects.filter(
        (o) => o.kind === "work_item" && o.linkedProjectId === project.id,
      );
      const tasks = graph.objects.filter(
        (o) => o.kind === "task" && o.linkedProjectId === project.id,
      );
      const activities = graph.objects.filter(
        (o) => o.kind === "activity" && o.linkedProjectId === project.id,
      );
      const decisionPool = [...workItems, ...tasks];
      map.set(project.id, {
        workItems: workItems.length,
        tasks: tasks.length,
        activities: activities.length,
        needsDecision: decisionPool.filter((o) => o.attention === "decision_needed")
          .length,
        blocked: decisionPool.filter(
          (o) => o.attention === "blocked" || o.attention === "failed",
        ).length,
      });
    }
    return map;
  }, [projects, graph]);

  return (
    <div className="paperclipProjects">
      <header className="channelTopBar paperclipProjectsTopBar">
        <div className="channelTopBarStart paperclipProjectsTopBar__start">
          <h1 className="channelTopBarTitle paperclipProjectsTopBar__title">
            Projects
          </h1>
          <span className="paperclipProjectsTopBar__count">
            {projects.length}
          </span>
        </div>
        <div className="channelTopBarCenter paperclipProjectsTopBar__center">
          <span className="paperclipProjectsTopBar__lede">
            Pick a project to drill into its work items, tasks, and activity.
          </span>
        </div>
        <div className="channelTopBarEnd paperclipProjectsTopBar__end">
          <button
            type="button"
            className="paperclipProjectsTopBar__addBtn"
            onClick={() => undefined}
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
      <main className="paperclipProjects__main">
        {projects.length === 0 ? (
          <p className="paperclipProjects__empty">
            No projects yet. Click <strong>New project</strong> to start one.
          </p>
        ) : (
          <ul className="paperclipProjects__list">
            {projects.map((project) => {
              const counts = countsById.get(project.id) ?? {
                workItems: 0,
                tasks: 0,
                activities: 0,
                needsDecision: 0,
                blocked: 0,
              };
              return (
                <li key={project.id} className="paperclipProjects__row">
                  <Link
                    to={project.id}
                    className="paperclipProjects__rowLink"
                    aria-label={`Open project ${project.title}`}
                  >
                    <div className="paperclipProjects__rowMain">
                      <span
                        className={`paperclipProjects__dot paperclipProjects__dot--${project.status}`}
                        aria-hidden="true"
                      />
                      <div className="paperclipProjects__rowText">
                        <span className="paperclipProjects__rowTitle">
                          {project.title}
                        </span>
                        {project.summary ? (
                          <span className="paperclipProjects__rowSummary">
                            {project.summary}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="paperclipProjects__rowMeta">
                      {counts.needsDecision > 0 ? (
                        <span className="paperclipProjects__pip paperclipProjects__pip--decision">
                          {counts.needsDecision} decision
                          {counts.needsDecision === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {counts.blocked > 0 ? (
                        <span className="paperclipProjects__pip paperclipProjects__pip--blocked">
                          {counts.blocked} blocked
                        </span>
                      ) : null}
                      <span className="paperclipProjects__metric">
                        <strong>{counts.workItems}</strong> WI
                      </span>
                      <span className="paperclipProjects__metric">
                        <strong>{counts.tasks}</strong> tasks
                      </span>
                      <span className="paperclipProjects__metric paperclipProjects__metric--muted">
                        {formatRelative(project.updatedAt)}
                      </span>
                      <span
                        className={`paperclipProjects__statusPill paperclipProjects__statusPill--${project.status}`}
                      >
                        {project.status.replace(/_/g, " ")}
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
