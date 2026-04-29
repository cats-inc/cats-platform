import { useState, type FormEvent } from "react";

import {
  workspacesMockStore,
  type CodeWorkspaceSource,
  type CodeWorkspaceStatus,
} from "../../state/workspacesMockStore";

const SOURCE_OPTIONS: { value: CodeWorkspaceSource; label: string }[] = [
  { value: "owner_folder", label: "Owner folder" },
  { value: "conversation_repo", label: "Repo bind from conversation" },
  { value: "runtime_cwd", label: "Runtime cwd" },
  { value: "managed_room", label: "Managed room" },
];

const STATUS_OPTIONS: { value: CodeWorkspaceStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "ready", label: "Ready" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

export interface NewWorkspaceDialogProps {
  onClose: () => void;
  onCreated?: (workspaceId: string) => void;
}

export function NewWorkspaceDialog({
  onClose,
  onCreated,
}: NewWorkspaceDialogProps): JSX.Element {
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [summary, setSummary] = useState("");
  const [source, setSource] = useState<CodeWorkspaceSource>("owner_folder");
  const [status, setStatus] = useState<CodeWorkspaceStatus>("active");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedPath = path.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (!trimmedPath) {
      setError("Path is required (repo / folder / managed-room id).");
      return;
    }
    const created = workspacesMockStore.create({
      title: trimmedTitle,
      path: trimmedPath,
      summary: summary.trim() || null,
      source,
      status,
    });
    onCreated?.(created.id);
    onClose();
  };

  return (
    <div
      className="newProjectDialog__backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="newProjectDialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="newWorkspaceDialog__heading"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="newProjectDialog__header">
          <h2 id="newWorkspaceDialog__heading" className="newProjectDialog__heading">
            New codespace
          </h2>
          <button
            type="button"
            className="newProjectDialog__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form className="newProjectDialog__form" onSubmit={handleSubmit}>
          {error ? (
            <p className="newProjectDialog__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="newProjectDialog__field">
            <label className="newProjectDialog__label" htmlFor="ws-title">
              Title
              <span className="newProjectDialog__required">*</span>
            </label>
            <input
              id="ws-title"
              className="newProjectDialog__input"
              autoFocus
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. cats-platform"
            />
          </div>
          <div className="newProjectDialog__field">
            <label className="newProjectDialog__label" htmlFor="ws-path">
              Path
              <span className="newProjectDialog__required">*</span>
            </label>
            <input
              id="ws-path"
              className="newProjectDialog__input"
              type="text"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="C:\\Users\\... or [managed-room] room-id"
            />
          </div>
          <div className="newProjectDialog__field">
            <label className="newProjectDialog__label" htmlFor="ws-summary">
              Summary
            </label>
            <textarea
              id="ws-summary"
              className="newProjectDialog__textarea"
              rows={2}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Optional one-line note about this codespace."
            />
          </div>
          <div className="newProjectDialog__row">
            <div className="newProjectDialog__field">
              <label className="newProjectDialog__label" htmlFor="ws-source">
                Source
              </label>
              <select
                id="ws-source"
                className="newProjectDialog__select"
                value={source}
                onChange={(event) =>
                  setSource(event.target.value as CodeWorkspaceSource)
                }
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="newProjectDialog__field">
              <label className="newProjectDialog__label" htmlFor="ws-status">
                Status
              </label>
              <select
                id="ws-status"
                className="newProjectDialog__select"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as CodeWorkspaceStatus)
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="newProjectDialog__footer">
            <button
              type="button"
              className="newProjectDialog__cancelBtn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="newProjectDialog__submitBtn"
              disabled={!title.trim() || !path.trim()}
            >
              Create codespace
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
