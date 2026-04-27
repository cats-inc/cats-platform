import { useMemo } from "react";
import { Link } from "react-router-dom";

import { MOCK_WORK_GRAPH } from "../topdown/mock";
import { formatRelative } from "../topdown/shared";
import { usePinnedProjects } from "../../state/pinnedProjectsStore";
import "./projects.css";

interface ProjectCounts {
  workItems: number;
  tasks: number;
  activities: number;
  needsDecision: number;
  blocked: number;
}

export function ProjectsListPage(): JSX.Element {
  const graph = MOCK_WORK_GRAPH;
  const { deletedIds } = usePinnedProjects();

  const projects = useMemo(
    () =>
      graph.objects.filter(
        (o) => o.kind === "project" && !deletedIds.has(o.id),
      ),
    [graph, deletedIds],
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
        <div className="channelTopBarCenter projectsListTopBar__center">
          <span className="projectsListTopBar__lede">
            Pick a project to drill into its work items, tasks, and activity.
          </span>
        </div>
        <div className="channelTopBarEnd projectsListTopBar__end">
          <button
            type="button"
            className="projectsListTopBar__addBtn"
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
      <main className="projectsList__main">
        {projects.length === 0 ? (
          <p className="projectsList__empty">
            No projects yet. Click <strong>New project</strong> to start one.
          </p>
        ) : (
          <ul className="projectsList__list">
            {projects.map((project) => {
              const counts = countsById.get(project.id) ?? {
                workItems: 0,
                tasks: 0,
                activities: 0,
                needsDecision: 0,
                blocked: 0,
              };
              return (
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
                      {counts.needsDecision > 0 ? (
                        <span className="projectsList__pip projectsList__pip--decision">
                          {counts.needsDecision} decision
                          {counts.needsDecision === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {counts.blocked > 0 ? (
                        <span className="projectsList__pip projectsList__pip--blocked">
                          {counts.blocked} blocked
                        </span>
                      ) : null}
                      <span className="projectsList__metric">
                        <strong>{counts.workItems}</strong> WI
                      </span>
                      <span className="projectsList__metric">
                        <strong>{counts.tasks}</strong> tasks
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
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
