import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useI18n } from "../../../../../app/renderer/i18n/index.js";
import { createWorkLink } from "../../api/links.js";
import { WORK_GRAPH_QUERY_KEY } from "../../state/queries/workGraphQuery.js";
import { endpointKey, getWorkGraphKindLabel } from "./shared";
import type { MessageKey } from "../../../../../shared/i18n/index.js";
import type {
  WorkGraphLinkEndpointKind,
  WorkGraphLinkEndpointRef,
  WorkGraphLinkViewKind,
  WorkGraphObjectSummary,
  WorkGraphProjection,
} from "./types";

type SubmittableKind = WorkGraphLinkViewKind;
type KindOption = { value: SubmittableKind; label: MessageKey; help: MessageKey };

const KIND_OPTIONS: ReadonlyArray<KindOption> = [
  {
    value: "blocks",
    label: "workTopdownLinkageViewKindBlocksLabel",
    help: "workTopdownLinkKindBlocksHelp",
  },
  {
    value: "blocked_by",
    label: "workTopdownLinkageViewKindBlockedByLabel",
    help: "workTopdownLinkKindBlockedByHelp",
  },
  {
    value: "related_to",
    label: "workTopdownLinkageViewKindRelatedToLabel",
    help: "workTopdownLinkKindRelatedToHelp",
  },
  {
    value: "duplicate_of",
    label: "workTopdownLinkageViewKindDuplicateOfLabel",
    help: "workTopdownLinkKindDuplicateOfHelp",
  },
  {
    value: "follows",
    label: "workTopdownLinkageViewKindFollowsLabel",
    help: "workTopdownLinkKindFollowsHelp",
  },
];

interface NewLinkDialogProps {
  selfRef: WorkGraphLinkEndpointRef;
  graph: WorkGraphProjection;
  onClose: () => void;
  onCreated?: (linkId: string) => void;
}

const ENDPOINT_KINDS: ReadonlySet<WorkGraphLinkEndpointKind> = new Set([
  "project",
  "work_item",
  "task",
]);
const NOTE_MAX_LENGTH = 280;

function isPwt(o: WorkGraphObjectSummary): boolean {
  return ENDPOINT_KINDS.has(o.kind as WorkGraphLinkEndpointKind);
}

