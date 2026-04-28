import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";

import { LinkageSection } from "../topdown/LinkageSection";
import {
  ATTENTION_LABEL,
  buildIndexes,
  formatRelative,
} from "../topdown/shared";
import { usePinnedProjects } from "../../state/pinnedProjectsStore";
import { useRuns, type RunItem } from "../../state/runsStore";
import { useTasks, type TaskItem } from "../../state/tasksStore";
import { useWorkGraph } from "../../state/workGraphStore";
import { useWorkItems } from "../../state/workItemsStore";
import {
  WORK_PROJECTS_PATH,
  WORK_TASKS_PATH,
  WORK_WORK_ITEMS_PATH,
  buildWorkRunPath,
} from "../../workPaths.js";
import "./tasks.css";

export function TaskDetailPage(): JSX.Element {
  const { taskId } = useParams<{ taskId: string }>();
  const { graph } = useWorkGraph();
  const indexes = useMemo(() => buildIndexes(graph), [graph]);
  const { allTasks, deletedIds } = useTasks();
  const { allProjects } = usePinnedProjects();
  const { allWorkItems } = useWorkItems();
  const { allRuns } = useRuns();

  const task = taskId ? allTasks.find((t) => t.id === taskId) : undefined;

  if (!task || (taskId !== undefined && deletedIds.has(taskId))) {
    return <TaskNotFound taskId={taskId ?? null} />;
  }

  const linkedProject = task.linkedProjectId
    ? allProjects.find((p) => p.id === task.linkedProjectId)
    : undefined;
  const linkedWorkItem = task.linkedWorkItemId
    ? allWorkItems.find((wi) => wi.id === task.linkedWorkItemId)
    : undefined;
  const parentTask = task.parentTaskId
    ? allTasks.find((t) => t.id === task.parentTaskId)
    : undefined;
  const subTasks = allTasks.filter(
    (t) => t.parentTaskId === task.id && !deletedIds.has(t.id),
  );
  const taskRuns = allRuns
    .filter((r) => r.linkedTaskId === task.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const activities = graph.objects
    .filter(
      (o) => o.kind === "activity" && o.linkedTaskId === task.id,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const conversation = task.linkedConversationId
    ? indexes.objectsById.get(task.linkedConversationId)
    : undefined;

  return (
    <div className="taskDetail">
      <header className="channelTopBar taskDetailTopBar">
        <div className="channelTopBarStart taskDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="taskDetailTopBar__back"
            aria-label="Back to tasks"
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
            <span>Tasks</span>
          </Link>
        </div>
        <div className="channelTopBarCenter taskDetailTopBar__center">
          <span
            className={`projectsList__dot projectsList__dot--${task.status}`}
            aria-hidden="true"
          />
          <h1 className="channelTopBarTitle taskDetailTopBar__title">
            {task.title}
          </h1>
        </div>
        <div className="channelTopBarEnd taskDetailTopBar__end">
          {task.attention !== "none" && ATTENTION_LABEL[task.attention] ? (
            <span
              className={`taskDetail__attention taskDetail__attention--${task.attention}`}
            >
              {ATTENTION_LABEL[task.attention]}
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
          <span
            className={`tasksList__statusPill tasksList__statusPill--${task.status}`}
          >
            {task.status.replace(/_/g, " ")}
          </span>
          <span className="taskDetailTopBar__updated">
            updated {formatRelative(task.updatedAt)}
          </span>
        </div>
      </header>
      <main className="taskDetail__main">
        <section className="taskDetail__section taskDetail__overview">
          <header className="taskDetail__sectionHeader">
            <h2>Overview</h2>
          </header>
          <dl className="taskDetail__overviewList">
            {task.summary ? (
              <>
                <dt>Summary</dt>
                <dd>{task.summary}</dd>
              </>
            ) : null}
            <dt>Project</dt>
            <dd>
              {linkedProject ? (
                <Link
                  className="taskDetail__refLink"
                  to={`${WORK_PROJECTS_PATH}/${linkedProject.id}`}
                >
                  {linkedProject.title}
                </Link>
              ) : (
                <em>(orphan — no project linked)</em>
              )}
            </dd>
            <dt>Work item</dt>
            <dd>
              {linkedWorkItem ? (
                <Link
                  className="taskDetail__refLink"
                  to={`${WORK_WORK_ITEMS_PATH}/${linkedWorkItem.id}`}
                >
                  {linkedWorkItem.title}
                </Link>
              ) : (
                <em>(no work item linked)</em>
              )}
            </dd>
            {parentTask ? (
              <>
                <dt>Parent task</dt>
                <dd>
                  <Link
                    className="taskDetail__refLink"
                    to={`${WORK_TASKS_PATH}/${parentTask.id}`}
                  >
                    {parentTask.title}
                  </Link>
                </dd>
              </>
            ) : null}
            <dt>Owner role</dt>
            <dd>{task.ownerRole ?? <em>(not assigned)</em>}</dd>
            <dt>Assignee</dt>
            <dd>{task.assigneeName ?? <em>(unassigned)</em>}</dd>
            <dt>Next action</dt>
            <dd>{task.nextAction ?? <em>(none recorded)</em>}</dd>
            {task.acceptanceCriteria ? (
              <>
                <dt>Acceptance criteria</dt>
                <dd>{task.acceptanceCriteria}</dd>
              </>
            ) : null}
            {conversation ? (
              <>
                <dt>Conversation</dt>
                <dd>
                  <span className="taskDetail__convoTitle">
                    {conversation.title}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <SubTasksSection subTasks={subTasks} />

        <RunsSection taskId={task.id} runs={taskRuns} />

        <LinkageSection
          selfRef={{ recordFamily: "task", recordId: task.sourceRecordId }}
          graph={graph}
          indexes={indexes}
        />

        <section className="taskDetail__section">
          <header className="taskDetail__sectionHeader">
            <h2>Activity</h2>
            <span className="taskDetail__sectionCount">
              {activities.length}
            </span>
          </header>
          {activities.length === 0 ? (
            <p className="taskDetail__empty">
              No activity recorded for this task.
            </p>
          ) : (
            <ul className="taskDetail__activity">
              {activities.map((act) => (
                <li key={act.id} className="taskDetail__activityRow">
                  <span className="taskDetail__activityWhen">
                    {formatRelative(act.updatedAt)}
                  </span>
                  <span className="taskDetail__activityTitle">
                    {act.title}
                  </span>
                  {act.summary ? (
                    <span className="taskDetail__activitySummary">
                      {act.summary}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function SubTasksSection({ subTasks }: { subTasks: TaskItem[] }): JSX.Element {
  return (
    <section className="taskDetail__section">
      <header className="taskDetail__sectionHeader">
        <h2>Sub-tasks</h2>
        <span className="taskDetail__sectionCount">{subTasks.length}</span>
      </header>
      {subTasks.length === 0 ? (
        <p className="taskDetail__empty">
          No sub-tasks yet.
        </p>
      ) : (
        <ul className="taskDetail__subTasks">
          {subTasks.map((sub) => (
            <li key={sub.id} className="taskDetail__subTaskRow">
              <span
                className={`projectsList__dot projectsList__dot--small projectsList__dot--${sub.status}`}
                aria-hidden="true"
              />
              <Link
                to={`${WORK_TASKS_PATH}/${sub.id}`}
                className="taskDetail__subTaskTitle"
              >
                {sub.title}
              </Link>
              <span
                className={`tasksList__statusPill tasksList__statusPill--${sub.status}`}
              >
                {sub.status.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface RunsSectionProps {
  taskId: string;
  runs: readonly RunItem[];
}

function RunsSection({ taskId, runs }: RunsSectionProps): JSX.Element {
  return (
    <section className="taskDetail__section">
      <header className="taskDetail__sectionHeader">
        <h2>Runs</h2>
        <span className="taskDetail__sectionCount">{runs.length}</span>
      </header>
      {runs.length === 0 ? (
        <p className="taskDetail__empty">
          No runs dispatched. Use <strong>Start supervised run</strong> to
          dispatch.
        </p>
      ) : (
        <ul className="taskDetail__subTasks">
          {runs.map((run) => (
            <li key={run.id} className="taskDetail__subTaskRow">
              <span
                className={`projectsList__dot projectsList__dot--small projectsList__dot--${run.status}`}
                aria-hidden="true"
              />
              <Link
                to={buildWorkRunPath(taskId, run.id)}
                className="taskDetail__subTaskTitle"
              >
                {run.title}
              </Link>
              <span
                className={`tasksList__statusPill tasksList__statusPill--${run.status}`}
              >
                {run.status.replace(/_/g, " ")}
              </span>
              <span className="taskDetail__activityWhen">
                {formatRelative(run.updatedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskNotFound({ taskId }: { taskId: string | null }): JSX.Element {
  return (
    <div className="taskDetail">
      <header className="channelTopBar taskDetailTopBar">
        <div className="channelTopBarStart taskDetailTopBar__start">
          <Link to=".." relative="path" className="taskDetailTopBar__back">
            <span>← Tasks</span>
          </Link>
          <span className="taskDetailTopBar__separator" aria-hidden="true">
            /
          </span>
          <h1 className="channelTopBarTitle taskDetailTopBar__title">
            Not found
          </h1>
        </div>
      </header>
      <main className="taskDetail__main">
        <p className="taskDetail__empty">
          Task <code>{taskId ?? "(missing id)"}</code> is not in the current
          projection.
        </p>
      </main>
    </div>
  );
}
