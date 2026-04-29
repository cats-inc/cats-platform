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

import {
  createWorkItem as restCreateWorkItem,
  type CoreWorkItemStatus,
} from "../../api/workRecords.js";
import { WORK_WORK_ITEMS_PATH } from "../../workPaths.js";
import { useProjectsQuery } from "../../state/queries/projectsQuery.js";
import { WORK_ITEMS_QUERY_KEY } from "../../state/queries/workItemsQuery.js";

interface CreateWorkItemInput {
  title: string;
  summary: string | null;
  status: CoreWorkItemStatus;
  projectId: string | null;
}

async function createWorkItemFromDialog(
  input: CreateWorkItemInput,
): Promise<{ id: string }> {
  const result = await restCreateWorkItem({
    title: input.title,
    summary: input.summary,
    status: input.status,
    projectId: input.projectId,
  });
  return { id: result.workItem.id };
}

interface NewWorkItemDialogProps {
  onClose: () => void;
  defaultProjectId?: string | null;
}

const STATUS_OPTIONS: { value: CoreWorkItemStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "planned", label: "Planned" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function NewWorkItemDialog({
  onClose,
  defaultProjectId,
}: NewWorkItemDialogProps): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleId = useId();
  const summaryId = useId();
  const projectId = useId();
  const statusId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const projectsQuery = useProjectsQuery();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [linkedProject, setLinkedProject] = useState(defaultProjectId ?? "");
  const [status, setStatus] = useState<CoreWorkItemStatus>("draft");

  const createMutation = useMutation({
    mutationFn: createWorkItemFromDialog,
    onSuccess: async (workItem) => {
      await queryClient.invalidateQueries({ queryKey: WORK_ITEMS_QUERY_KEY });
      onClose();
      navigate(`${WORK_WORK_ITEMS_PATH}/${workItem.id}`);
    },
  });
  const submitting = createMutation.isPending;
  const error = createMutation.error
    ? createMutation.error instanceof Error
      ? createMutation.error.message
      : "Failed to create work item."
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
      projectId: linkedProject || null,
    });
  }

  const projectOptions = projectsQuery.data?.projects ?? [];

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
            New work item
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
              placeholder="What needs to ship?"
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
              placeholder="Define the scope in one or two lines."
              rows={3}
              maxLength={400}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={projectId}>
            <span className="newProjectDialog__label">Project</span>
            <select
              id={projectId}
              className="newProjectDialog__select"
              value={linkedProject}
              onChange={(event) => setLinkedProject(event.target.value)}
            >
              <option value="">— Orphan (no project) —</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>

          <label className="newProjectDialog__field" htmlFor={statusId}>
            <span className="newProjectDialog__label">Status</span>
            <select
              id={statusId}
              className="newProjectDialog__select"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as CoreWorkItemStatus)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
              {submitting ? "Creating…" : "Create work item"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