export function NewLinkDialog({
  selfRef,
  graph,
  onClose,
  onCreated,
}: NewLinkDialogProps): JSX.Element {
  const headingId = useId();
  const kindId = useId();
  const targetSearchId = useId();
  const noteId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const [kind, setKind] = useState<SubmittableKind>("blocks");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape" && !submitting) {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  const candidates = useMemo(() => {
    const selfKey = endpointKey(selfRef);
    const search = targetQuery.trim().toLowerCase();
    return graph.objects
      .filter(isPwt)
      .filter((o) => `${o.kind}:${o.sourceRecordId}` !== selfKey)
      .filter((o) =>
        search.length === 0
          ? true
          : o.title.toLowerCase().includes(search) ||
            o.sourceRecordId.toLowerCase().includes(search),
      )
      .slice(0, 25);
  }, [graph.objects, selfRef, targetQuery]);

  const selectedTarget = targetId
    ? graph.objects.find((o) => o.id === targetId) ?? null
    : null;
  const selectedKindOption = KIND_OPTIONS.find((option) => option.value === kind);

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onClose();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTarget || submitting) return;
    if (!isPwt(selectedTarget)) {
      setError(t("workTopdownNewLinkErrorInvalidTarget"));
      return;
    }
    const targetRefKind = selectedTarget.kind as WorkGraphLinkEndpointKind;
    if (
      targetRefKind === selfRef.recordFamily &&
      selectedTarget.sourceRecordId === selfRef.recordId
    ) {
      setError(t("workTopdownNewLinkErrorSelfLink"));
      return;
    }
    const trimmedNote = note.trim();
    if (trimmedNote.length > NOTE_MAX_LENGTH) {
      setError(
        t("workTopdownNewLinkErrorNoteTooLong", {
          max: `${NOTE_MAX_LENGTH}`,
        }),
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createWorkLink({
        kind,
        source: selfRef,
        target: { recordFamily: targetRefKind, recordId: selectedTarget.sourceRecordId },
        note: trimmedNote.length === 0 ? null : trimmedNote,
      });
      await queryClient.invalidateQueries({ queryKey: WORK_GRAPH_QUERY_KEY });
      onCreated?.(result.link.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workTopdownNewLinkErrorFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = !selectedTarget || submitting;

  return (
    <div
      className="newLinkDialog__backdrop"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className="newLinkDialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="newLinkDialog__header">
          <h2 id={headingId} className="newLinkDialog__heading">
            {t("workTopdownNewLinkDialogTitle")}
          </h2>
          <button
            type="button"
            className="newLinkDialog__close"
            aria-label={t("workTopdownNewLinkClose")}
            onClick={onClose}
            disabled={submitting}
          >
            &times;
          </button>
        </header>
        <form className="newLinkDialog__form" onSubmit={onSubmit}>
          <p className="newLinkDialog__sourceLine">
            {t("workTopdownNewLinkSourcePrefix")}{" "}
            <strong>{getWorkGraphKindLabel(selfRef.recordFamily, t)}</strong>{" "}
            <code>{selfRef.recordId}</code>
          </p>

          <label className="newLinkDialog__field" htmlFor={kindId}>
            <span className="newLinkDialog__label">
              {t("workTopdownNewLinkRelationLabel")}
            </span>
            <select
              id={kindId}
              className="newLinkDialog__select"
              value={kind}
              onChange={(event) => setKind(event.target.value as SubmittableKind)}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
            <span className="newLinkDialog__hint">
              {selectedKindOption ? t(selectedKindOption.help) : ""}
            </span>
          </label>

          <div className="newLinkDialog__field">
            <label className="newLinkDialog__label" htmlFor={targetSearchId}>
              {t("workTopdownNewLinkTargetLabel")}
            </label>
            <input
              ref={titleInputRef}
              id={targetSearchId}
              type="text"
              className="newLinkDialog__input"
              value={targetQuery}
              onChange={(event) => {
                setTargetQuery(event.target.value);
                setTargetId(null);
              }}
              placeholder={t("workTopdownNewLinkTargetSearchPlaceholder", {
                project: t("workTopdownAnchorProject"),
                workItem: t("workTopdownAnchorWorkItem"),
                task: t("workTopdownAnchorTask"),
              })}
              autoComplete="off"
            />
            {candidates.length === 0 ? (
              <p className="newLinkDialog__empty">
                {t("workTopdownNewLinkNoMatches")}
              </p>
            ) : (
              <ul className="newLinkDialog__candidates">
                {candidates.map((candidate) => {
                  const selected = targetId === candidate.id;
                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className={
                          "newLinkDialog__candidate" +
                          (selected ? " newLinkDialog__candidate--selected" : "")
                        }
                        onClick={() => setTargetId(candidate.id)}
                      >
                        <span className="newLinkDialog__candidateKind">
                          {getWorkGraphKindLabel(candidate.kind, t)}
                        </span>
                        <span className="newLinkDialog__candidateTitle">
                          {candidate.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <label className="newLinkDialog__field" htmlFor={noteId}>
            <span className="newLinkDialog__label">
              {t("workTopdownNewLinkNoteLabel")}
            </span>
            <textarea
              id={noteId}
              className="newLinkDialog__textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("workTopdownNewLinkNotePlaceholder")}
              rows={2}
              maxLength={NOTE_MAX_LENGTH}
            />
            <span className="newLinkDialog__charCount">
              {note.length}/{NOTE_MAX_LENGTH}
            </span>
          </label>

          {error ? (
            <p className="newLinkDialog__error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="newLinkDialog__footer">
            <button
              type="button"
              className="newLinkDialog__cancelBtn"
              onClick={onClose}
              disabled={submitting}
            >
              {t("workTopdownNewLinkCancel")}
            </button>
            <button
              type="submit"
              className="newLinkDialog__submitBtn"
              disabled={submitDisabled}
            >
              {submitting ? t("workTopdownNewLinkSaving") : t("workTopdownLinkageAddAction")}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
