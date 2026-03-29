import { useState, type FormEvent } from 'react';

import type {
  CompanionSourceRecord,
  CreateCompanionSourceInput,
  CompanionSourceKind,
  CompanionSourceStorageMode,
} from '../../../companion/contracts.js';

export interface CompanionResourcesSectionProps {
  sources: CompanionSourceRecord[];
  loading: boolean;
  onAddSource: (input: CreateCompanionSourceInput) => Promise<void>;
  onDeleteSource: (sourceId: string) => Promise<void>;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function sourceKindLabel(kind: string): string {
  switch (kind) {
    case 'note': return 'Note';
    case 'conversation_log': return 'Log';
    case 'article': return 'Article';
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    case 'path_ref': return 'Path';
    default: return kind;
  }
}

export function CompanionResourcesSection({
  sources,
  loading,
  onAddSource,
  onDeleteSource,
}: CompanionResourcesSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formText, setFormText] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!formTitle.trim() && !formNote.trim() && !formText.trim()) return;
    setFormBusy(true);
    try {
      const kind: CompanionSourceKind = 'note';
      const storageMode: CompanionSourceStorageMode = 'imported_copy';
      await onAddSource({
        kind,
        storageMode,
        title: formTitle.trim() || undefined,
        ownerNote: formNote.trim() || undefined,
        textContent: formText.trim() || undefined,
      });
      setFormTitle('');
      setFormNote('');
      setFormText('');
      setShowForm(false);
    } finally {
      setFormBusy(false);
    }
  }

  if (loading && sources.length === 0) {
    return <div className="companionSection companionLoading">Loading...</div>;
  }

  return (
    <div className="companionSection companionResources">
      <div className="companionSectionHeader">
        <span>Resources</span>
        <button
          type="button"
          className="companionActionButton"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showForm && (
        <form className="companionCard companionForm" onSubmit={handleSubmit}>
          <input
            type="text"
            className="companionInput"
            placeholder="Title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
          <input
            type="text"
            className="companionInput"
            placeholder="Note (optional)"
            value={formNote}
            onChange={(e) => setFormNote(e.target.value)}
          />
          <textarea
            className="companionTextarea"
            placeholder="Content"
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            rows={4}
          />
          <button
            type="submit"
            className="companionActionButton"
            disabled={formBusy || (!formTitle.trim() && !formNote.trim() && !formText.trim())}
          >
            {formBusy ? 'Adding...' : 'Add Resource'}
          </button>
        </form>
      )}

      {sources.length === 0 ? (
        <p className="companionEmpty">No resources yet. Add materials to help your companion.</p>
      ) : (
        <ul className="companionSourceList">
          {sources.map((source) => (
            <li key={source.id} className="companionCard companionSourceCard">
              <div className="companionSourceHeader">
                <span className="companionSourceKind">{sourceKindLabel(source.kind)}</span>
                <span className="companionSourceTitle">
                  {source.title || source.originalFileName || 'Untitled'}
                </span>
                <span className="companionSourceDate">{formatDate(source.updatedAt)}</span>
              </div>
              {source.ownerNote && (
                <p className="companionSourceNote">{source.ownerNote}</p>
              )}
              {source.linkedPath && (
                <span className="companionSourcePath">{source.linkedPath}</span>
              )}
              <button
                type="button"
                className="companionDangerButton"
                onClick={() => onDeleteSource(source.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
