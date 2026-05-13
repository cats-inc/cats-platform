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
import { linkWorkExternalIssue } from "../../api/workRecords.js";
import { WORK_GRAPH_QUERY_KEY } from "../../state/queries/workGraphQuery.js";
import { WORK_ITEMS_QUERY_KEY } from "../../state/queries/workItemsQuery.js";
import type {
  ExternalWorkBindingExternalType,
  ExternalWorkBindingProvider,
  ExternalWorkBindingSyncDirection,
} from "../../../shared/externalWorkBinding.js";
import { formatWorkCrudMutationError } from "../workCrudErrorLabels.js";

interface WorkItemExternalBindingDialogProps {
  workItemId: string;
  onClose: () => void;
}

export function WorkItemExternalBindingDialog({
  workItemId,
  onClose,
}: WorkItemExternalBindingDialogProps): JSX.Element {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const titleId = useId();
  const providerId = useId();
  const externalTypeId = useId();
  const externalIdInputId = useId();
  const externalUrlId = useId();
  const syncDirectionId = useId();
  const externalIdRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<ExternalWorkBindingProvider>("github");
  const [externalType, setExternalType] =
    useState<ExternalWorkBindingExternalType>("issue");
  const [externalId, setExternalId] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [syncDirection, setSyncDirection] =
    useState<ExternalWorkBindingSyncDirection>("pull");

  const mutation = useMutation({
    mutationFn: () =>
      linkWorkExternalIssue(
        {
          localKind: "work_item",
          localId: workItemId,
          provider,
          externalType,
          externalId: externalId.trim(),
          externalUrl: externalUrl.trim() || null,
          syncDirection,
        },
        t("workItemExternalLinkError"),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORK_ITEMS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY }),
      ]);
      onClose();
    },
  });
  const submitting = mutation.isPending;
  const error = mutation.error
    ? formatWorkCrudMutationError(
      mutation.error,
      t("workItemExternalLinkError"),
      t,
    )
    : null;

  useEffect(() => {
    externalIdRef.current?.focus();
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
    if (!externalId.trim() || submitting) {
      return;
    }
    mutation.mutate();
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
            {t("workItemExternalLinkDialogTitle")}
          </h2>
          <button
            type="button"
            className="newProjectDialog__close"
            aria-label={t("workItemExternalLinkCloseLabel")}
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form className="newProjectDialog__form" onSubmit={onSubmit}>
          <label className="newProjectDialog__field" htmlFor={providerId}>
            <span className="newProjectDialog__label">
              {t("workItemExternalProviderLabel")}
            </span>
            <select
              id={providerId}
              className="newProjectDialog__select"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as ExternalWorkBindingProvider)
              }
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="gitea">Gitea</option>
              <option value="redmine">Redmine</option>
              <option value="bugzilla">Bugzilla</option>
            </select>
          </label>

          <label className="newProjectDialog__field" htmlFor={externalTypeId}>
            <span className="newProjectDialog__label">
              {t("workItemExternalTypeLabel")}
            </span>
            <select
              id={externalTypeId}
              className="newProjectDialog__select"
              value={externalType}
              onChange={(event) =>
                setExternalType(event.target.value as ExternalWorkBindingExternalType)
              }
            >
              <option value="issue">{t("workItemExternalTypeIssue")}</option>
              <option value="ticket">{t("workItemExternalTypeTicket")}</option>
              <option value="project">{t("workItemExternalTypeProject")}</option>
            </select>
          </label>

          <label className="newProjectDialog__field" htmlFor={externalIdInputId}>
            <span className="newProjectDialog__label">
              {t("workItemExternalIdLabel")}
              <span className="newProjectDialog__required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              ref={externalIdRef}
              id={externalIdInputId}
              type="text"
              className="newProjectDialog__input"
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
              placeholder={t("workItemExternalIdPlaceholder")}
              required
              maxLength={200}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={externalUrlId}>
            <span className="newProjectDialog__label">
              {t("workItemExternalUrlLabel")}
            </span>
            <input
              id={externalUrlId}
              type="url"
              className="newProjectDialog__input"
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              placeholder={t("workItemExternalUrlPlaceholder")}
              maxLength={1000}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={syncDirectionId}>
            <span className="newProjectDialog__label">
              {t("workItemExternalSyncDirectionLabel")}
            </span>
            <select
              id={syncDirectionId}
              className="newProjectDialog__select"
              value={syncDirection}
              onChange={(event) =>
                setSyncDirection(event.target.value as ExternalWorkBindingSyncDirection)
              }
            >
              <option value="pull">{t("workItemExternalSyncPull")}</option>
              <option value="push">{t("workItemExternalSyncPush")}</option>
              <option value="bidirectional">
                {t("workItemExternalSyncBidirectional")}
              </option>
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
              {t("workItemExternalCancelButton")}
            </button>
            <button
              type="submit"
              className="newProjectDialog__submitBtn"
              disabled={externalId.trim().length === 0 || submitting}
            >
              {submitting
                ? t("workItemExternalSubmitBusyLabel")
                : t("workItemExternalSubmitLabel")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
