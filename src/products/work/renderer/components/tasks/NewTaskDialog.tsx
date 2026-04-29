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

import type { CoreTaskStatus } from "../../api/workRecords.js";
import { WORK_TASKS_PATH } from "../../workPaths.js";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import { TASKS_QUERY_KEY, useTasksQuery } from "../../state/queries/tasksQuery.js";
import { useWorkItemsQuery } from "../../state/queries/workItemsQuery.js";
import {
  tasksStore,
  type CreateTaskInput,
  type TaskPriority,
} from "../../state/tasksStore";

interface NewTaskDialogProps {
  onClose: () => void;
  defaultProjectId?: string | null;
  defaultWorkItemId?: string | null;
  defaultParentTaskId?: string | null;
}

const STATUS_OPTIONS: { value: CoreTaskStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

const PRIORITY_OPTIONS: { value: TaskPriority | ""; label: string }[] = [
  { value: "", label: "— No priority —" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function NewTaskDialog({
  onClose,
  defaultProjectId,
  defaultWorkItemId,
  defaultParentTaskId,
}: NewTaskDialogProps): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleId = useId();
  const summaryId = useId();
  const projectId = useId();
  const workItemId = useId();
  const parentTaskFieldId = useId();
  const ownerId = useId();
  const assigneeId = useId();
  const statusId = useId();
  const priorityId = useId();
  const nextActionId = useId();
  const acceptanceId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const projectsQuery = useProjectsQuery();
  const workItemsQuery = useWorkItemsQuery();
  const tasksQuery = useTasksQuery();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [linkedProject, setLinkedProject] = useState(defaultProjectId ?? "");
  const [linkedWorkItem, setLinkedWorkItem] = useState(defaultWorkItemId ?? "");
  const [parentTask, setParentTask] = useState(defaultParentTaskId ?? "");
  const [ownerRole, setOwnerRole] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [status, setStatus] = useState<CoreTaskStatus>("draft");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [nextAction, setNextAction] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");

  const createMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => tasksStore.createTask(input),
    onSuccess: async (task) => {
      await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      onClose();
      navigate(`${WORK_TASKS_PATH}/${task.id}`);
    },
  });
  const submitting = createMutation.isPending;
  const error = createMutation.error
    ? createMutation.error instanceof Error
      ? createMutation.error.message
      : "Failed to create task."
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
      summary: summary || null,
      linkedProjectId: linkedProject || null,
      linkedWorkItemId: linkedWorkItem || null,
      parentTaskId: parentTask || null,
      ownerRole: ownerRole || null,
      assigneeName: assigneeName || null,
      status,
      priority: priority || null,
      nextAction: nextAction || null,
      acceptanceCriteria: acceptanceCriteria || null,
    });
  }

  const projectOptions = projectsQuery.data?.projects ?? [];
  const workItemOptions = (workItemsQuery.data?.workItems ?? []).filter((wi) =>
    linkedProject ? wi.projectId === linkedProject : true,
  );
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
            New task
          </h2>
          <button
            type="button"
            className="newProjectDialog__close"
            aria-label="Close"
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form className="newProjectDialog__form" onSubmit={onSubmit}>
          <label className="newProjectDialog__field" htmlFor={titleId}>
            <span className="newProjectDialog__label">
              Title<span className="newProjectDialog__required" aria-hidden="true">*</span>
            </span>
            <input
              ref={titleInputRef}
              id={titleId}
              type="text"
              className="newProjectDialog__input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What concrete action needs to happen?"
              required
              maxLength={120}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={summaryId}>
            <span className="newProjectDialog__label">Summary</span>
            <textarea
              id={summaryId}
              className="newProjectDialog__textarea"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Describe scope or context in one or two lines."
              rows={3}
              maxLength={400}
            />
          </label>

          <div className="newProjectDialog__row">
            <label className="newProjectDialog__field" htmlFor={projectId}>
              <span className="newProjectDialog__label">Project</span>
              <select
                id={projectId}
                className="newProjectDialog__select"
                value={linkedProject}
                onChange={(event) => {
                  setLinkedProject(event.target.value);
                  setLinkedWorkItem("");
                }}
              >
                <option value="">— No project —</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="newProjectDialog__field" htmlFor={workItemId}>
              <span className="newProjectDialog__label">Work item</span>
              <select
                id={workItemId}
                className="newProjectDialog__select"
                value={linkedWorkItem}
                onChange={(event) => setLinkedWorkItem(event.target.value)}
              >
                <option value="">— No work item —</option>
                {workItemOptions.map((wi) => (
                  <option key={wi.id} value={wi.id}>
                    {wi.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="newProjectDialog__field" htmlFor={parentTaskFieldId}>
            <span className="newProjectDialog__label">Parent task</span>
            <select
              id={parentTaskFieldId}
              className="newProjectDialog__select"
              value={parentTask}
              onChange={(event) => setParentTask(event.target.value)}
            >
              <option value="">— No parent task —</option>
              {parentTaskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>

          <div className="newProjectDialog__row">
            <label className="newProjectDialog__field" htmlFor={ownerId}>
              <span className="newProjectDialog__label">Owner role</span>
              <input
                id={ownerId}
                type="text"
                className="newProjectDialog__input"
                value={ownerRole}
                onChange={(event) => setOwnerRole(event.target.value)}
                placeholder="e.g. marketing"
                maxLength={40}
              />
            </label>

            <label className="newProjectDialog__field" htmlFor={assigneeId}>
              <span className="newProjectDialog__label">Assignee</span>
              <input
                id={assigneeId}
                type="text"
                className="newProjectDialog__input"
                value={assigneeName}
                onChange={(event) => setAssigneeName(event.target.value)}
                placeholder="Who picks this up?"
                maxLength={60}
              />
            </label>
          </div>

          <div className="newProjectDialog__row">
            <label className="newProjectDialog__field" htmlFor={statusId}>
              <span className="newProjectDialog__label">Status</span>
              <select
                id={statusId}
                className="newProjectDialog__select"
                value={status}
                onChange={(event) => setStatus(event.target.value as CoreTaskStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="newProjectDialog__field" htmlFor={priorityId}>
              <span className="newProjectDialog__label">Priority</span>
              <select
                id={priorityId}
                className="newProjectDialog__select"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority | "")
                }
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="newProjectDialog__field" htmlFor={nextActionId}>
            <span className="newProjectDialog__label">Next action</span>
            <input
              id={nextActionId}
              type="text"
              className="newProjectDialog__input"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              placeholder="What's the very next step?"
              maxLength={120}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={acceptanceId}>
            <span className="newProjectDialog__label">Acceptance criteria</span>
            <textarea
              id={acceptanceId}
              className="newProjectDialog__textarea"
              value={acceptanceCriteria}
              onChange={(event) => setAcceptanceCriteria(event.target.value)}
              placeholder='How do we know this is "done"?'
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
              Cancel
            </button>
            <button
              type="submit"
              className="newProjectDialog__submitBtn"
              disabled={title.trim().length === 0 || submitting}
            >
              {submitting ? "Creating…" : "Create task"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
