import { useState } from "react";
import { Link } from "react-router-dom";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import {
  formatRelative,
  getWorkGraphAttentionLabel,
} from "../topdown/shared";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import { useTasksQuery } from "../../state/queries/tasksQuery.js";
import { NewTaskDialog } from "./NewTaskDialog";
import "./tasks.css";

export function TasksListPage(): JSX.Element {
  const tasksQuery = useTasksQuery();
  const tasks = tasksQuery.data?.tasks ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const { t } = useI18n();

  return (
    <div className="tasksList">
      <header className="channelTopBar tasksListTopBar">
        <div className="channelTopBarStart tasksListTopBar__start">
          <h1 className="channelTopBarTitle tasksListTopBar__title">
            {t("workTasksListTitle")}
          </h1>
          <span className="tasksListTopBar__count">{tasks.length}</span>
        </div>
        <div className="channelTopBarCenter tasksListTopBar__center" />
        <div className="channelTopBarEnd tasksListTopBar__end">
          <button
            type="button"
            className="tasksListTopBar__addBtn"
            onClick={() => setDialogOpen(true)}
            aria-label={t("workTasksListCreateNewTaskAriaLabel")}
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
            <span>{t("workTasksListNewAction")}</span>
          </button>
        </div>
      </header>
      <main className="tasksList__main">
        {tasksQuery.isPending ? (
          <p className="tasksList__empty">{t("workTasksListLoading")}</p>
        ) : tasksQuery.isError ? (
          <p className="tasksList__empty">
            {t("workTasksListLoadError", {
              errorMessage: String((tasksQuery.error as Error).message),
            })}
          </p>
        ) : tasks.length === 0 ? (
          <p className="tasksList__empty">
            {t("workTasksListEmptyIntro")}{" "}
            <strong>{t("workTasksListEmptyActionLabel")}</strong>{" "}
            {t("workTasksListEmptySuffix")}
          </p>
        ) : (
          <ul className="tasksList__list">
            {tasks.map((task) => (
              <li key={task.id} className="tasksList__row">
                <Link
                  to={task.id}
                  className="tasksList__rowLink"
                  aria-label={t("workTasksListOpenTaskAria", {
                    title: task.title,
                  })}
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
                    {task.projectTitle ? (
                      <span className="tasksList__chip tasksList__chip--project">
                        {task.projectTitle}
                      </span>
                    ) : null}
                    {task.workItemTitle ? (
                      <span className="tasksList__chip tasksList__chip--workItem">
                        {task.workItemTitle}
                      </span>
                    ) : null}
                    {task.priority ? (
                  <span
                    className={`tasksList__priority tasksList__priority--${task.priority}`}
                    title={formatTaskPriorityTitle(task.priority, t)}
                  >
                        {formatTaskPriorityLabel(task.priority, t)}
                      </span>
                    ) : null}
                    {task.attention === "decision_needed" ? (
                      <span className="tasksList__pip tasksList__pip--decision">
                        {t("workObjectAttentionDecisionNeeded")}
                      </span>
                    ) : null}
                    {task.attention === "blocked" || task.attention === "failed" ? (
                      <span className="tasksList__pip tasksList__pip--blocked">
                        {getWorkGraphAttentionLabel(task.attention, t)}
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
                      {formatRelative(task.updatedAt, t)}
                    </span>
                    <span
                      className={`tasksList__statusPill tasksList__statusPill--${task.status}`}
                    >
                      {formatTaskStatusLabel(task.status, t)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      {dialogOpen ? (
        <NewTaskDialog onClose={() => setDialogOpen(false)} />
      ) : null}
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

function formatTaskPriorityTitle(
  priority: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const label = formatTaskPriorityLabel(priority, t);
  return t("workTaskPriorityLabelWithValue", { priorityLabel: label });
}
