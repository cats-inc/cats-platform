import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { useI18n } from "../../../../app/renderer/i18n/index.js";
import { linkWorkExternalIssue } from "../api/workRecords.js";
import type {
  ExternalWorkBindingExternalType,
  ExternalWorkBindingLocalKind,
  ExternalWorkBindingProvider,
  ExternalWorkBindingSyncDirection,
} from "../../shared/externalWorkBinding.js";
import { inferExternalTrackerBindingFromUrl } from "../../shared/externalTrackerUrls.js";
import { formatWorkCrudMutationError } from "./workCrudErrorLabels.js";

interface WorkExternalBindingDialogProps {
  localKind: ExternalWorkBindingLocalKind;
  localId: string;
  defaultExternalType?: ExternalWorkBindingExternalType;
  errorFallback: string;
  invalidateQueryKeys: readonly QueryKey[];
  onClose: () => void;
  title: string;
}

export function WorkExternalBindingDialog({
  localKind,
  localId,
  defaultExternalType = "issue",
  errorFallback,
  invalidateQueryKeys,
  onClose,
  title,
}: WorkExternalBindingDialogProps): JSX.Element {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const titleId = useId();
  const providerId = useId();
  const externalTypeId = useId();
  const externalIdInputId = useId();
  const externalUrlId = useId();
  const syncDirectionId = useId();
  const externalIdRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] =
    useState<ExternalWorkBindingProvider>("github");
  const [externalType, setExternalType] =
    useState<ExternalWorkBindingExternalType>(defaultExternalType);
  const [externalId, setExternalId] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [syncDirection, setSyncDirection] =
    useState<ExternalWorkBindingSyncDirection>("pull");

  const mutation = useMutation({
    mutationFn: () =>
      linkWorkExternalIssue(
        {
          localKind,
          localId,
          provider,
          externalType,
          externalId: externalId.trim(),
          externalUrl: externalUrl.trim() || null,
          syncDirection,
        },
        errorFallback,
      ),
    onSuccess: async () => {
      await Promise.all(
        invalidateQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onClose();
    },
  });
  const submitting = mutation.isPending;
  const error = mutation.error
    ? formatWorkCrudMutationError(mutation.error, errorFallback, t)
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

  function onExternalUrlChange(value: string): void {
    setExternalUrl(value);

    const inference = inferExternalTrackerBindingFromUrl(value, provider);
    if (!inference) {
      return;
    }
    if (inference.provider) {
      setProvider(inference.provider);
    }
    if (inference.externalType) {
      setExternalType(inference.externalType);
    }
    if (inference.externalId && externalId.trim().length === 0) {
      setExternalId(inference.externalId);
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
            {title}
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
              {t("workExternalProviderLabel")}
            </span>
            <select
              id={providerId}
              className="newProjectDialog__select"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value as ExternalWorkBindingProvider)
              }
            >
              <option value="github">{t("workExternalProviderGithub")}</option>
              <option value="gitlab">{t("workExternalProviderGitlab")}</option>
              <option value="gitea">{t("workExternalProviderGitea")}</option>
              <option value="redmine">{t("workExternalProviderRedmine")}</option>
              <option value="bugzilla">{t("workExternalProviderBugzilla")}</option>
            </select>
          </label>

          <label className="newProjectDialog__field" htmlFor={externalTypeId}>
            <span className="newProjectDialog__label">
              {t("workExternalTypeLabel")}
            </span>
            <select
              id={externalTypeId}
              className="newProjectDialog__select"
              value={externalType}
              onChange={(event) =>
                setExternalType(
                  event.target.value as ExternalWorkBindingExternalType,
                )
              }
            >
              <option value="issue">{t("workExternalTypeIssue")}</option>
              <option value="ticket">{t("workExternalTypeTicket")}</option>
              <option value="project">{t("workExternalTypeProject")}</option>
            </select>
          </label>

          <label className="newProjectDialog__field" htmlFor={externalIdInputId}>
            <span className="newProjectDialog__label">
              {t("workExternalIdLabel")}
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
              placeholder={t("workExternalIdPlaceholder")}
              required
              maxLength={200}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={externalUrlId}>
            <span className="newProjectDialog__label">
              {t("workExternalUrlLabel")}
            </span>
            <input
              id={externalUrlId}
              type="url"
              className="newProjectDialog__input"
              value={externalUrl}
              onChange={(event) => onExternalUrlChange(event.target.value)}
              placeholder={t("workExternalUrlPlaceholder")}
              maxLength={1000}
            />
          </label>

          <label className="newProjectDialog__field" htmlFor={syncDirectionId}>
            <span className="newProjectDialog__label">
              {t("workExternalSyncDirectionLabel")}
            </span>
            <select
              id={syncDirectionId}
              className="newProjectDialog__select"
              value={syncDirection}
              onChange={(event) =>
                setSyncDirection(
                  event.target.value as ExternalWorkBindingSyncDirection,
                )
              }
            >
              <option value="pull">{t("workExternalSyncPull")}</option>
              <option value="push">{t("workExternalSyncPush")}</option>
              <option value="bidirectional">
                {t("workExternalSyncBidirectional")}
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
              {t("workExternalCancelButton")}
            </button>
            <button
              type="submit"
              className="newProjectDialog__submitBtn"
              disabled={externalId.trim().length === 0 || submitting}
            >
              {submitting
                ? t("workExternalSubmitBusyLabel")
                : t("workExternalSubmitLabel")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
