import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { createWorkTask, type CoreTaskStatus } from "../../api/workRecords.js";
import { WORK_TASKS_PATH } from "../../workPaths.js";
import {
  TASKS_QUERY_KEY,
  useTasksQuery,
} from "../../state/queries/tasksQuery.js";
import type { TaskPriority } from "../../../shared/workGraphTypes.js";
import { formatWorkCrudMutationError } from "../workCrudErrorLabels.js";

interface CreateTaskInput {
  title: string;
  summary: string | null;
  status: CoreTaskStatus;
  priority: TaskPriority | null;
  assigneeName: string | null;
  acceptanceCriteria: string | null;
  parentTaskId: string | null;
}

const TASK_RENDERER_METADATA_KEY = "workRenderer";

async function createTaskFromDialog(
  input: CreateTaskInput,
  errorMessage: string,
): Promise<{ id: string }> {
  const rendererExtras: Record<string, unknown> = {};
  if (input.priority) rendererExtras.priority = input.priority;
  if (input.assigneeName) rendererExtras.assigneeName = input.assigneeName;
  if (input.acceptanceCriteria) {
    rendererExtras.acceptanceCriteria = input.acceptanceCriteria;
  }
  const metadata =
    Object.keys(rendererExtras).length > 0
      ? { [TASK_RENDERER_METADATA_KEY]: rendererExtras }
      : undefined;

  const result = await createWorkTask({
    title: input.title,
    summary: input.summary,
    status: input.status,
    parentTaskId: input.parentTaskId,
    metadata,
  }, errorMessage);
  return { id: result.task.id };
}

interface NewTaskDialogProps {
  onClose: () => void;
  defaultParentTaskId?: string | null;
}

export function NewTaskDialog({
  onClose,
  defaultParentTaskId,
}: NewTaskDialogProps): JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleId = useId();
  const summaryId = useId();
  const parentTaskFieldId = useId();
  const assigneeId = useId();
  const statusId = useId();
  const priorityId = useId();
  const acceptanceId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const tasksQuery = useTasksQuery();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [parentTask, setParentTask] = useState(defaultParentTaskId ?? "");
  const [assigneeName, setAssigneeName] = useState("");
  const [status, setStatus] = useState<CoreTaskStatus>("draft");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) =>
      createTaskFromDialog(input, t("workNewTaskCreateError")),
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      onClose();
      navigate(`${WORK_TASKS_PATH}/${task.id}`);
    },
  });
  const submitting = createMutation.isPending;
  const error = createMutation.error
    ? formatWorkCrudMutationError(
      createMutation.error,
      t("workNewTaskCreateError"),
      t,
    )
    : null;

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    createMutation.mutate({
      title: trimmed,
      summary: summary.trim() || null,
      status,
      priority: priority || null,
      assigneeName: assigneeName.trim() || null,
      acceptanceCriteria: acceptanceCriteria.trim() || null,
      parentTaskId: parentTask || null,
    });
  }

  const statusOptions: { value: CoreTaskStatus; label: string }[] = [
    { value: "draft", label: t("workNewTaskStatusDraft") },
    {
      value: "pending_approval",
      label: t("workNewTaskStatusPendingApproval"),
    },
    { value: "approved", label: t("workNewTaskStatusApproved") },
    { value: "in_progress", label: t("workNewTaskStatusInProgress") },
    { value: "blocked", label: t("workNewTaskStatusBlocked") },
    { value: "completed", label: t("workNewTaskStatusCompleted") },
  ];

  const priorityOptions: {
    value: TaskPriority | "";
    label: string;
  }[] = [
    { value: "", label: t("workNewTaskNoPriority") },
    { value: "urgent", label: t("workNewTaskPriorityUrgent") },
    { value: "high", label: t("workNewTaskPriorityHigh") },
    { value: "medium", label: t("workNewTaskPriorityMedium") },
    { value: "low", label: t("workNewTaskPriorityLow") },
  ];

  const parentTaskOptions = tasksQuery.data?.tasks ?? [];

  return (
    <div
      className="newProjectDialog__backdrop"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className="newProjectDialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${titleId}-heading`}
      >
        <header className="newProjectDialog__header">
          <h2 id={`${titleId}-heading`} className="newProjectDialog__heading">
            {t("workNewTaskTitle")}
          </h2>
          <button
            type="button"
            className="newProjectDialog__close"
            aria-label={t("workNewTaskCloseLabel")}
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form className="newProjectDialog__form" onSubmit={onSubmit}>
          <label className="newProjectDialog__field" htmlFor={titleId}>
            <span className="newProjectDialog__label">
              {t("workNewTaskTitleLabel")}
              <span className="newProjectDialog__required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              ref={titleInputRef}
              id={titleId}
              type="text"
              className="newProjectDialog__input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("workNewTaskTitlePlaceholder")}
              required
              maxLength={120}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={summaryId}>
            <span className="newProjectDialog__label">
              {t("workNewTaskSummaryLabel")}
            </span>
            <textarea
              id={summaryId}
              className="newProjectDialog__textarea"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t("workNewTaskSummaryPlaceholder")}
              rows={3}
              maxLength={400}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={parentTaskFieldId}>
            <span className="newProjectDialog__label">
              {t("workNewTaskParentTaskLabel")}
            </span>
            <select
              id={parentTaskFieldId}
              className="newProjectDialog__select"
              value={parentTask}
              onChange={(event) => setParentTask(event.target.value)}
            >
              <option value="">{t("workNewTaskNoParentTask")}</option>
              {parentTaskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>

          <label className="newProjectDialog__field" htmlFor={assigneeId}>
            <span className="newProjectDialog__label">
              {t("workNewTaskAssigneeLabel")}
            </span>
            <input
              id={assigneeId}
              type="text"
              className="newProjectDialog__input"
              value={assigneeName}
              onChange={(event) => setAssigneeName(event.target.value)}
              placeholder={t("workNewTaskAssigneePlaceholder")}
              maxLength={60}
            />
          </label>

          <div className="newProjectDialog__row">
            <label className="newProjectDialog__field" htmlFor={statusId}>
              <span className="newProjectDialog__label">
                {t("workNewTaskStatusLabel")}
              </span>
              <select
                id={statusId}
                className="newProjectDialog__select"
                value={status}
                onChange={(event) => setStatus(event.target.value as CoreTaskStatus)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="newProjectDialog__field" htmlFor={priorityId}>
              <span className="newProjectDialog__label">
                {t("workNewTaskPriorityLabel")}
              </span>
              <select
                id={priorityId}
                className="newProjectDialog__select"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority | "")
                }
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="newProjectDialog__field" htmlFor={acceptanceId}>
            <span className="newProjectDialog__label">
              {t("workNewTaskAcceptanceCriteriaLabel")}
            </span>
            <textarea
              id={acceptanceId}
              className="newProjectDialog__textarea"
              value={acceptanceCriteria}
              onChange={(event) => setAcceptanceCriteria(event.target.value)}
              placeholder={t("workNewTaskAcceptanceCriteriaPlaceholder")}
              rows={2}
              maxLength={280}
            />
          </label>

          {error ? (
            <p className="newProjectDialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <footer className="newProjectDialog__footer">
            <button
              type="button"
              className="newProjectDialog__cancelBtn"
              onClick={onClose}
              disabled={submitting}
            >
              {t("workNewTaskCancelButton")}
            </button>
            <button
              type="submit"
              className="newProjectDialog__submitBtn"
              disabled={title.trim().length === 0 || submitting}
            >
              {submitting
                ? t("workNewTaskSubmittingLabel")
                : t("workNewTaskSubmitLabel")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
