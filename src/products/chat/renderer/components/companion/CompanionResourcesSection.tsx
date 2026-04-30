import { useState, type FormEvent } from 'react';

import type {
  CompanionSourceRecord,
  CreateCompanionSourceInput,
  CompanionSourceKind,
  CompanionSourceStorageMode,
} from '../../../companion/contracts.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

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
    case 'note':
      return 'note';
    case 'conversation_log':
      return 'conversation_log';
    case 'article':
      return 'article';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'path_ref':
      return 'path_ref';
    default:
      return 'unknown';
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
  const { t } = useI18n();

  const sourceKindMap: Record<string, string> = {
    note: t(messageKeys.chatCompanionResourcesSourceKindNote),
    conversation_log: t(messageKeys.chatCompanionResourcesSourceKindConversationLog),
    article: t(messageKeys.chatCompanionResourcesSourceKindArticle),
    image: t(messageKeys.chatCompanionResourcesSourceKindImage),
    video: t(messageKeys.chatCompanionResourcesSourceKindVideo),
    audio: t(messageKeys.chatCompanionResourcesSourceKindAudio),
    path_ref: t(messageKeys.chatCompanionResourcesSourceKindPath),
    unknown: t(messageKeys.chatCompanionResourcesSourceKindUnknown),
  };

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
    return (
      <div className="companionSection companionLoading">
        {t(messageKeys.chatCompanionResourcesLoadingState)}
      </div>
    );
  }

  return (
    <div className="companionSection companionResources">
      <div className="companionSectionHeader">
        <span>{t(messageKeys.chatCompanionResourcesSectionTitle)}</span>
        <button
          type="button"
          className="companionActionButton"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? t(messageKeys.chatCompanionResourcesActionCancel) : t(messageKeys.chatCompanionResourcesActionShowForm)}
        </button>
      </div>

      {showForm && (
        <form className="companionCard companionForm" onSubmit={handleSubmit}>
          <input
            type="text"
            className="companionInput"
            placeholder={t(messageKeys.chatCompanionResourcesFormTitlePlaceholder)}
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
          <input
            type="text"
            className="companionInput"
            placeholder={t(messageKeys.chatCompanionResourcesFormNotePlaceholder)}
            value={formNote}
            onChange={(e) => setFormNote(e.target.value)}
          />
          <textarea
            className="companionTextarea"
            placeholder={t(messageKeys.chatCompanionResourcesFormContentPlaceholder)}
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            rows={4}
          />
          <button
            type="submit"
            className="companionActionButton"
            disabled={formBusy || (!formTitle.trim() && !formNote.trim() && !formText.trim())}
          >
            {formBusy
              ? t(messageKeys.chatCompanionResourcesActionBusy)
              : t(messageKeys.chatCompanionResourcesActionAddResource)}
          </button>
        </form>
      )}

      {sources.length === 0 ? (
        <p className="companionEmpty">
          {t(messageKeys.chatCompanionResourcesEmptyState)}
        </p>
      ) : (
        <ul className="companionSourceList">
          {sources.map((source) => (
            <li key={source.id} className="companionCard companionSourceCard">
              <div className="companionSourceHeader">
                <span className="companionSourceKind">
                  {sourceKindMap[sourceKindLabel(source.kind)]}
                </span>
                <span className="companionSourceTitle">
                  {source.title || source.originalFileName || t(messageKeys.chatCompanionResourcesUntitledSource)}
                </span>
                <span className="companionSourceDate">{formatDate(source.updatedAt)}</span>
              </div>
              {source.ownerNote && (
                <p className="companionSourceNote">{source.ownerNote}</p>
              )}
              {source.linkedPath && (
                <span className="companionSourcePath">{source.linkedPath}</span>
              )}
              <div className="companionSourceActions">
                <button
                  type="button"
                  className="companionDangerButton"
                  onClick={() => onDeleteSource(source.id)}
                >
                  {t(messageKeys.chatCompanionResourcesActionRemove)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
