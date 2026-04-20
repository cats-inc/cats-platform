import { type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import { SidePanel } from '../../../../design/components/SidePanel.js';
import type { BrowseDirectoryEntry } from '../api/index.js';
import { type NewChatPreset } from '../draftStarterSuggestionContext.js';
import {
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import {
  fingerprintDraftHelperChips,
  resolveDraftHelperRegionVisibility,
  useDraftHelperChipVisibility,
} from '../draftHelperChips.js';
import { isChatCat, truncatePath } from '../workspaceChatUtils.js';
import { ChatNewChatDraftTargetSlot } from './ChatNewChatDraftTargetSlot.js';
import { type ExecutionTargetValue } from './ExecutionTarget.js';
import {
  buildChatNewChatDraftSidePanelSections,
} from './chatNewChatDraftSidePanel.js';
import { DraftHeader } from './DraftHeader.js';
import { DraftComposerFooter } from './DraftComposerFooter.js';
import { DraftComposerStack } from './DraftComposerStack.js';
import { BranchAudienceRoster } from './BranchAudienceRoster.js';
import { ParallelDraftShadowBranchRow } from './ParallelDraftShadowBranchRow.js';
import { resolveChatNewChatDraftViewState } from './chatNewChatDraftSupport.js';
import { useChatNewChatDraftPanelState } from './useChatNewChatDraftPanelState.js';
import type { DraftRoomWorkflowShape } from '../../../../shared/roomRouting.js';
import type {
  RuntimeSessionPolicy,
} from '../../../../shared/runtimeSessionPolicy.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromExecutionTarget,
  buildAudienceParticipantFromTemporaryParticipant,
} from '../audienceParticipantBuilder.js';
import { AudienceChip } from './AudienceChip.js';

export interface NewChatDraftProps {
  payload: AppShellPayload;
  composerDraft: string;
  busy: WorkspaceBusyState;
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
  onQuickAddDraftTemporaryParticipant?: () => void;
  showDraftGroupAddButton?: boolean;
  onRemoveDraftTemporaryParticipant: (participantId: string) => void;
  onUpdateDraftTemporaryParticipant: (
    participantId: string,
    input: { name?: string | null; roleHint?: string | null },
  ) => void;
  autoResize: (el: HTMLTextAreaElement) => void;
  draftDefaultRecipientCatId: string | null;
  entryPreset?: NewChatPreset;
  onDraftDefaultRecipientChange: (catId: string | null) => void;
  allowAddCat?: boolean;
  selectedExecutionTarget?: ExecutionTargetValue;
  onExecutionTargetChange?: (value: ExecutionTargetValue) => void;
  draftHighlightedCatId: string | null;
  onHighlightDraftCat: (catId: string | null) => void;
  draftCatExecutionTargetOverrides: Map<string, ExecutionTargetValue>;
  onDraftCatExecutionTargetOverride: (catId: string, value: ExecutionTargetValue) => void;
  onDirectLaneExecutionTargetChange?: (catId: string, value: ExecutionTargetValue) => void;
  parallelTargets?: ExecutionTargetValue[];
  onParallelTargetChange?: (index: number, value: ExecutionTargetValue) => void;
  onAddParallelTarget?: () => void;
  onRemoveParallelTarget?: (index: number) => void;
  showDraftParallelAddButton?: boolean;
  folderBrowsePath?: string;
  folderBrowseCurrentPath?: string;
  folderBrowseParentPath?: string;
  folderBrowseEntries?: BrowseDirectoryEntry[];
  folderBrowseLoading?: boolean;
  folderBrowseError?: string;
  onFolderBrowsePathChange?: (path: string) => void;
  onFolderBrowse?: (path: string) => void;
  onFolderBrowseSelect?: () => void;
  draftWorkflowShape?: DraftRoomWorkflowShape;
  onToggleDraftWorkflowShape?: () => void;
  draftAudienceKeys?: string[] | null;
  onSetAudienceKeys?: (keys: string[]) => void;
  parallelBranchAudienceKeys?: string[][];
  parallelBranchWorkflowShapes?: DraftRoomWorkflowShape[];
  onSetParallelBranchAudienceKeys?: (index: number, keys: string[]) => void;
  onToggleParallelBranchWorkflowShape?: (index: number) => void;
  onQuickAddParallelBranchTemporaryParticipant?: (index: number) => void;
  draftRuntimeSessionPolicy?: RuntimeSessionPolicy | null;
  onDraftRuntimeSessionPolicyChange?: (policy: RuntimeSessionPolicy) => void;
  composerHeaderAccessory?: ReactNode;
  composerHeaderWhereExtras?: ReactNode;
  composerFooterAccessory?: ReactNode;
  draftCustomRegion?: ReactNode;
  surfaceTag?: ReactNode;
  hideDraftGroupHint?: boolean;
  hideDraftParallelHint?: boolean;
  folderActionLabel?: string;
  chooseFolderPlacement?: 'header' | 'plusMenu';
  leadingStarterChips?: ReadonlyArray<{
    id: string;
    label: string;
    onClick: () => void;
  }>;
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
  onQuickAddDraftTemporaryParticipant,
  showDraftGroupAddButton = false,
  onRemoveDraftTemporaryParticipant,
  onUpdateDraftTemporaryParticipant,
  autoResize,
  draftDefaultRecipientCatId,
  entryPreset = 'default',
  onDraftDefaultRecipientChange,
  allowAddCat = true,
  selectedExecutionTarget,
  onExecutionTargetChange,
  draftHighlightedCatId,
  onHighlightDraftCat,
  draftCatExecutionTargetOverrides,
  onDraftCatExecutionTargetOverride,
  onDirectLaneExecutionTargetChange,
  parallelTargets,
  onParallelTargetChange,
  onAddParallelTarget,
  onRemoveParallelTarget,
  showDraftParallelAddButton = false,
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
  parallelBranchAudienceKeys,
  parallelBranchWorkflowShapes,
  onSetParallelBranchAudienceKeys,
  onToggleParallelBranchWorkflowShape,
  onQuickAddParallelBranchTemporaryParticipant,
  composerHeaderAccessory = null,
  composerHeaderWhereExtras = null,
  composerFooterAccessory = null,
  draftCustomRegion = null,
  surfaceTag = null,
  hideDraftGroupHint = false,
  hideDraftParallelHint = false,
  folderActionLabel = 'Choose folder',
  chooseFolderPlacement = 'header',
  leadingStarterChips,
}: NewChatDraftProps) {
  const isParallelMode = (parallelTargets?.length ?? 0) >= 2;
  const maxAudienceParticipants = payload.chat.capabilities.maxAudienceParticipants ?? 3;
  const {
    chatCats,
    assistantPresets,
    draftParticipants,
    defaultRecipientCat,
    effectiveDefaultRecipientCat,
    effectiveDefaultRecipientTemporaryParticipant,
    draftParticipantCount,
    hasReachedGroupParticipantLimit,
    draftSuggestionContext,
    visibleDraftCatIds,
    visibleStarterSuggestions,
    resolvedGreeting,
    groupDraftSelectionLabel,
    activePanelExecutionTarget,
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
    entryPreset,
    parallelTargets,
    greeting,
    greetingPool,
    draftHighlightedCatId,
    draftCatExecutionTargetOverrides,
    selectedExecutionTarget,
    busy,
  });
  const { isGroupDraft, isDirectLaneContext, isCatLedDraft } = draftSuggestionContext;
  const helperChipResetKey = fingerprintDraftHelperChips(visibleStarterSuggestions);
  const {
    showDraftHelperChips,
    dismissDraftHelperChips,
  } = useDraftHelperChipVisibility({
    availableChipCount: visibleStarterSuggestions.length,
    resetKey: helperChipResetKey,
  });

  function capAudienceParticipants(
    participants: typeof groupComposerParticipants,
  ): typeof groupComposerParticipants {
    if (participants.length <= maxAudienceParticipants) {
      return participants;
    }
    return participants.slice(0, maxAudienceParticipants);
  }

  function resolveParallelBranchAudienceParticipants(
    branchIndex: number,
    target: ExecutionTargetValue,
  ): typeof groupComposerParticipants {
    const branchAudienceKeys = parallelBranchAudienceKeys?.[branchIndex] ?? [];
    if (groupComposerParticipants.length === 0 || branchAudienceKeys.length === 0) {
      return [buildAudienceParticipantFromExecutionTarget(target, `parallel:${branchIndex}`)];
    }

    const byKey = new Map(groupComposerParticipants.map((participant) => [participant.key, participant]));
    const resolved = branchAudienceKeys
      .map((key) => byKey.get(key))
      .filter(Boolean) as typeof groupComposerParticipants;

    if (resolved.length > 0) {
      return capAudienceParticipants(resolved);
    }

    return [buildAudienceParticipantFromExecutionTarget(target, `parallel:${branchIndex}`)];
  }

  // Build unified audience participants for all modes
  const audienceParticipants: typeof groupComposerParticipants = (() => {
    if (isParallelMode && parallelTargets?.[0]) {
      return resolveParallelBranchAudienceParticipants(0, parallelTargets[0]);
    }

    if (isGroupDraft) {
      if (!draftAudienceKeys) return capAudienceParticipants(groupComposerParticipants);
      const byKey = new Map(groupComposerParticipants.map((p) => [p.key, p]));
      const resolved = draftAudienceKeys.map((key) => byKey.get(key)).filter(Boolean) as typeof groupComposerParticipants;
      if (resolved.length > 0) return capAudienceParticipants(resolved);
      return groupComposerParticipants.length > 0 ? [groupComposerParticipants[0]] : [];
    }

    // Single participant modes: cat or temporary participant
    if (effectiveDefaultRecipientCat) {
      return [buildAudienceParticipantFromCat(effectiveDefaultRecipientCat)];
    }
    if (effectiveDefaultRecipientTemporaryParticipant) {
      return [buildAudienceParticipantFromTemporaryParticipant(effectiveDefaultRecipientTemporaryParticipant)];
    }

    // Solo implicit: use the current execution target value
    if (activePanelExecutionTarget) {
      return [buildAudienceParticipantFromExecutionTarget(activePanelExecutionTarget)];
    }

    return [];
  })();
  const hasPrimaryParallelBranchAudience = isParallelMode
    && groupComposerParticipants.length > 0
    && (parallelBranchAudienceKeys?.[0]?.length ?? 0) > 0;

  // Determine click action for single-participant chip
  const audienceSingleClick = (() => {
    if (isGroupDraft) return undefined;
    if (isParallelMode) {
      return hasPrimaryParallelBranchAudience
        ? () => openSidePanelTo('cats')
        : () => openSidePanelTo('parallel:0');
    }
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
  const showCancelPendingSend = isAckPending && onCancelPendingSend != null;
  const shouldRenderGroupAddRow =
    !isDirectLaneContext && (isGroupDraft || showDraftGroupAddButton);
  const canAddAnotherGroupParticipant = !hasReachedGroupParticipantLimit;
  const canRemoveGroupParticipant =
    !isSubmittingFirstTurn
    && (
      entryPreset === 'group'
        ? groupComposerParticipants.length > 2
        : groupComposerParticipants.length >= 2
    );
  const minParallelTargetCount = entryPreset === 'parallel' ? 2 : 1;
  const useDangerGroupRemoveHover = entryPreset === 'group';
  const useDangerParallelRemoveHover = entryPreset === 'parallel';
  const accentGroupAddButton = entryPreset === 'group';
  const accentParallelAddButton = entryPreset === 'parallel';

  function renderCollaborateAddControl(options: {
    showHint: boolean;
    accent: boolean;
    className?: string;
  }) {
    if (!canAddAnotherGroupParticipant) {
      return null;
    }

    return (
      <div className={options.className ?? 'composerGroupAddRow'}>
        <button
          type="button"
          className={`parallelAddButton${options.accent ? ' parallelAddButtonAccent' : ''}`}
          disabled={isSubmittingFirstTurn}
          onClick={() => {
            if (onQuickAddDraftTemporaryParticipant) {
              onQuickAddDraftTemporaryParticipant();
              return;
            }
            openSidePanelTo('cats');
          }}
          aria-label="Add another model to collaborate"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10" />
            <path d="M3 8h10" />
          </svg>
        </button>
        {options.showHint ? (
          <span className={`parallelAddHint${options.accent ? ' parallelAddHintAccent' : ''}`}>
            Add another model to collaborate
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="viewShell viewShellDraft">
      <section className="draftShell">
        {isDirectLaneContext && defaultRecipientCat ? (
          <DraftHeader
            variant="profile"
            title={defaultRecipientCat.name}
            avatarName={defaultRecipientCat.name}
            avatarUrl={defaultRecipientCat.avatarUrl}
            avatarColor={defaultRecipientCat.avatarColor}
          />
        ) : isCatLedDraft && effectiveDefaultRecipientCat ? (
          <DraftHeader
            variant="intro"
            eyebrow="Cat-led Chat"
            title={`Start with ${effectiveDefaultRecipientCat.name}`}
            description={`Ask ${effectiveDefaultRecipientCat.name} to take the first pass. Add more Cats anytime, or keep the thread focused.`}
          />
        ) : (
          <DraftHeader
            variant="intro"
            title={resolvedGreeting}
          />
        )}
        {draftCustomRegion ? (
          <div className="draftCustomRegion">{draftCustomRegion}</div>
        ) : null}
        {(surfaceTag || draftCwd || chooseFolderPlacement === 'header' || composerHeaderWhereExtras || composerHeaderAccessory) ? (
          <div className="composerHeaderRow">
            <div className="composerHeaderLeft">
              {surfaceTag}
              {draftCwd ? (
                <span
                  className="composerCwdChip composerCwdClickable"
                  data-tooltip={draftCwd}
                  role="button"
                  tabIndex={isSubmittingFirstTurn ? undefined : 0}
                  onClick={isSubmittingFirstTurn ? undefined : () => openSidePanelTo('cwd')}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                  </svg>
                  <span>{truncatePath(draftCwd)}</span>
                  <button
                    className="composerChipClose"
                    type="button"
                    disabled={isSubmittingFirstTurn}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDraftCwdClear();
                    }}
                    aria-label="Remove folder"
                  >
                    &times;
                  </button>
                </span>
              ) : chooseFolderPlacement === 'header' ? (
                <button
                  type="button"
                  className="composerHeaderChooseButton"
                  disabled={isSubmittingFirstTurn}
                  onClick={() => openSidePanelTo('cwd')}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                  </svg>
                  <span>{folderActionLabel}</span>
                </button>
              ) : null}
              {composerHeaderWhereExtras}
            </div>
            {composerHeaderAccessory ? (
              <div className="composerHeaderRight">{composerHeaderAccessory}</div>
            ) : null}
          </div>
        ) : null}
        <DraftComposerStack
          card={(
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
                        {chooseFolderPlacement === 'plusMenu' ? (
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
                            {folderActionLabel}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {shouldRenderGroupAddRow ? (
                    <div className="composerGroupAddRow">
                      <BranchAudienceRoster
                        audienceParticipants={groupComposerParticipants}
                        isSubmittingFirstTurn={isSubmittingFirstTurn}
                        canRemoveParticipant={canRemoveGroupParticipant}
                        useDangerRemoveHover={useDangerGroupRemoveHover}
                        onAvatarClick={() => openSidePanelTo('cats')}
                        onRemoveParticipant={(participant) => {
                          if (participant.isCat && participant.catId) {
                            onToggleDraftCat(participant.catId);
                          } else if (participant.participantId) {
                            onRemoveDraftTemporaryParticipant(participant.participantId);
                          }
                        }}
                      />
                      {renderCollaborateAddControl({
                        showHint: !hideDraftGroupHint,
                        accent: accentGroupAddButton,
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="composerRightGroup">
                  {audienceParticipants.length > 0 ? (
                    <AudienceChip
                      audienceParticipants={audienceParticipants}
                      allParticipants={
                        isParallelMode && hasPrimaryParallelBranchAudience
                          ? groupComposerParticipants
                          : (isGroupDraft ? groupComposerParticipants : undefined)
                      }
                      onSetAudienceKeys={
                        isParallelMode && hasPrimaryParallelBranchAudience
                          ? (onSetParallelBranchAudienceKeys
                            ? (keys) => onSetParallelBranchAudienceKeys(0, keys)
                            : undefined)
                          : (isGroupDraft ? onSetAudienceKeys : undefined)
                      }
                      onSingleClick={audienceSingleClick}
                      disabled={isSubmittingFirstTurn}
                      maxSelectedParticipants={
                        (isParallelMode && hasPrimaryParallelBranchAudience) || isGroupDraft
                          ? maxAudienceParticipants
                          : undefined
                      }
                      workflowShape={
                        isParallelMode
                          ? (parallelBranchWorkflowShapes?.[0] ?? draftWorkflowShape)
                          : draftWorkflowShape
                      }
                      onToggleWorkflowShape={
                        isParallelMode && hasPrimaryParallelBranchAudience
                          ? (onToggleParallelBranchWorkflowShape
                            ? () => onToggleParallelBranchWorkflowShape(0)
                            : undefined)
                          : (isGroupDraft ? onToggleDraftWorkflowShape : undefined)
                      }
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
          )}
          footer={(
            <DraftComposerFooter
              accessory={composerFooterAccessory}
              showParallelAddButton={Boolean(
                onAddParallelTarget
                  && (showDraftParallelAddButton || (parallelTargets?.length ?? 0) > 0)
                  && (parallelTargets?.length ?? 1) < (payload.chat.capabilities.maxParallelChats ?? 3),
              )}
              hideParallelHint={hideDraftParallelHint}
              accentParallelAddButton={accentParallelAddButton}
              disabled={isSubmittingFirstTurn}
              onAddParallelTarget={onAddParallelTarget}
            />
          )}
          helperRegion={(() => {
            const { runtimeChipsRendered, fallbackChipsRendered } =
              resolveDraftHelperRegionVisibility({
                isDirectLaneContext,
                showDraftHelperChips,
                runtimeChipCount: visibleStarterSuggestions.length,
                fallbackChipCount: leadingStarterChips?.length ?? 0,
              });
            if (!runtimeChipsRendered && !fallbackChipsRendered) return null;
            return (
              <div className="draftPromptSuggestions">
                <div className="chipRow">
                  {fallbackChipsRendered
                    ? leadingStarterChips?.map((chip) => (
                        <button
                          key={chip.id}
                          className="promptChip draftPromptChip"
                          type="button"
                          disabled={isSubmittingFirstTurn}
                          onClick={() => {
                            dismissDraftHelperChips();
                            chip.onClick();
                          }}
                        >
                          {chip.label}
                        </button>
                      ))
                    : null}
                  {runtimeChipsRendered
                    ? visibleStarterSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          className="promptChip draftPromptChip"
                          type="button"
                          disabled={isSubmittingFirstTurn}
                          onClick={() => {
                            dismissDraftHelperChips();
                            onComposerChange(suggestion.prompt);
                          }}
                        >
                          {suggestion.prompt}
                        </button>
                      ))
                    : null}
                </div>
              </div>
            );
          })()}
          shadowStack={isParallelMode && parallelTargets && parallelTargets.length > 1 ? (
            <div className="parallelStubStack">
              {parallelTargets.slice(1).map((target, i, arr) => (
                <div key={i + 1} style={{ position: 'relative', zIndex: arr.length - i }}>
                  <ParallelDraftShadowBranchRow
                    branchIndex={i + 1}
                    target={target}
                    audienceParticipants={
                      groupComposerParticipants.length > 0
                      && (parallelBranchAudienceKeys?.[i + 1]?.length ?? 0) > 0
                        ? resolveParallelBranchAudienceParticipants(i + 1, target)
                        : []
                    }
                    allParticipants={groupComposerParticipants}
                    workflowShape={parallelBranchWorkflowShapes?.[i + 1] ?? 'sequential'}
                    maxAudienceParticipants={maxAudienceParticipants}
                    isSubmittingFirstTurn={isSubmittingFirstTurn}
                    canAddCollaborator={canAddAnotherGroupParticipant}
                    accentCollaborateButton={accentGroupAddButton}
                    onAddCollaborator={onQuickAddParallelBranchTemporaryParticipant}
                    onSetAudienceKeys={onSetParallelBranchAudienceKeys}
                    onToggleWorkflowShape={onToggleParallelBranchWorkflowShape}
                    onOpenAudience={() => openSidePanelTo('cats')}
                    onRemoveParallelTarget={onRemoveParallelTarget}
                    canRemoveParallelTarget={parallelTargets.length > minParallelTargetCount}
                    useDangerParallelRemoveHover={useDangerParallelRemoveHover}
                  />
                </div>
              ))}
            </div>
          ) : null}
        />
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
            activePanelExecutionTarget,
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
            selectedExecutionTarget,
            onExecutionTargetChange,
            onDirectLaneExecutionTargetChange,
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
