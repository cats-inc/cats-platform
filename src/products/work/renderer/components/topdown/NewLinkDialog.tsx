import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { createWorkLink } from "../../api/links.js";
import { useWorkGraphLinks } from "../../state/workGraphLinksStore";
import { endpointKey, KIND_LABEL } from "./shared";
import type {
  WorkGraphLinkEndpointKind,
  WorkGraphLinkEndpointRef,
  WorkGraphLinkViewKind,
  WorkGraphObjectSummary,
  WorkGraphProjection,
} from "./types";

type SubmittableKind = WorkGraphLinkViewKind;

interface NewLinkDialogProps {
  selfRef: WorkGraphLinkEndpointRef;
  graph: WorkGraphProjection;
  onClose: () => void;
  onCreated?: (linkId: string) => void;
}

const KIND_OPTIONS: ReadonlyArray<{ value: SubmittableKind; label: string; help: string }> = [
  { value: "blocks", label: "Blocking", help: "This blocks the target." },
  { value: "blocked_by", label: "Blocked by", help: "The target blocks this." },
  { value: "related_to", label: "Related", help: "Related but no containment." },
  { value: "duplicate_of", label: "Duplicate of", help: "This is a duplicate of the target." },
  { value: "follows", label: "Follows", help: "This supersedes the target." },
];

const ENDPOINT_KINDS: ReadonlySet<WorkGraphLinkEndpointKind> = new Set([
  "project",
  "work_item",
  "task",
]);

function isPwt(o: WorkGraphObjectSummary): boolean {
  return ENDPOINT_KINDS.has(o.kind as WorkGraphLinkEndpointKind);
}

const NOTE_MAX_LENGTH = 280;

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

  const { refresh } = useWorkGraphLinks();

  const [kind, setKind] = useState<SubmittableKind>("blocks");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget && !submitting) {
      onClose();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTarget || submitting) return;
    if (!isPwt(selectedTarget)) {
      setError("Target must be a Project, Work Item, or Task.");
      return;
    }
    const targetRefKind = selectedTarget.kind as WorkGraphLinkEndpointKind;
    if (
      targetRefKind === selfRef.recordFamily &&
      selectedTarget.sourceRecordId === selfRef.recordId
    ) {
      setError("A link cannot point to itself.");
      return;
    }
    const trimmedNote = note.trim();
    if (trimmedNote.length > NOTE_MAX_LENGTH) {
      setError(`Note must be ${NOTE_MAX_LENGTH} characters or fewer.`);
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
      await refresh();
      onCreated?.(result.link.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link.");
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
            Add link
          </h2>
          <button
            type="button"
            className="newLinkDialog__close"
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
          >
            &times;
          </button>
        </header>
        <form className="newLinkDialog__form" onSubmit={onSubmit}>
          <p className="newLinkDialog__sourceLine">
            From <strong>{KIND_LABEL[selfRef.recordFamily]}</strong>{" "}
            <code>{selfRef.recordId}</code>
          </p>

          <label className="newLinkDialog__field" htmlFor={kindId}>
            <span className="newLinkDialog__label">Relation</span>
            <select
              id={kindId}
              className="newLinkDialog__select"
              value={kind}
              onChange={(event) => setKind(event.target.value as SubmittableKind)}
            >
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="newLinkDialog__hint">
              {KIND_OPTIONS.find((o) => o.value === kind)?.help}
            </span>
          </label>

          <div className="newLinkDialog__field">
            <label className="newLinkDialog__label" htmlFor={targetSearchId}>
              Target
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
              placeholder="Search Projects / Work Items / Tasks"
              autoComplete="off"
            />
            {candidates.length === 0 ? (
              <p className="newLinkDialog__empty">No matches.</p>
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
                          {KIND_LABEL[candidate.kind]}
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
            <span className="newLinkDialog__label">Note (optional)</span>
            <textarea
              id={noteId}
              className="newLinkDialog__textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why is this relation worth recording?"
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
              Cancel
            </button>
            <button
              type="submit"
              className="newLinkDialog__submitBtn"
              disabled={submitDisabled}
            >
              {submitting ? "Saving…" : "Add link"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
