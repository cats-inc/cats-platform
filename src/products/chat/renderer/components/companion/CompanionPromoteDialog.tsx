import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { CompanionProfilePostMediaRef } from '../../../companion/profileReadModel.js';

/**
 * SPEC-085 §"add the promotion dialog with required Title (auto-prefilled),
 * optional Body/excerpt, optional Tags, optional per-media-item inclusion
 * checkboxes (default-checked from the selection's natural media set, fed
 * back into `metadata.profilePostMediaRefs` on `Promote`)."
 */

export interface CompanionPromoteDialogMediaCandidate {
  ref: CompanionProfilePostMediaRef;
  label: string;
  defaultChecked: boolean;
}

export interface CompanionPromoteDialogSubmit {
  title: string;
  body: string;
  tags: string[];
  mediaRefs: CompanionProfilePostMediaRef[];
}

export interface CompanionPromoteDialogProps {
  open: boolean;
  defaultTitle: string;
  defaultBody?: string;
  defaultTags?: readonly string[];
  mediaCandidates: readonly CompanionPromoteDialogMediaCandidate[];
  busy?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (input: CompanionPromoteDialogSubmit) => Promise<void> | void;
}

function tagsFromInput(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(',')) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function CompanionPromoteDialog({
  open,
  defaultTitle,
  defaultBody = '',
  defaultTags = [],
  mediaCandidates,
  busy = false,
  errorMessage = null,
  onClose,
  onSubmit,
}: CompanionPromoteDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [tagsInput, setTagsInput] = useState(defaultTags.join(', '));
  const [mediaSelection, setMediaSelection] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const candidate of mediaCandidates) {
        initial[`${candidate.ref.kind}:${candidate.ref.id}`] = candidate.defaultChecked;
      }
      return initial;
    },
  );
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setBody(defaultBody);
    setTagsInput(defaultTags.join(', '));
    const initial: Record<string, boolean> = {};
    for (const candidate of mediaCandidates) {
      initial[`${candidate.ref.kind}:${candidate.ref.id}`] = candidate.defaultChecked;
    }
    setMediaSelection(initial);
    titleInputRef.current?.focus();
  }, [open, defaultTitle, defaultBody, defaultTags, mediaCandidates]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const trimmedTitle = title.trim();
  const submitDisabled = busy || trimmedTitle.length === 0;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submitDisabled) return;
    const selectedRefs: CompanionProfilePostMediaRef[] = [];
    for (const candidate of mediaCandidates) {
      const key = `${candidate.ref.kind}:${candidate.ref.id}`;
      if (mediaSelection[key]) {
        selectedRefs.push(candidate.ref);
      }
    }
    await onSubmit({
      title: trimmedTitle,
      body: body.trim(),
      tags: tagsFromInput(tagsInput),
      mediaRefs: selectedRefs,
    });
  }

  return (
    <div
      className="companionPromoteOverlay"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="companionPromoteDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="companionPromoteDialogTitle"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="companionPromoteDialogTitle" className="companionPromoteDialogTitle">
          Promote to post
        </h2>

        <label className="companionPromoteField">
          <span className="companionPromoteLabel">Title</span>
          <input
            ref={titleInputRef}
            type="text"
            className="companionInput"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Required"
            aria-required="true"
          />
        </label>

        <label className="companionPromoteField">
          <span className="companionPromoteLabel">Body / excerpt</span>
          <textarea
            className="companionTextarea"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label className="companionPromoteField">
          <span className="companionPromoteLabel">Tags (comma-separated)</span>
          <input
            type="text"
            className="companionInput"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="#concert, #ideas"
          />
        </label>

        {mediaCandidates.length > 0 ? (
          <fieldset className="companionPromoteMediaFieldset">
            <legend className="companionPromoteLabel">Include media</legend>
            <ul className="companionPromoteMediaList">
              {mediaCandidates.map((candidate) => {
                const key = `${candidate.ref.kind}:${candidate.ref.id}`;
                return (
                  <li key={key} className="companionPromoteMediaRow">
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(mediaSelection[key])}
                        onChange={(event) =>
                          setMediaSelection((prev) => ({
                            ...prev,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      <span>{candidate.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        {errorMessage ? (
          <p className="companionPromoteError" role="alert">{errorMessage}</p>
        ) : null}

        <div className="companionPromoteActions">
          <button
            type="button"
            className="companionActionButton"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="companionActionButton companionActionButtonPrimary"
            disabled={submitDisabled}
            aria-disabled={submitDisabled || undefined}
          >
            {busy ? 'Promoting...' : 'Promote'}
          </button>
        </div>
      </form>
    </div>
  );
}
