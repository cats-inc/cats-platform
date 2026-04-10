import { type FormEvent, type KeyboardEvent, type RefObject } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { SidePanel } from '../../../../design/components/SidePanel.js';
import type { BrowseDirectoryEntry } from '../api/index.js';
import { type NewChatMode } from '../draftStarterSuggestionContext.js';
import { type DraftStarterSuggestion } from '../draftStarterSuggestions.js';
import {
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import { catInitials, isChatCat, truncatePath } from '../workspaceChatUtils.js';
import { ChatNewChatDraftTargetSlot } from './ChatNewChatDraftTargetSlot.js';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector.js';
import {
  buildChatNewChatDraftSidePanelSections,
} from './chatNewChatDraftSidePanel.js';
import { resolveChatNewChatDraftViewState } from './chatNewChatDraftSupport.js';
import { useChatNewChatDraftPanelState } from './useChatNewChatDraftPanelState.js';
import type { RoomWorkflowShape } from '../../../../shared/roomRouting.js';
import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import { AudienceChip } from './AudienceChip.js';

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
  onDraftDefaultRecipientChange: (catId: string | null) => void;
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
  draftWorkflowShape?: RoomWorkflowShape;
  onToggleDraftWorkflowShape?: () => void;
  draftAudienceKeys?: string[] | null;
  onSetAudienceKeys?: (keys: string[]) => void;
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
  onDraftDefaultRecipientChange,
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
  draftWorkflowShape = 'sequential',
  onToggleDraftWorkflowShape,
  draftAudienceKeys,
  onSetAudienceKeys,
}: NewChatDraftProps) {
  const isParallelMode = (parallelTargets?.length ?? 0) >= 2;
  const {
    chatCats,
    assistantPresets,
    draftParticipants,
    defaultRecipientCat,
    hasTelegramBinding,
    effectiveDefaultRecipientCat,
    effectiveDefaultRecipientTemporaryParticipant,
    draftParticipantCount,
    hasReachedGroupParticipantLimit,
    draftSuggestionContext,
    visibleDraftCatIds,
    visibleStarterSuggestions,
    resolvedGreeting,
    groupDraftSelectionLabel,
    activePanelModel,
    isAckPending,
    isSubmittingFirstTurn,
    draftComposerRecipients,
    groupComposerParticipants,
  } = resolveChatNewChatDraftViewState({
    payload,
    draftDefaultRecipientCatId,
    draftCatIds,
    draftTemporaryParticipants,
    allowAddCat,
    entryMode,
    parallelTargets,
    starterSuggestions,
    greeting,
    greetingPool,
    draftHighlightedCatId,
    draftCatModelOverrides,
    selectedModel,
    busy,
  });
  const { isGroupDraft, isDirectLaneContext, isCatLedDraft } = draftSuggestionContext;

  // Build unified audience participants for all modes
  const audienceParticipants: typeof groupComposerParticipants = (() => {
    // Parallel mode: first target as implicit participant
    if (isParallelMode && parallelTargets?.[0]) {
      return [{
        key: 'parallel:0',
        name: buildModelSelectorLabel(parallelTargets[0]),
        executionLabel: buildModelSelectorLabel(parallelTargets[0]),
        avatarColor: null,
        avatarUrl: null,
        isCat: false,
        catId: null,
        participantId: null,
      }];
    }

    if (isGroupDraft) {
      // Group mode: use explicit audience keys or all participants
      if (!draftAudienceKeys) return groupComposerParticipants;
      const byKey = new Map(groupComposerParticipants.map((p) => [p.key, p]));
      const resolved = draftAudienceKeys.map((key) => byKey.get(key)).filter(Boolean) as typeof groupComposerParticipants;
      if (resolved.length > 0) return resolved;
      return groupComposerParticipants.length > 0 ? [groupComposerParticipants[0]] : [];
    }

    // Single participant modes: cat or temporary participant
    if (effectiveDefaultRecipientCat) {
      return [{
        key: `cat:${effectiveDefaultRecipientCat.id}`,
        name: effectiveDefaultRecipientCat.name,
        executionLabel: null,
        avatarColor: effectiveDefaultRecipientCat.avatarColor ?? null,
        avatarUrl: effectiveDefaultRecipientCat.avatarUrl ?? null,
        isCat: true,
        catId: effectiveDefaultRecipientCat.id,
        participantId: null,
      }];
    }
    if (effectiveDefaultRecipientTemporaryParticipant) {
      const tp = effectiveDefaultRecipientTemporaryParticipant;
      return [{
        key: `temp:${tp.participantId}`,
        name: tp.name,
        executionLabel: tp.provider
          ? buildExecutionLabel(tp.provider, tp.instance ?? null, tp.model ?? null)
          : null,
        avatarColor: null,
        avatarUrl: null,
        isCat: false,
        catId: null,
        participantId: tp.participantId,
      }];
    }

    // Solo implicit: use model selector value
    if (activePanelModel) {
      return [{
        key: 'implicit:model',
        name: buildModelSelectorLabel(activePanelModel),
        executionLabel: buildModelSelectorLabel(activePanelModel),
        avatarColor: null,
        avatarUrl: null,
        isCat: false,
        catId: null,
        participantId: null,
      }];
    }

    return [];
  })();

  // Determine click action for single-participant chip
  const audienceSingleClick = (() => {
    if (isGroupDraft) return undefined;
    if (isParallelMode) return () => openSidePanelTo('parallel:0');
    if (isDirectLaneContext) return () => openSidePanelTo('execution');
    if (effectiveDefaultRecipientCat || effectiveDefaultRecipientTemporaryParticipant) {
      return () => openSidePanelTo('cats');
    }
    return () => openSidePanelTo('execution');
  })();
  const {
    createTemporaryParticipantFormValue,
    sidePanelOpen,
    setSidePanelOpen,
    sidePanelSection,
    switchSection,
    openSidePanelTo,
    temporaryParticipantFormOpen,
    setTemporaryParticipantFormOpen,
    editingTemporaryParticipantId,
    editingTemporaryParticipantName,
    setEditingTemporaryParticipantName,
    temporaryParticipantForm,
    setTemporaryParticipantForm,
    submitTemporaryParticipant,
    beginTemporaryParticipantRename,
    cancelTemporaryParticipantRename,
    submitTemporaryParticipantRename,
  } = useChatNewChatDraftPanelState({
    payload,
    folderBrowseCurrentPath,
    folderBrowseLoading,
    onPickFolder,
    hasReachedGroupParticipantLimit,
    visibleDraftCatIds,
    chatCats,
    draftTemporaryParticipants,
    onAddDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
  });
  const chipLabel = selectedModel ? buildModelSelectorLabel(selectedModel) : '';
  const showCancelPendingSend = isAckPending && onCancelPendingSend != null;

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
                Ask {effectiveDefaultRecipientCat.name} to take the first pass. Add more Cats anytime, or keep the thread focused.
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
        <form
          className={`composerCard composerCardFresh${parallelTargets ? ' parallelComposerAnchor' : ''}${plusMenuOpen ? ' composerCardMenuOpen' : ''}`}
          onSubmit={(event) => void onSendMessage(event)}
        >
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
              {isGroupDraft ? (
                <div className="composerGroupAddRow">
                  {groupComposerParticipants.map((participant) => {
                    const canRemove = !isSubmittingFirstTurn && groupComposerParticipants.length > 2;
                    return (
                      <div key={participant.key} className="composerGroupAvatarSlot">
                        <div
                          className="catAvatar"
                          role={isSubmittingFirstTurn ? undefined : 'button'}
                          tabIndex={isSubmittingFirstTurn ? undefined : 0}
                          onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('cats')}
                          data-tooltip={participant.executionLabel || participant.name}
                          style={
                            participant.avatarUrl
                              ? {
                                  backgroundImage: `url(${participant.avatarUrl})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                }
                              : participant.isCat
                                ? { background: participant.avatarColor ?? '#8B7E74' }
                                : {
                                    background: '#fff',
                                    color: '#222',
                                    border: '1px solid rgba(0, 0, 0, 0.15)',
                                  }
                          }
                        >
                          {participant.avatarUrl ? null : catInitials(participant.name)}
                        </div>
                        {canRemove ? (
                          <button
                            type="button"
                            className="composerGroupAvatarRemove"
                            aria-label={`Remove ${participant.name}`}
                            onClick={() => {
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
                  })}
                  {!hasReachedGroupParticipantLimit ? (
                    <>
                      <button
                        type="button"
                        className="parallelAddButton"
                        disabled={isSubmittingFirstTurn}
                        onClick={() => openSidePanelTo('cats')}
                        aria-label="Add another model to collaborate"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3v10" />
                          <path d="M3 8h10" />
                        </svg>
                      </button>
                      <span className="parallelAddHint">Add another model to collaborate</span>
                    </>
                  ) : null}
                </div>
              ) : null}
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
            <div className="composerRightGroup">
              {audienceParticipants.length > 0 ? (
                <AudienceChip
                  audienceParticipants={audienceParticipants}
                  allParticipants={isGroupDraft ? groupComposerParticipants : undefined}
                  onSetAudienceKeys={isGroupDraft ? onSetAudienceKeys : undefined}
                  onSingleClick={audienceSingleClick}
                  disabled={isSubmittingFirstTurn}
                  workflowShape={draftWorkflowShape}
                  onToggleWorkflowShape={isGroupDraft ? onToggleDraftWorkflowShape : undefined}
                />
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
                <AudienceChip
                  audienceParticipants={[{
                    key: `parallel:${i + 1}`,
                    name: buildModelSelectorLabel(target),
                    executionLabel: buildModelSelectorLabel(target),
                    avatarColor: null,
                    avatarUrl: null,
                    isCat: false,
                    catId: null,
                    participantId: null,
                  }]}
                  onSingleClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo(`parallel:${i + 1}`)}
                  disabled={isSubmittingFirstTurn}
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
          sections={buildChatNewChatDraftSidePanelSections({
            payload,
            chatCats,
            draftCatIds,
            draftHighlightedCatId,
            effectiveDefaultRecipientCat,
            isGroupDraft,
            isDirectLaneContext,
            isParallelMode,
            groupDraftSelectionLabel,
            assistantPresets,
            draftTemporaryParticipants,
            editingTemporaryParticipantId,
            editingTemporaryParticipantName,
            temporaryParticipantFormOpen,
            temporaryParticipantForm,
            hasReachedGroupParticipantLimit,
            isSubmittingFirstTurn,
            defaultRecipientCat,
            activePanelModel,
            onToggleDraftCat,
            onHighlightDraftCat,
            onAddDraftTemporaryParticipant,
            onRemoveDraftTemporaryParticipant,
            onBeginTemporaryParticipantRename: beginTemporaryParticipantRename,
            onCancelTemporaryParticipantRename: cancelTemporaryParticipantRename,
            onSubmitTemporaryParticipantRename: submitTemporaryParticipantRename,
            onEditingTemporaryParticipantNameChange: setEditingTemporaryParticipantName,
            onTemporaryParticipantFormChange: (updater) =>
              setTemporaryParticipantForm((current) => updater(current)),
            createTemporaryParticipantFormValue,
            onTemporaryParticipantFormOpenChange: setTemporaryParticipantFormOpen,
            onSubmitTemporaryParticipant: submitTemporaryParticipant,
            selectedModel,
            onModelChange,
            onDirectLaneModelChange,
            parallelTargets,
            onParallelTargetChange,
            folderBrowsePath,
            folderBrowseCurrentPath,
            folderBrowseParentPath,
            folderBrowseEntries,
            folderBrowseLoading,
            folderBrowseError,
            draftCwd,
            onFolderBrowsePathChange,
            onFolderBrowse,
            onFolderBrowseSelect,
            onCloseSidePanel: () => setSidePanelOpen(false),
          })}
        />
      ) : null}
    </div>
  );
}
