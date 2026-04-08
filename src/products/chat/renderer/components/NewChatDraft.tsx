import { useMemo, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';

import type { AppShellPayload } from '../../api/contracts';
import type { NewChatMode } from '../../shared/channelPaths.js';
import { SidePanel, type SidePanelSection } from '../../../../design/components/SidePanel';
import type { BrowseDirectoryEntry } from '../api';
import { resolveDraftParticipantSelection } from '../draftParticipants';
import { resolveDraftStarterSuggestionContext } from '../draftStarterSuggestionContext';
import {
  resolveVisibleDraftStarterSuggestions,
  type DraftStarterSuggestion,
} from '../draftStarterSuggestions';
import {
  buildDraftParticipantExecutionLabel,
  catInitials,
  createDraftTemporaryParticipant,
  createDraftTemporaryParticipantFromAssistantPreset,
  draftHasAssistantPresetParticipant,
  isChatCat,
  pickDraftGreeting,
  truncatePath,
  type DraftTemporaryParticipant,
} from '../chatUtils';
import { CatAvatarRow } from './CatAvatarRow';
import { ComposerCatStack } from './ComposerCatStack';
import { FolderBrowserContent } from './FolderBrowser';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector';
import { ProviderModelFields } from './ProviderModelFields';
import { isComposerAckBusy, isComposerBusy } from '../../../../shared/composer';
import type { ProviderTargetSelection } from '../../../../shared/providerSelection';

export interface NewChatDraftProps {
  payload: AppShellPayload;
  composerDraft: string;
  busy: string;
  greeting?: string | null;
  greetingPool?: ReadonlyArray<string> | null;
  draftFiles: File[];
  draftCwd: string | null;
  draftCatIds: string[];
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  plusMenuOpen: boolean;
  plusMenuRef: RefObject<HTMLDivElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  bossCatName: string;
  bossCatAvatarColor: string | null;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onCancelPendingSend?: () => void;
  onTogglePlusMenu: () => void;
  onFileSelect: () => void;
  onPickFolder: () => void;
  onOpenAddCat: () => void;
  onDraftFilesChange: (files: File[]) => void;
  onDraftCwdClear: () => void;
  onToggleDraftCat: (catId: string) => void;
  onAddDraftTemporaryParticipant: (
    participant: Omit<DraftTemporaryParticipant, 'participantId'> & {
      participantId?: string | null;
    },
  ) => void;
  onRemoveDraftTemporaryParticipant: (participantId: string) => void;
  onUpdateDraftTemporaryParticipant: (
    participantId: string,
    input: { name?: string | null; roleHint?: string | null },
  ) => void;
  autoResize: (el: HTMLTextAreaElement) => void;
  draftDefaultRecipientCatId: string | null;
  entryMode?: NewChatMode;
  starterSuggestions?: ReadonlyArray<DraftStarterSuggestion> | null;
  onDraftLeadCatChange: (catId: string | null) => void;
  allowAddCat?: boolean;
  selectedModel?: ModelSelectorValue;
  onModelChange?: (value: ModelSelectorValue) => void;
  draftHighlightedCatId: string | null;
  onHighlightDraftCat: (catId: string | null) => void;
  draftCatModelOverrides: Map<string, ModelSelectorValue>;
  onDraftCatModelOverride: (catId: string, value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
  parallelTargets?: ModelSelectorValue[];
  onParallelTargetChange?: (index: number, value: ModelSelectorValue) => void;
  onAddParallelTarget?: () => void;
  onRemoveParallelTarget?: (index: number) => void;
  folderBrowsePath?: string;
  folderBrowseCurrentPath?: string;
  folderBrowseParentPath?: string;
  folderBrowseEntries?: BrowseDirectoryEntry[];
  folderBrowseLoading?: boolean;
  folderBrowseError?: string;
  onFolderBrowsePathChange?: (path: string) => void;
  onFolderBrowse?: (path: string) => void;
  onFolderBrowseSelect?: () => void;
}

export function NewChatDraft({
  payload,
  composerDraft,
  busy,
  greeting = null,
  greetingPool = null,
  draftFiles,
  draftCwd,
  draftCatIds,
  draftTemporaryParticipants,
  plusMenuOpen,
  plusMenuRef,
  fileInputRef,
  bossCatName,
  bossCatAvatarColor,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onCancelPendingSend,
  onTogglePlusMenu,
  onFileSelect,
  onPickFolder,
  onOpenAddCat,
  onDraftFilesChange,
  onDraftCwdClear,
  onToggleDraftCat,
  onAddDraftTemporaryParticipant,
  onRemoveDraftTemporaryParticipant,
  onUpdateDraftTemporaryParticipant,
  autoResize,
  draftDefaultRecipientCatId,
  entryMode = 'default',
  starterSuggestions,
  onDraftLeadCatChange,
  allowAddCat = true,
  selectedModel,
  onModelChange,
  draftHighlightedCatId,
  onHighlightDraftCat,
  draftCatModelOverrides,
  onDraftCatModelOverride,
  onDirectLaneModelChange,
  parallelTargets,
  onParallelTargetChange,
  onAddParallelTarget,
  onRemoveParallelTarget,
  folderBrowsePath = '',
  folderBrowseCurrentPath = '',
  folderBrowseParentPath = '',
  folderBrowseEntries = [],
  folderBrowseLoading = false,
  folderBrowseError = '',
  onFolderBrowsePathChange,
  onFolderBrowse,
  onFolderBrowseSelect,
}: NewChatDraftProps) {
  const isParallelMode = (parallelTargets?.length ?? 0) >= 2;
  function createTemporaryParticipantFormValue() {
    return {
      roleHint: '',
      provider: payload.chat.newChatDefaults?.provider ?? 'claude',
      instance: payload.chat.newChatDefaults?.instance ?? '',
      model: payload.chat.newChatDefaults?.model ?? '',
      modelSelection: payload.chat.newChatDefaults?.modelSelection ?? null,
    };
  }
  const chatCats = payload.chat.cats.filter(isChatCat);
  const assistantPresets = payload.assistantPresets ?? [];
  const activeChatCats = chatCats.filter((cat) => cat.status === 'active');
  const draftParticipants = resolveDraftParticipantSelection({ draftDefaultRecipientCatId, draftCatIds });
  const defaultRecipientCat = draftDefaultRecipientCatId
    ? chatCats.find((cat) => cat.id === draftDefaultRecipientCatId && cat.status === 'active') ?? null
    : null;
  const hasTelegramBinding = Boolean(
    defaultRecipientCat && payload.chat.botBindings.some((binding) =>
      binding.platform === 'telegram'
      && binding.status === 'active'
      && binding.catId === defaultRecipientCat.id),
  );
  const draftDefaultRecipientCat = !defaultRecipientCat && draftCatIds.length > 0
    ? chatCats.find((c) => c.id === draftParticipants.effectiveLeadCatId && c.status === 'active') ?? null
    : null;
  const effectiveDefaultRecipientCat = defaultRecipientCat ?? draftDefaultRecipientCat;
  const draftParticipantCount = draftParticipants.participantCatIds.length + draftTemporaryParticipants.length;
  const maxGroupParticipants = payload.chat.capabilities.maxCats ?? Number.POSITIVE_INFINITY;
  const hasReachedGroupParticipantLimit = draftParticipantCount >= maxGroupParticipants;
  const draftSuggestionContext = resolveDraftStarterSuggestionContext({
    allowAddCat,
    draftDefaultRecipientCatId,
    hasDefaultRecipientCat: Boolean(effectiveDefaultRecipientCat),
    entryMode,
    participantCount: draftParticipantCount,
    parallelTargetCount: parallelTargets?.length ?? 0,
  });
  const { isGroupDraft, isDirectLaneContext, isCatLedDraft } = draftSuggestionContext;
  const hasDraftCats = draftCatIds.length > 0;
  const showSoloSelector = !effectiveDefaultRecipientCat;
  const nonLeadDraftCatIds = draftDefaultRecipientCat
    ? draftCatIds.filter((id) => id !== draftDefaultRecipientCat.id)
    : defaultRecipientCat
      ? draftCatIds.filter((id) => id !== defaultRecipientCat.id)
      : draftCatIds;
  const visibleDraftCatIds = draftParticipants.participantCatIds;
  const totalCats = (showSoloSelector ? 1 : 0) + visibleDraftCatIds.length;
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cats');
  const [temporaryParticipantFormOpen, setTemporaryParticipantFormOpen] = useState(false);
  const [editingTemporaryParticipantId, setEditingTemporaryParticipantId] = useState<string | null>(null);
  const [editingTemporaryParticipantName, setEditingTemporaryParticipantName] = useState('');
  const [temporaryParticipantForm, setTemporaryParticipantForm] = useState(
    createTemporaryParticipantFormValue,
  );
  function openSidePanelTo(section: string): void {
    setSidePanelOpen(true);
    switchSection(section);
  }
  function switchSection(section: string): void {
    setSidePanelSection(section);
    if (section === 'cwd' && !folderBrowseCurrentPath && !folderBrowseLoading) {
      onPickFolder();
    }
  }
  const visibleStarterSuggestions = resolveVisibleDraftStarterSuggestions({
    mode: draftSuggestionContext.mode,
    leadCatName: effectiveDefaultRecipientCat?.name ?? null,
    suggestions: starterSuggestions,
  });
  const greetingPoolKey = Array.isArray(greetingPool)
    ? greetingPool.map((line) => line.trim()).filter((line) => line.length > 0).join('\u0000')
    : '';
  const resolvedGreeting = useMemo(() => {
    const explicitGreeting = greeting?.trim();
    if (explicitGreeting) {
      return explicitGreeting;
    }

    return pickDraftGreeting({ pool: greetingPool });
  }, [greeting, greetingPoolKey]);
  const groupDraftSelectionLabel = draftParticipantCount === 1
    ? '1 participant selected so far. Add more or send when ready.'
    : draftParticipantCount > 1
      ? `${draftParticipantCount} participants selected for this shared chat.`
      : activeChatCats.length > 0 || assistantPresets.length > 0
        ? 'Choose Cats, reuse saved Assistants, or add temporary participants for this shared chat.'
        : 'Add temporary participants here, or create Cats and Assistants in Settings before starting a shared chat.';
  const participantChipLabel = draftParticipantCount > 0
    ? `${draftParticipantCount} participant${draftParticipantCount === 1 ? '' : 's'}`
    : 'Choose participants';

  const highlightedCat = draftHighlightedCatId && draftCatIds.includes(draftHighlightedCatId)
    ? chatCats.find((c) => c.id === draftHighlightedCatId) ?? null
    : null;
  const activePanelModel: ModelSelectorValue | null = isDirectLaneContext && defaultRecipientCat
    ? {
        provider: defaultRecipientCat.defaultExecutionTarget.provider,
        model: defaultRecipientCat.defaultExecutionTarget.model,
        instance: defaultRecipientCat.defaultExecutionTarget.instance,
        modelSelection: defaultRecipientCat.defaultModelSelection ?? null,
      }
    : highlightedCat
      ? (draftCatModelOverrides.get(highlightedCat.id) ?? {
          provider: highlightedCat.defaultExecutionTarget.provider,
          model: highlightedCat.defaultExecutionTarget.model,
          instance: highlightedCat.defaultExecutionTarget.instance,
          modelSelection: highlightedCat.defaultModelSelection ?? null,
        })
      : selectedModel ?? null;
  const chipLabel = selectedModel ? buildModelSelectorLabel(selectedModel) : '';
  const isAckPending = isComposerAckBusy(busy);
  const isSubmittingFirstTurn = isComposerBusy(busy) || isAckPending;
  const showCancelPendingSend = isAckPending && onCancelPendingSend != null;

  function submitTemporaryParticipant(): void {
    if (hasReachedGroupParticipantLimit) {
      return;
    }
    if (!temporaryParticipantForm.provider.trim()) {
      return;
    }

    const takenNames = [
      ...visibleDraftCatIds.map((catId) => chatCats.find((cat) => cat.id === catId)?.name ?? ''),
      ...draftTemporaryParticipants.map((participant) => participant.name),
    ].filter((name) => name.trim().length > 0);

    onAddDraftTemporaryParticipant(createDraftTemporaryParticipant({
      provider: temporaryParticipantForm.provider.trim(),
      instance: temporaryParticipantForm.instance.trim() || undefined,
      model: temporaryParticipantForm.model.trim() || undefined,
      modelSelection: temporaryParticipantForm.modelSelection,
      roleHint: temporaryParticipantForm.roleHint.trim() || undefined,
      takenNames,
    }));
    setTemporaryParticipantForm(createTemporaryParticipantFormValue());
    setTemporaryParticipantFormOpen(false);
  }

  function beginTemporaryParticipantRename(participant: DraftTemporaryParticipant): void {
    setEditingTemporaryParticipantId(participant.participantId);
    setEditingTemporaryParticipantName(participant.name);
  }

  function cancelTemporaryParticipantRename(): void {
    setEditingTemporaryParticipantId(null);
    setEditingTemporaryParticipantName('');
  }

  function submitTemporaryParticipantRename(participantId: string): void {
    const nextName = editingTemporaryParticipantName.trim();
    if (!nextName) {
      return;
    }
    onUpdateDraftTemporaryParticipant(participantId, { name: nextName });
    cancelTemporaryParticipantRename();
  }

  return (
    <div className="viewShell viewShellDraft">
      <section className="draftShell">
        <div className="draftGreeting">
          {isDirectLaneContext && defaultRecipientCat ? (
            <>
              <p className="eyebrow">Private Chat</p>
              <h1>{defaultRecipientCat.name}</h1>
              <p className="heroNote">
                {hasTelegramBinding ? 'Telegram-bound private lane.' : 'Private lane for this Cat.'}
              </p>
            </>
          ) : isGroupDraft ? (
            <h1>{resolvedGreeting}</h1>
          ) : isCatLedDraft && effectiveDefaultRecipientCat ? (
            <>
              <p className="eyebrow">Cat-led Chat</p>
              <h1>Start with {effectiveDefaultRecipientCat.name}</h1>
              <p className="heroNote">
                {effectiveDefaultRecipientCat.name} will lead this draft. Add more Cats anytime, or keep the thread focused.
              </p>
            </>
          ) : (
            <h1>{resolvedGreeting}</h1>
          )}
          {!composerDraft.trim() && visibleStarterSuggestions.length > 0 ? (
            <div className="draftPromptSuggestions">
              <div className="chipRow">
                {visibleStarterSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    className="promptChip draftPromptChip"
                    type="button"
                    disabled={isSubmittingFirstTurn}
                    onClick={() => onComposerChange(suggestion.prompt)}
                  >
                    {suggestion.prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <form className={`composerCard composerCardFresh${parallelTargets ? ' parallelComposerAnchor' : ''}`} onSubmit={(event) => void onSendMessage(event)}>
          {draftFiles.length > 0 ? (
            <div className="composerAttachments">
              {draftFiles.map((file, index) => {
                const isImage = file.type.startsWith('image/');
                return (
                  <div key={`${file.name}-${file.size}-${index}`} className="attachmentCard">
                    <button
                      className="attachmentRemove"
                      type="button"
                      disabled={isSubmittingFirstTurn}
                      onClick={() => onDraftFilesChange(draftFiles.filter((_, i) => i !== index))}
                      aria-label={`Remove ${file.name}`}
                    >
                      &times;
                    </button>
                    {isImage ? (
                      <img
                        className="attachmentPreview"
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                      />
                    ) : (
                      <div className="attachmentFileIcon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                      </div>
                    )}
                    <span className="attachmentName">{file.name}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <textarea
            className="composerInput"
            rows={1}
            placeholder="How can I help you today?"
            value={composerDraft}
            disabled={isSubmittingFirstTurn}
            onChange={(event) => { onComposerChange(event.target.value); autoResize(event.target); }}
            onKeyDown={(event) => void onComposerKeyDown(event)}
          />
          {isGroupDraft ? (
            <div className="composerGroupAddRow" style={hasReachedGroupParticipantLimit ? { visibility: 'hidden' } : undefined}>
              <span className="parallelAddHint">Add another model to collaborate</span>
              <button
                type="button"
                className="parallelAddButton"
                disabled={isSubmittingFirstTurn}
                onClick={() => openSidePanelTo('cats')}
                aria-label="Add another model to collaborate"
                tabIndex={hasReachedGroupParticipantLimit ? -1 : 0}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v10" />
                  <path d="M3 8h10" />
                </svg>
              </button>
            </div>
          ) : null}
          <div className="composerBottomRow">
            <div className="composerLeftGroup">
              <div className="composerPlusWrapper" ref={plusMenuRef}>
                <button
                  className="composerPlusButton"
                  type="button"
                  aria-label="Attach"
                  disabled={isSubmittingFirstTurn}
                  onClick={onTogglePlusMenu}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v10" />
                    <path d="M3 8h10" />
                  </svg>
                </button>
                {plusMenuOpen ? (
                  <div className="composerPlusMenu">
                    <button
                      className="composerPlusMenuItem"
                      type="button"
                      disabled={isSubmittingFirstTurn}
                      onClick={onFileSelect}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
                        <path d="M8 2v8" />
                        <path d="M4 6l4-4 4 4" />
                      </svg>
                      Add photos and files
                    </button>
                    <button
                      className="composerPlusMenuItem"
                      type="button"
                      disabled={isSubmittingFirstTurn}
                      onClick={() => {
                        openSidePanelTo('cwd');
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                      </svg>
                      Choose folder
                    </button>
                  </div>
                ) : null}
              </div>
              {draftCwd ? (
                <span
                  className="composerCwdChip"
                  data-tooltip={draftCwd}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                  </svg>
                  <span>{truncatePath(draftCwd)}</span>
                  <button
                    className="composerChipClose"
                    type="button"
                    disabled={isSubmittingFirstTurn}
                    onClick={onDraftCwdClear}
                    aria-label="Remove folder"
                  >
                    &times;
                  </button>
                </span>
              ) : null}
            </div>
            {isParallelMode && parallelTargets?.[0] ? (
              <div style={{ marginRight: 8 }}>
                <ModelSelectorChip
                  label={buildModelSelectorLabel(parallelTargets[0])}
                  onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('parallel:0')}
                />
              </div>
            ) : isGroupDraft ? (
              <>
                <div className="composerCatStack" style={{ marginRight: 8 }}>
                  {(() => {
                    const allParticipants: Array<{ key: string; name: string; avatarColor: string | null; avatarUrl: string | null; isCat: boolean; catId: string | null; participantId: string | null }> = [
                      ...visibleDraftCatIds.map((catId) => {
                        const cat = chatCats.find((c) => c.id === catId);
                        return { key: `cat:${catId}`, name: cat?.name ?? '', avatarColor: cat?.avatarColor ?? null, avatarUrl: cat?.avatarUrl ?? null, isCat: true, catId, participantId: null };
                      }).filter((p) => p.name),
                      ...draftTemporaryParticipants.map((p) => ({
                        key: `temp:${p.participantId}`, name: p.name, avatarColor: null, avatarUrl: null, isCat: false, catId: null, participantId: p.participantId,
                      })),
                    ];
                    const canRemove = allParticipants.length > 2;
                    const rendered = [...allParticipants].reverse();
                    return rendered.map((participant, index) => {
                      const isLead = index === rendered.length - 1;
                      const isBoss = participant.isCat && participant.catId === payload.chat.bossCatId;
                      return (
                        <div
                          key={participant.key}
                          className={`catAvatar composerStackAvatar${isBoss ? ' catAvatarBoss' : ''}`}
                          data-tooltip={participant.name}
                          style={{
                            ...(participant.avatarUrl
                              ? { backgroundImage: `url(${participant.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                              : participant.isCat
                                ? {
                                  background: participant.avatarColor ?? '#8B7E74',
                                  color: '#fff',
                                }
                              : {}),
                            zIndex: index + 1,
                          }}
                        >
                          {participant.avatarUrl ? null : catInitials(participant.name)}
                          {isLead ? <span className="catAvatarLeadBadge">&#x2605;</span> : null}
                          {canRemove && !isSubmittingFirstTurn ? (
                            <button
                              type="button"
                              className="composerStackRemove"
                              aria-label={`Remove ${participant.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (participant.isCat && participant.catId) {
                                  onToggleDraftCat(participant.catId);
                                } else if (participant.participantId) {
                                  onRemoveDraftTemporaryParticipant(participant.participantId);
                                }
                              }}
                            >
                              &times;
                            </button>
                          ) : null}
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            ) : effectiveDefaultRecipientCat ? (
              <ComposerCatStack
                cats={[effectiveDefaultRecipientCat, ...nonLeadDraftCatIds
                  .map((id) => chatCats.find((c) => c.id === id))
                  .filter((c): c is NonNullable<typeof c> => c != null)]}
                bossCatId={payload.chat.bossCatId}
                defaultRecipientCatId={effectiveDefaultRecipientCat.id}
                onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('execution')}
              />
            ) : activePanelModel && chipLabel ? (
              <div style={{ marginRight: 8 }}>
                <ModelSelectorChip
                  label={chipLabel}
                  onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('execution')}
                />
              </div>
            ) : null}
            {showCancelPendingSend ? (
              <button
                className="composerSendButton composerCancelButton"
                type="button"
                aria-label="Cancel send"
                onClick={() => onCancelPendingSend?.()}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 4l6 6" />
                  <path d="M10 4l-6 6" />
                </svg>
              </button>
            ) : (
              <button
                className="composerSendButton"
                disabled={!composerDraft.trim() || isSubmittingFirstTurn || (isGroupDraft && draftParticipantCount < 2)}
                type="submit"
                aria-label={isParallelMode ? 'Send to all chats' : 'Send'}
              >
                {isParallelMode ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 13V6" /><path d="M1 9l3-3 3 3" />
                    <path d="M12 13V6" /><path d="M9 9l3-3 3 3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 13V3" />
                    <path d="M3 7l5-5 5 5" />
                  </svg>
                )}
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            disabled={isSubmittingFirstTurn}
            style={{ display: 'none' }}
            onChange={(event) => {
              const input = event.currentTarget;
              if (input.files && input.files.length > 0) {
                const selected = Array.from(input.files);
                onDraftFilesChange([...draftFiles, ...selected]);
              }
              input.value = '';
            }}
          />
        </form>
        {isParallelMode && parallelTargets && parallelTargets.length > 1 ? (
          <div className="parallelStubStack">
            {parallelTargets.slice(1).map((target, i, arr) => (
              <div key={i + 1} className="parallelStubCard" style={{ zIndex: arr.length - i }}>
                <ModelSelectorChip
                  label={buildModelSelectorLabel(target)}
                  onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo(`parallel:${i + 1}`)}
                />
                <button
                  type="button"
                  className="parallelStubRemove"
                  disabled={isSubmittingFirstTurn || parallelTargets.length <= 2}
                  onClick={() => onRemoveParallelTarget?.(i + 1)}
                  aria-label="Remove parallel chat"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {parallelTargets && parallelTargets.length < (payload.chat.capabilities.maxParallelChats ?? 5) ? (
          <div className="parallelAddRow">
            <span className="parallelAddHint">Add another model to compare</span>
            <button
              type="button"
              className="parallelAddButton"
              disabled={isSubmittingFirstTurn}
              onClick={onAddParallelTarget}
              aria-label="Add parallel chat"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10" />
                <path d="M3 8h10" />
              </svg>
            </button>
          </div>
        ) : null}
      </section>
      {sidePanelOpen ? (
        <SidePanel
          title="New Chat Setup"
          activeSection={sidePanelSection}
          onSectionToggle={isSubmittingFirstTurn ? () => {} : switchSection}
          onClose={isSubmittingFirstTurn ? () => {} : () => setSidePanelOpen(false)}
          className="chatPaneSidePanel"
          sections={buildDraftSidePanelSections()}
        />
      ) : null}
    </div>
  );

  function buildDraftSidePanelSections(): SidePanelSection[] {
    const sections: SidePanelSection[] = [];

    sections.push({
      id: 'cats',
      title: isGroupDraft ? 'Participants' : 'Cats',
      children: (
        <div className="sidePanelSectionStack">
          {isGroupDraft ? (
            <p className="operatorEmptyState" style={{ margin: 0 }}>
              {groupDraftSelectionLabel}
            </p>
          ) : null}
          {chatCats.filter((c) => c.status === 'active').length > 0 ? (
            <CatAvatarRow
              cats={chatCats}
              bossCatId={payload.chat.bossCatId}
              selectedIds={draftCatIds}
              highlightedId={draftHighlightedCatId}
              defaultRecipientCatId={effectiveDefaultRecipientCat?.id ?? null}
              toggleable
              showLeadBadge
              onToggle={onToggleDraftCat}
              onHighlight={(id) => onHighlightDraftCat(id)}
            />
          ) : (
            <p className="operatorEmptyState">No cats are available yet.</p>
          )}
          {isGroupDraft ? (
            <>
              {assistantPresets.length > 0 ? (
                <div className="addCatList">
                  {assistantPresets.map((assistantPreset) => {
                    const alreadyAdded = draftHasAssistantPresetParticipant(
                      draftTemporaryParticipants,
                      assistantPreset.id,
                    );
                    return (
                      <div key={assistantPreset.id} className="addCatItem">
                        <div>
                          <strong>{assistantPreset.name}</strong>
                          <p>{buildDraftParticipantExecutionLabel({
                            provider: assistantPreset.executionTarget.provider,
                            instance: assistantPreset.executionTarget.instance,
                            model: assistantPreset.executionTarget.model,
                          })}</p>
                          {assistantPreset.roleHint ? <p>{assistantPreset.roleHint}</p> : null}
                        </div>
                        <button
                          className="addCatAssignButton"
                          type="button"
                          disabled={isSubmittingFirstTurn || alreadyAdded || hasReachedGroupParticipantLimit}
                          onClick={() =>
                            onAddDraftTemporaryParticipant(
                              createDraftTemporaryParticipantFromAssistantPreset(assistantPreset),
                            )}
                        >
                          {alreadyAdded ? 'Added' : 'Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {draftTemporaryParticipants.length > 0 ? (
                <div className="addCatList">
                  {draftTemporaryParticipants.map((participant) => (
                    <div key={participant.participantId} className="addCatItem">
                      <div>
                        <strong>{participant.name}</strong>
                        <p>{buildDraftParticipantExecutionLabel(participant)}</p>
                        {participant.roleHint ? <p>{participant.roleHint}</p> : null}
                        {editingTemporaryParticipantId === participant.participantId ? (
                          <form
                            className="stackForm"
                            onSubmit={(event) => {
                              event.preventDefault();
                              submitTemporaryParticipantRename(participant.participantId);
                            }}
                          >
                            <label className="fieldLabel">
                              <span>Name</span>
                              <input
                                className="textInput"
                                value={editingTemporaryParticipantName}
                                onChange={(event) => setEditingTemporaryParticipantName(event.target.value)}
                                placeholder="Participant name"
                              />
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                type="button"
                                className="operatorActionButton"
                                onClick={cancelTemporaryParticipantRename}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="primaryButton"
                                disabled={!editingTemporaryParticipantName.trim()}
                              >
                                Save name
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="addCatAssignButton"
                          type="button"
                          disabled={isSubmittingFirstTurn}
                          onClick={() => beginTemporaryParticipantRename(participant)}
                        >
                          Rename
                        </button>
                        <button
                          className="addCatAssignButton addCatRemoveButton"
                          type="button"
                          disabled={isSubmittingFirstTurn}
                          onClick={() => {
                            if (editingTemporaryParticipantId === participant.participantId) {
                              cancelTemporaryParticipantRename();
                            }
                            onRemoveDraftTemporaryParticipant(participant.participantId);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {temporaryParticipantFormOpen && !hasReachedGroupParticipantLimit ? (
                <form
                  className="stackForm"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitTemporaryParticipant();
                  }}
                >
                  <p className="operatorEmptyState" style={{ margin: 0 }}>
                    Name will be assigned automatically from the provider. You can rename it after adding.
                  </p>
                  <label className="fieldLabel">
                    <span>Role Hint</span>
                    <input
                      className="textInput"
                      value={temporaryParticipantForm.roleHint}
                      onChange={(event) =>
                        setTemporaryParticipantForm((current) => ({
                          ...current,
                          roleHint: event.target.value,
                        }))}
                      placeholder="Optional one-line role"
                    />
                  </label>
                  <ProviderModelFields
                    provider={temporaryParticipantForm.provider}
                    instance={temporaryParticipantForm.instance}
                    model={temporaryParticipantForm.model}
                    modelSelection={temporaryParticipantForm.modelSelection}
                    onTargetChange={(target: ProviderTargetSelection) => {
                      setTemporaryParticipantForm((current) => ({
                        ...current,
                        provider: target.provider,
                        instance: target.instance,
                        model: target.model,
                        modelSelection: target.modelSelection ?? null,
                      }));
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="operatorActionButton"
                      onClick={() => {
                        setTemporaryParticipantForm(createTemporaryParticipantFormValue());
                        setTemporaryParticipantFormOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="primaryButton"
                      disabled={
                        hasReachedGroupParticipantLimit
                        || !temporaryParticipantForm.provider.trim()
                      }
                    >
                      Add participant
                    </button>
                  </div>
                </form>
              ) : !hasReachedGroupParticipantLimit ? (
                <button
                  type="button"
                  className="operatorActionButton"
                  disabled={isSubmittingFirstTurn}
                  onClick={() => setTemporaryParticipantFormOpen(true)}
                >
                  Add temporary participant
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ),
    });

    const executionChildren = (() => {
      if (isDirectLaneContext && defaultRecipientCat && activePanelModel) {
        return (
          <>
            <CatAvatarRow
              cats={[defaultRecipientCat]}
              bossCatId={payload.chat.bossCatId}
              selectedIds={[defaultRecipientCat.id]}
              highlightedId={defaultRecipientCat.id}
              defaultRecipientCatId={defaultRecipientCat.id}
              toggleable={false}
              showLeadBadge
              onToggle={() => {}}
              onHighlight={() => {}}
            />
            <ProviderModelFields
              provider={activePanelModel.provider}
              instance={activePanelModel.instance ?? ''}
              model={activePanelModel.model ?? ''}
              modelSelection={activePanelModel.modelSelection}
              onTargetChange={(target: ProviderTargetSelection) => {
                onDirectLaneModelChange?.(defaultRecipientCat.id, {
                  provider: target.provider,
                  model: target.model || null,
                  instance: target.instance || null,
                  modelSelection: target.modelSelection ?? null,
                });
              }}
            />
          </>
        );
      }
      if (activePanelModel) {
        return (
          <>
            <div style={effectiveDefaultRecipientCat && !isDirectLaneContext ? { pointerEvents: 'none', opacity: 0.45 } : undefined}>
              <ProviderModelFields
                provider={activePanelModel.provider}
                instance={activePanelModel.instance ?? ''}
                model={activePanelModel.model ?? ''}
                modelSelection={activePanelModel.modelSelection}
                onTargetChange={(target: ProviderTargetSelection) => {
                  if (!effectiveDefaultRecipientCat && onModelChange) {
                    onModelChange({
                      provider: target.provider,
                      model: target.model || null,
                      instance: target.instance || null,
                      modelSelection: target.modelSelection ?? null,
                    });
                  }
                }}
              />
            </div>
          </>
        );
      }
      return <p className="operatorEmptyState">No AI reply setup yet.</p>;
    })();
    sections.push({ id: 'execution', title: 'AI Reply', children: executionChildren });

    if (isParallelMode && parallelTargets) {
      parallelTargets.forEach((target, index) => {
        sections.push({
          id: `parallel:${index}`,
          title: buildModelSelectorLabel(target),
          children: (
            <ProviderModelFields
              provider={target.provider}
              instance={target.instance ?? ''}
              model={target.model ?? ''}
              modelSelection={target.modelSelection}
              onTargetChange={(next: ProviderTargetSelection) => {
                onParallelTargetChange?.(index, {
                  provider: next.provider,
                  model: next.model || null,
                  instance: next.instance || null,
                  modelSelection: next.modelSelection ?? null,
                });
              }}
            />
          ),
        });
      });
    }

    sections.push({
      id: 'cwd',
      title: 'Folder',
      children: onFolderBrowsePathChange && onFolderBrowse && onFolderBrowseSelect ? (
        <FolderBrowserContent
          folderBrowsePath={folderBrowsePath}
          folderBrowseCurrentPath={folderBrowseCurrentPath}
          folderBrowseParentPath={folderBrowseParentPath}
          folderBrowseEntries={folderBrowseEntries}
          folderBrowseLoading={folderBrowseLoading}
          folderBrowseError={folderBrowseError}
          onPathChange={onFolderBrowsePathChange}
          onBrowse={onFolderBrowse}
          onSelect={() => {
            onFolderBrowseSelect();
            setSidePanelOpen(false);
          }}
        />
      ) : (
        draftCwd ? (
          <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>{draftCwd}</p>
        ) : (
          <p className="operatorEmptyState">No folder selected yet.</p>
        )
      ),
    });

    return sections;
  }
}
