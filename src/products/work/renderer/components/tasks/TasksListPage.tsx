import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { formatRelative } from "../topdown/shared";
import { usePinnedProjects } from "../../state/pinnedProjectsStore";
import { useWorkItems } from "../../state/workItemsStore";
import { useTasks } from "../../state/tasksStore";
import { NewTaskDialog } from "./NewTaskDialog";
import "./tasks.css";

// useTasks already reads from useWorkGraph; this page does not need to
// pull the graph directly.

export function TasksListPage(): JSX.Element {
  const { allTasks, deletedIds } = useTasks();
  const { allProjects } = usePinnedProjects();
  const { allWorkItems } = useWorkItems();
  const [dialogOpen, setDialogOpen] = useState(false);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of allProjects) {
      map.set(project.id, project.title);
    }
    return map;
  }, [allProjects]);

  const workItemsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const wi of allWorkItems) {
      map.set(wi.id, wi.title);
    }
    return map;
  }, [allWorkItems]);

  const tasks = useMemo(
    () => allTasks.filter((t) => !deletedIds.has(t.id)),
    [allTasks, deletedIds],
  );

  return (
    <div className="tasksList">
      <header className="channelTopBar tasksListTopBar">
        <div className="channelTopBarStart tasksListTopBar__start">
          <h1 className="channelTopBarTitle tasksListTopBar__title">
            Tasks
          </h1>
          <span className="tasksListTopBar__count">{tasks.length}</span>
        </div>
        <div className="channelTopBarCenter tasksListTopBar__center" />
        <div className="channelTopBarEnd tasksListTopBar__end">
          <button
            type="button"
            className="tasksListTopBar__addBtn"
            onClick={() => setDialogOpen(true)}
            aria-label="Create new task"
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
            <span>New task</span>
          </button>
        </div>
      </header>
      <main className="tasksList__main">
        {tasks.length === 0 ? (
          <p className="tasksList__empty">
            No tasks yet. Click <strong>New task</strong> to create one.
          </p>
        ) : (
          <ul className="tasksList__list">
            {tasks.map((task) => {
              const projectTitle = task.linkedProjectId
                ? projectsById.get(task.linkedProjectId)
                : null;
              const workItemTitle = task.linkedWorkItemId
                ? workItemsById.get(task.linkedWorkItemId)
                : null;
              return (
                <li key={task.id} className="tasksList__row">
                  <Link
                    to={task.id}
                    className="tasksList__rowLink"
                    aria-label={`Open task ${task.title}`}
                  >
                    <div className="tasksList__rowMain">
                      <span
                        className={`projectsList__dot projectsList__dot--${task.status}`}
                        aria-hidden="true"
                      />
                      <div className="tasksList__rowText">
                        <span className="tasksList__rowTitle">
                          {task.title}
                        </span>
                        {task.summary ? (
                          <span className="tasksList__rowSummary">
                            {task.summary}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="tasksList__rowMeta">
                      {projectTitle ? (
                        <span className="tasksList__chip tasksList__chip--project">
                          {projectTitle}
                        </span>
                      ) : null}
                      {workItemTitle ? (
                        <span className="tasksList__chip tasksList__chip--workItem">
                          {workItemTitle}
                        </span>
                      ) : null}
                      {task.priority ? (
                        <span
                          className={`tasksList__priority tasksList__priority--${task.priority}`}
                          title={`${task.priority} priority`}
                        >
                          {task.priority}
                        </span>
                      ) : null}
                      {task.attention === "decision_needed" ? (
                        <span className="tasksList__pip tasksList__pip--decision">
                          decision
                        </span>
                      ) : null}
                      {task.attention === "blocked" || task.attention === "failed" ? (
                        <span className="tasksList__pip tasksList__pip--blocked">
                          {task.attention}
                        </span>
                      ) : null}
                      {task.assigneeName ? (
                        <span className="tasksList__assignee">
                          {task.assigneeName}
                        </span>
                      ) : task.ownerRole ? (
                        <span className="tasksList__assignee tasksList__assignee--role">
                          {task.ownerRole}
                        </span>
                      ) : null}
                      <span className="tasksList__metric tasksList__metric--muted">
                        {formatRelative(task.updatedAt)}
                      </span>
                      <span
                        className={`tasksList__statusPill tasksList__statusPill--${task.status}`}
                      >
                        {task.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      {dialogOpen ? (
        <NewTaskDialog onClose={() => setDialogOpen(false)} />
      ) : null}
    </div>
  );
}
