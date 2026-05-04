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
  createWorkProject as restCreateWorkProject,
  type CoreProjectStatus,
} from "../../api/workRecords.js";
import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { getWorkObjectStatusLabel } from "../topdown/WorkObjectCard";
import { WORK_PROJECTS_PATH } from "../../workPaths.js";
import { PROJECTS_QUERY_KEY } from "../../state/queries/projectsQuery.js";
import { formatWorkCrudMutationError } from "../workCrudErrorLabels.js";

interface CreateProjectInput {
  title: string;
  summary: string | null;
  status: CoreProjectStatus;
}

async function createProjectFromDialog(
  input: CreateProjectInput,
  errorMessage: string,
): Promise<{ id: string }> {
  const result = await restCreateWorkProject({
    title: input.title,
    summary: input.summary,
    status: input.status,
  }, errorMessage);
  return { id: result.project.id };
}

interface NewProjectDialogProps {
  onClose: () => void;
}

const STATUS_OPTIONS: CoreProjectStatus[] = [
  "planned",
  "active",
  "paused",
  "archived",
];

export function NewProjectDialog({ onClose }: NewProjectDialogProps): JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const titleId = useId();
  const summaryId = useId();
  const statusId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<CoreProjectStatus>("planned");

  const createMutation = useMutation({
    mutationFn: (input: CreateProjectInput) =>
      createProjectFromDialog(input, t("workNewProjectCreateError")),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      onClose();
      navigate(`${WORK_PROJECTS_PATH}/${project.id}`);
    },
  });
  const submitting = createMutation.isPending;
  const error = createMutation.error
    ? formatWorkCrudMutationError(
      createMutation.error,
      t("workNewProjectCreateError"),
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
    });
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
            {t("workNewProjectTitle")}
          </h2>
          <button
            type="button"
            className="newProjectDialog__close"
            aria-label={t("workNewProjectCloseLabel")}
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form className="newProjectDialog__form" onSubmit={onSubmit}>
          <label className="newProjectDialog__field" htmlFor={titleId}>
            <span className="newProjectDialog__label">
              {t("workNewProjectTitleLabel")}
              <span className="newProjectDialog__required" aria-hidden="true">*</span>
            </span>
            <input
              ref={titleInputRef}
              id={titleId}
              type="text"
              className="newProjectDialog__input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("workNewProjectTitlePlaceholder")}
              required
              maxLength={120}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={summaryId}>
            <span className="newProjectDialog__label">
              {t("workNewProjectSummaryLabel")}
            </span>
            <textarea
              id={summaryId}
              className="newProjectDialog__textarea"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t("workNewProjectSummaryPlaceholder")}
              rows={3}
              maxLength={400}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={statusId}>
            <span className="newProjectDialog__label">
              {t("workNewProjectStatusLabel")}
            </span>
            <select
              id={statusId}
              className="newProjectDialog__select"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as CoreProjectStatus)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getWorkObjectStatusLabel(option, t)}
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
              {t("workNewProjectCancelButton")}
            </button>
            <button
              type="submit"
              className="newProjectDialog__submitBtn"
              disabled={title.trim().length === 0 || submitting}
            >
              {submitting
                ? t("workNewProjectSubmitBusyLabel")
                : t("workNewProjectSubmitLabel")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
