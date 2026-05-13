import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import {
  importWorkExternalIssue,
  type ImportWorkExternalIssueInput,
} from "../../api/workRecords.js";
import type { ExternalWorkBindingProvider } from "../../../shared/externalWorkBinding.js";
import { inferExternalTrackerBindingFromUrl } from "../../../shared/externalTrackerUrls.js";
import { WORK_DASHBOARD_QUERY_KEY } from "../../state/queries/workDashboardQuery.js";
import { WORK_GRAPH_QUERY_KEY } from "../../state/queries/workGraphQuery.js";
import { WORK_ITEMS_QUERY_KEY } from "../../state/queries/workItemsQuery.js";
import { formatWorkCrudMutationError } from "../workCrudErrorLabels.js";

interface ImportExternalIssueDialogProps {
  onClose: () => void;
}

type ImportIssueProvider = Extract<
  ExternalWorkBindingProvider,
  "github" | "redmine" | "bugzilla"
>;

const PROVIDER_OPTIONS: readonly ImportIssueProvider[] = [
  "github",
  "redmine",
  "bugzilla",
];

function isImportIssueProvider(
  value: ExternalWorkBindingProvider | undefined,
): value is ImportIssueProvider {
  return value === "github" || value === "redmine" || value === "bugzilla";
}

function formatProviderLabel(provider: ImportIssueProvider): string {
  switch (provider) {
    case "github":
      return "GitHub";
    case "redmine":
      return "Redmine";
    case "bugzilla":
      return "Bugzilla";
  }
}

export function ImportExternalIssueDialog({
  onClose,
}: ImportExternalIssueDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const titleId = useId();
  const providerId = useId();
  const externalUrlId = useId();
  const externalUrlRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<ImportIssueProvider>("github");
  const [externalUrl, setExternalUrl] = useState("");

  const mutation = useMutation({
    mutationFn: (input: ImportWorkExternalIssueInput) =>
      importWorkExternalIssue(input, t("workExternalImportError")),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORK_ITEMS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: WORK_DASHBOARD_QUERY_KEY }),
      ]);
      onClose();
    },
  });
  const submitting = mutation.isPending;
  const trimmedExternalUrl = externalUrl.trim();
  const error = mutation.error
    ? formatWorkCrudMutationError(
      mutation.error,
      t("workExternalImportError"),
      t,
    )
    : null;

  useEffect(() => {
    externalUrlRef.current?.focus();
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

  function onExternalUrlChange(value: string): void {
    setExternalUrl(value);
    const inference = inferExternalTrackerBindingFromUrl(value, provider);
    if (isImportIssueProvider(inference?.provider)) {
      setProvider(inference.provider);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!trimmedExternalUrl || submitting) {
      return;
    }
    mutation.mutate({
      provider,
      externalUrl: trimmedExternalUrl,
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
            {t("workExternalImportDialogTitle")}
          </h2>
          <button
            type="button"
            className="newProjectDialog__close"
            aria-label={t("workExternalLinkCloseLabel")}
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form className="newProjectDialog__form" onSubmit={onSubmit}>
          <label className="newProjectDialog__field" htmlFor={providerId}>
            <span className="newProjectDialog__label">
              {t("workExternalImportProviderLabel")}
            </span>
            <select
              id={providerId}
              className="newProjectDialog__select"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as ImportIssueProvider)
              }
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatProviderLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="newProjectDialog__field" htmlFor={externalUrlId}>
            <span className="newProjectDialog__label">
              {t("workExternalImportUrlLabel")}
              <span className="newProjectDialog__required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              ref={externalUrlRef}
              id={externalUrlId}
              type="url"
              className="newProjectDialog__input"
              value={externalUrl}
              onChange={(event) => onExternalUrlChange(event.target.value)}
              placeholder={t("workExternalImportUrlPlaceholder")}
              required
              maxLength={1000}
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
              {t("workExternalImportCancelButton")}
            </button>
            <button
              type="submit"
              className="newProjectDialog__submitBtn"
              disabled={trimmedExternalUrl.length === 0 || submitting}
            >
              {submitting
                ? t("workExternalImportSubmitBusyLabel")
                : t("workExternalImportSubmitLabel")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
