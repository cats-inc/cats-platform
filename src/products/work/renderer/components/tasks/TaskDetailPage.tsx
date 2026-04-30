import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { LinkageSection } from "../topdown/LinkageSection";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import {
  buildIndexes,
  formatRelative,
  getWorkGraphAttentionLabel,
} from "../topdown/shared";
import { removeWorkTask } from "../../api/workRecords.js";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import { useRunsQuery, type WorkRunListItem } from "../../state/queries/runsQuery.js";
import {
  TASKS_QUERY_KEY,
  useTasksQuery,
  type WorkTaskListItem,
} from "../../state/queries/tasksQuery.js";
import { useWorkItemsQuery } from "../../state/queries/workItemsQuery.js";
import {
  EMPTY_WORK_GRAPH,
  useWorkGraphQuery,
} from "../../state/queries/workGraphQuery.js";
import {
  WORK_PROJECTS_PATH,
  WORK_TASKS_PATH,
  WORK_WORK_ITEMS_PATH,
  buildWorkRunPath,
} from "../../workPaths.js";
import "./tasks.css";

export function TaskDetailPage(): JSX.Element {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const graph = useWorkGraphQuery().data ?? EMPTY_WORK_GRAPH;
  const indexes = useMemo(() => buildIndexes(graph), [graph]);
  const tasksQuery = useTasksQuery();
  const projectsQuery = useProjectsQuery();
  const workItemsQuery = useWorkItemsQuery();
  const runsQuery = useRunsQuery();

  const allTasks = tasksQuery.data?.tasks ?? [];
  const task = taskId ? allTasks.find((t) => t.id === taskId) : undefined;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await removeWorkTask(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      navigate(WORK_TASKS_PATH);
    },
  });

  const handleDelete = () => {
    if (!task) return;
    if (
      !window.confirm(
        t("workTaskDeleteConfirmation", { taskTitle: task.title }),
      )
    ) {
      return;
    }
    deleteMutation.mutate(task.id);
  };

  if (tasksQuery.isPending) {
    return <TaskDetailLoading />;
  }
  if (!task) {
    return <TaskNotFound taskId={taskId ?? null} />;
  }

  const deleteError = deleteMutation.error
    ? deleteMutation.error instanceof Error
      ? deleteMutation.error.message
      : t("workTaskDeleteError")
    : null;

  const linkedProject = task.projectId
    ? projectsQuery.data?.projects.find((p) => p.id === task.projectId)
    : undefined;
  const linkedWorkItem = task.workItemId
    ? workItemsQuery.data?.workItems.find((wi) => wi.id === task.workItemId)
    : undefined;
  const parentTask = task.parentTaskId
    ? allTasks.find((t) => t.id === task.parentTaskId)
    : undefined;
  const subTasks = allTasks.filter((t) => t.parentTaskId === task.id);
  const taskRuns = (runsQuery.data?.runs ?? [])
    .filter((r) => r.taskId === task.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const activities = graph.objects
    .filter((o) => o.kind === "activity" && o.linkedTaskId === task.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const assignedNames = task.assignedActors.map((actor) => actor.displayName);

  return (
    <div className="taskDetail">
      <header className="channelTopBar taskDetailTopBar">
        <div className="channelTopBarStart taskDetailTopBar__start">
          <Link
            to=".."
            relative="path"
            className="taskDetailTopBar__back"
            aria-label={t("workTaskBackLabel")}
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
            <span>{t("workTaskBackArrowLabel")}</span>
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
          {task.attention !== "none" ? (
            <span
              className={`taskDetail__attention taskDetail__attention--${task.attention}`}
            >
              {getWorkGraphAttentionLabel(task.attention, t)}
            </span>
          ) : null}
          {task.priority ? (
            <span
              className={`tasksList__priority tasksList__priority--${task.priority}`}
              title={t("workTaskPriorityTooltip", {
                priority: formatTaskPriorityLabel(task.priority, t),
              })}
            >
              {formatTaskPriorityLabel(task.priority, t)}
            </span>
          ) : null}
          {task.productBinding ? (
            <span
              className={`tasksList__binding tasksList__binding--${task.productBinding}`}
              title={t("workTopdownTaskProductBindingTitle", {
                productBinding: task.productBinding,
              })}
            >
              {task.productBinding}
            </span>
          ) : null}
          <span
            className={`tasksList__statusPill tasksList__statusPill--${task.status}`}
          >
            {formatTaskStatusLabel(task.status, t)}
          </span>
          <span className="taskDetailTopBar__updated">
            {t("workTaskUpdatedAtPrefix", {
              updatedAt: formatRelative(task.updatedAt, t),
            })}
          </span>
          <button
            type="button"
            className="taskDetailTopBar__action taskDetailTopBar__action--destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            aria-label={t("workTaskDeleteLabel")}
          >
            {deleteMutation.isPending
              ? t("workTaskDeleteLabelBusy")
              : t("workTaskDeleteLabel")}
          </button>
        </div>
      </header>
      <main className="taskDetail__main">
        {deleteError ? (
          <p className="taskDetail__error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <section className="taskDetail__section taskDetail__overview">
          <header className="taskDetail__sectionHeader">
            <h2>{t("workTaskOverviewTitle")}</h2>
          </header>
          <dl className="taskDetail__overviewList">
            {task.summary ? (
              <>
                <dt>{t("workTaskSummaryLabel")}</dt>
                <dd>{task.summary}</dd>
              </>
            ) : null}
            <dt>{t("workTaskProjectLabel")}</dt>
            <dd>
              {linkedProject ? (
                <Link
                  className="taskDetail__refLink"
                  to={`${WORK_PROJECTS_PATH}/${linkedProject.id}`}
                >
                  {linkedProject.title}
                </Link>
              ) : task.projectTitle ? (
                <span>{task.projectTitle}</span>
              ) : (
                <em>{t("workTaskOrphanProjectFallback")}</em>
              )}
            </dd>
            <dt>{t("workTaskWorkItemLabel")}</dt>
            <dd>
              {linkedWorkItem ? (
                <Link
                  className="taskDetail__refLink"
                  to={`${WORK_WORK_ITEMS_PATH}/${linkedWorkItem.id}`}
                >
                  {linkedWorkItem.title}
                </Link>
              ) : task.workItemTitle ? (
                <span>{task.workItemTitle}</span>
              ) : (
                <em>{t("workTaskNoWorkItemFallback")}</em>
              )}
            </dd>
            {parentTask ? (
              <>
                <dt>{t("workTaskParentTaskLabel")}</dt>
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
            <dt>{t("workTaskOwnerLabel")}</dt>
            <dd>{task.ownerName}</dd>
            <dt>{t("workTaskAssigneeLabel")}</dt>
            <dd>
              {task.assigneeName ?? <em>{t("workTaskNoAssigneeFallback")}</em>}
            </dd>
            <dt>{t("workTaskAssignedActorsLabel")}</dt>
            <dd>
              {assignedNames.length > 0 ? (
                assignedNames.join(", ")
              ) : (
                <em>{t("workTaskNoActorsAssignedFallback")}</em>
              )}
            </dd>
            {task.acceptanceCriteria ? (
              <>
                <dt>{t("workTaskAcceptanceCriteriaLabel")}</dt>
                <dd>{task.acceptanceCriteria}</dd>
              </>
            ) : null}
            {task.conversationId ? (
              <>
                <dt>{t("workTaskConversationLabel")}</dt>
                <dd>
                  <span className="taskDetail__convoTitle">
                    {task.conversationTitle ?? task.conversationId}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <SubTasksSection subTasks={subTasks} />

        <RunsSection taskId={task.id} runs={taskRuns} />

        <LinkageSection
          selfRef={{ recordFamily: "task", recordId: task.id }}
          graph={graph}
          indexes={indexes}
        />

        <section className="taskDetail__section">
          <header className="taskDetail__sectionHeader">
            <h2>{t("workTaskActivityTitle")}</h2>
            <span className="taskDetail__sectionCount">
              {activities.length}
            </span>
          </header>
          {activities.length === 0 ? (
            <p className="taskDetail__empty">{t("workTaskNoActivity")}</p>
          ) : (
            <ul className="taskDetail__activity">
              {activities.map((act) => (
                <li key={act.id} className="taskDetail__activityRow">
                  <span className="taskDetail__activityWhen">
                    {formatRelative(act.updatedAt, t)}
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

function SubTasksSection({
  subTasks,
}: { subTasks: WorkTaskListItem[] }): JSX.Element {
  const { t } = useI18n();

  return (
    <section className="taskDetail__section">
      <header className="taskDetail__sectionHeader">
        <h2>{t("workTaskSubTasksTitle")}</h2>
        <span className="taskDetail__sectionCount">{subTasks.length}</span>
      </header>
      {subTasks.length === 0 ? (
        <p className="taskDetail__empty">{t("workTaskNoSubTasksLabel")}</p>
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
                {formatTaskStatusLabel(sub.status, t)}
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
  runs: readonly WorkRunListItem[];
}

function RunsSection({ taskId, runs }: RunsSectionProps): JSX.Element {
  const { t } = useI18n();

  return (
    <section className="taskDetail__section">
      <header className="taskDetail__sectionHeader">
        <h2>{t("workTaskRunsTitle")}</h2>
        <span className="taskDetail__sectionCount">{runs.length}</span>
      </header>
      {runs.length === 0 ? (
        <p className="taskDetail__empty">
          {t("workTaskNoRunsIntro")}{" "}
          <strong>{t("workTaskNoRunsActionLabel")}</strong>{" "}
          {t("workTaskNoRunsSuffix")}
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
                {formatRunStatusLabel(run.status, t)}
              </span>
              <span className="taskDetail__activityWhen">
                {formatRelative(run.updatedAt, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskDetailLoading(): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="taskDetail">
      <header className="channelTopBar taskDetailTopBar">
        <div className="channelTopBarStart taskDetailTopBar__start">
          <Link to=".." relative="path" className="taskDetailTopBar__back">
            <span>{t("workTaskBackArrowLabel")}</span>
          </Link>
        </div>
      </header>
      <main className="taskDetail__main">
        <p className="taskDetail__empty">{t("workTaskLoadingLabel")}</p>
      </main>
    </div>
  );
}

function TaskNotFound({ taskId }: { taskId: string | null }): JSX.Element {
  const { t } = useI18n();

  return (
    <div className="taskDetail">
      <header className="channelTopBar taskDetailTopBar">
        <div className="channelTopBarStart taskDetailTopBar__start">
          <Link to=".." relative="path" className="taskDetailTopBar__back">
            <span>{t("workTaskBackArrowLabel")}</span>
          </Link>
          <span className="taskDetailTopBar__separator" aria-hidden="true">
            /
          </span>
          <h1 className="channelTopBarTitle taskDetailTopBar__title">
            {t("workTaskNotFoundTitle")}
          </h1>
        </div>
      </header>
      <main className="taskDetail__main">
        <p className="taskDetail__empty">
          {t("workTaskNotFoundText", {
            taskId: taskId ?? t("workTaskNotFoundCodeLabel"),
          })}
        </p>
      </main>
    </div>
  );
}

function formatTaskStatusLabel(
  status: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return status === "pending_approval"
    ? t("workTaskStatusPendingApproval")
    : status === "approved"
      ? t("workTaskStatusApproved")
      : status === "archived"
        ? t("workTaskStatusArchived")
        : getWorkObjectStatusLabel(status, t);
}

function formatRunStatusLabel(
  status: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return status === "pending_approval"
    ? t("workTaskStatusPendingApproval")
    : getWorkObjectStatusLabel(status, t);
}

function formatTaskPriorityLabel(
  priority: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return priority === "urgent"
    ? t("workTaskPriorityUrgent")
    : priority === "high"
      ? t("workTaskPriorityHigh")
      : priority === "medium"
        ? t("workTaskPriorityMedium")
        : priority === "low"
          ? t("workTaskPriorityLow")
          : priority;
}
