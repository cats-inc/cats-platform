import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import type { CoreProjectStatus } from "../../api/workRecords.js";
import { WORK_PROJECTS_PATH } from "../../workPaths.js";
import { PROJECTS_QUERY_KEY } from "../../state/queries/projectsQuery.js";
import { pinnedProjectsStore } from "../../state/pinnedProjectsStore";

interface NewProjectDialogProps {
  onClose: () => void;
}

const STATUS_OPTIONS: { value: CoreProjectStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

export function NewProjectDialog({ onClose }: NewProjectDialogProps): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleId = useId();
  const summaryId = useId();
  const ownerId = useId();
  const statusId = useId();
  const nextActionId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [ownerRole, setOwnerRole] = useState("");
  const [status, setStatus] = useState<CoreProjectStatus>("planned");
  const [nextAction, setNextAction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await pinnedProjectsStore.createProject({
        title: trimmed,
        summary: summary || null,
        ownerRole: ownerRole || null,
        status,
        nextAction: nextAction || null,
      });
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      onClose();
      navigate(`${WORK_PROJECTS_PATH}/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setSubmitting(false);
    }
  }

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
            New project
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
              placeholder="What is this project?"
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
              placeholder="Why does it exist? Who is it for?"
              rows={3}
              maxLength={400}
            />
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

            <label className="newProjectDialog__field" htmlFor={statusId}>
              <span className="newProjectDialog__label">Status</span>
              <select
                id={statusId}
                className="newProjectDialog__select"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as CoreProjectStatus)
                }
              >
                {STATUS_OPTIONS.map((option) => (
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
              {submitting ? "Creating…" : "Create project"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
