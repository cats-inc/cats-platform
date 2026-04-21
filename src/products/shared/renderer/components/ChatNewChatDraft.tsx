import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import type { AppShellPayload } from '../../api/workspaceContracts.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import { SidePanel } from '../../../../design/components/SidePanel.js';
import type { BrowseDirectoryEntry } from '../api/index.js';
import { type NewChatPreset } from '../draftStarterSuggestionContext.js';
import {
  type DraftParallelTarget,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import {
  resolveBranchAudienceKeys,
  resolveBranchWorkflowShape,
  type DraftLeadContext,
} from '../draftBranchResolution.js';
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
import { CollaborateIcon, CompareIcon } from './DraftBuilderIcons.js';
import {
  DraftCompareCarousel,
  type DraftCompareCarouselCard,
} from './DraftCompareCarousel.js';
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
  parallelTargets?: DraftParallelTarget[];
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
  composerPlaceholder?: string;
  hideDraftGroupHint?: boolean;
  hideDraftParallelHint?: boolean;
  folderActionLabel?: string;
  chooseFolderPlacement?: 'header' | 'plusMenu';
  leadingStarterChips?: ReadonlyArray<{
    id: string;
    label: string;
    onClick: () => void;
  }>;
  preserveHelperChipsOnSelect?: boolean;
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
  draftRuntimeSessionPolicy = null,
  composerHeaderAccessory = null,
  composerHeaderWhereExtras = null,
  composerFooterAccessory = null,
  draftCustomRegion = null,
  surfaceTag = null,
  composerPlaceholder = 'How can I help you today?',
  hideDraftGroupHint = false,
  hideDraftParallelHint = false,
  folderActionLabel = 'Choose folder',
  chooseFolderPlacement = 'header',
  leadingStarterChips,
  preserveHelperChipsOnSelect = false,
}: NewChatDraftProps) {
  const isParallelMode = (parallelTargets?.length ?? 0) >= 2;
  const [activeBranchIndex, setActiveBranchIndex] = useState(0);
  const parallelCount = parallelTargets?.length ?? 0;
  useEffect(() => {
    if (!isParallelMode) {
      if (activeBranchIndex !== 0) setActiveBranchIndex(0);
      return;
    }
    if (activeBranchIndex >= parallelCount) {
      setActiveBranchIndex(Math.max(0, parallelCount - 1));
    }
  }, [activeBranchIndex, isParallelMode, parallelCount]);

  const maxAudienceParticipants = payload.chat.capabilities.maxAudienceParticipants ?? 3;
  // Per-branch membership cap. Each branch (lead OR shadow) is its
  // own sub-chat, so maxChatParticipants applies per branch, not to
  // the shared pool of temps. The audience chip still respects
  // maxAudienceParticipants for selection, independently of how many
  // members the branch holds.
  const maxBranchMembers = payload.chat.capabilities.maxChatParticipants ?? Number.POSITIVE_INFINITY;
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

  const draftLeadContext: DraftLeadContext = {
    composerDraft,
    draftCwd,
    draftRuntimeSessionPolicy: draftRuntimeSessionPolicy ?? null,
    draftAudienceKeys: draftAudienceKeys ?? null,
    draftWorkflowShape: draftWorkflowShape ?? 'sequential',
    draftFiles,
  };
  function resolveParallelTargetForBranch(
    branchIndex: number,
    target: DraftParallelTarget,
  ): DraftParallelTarget {
    return {
      ...target,
      audienceKeys: target.audienceKeys ?? parallelBranchAudienceKeys?.[branchIndex] ?? null,
      workflowShape: target.workflowShape ?? parallelBranchWorkflowShapes?.[branchIndex] ?? null,
    };
  }
  function resolveParallelBranchAudienceKeys(branchIndex: number): string[] {
    const target = parallelTargets?.[branchIndex];
    if (!target) {
      return parallelBranchAudienceKeys?.[branchIndex] ?? [];
    }
    return resolveBranchAudienceKeys(
      resolveParallelTargetForBranch(branchIndex, target),
      draftLeadContext,
    );
  }
  function resolveParallelBranchWorkflowShape(
    branchIndex: number,
  ): DraftRoomWorkflowShape {
    const target = parallelTargets?.[branchIndex];
    if (!target) {
      return parallelBranchWorkflowShapes?.[branchIndex] ?? 'sequential';
    }
    return resolveBranchWorkflowShape(
      resolveParallelTargetForBranch(branchIndex, target),
      draftLeadContext,
    );
  }

  function resolveParallelBranchMembers(
    branchIndex: number,
  ): typeof groupComposerParticipants {
    const branchAudienceKeys = resolveParallelBranchAudienceKeys(branchIndex);
    if (groupComposerParticipants.length === 0 || branchAudienceKeys.length === 0) {
      return [];
    }
    const byKey = new Map(groupComposerParticipants.map((p) => [p.key, p]));
    return branchAudienceKeys.map((key) => byKey.get(key)).filter(Boolean) as typeof groupComposerParticipants;
  }

  function resolveParallelBranchAudienceParticipants(
    branchIndex: number,
    target: ExecutionTargetValue,
  ): typeof groupComposerParticipants {
    // Audience chip display: capped at maxAudienceParticipants.
    // The roster uses the uncapped member list (see
    // resolveParallelBranchMembers) so the full branch membership is
    // visible even when the audience chip truncates with "+N".
    const members = resolveParallelBranchMembers(branchIndex);
    if (members.length === 0) {
      return [buildAudienceParticipantFromExecutionTarget(target, `parallel:${branchIndex}`)];
    }
    return capAudienceParticipants(members);
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
    && resolveParallelBranchAudienceKeys(0).length > 0;
  // Lead branch membership (uncapped): the roster must show every
  // member of the lead branch, whereas the audience chip stays
  // capped at maxAudienceParticipants via audienceParticipants.
  const leadBranchMembers: typeof groupComposerParticipants = isParallelMode
    ? resolveParallelBranchMembers(0)
    : [];

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
  // Parallel mode: each branch is its own sub-chat, so lead's
  // +collaborate is gated purely on lead-branch membership vs
  // maxChatParticipants. The shared pool cap does not apply here
  // because a pool can legitimately grow past that when multiple
  // branches each host their own members.
  const leadBranchAudienceLength = isParallelMode
    ? resolveParallelBranchAudienceKeys(0).length
    : groupComposerParticipants.length;
  const canAddAnotherGroupParticipant = isParallelMode
    ? leadBranchAudienceLength < maxBranchMembers
    : !hasReachedGroupParticipantLimit;
  // Group-minimum (>= 2 for +Group) stays branch-scoped so a shadow
  // adding to the pool does not unlock × on the lead's at-minimum
  // roster.
  const leadRosterLength = isParallelMode
    ? leadBranchAudienceLength
    : groupComposerParticipants.length;
  const canRemoveGroupParticipant =
    !isSubmittingFirstTurn
    && (
      entryPreset === 'group'
        ? leadRosterLength > 2
        : leadRosterLength >= 2
    );
  const minParallelTargetCount = entryPreset === 'parallel' ? 2 : 1;
  const useDangerGroupRemoveHover = entryPreset === 'group';
  const useDangerParallelRemoveHover = entryPreset === 'parallel';
  const accentGroupAddButton = entryPreset === 'group';
  const accentParallelAddButton = entryPreset === 'parallel';
  const maxParallelChats = payload.chat.capabilities.maxParallelChats ?? 3;

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
          <CollaborateIcon />
        </button>
        {options.showHint ? (
          <span className={`parallelAddHint${options.accent ? ' parallelAddHintAccent' : ''}`}>
            Add another model to collaborate
          </span>
        ) : null}
      </div>
    );
  }

  // ── Hoisted JSX pieces: used by both the parallel-mode carousel
  // (each branch card stitches header + form + footer together) and
  // the non-parallel single-card layout (passed to DraftComposerStack).

  const draftHeaderJsx = isDirectLaneContext && defaultRecipientCat ? (
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
  );

  const hasComposerHeaderContent = Boolean(
    surfaceTag
    || draftCwd
    || chooseFolderPlacement === 'header'
    || composerHeaderWhereExtras
    || composerHeaderAccessory,
  );

  const composerHeaderRowJsx = hasComposerHeaderContent ? (
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
  ) : null;

  const leadFormJsx = (
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
        placeholder={composerPlaceholder}
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
                audienceParticipants={isParallelMode ? leadBranchMembers : groupComposerParticipants}
                isSubmittingFirstTurn={isSubmittingFirstTurn}
                canRemoveParticipant={canRemoveGroupParticipant}
                useDangerRemoveHover={useDangerGroupRemoveHover}
                onAvatarClick={() => openSidePanelTo('cats')}
                onRemoveParticipant={(participant) => {
                  // Parallel mode: the lead row is one branch among
                  // many. Removing here must stay branch-scoped so
                  // we don't rip the participant out of the pool
                  // and break shadow branches that still reference
                  // it. Pool-level deletion stays in the side panel.
                  if (isParallelMode) {
                    if (!onSetParallelBranchAudienceKeys) return;
                    const nextKeys = leadBranchMembers
                      .filter((p) => p.key !== participant.key)
                      .map((p) => p.key);
                    onSetParallelBranchAudienceKeys(0, nextKeys);
                    return;
                  }
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
                  ? resolveParallelBranchWorkflowShape(0)
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
  );

  const draftComposerFooterJsx = (
    <DraftComposerFooter
      accessory={composerFooterAccessory}
      showParallelAddButton={Boolean(
        onAddParallelTarget
          && (showDraftParallelAddButton || (parallelTargets?.length ?? 0) > 0)
          && (parallelTargets?.length ?? 1) < maxParallelChats,
      )}
      hideParallelHint={hideDraftParallelHint}
      accentParallelAddButton={accentParallelAddButton}
      disabled={isSubmittingFirstTurn}
      onAddParallelTarget={onAddParallelTarget}
    />
  );

  const helperRegionJsx = (() => {
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
                    if (!preserveHelperChipsOnSelect) {
                      dismissDraftHelperChips();
                    }
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
                    if (!preserveHelperChipsOnSelect) {
                      dismissDraftHelperChips();
                    }
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
  })();

  const sidePanelJsx = sidePanelOpen ? (
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
  ) : null;

  // ── Parallel-mode branch carousel ──
  //
  // When two or more parallel targets exist, lay out the lead + shadow
  // branches as a single 3D carousel where each card carries its own
  // header / form / footer chrome. The lead card reuses the shared
  // `leadFormJsx` above so its interactive surface stays intact; shadow
  // cards render a simpler mirror (read-only textarea, "follows lead"
  // chip instead of the cwd chip, per-branch audience + collaborate +
  // remove controls).

  function buildShadowCardContent(branchIndex: number, target: ExecutionTargetValue): ReactNode {
    const branchAudienceKeysLen = resolveParallelBranchAudienceKeys(branchIndex).length;
    const branchMembers = resolveParallelBranchMembers(branchIndex);
    const branchAudienceParticipants = branchAudienceKeysLen > 1
      ? resolveParallelBranchAudienceParticipants(branchIndex, target)
      : [buildAudienceParticipantFromExecutionTarget(target, `parallel:${branchIndex}`)];
    const canAddToBranch = branchAudienceKeysLen < maxBranchMembers;
    const showBranchCollaborateButton =
      canAddToBranch && onQuickAddParallelBranchTemporaryParticipant != null;
    const branchWorkflowShape = resolveParallelBranchWorkflowShape(branchIndex);
    const canRemoveBranch = parallelCount > minParallelTargetCount;
    const canAddMoreBranches = parallelCount < maxParallelChats;
    const showCompareHint = accentParallelAddButton && !hideDraftParallelHint;

    return (
      <>
        <div className="composerHeaderRow">
          <div className="composerHeaderLeft">
            {surfaceTag}
            <span className="composerFollowsLeadChip">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3l-3 5 3 5" />
                <path d="M3 8h10" />
              </svg>
              <span>Follows lead</span>
            </span>
          </div>
        </div>

        <form className="composerCard composerCardFresh parallelComposerAnchor" onSubmit={(event) => event.preventDefault()}>
          <textarea
            className="composerInput"
            rows={1}
            placeholder={composerPlaceholder}
            value={composerDraft}
            disabled
            readOnly
          />
          <div className="composerBottomRow">
            <div className="composerLeftGroup">
              <div className="composerPlusWrapper">
                <button
                  type="button"
                  className="composerPlusButton"
                  aria-label="Attach"
                  disabled
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v10" />
                    <path d="M3 8h10" />
                  </svg>
                </button>
              </div>
              {branchMembers.length > 0 || showBranchCollaborateButton ? (
                <div className="composerGroupAddRow">
                  {branchMembers.length > 0 ? (
                    <BranchAudienceRoster
                      audienceParticipants={branchMembers}
                      isSubmittingFirstTurn={isSubmittingFirstTurn}
                      canRemoveParticipant={canRemoveGroupParticipant}
                      useDangerRemoveHover={useDangerGroupRemoveHover}
                      onAvatarClick={() => openSidePanelTo('cats')}
                      onRemoveParticipant={(p) => {
                        if (!onSetParallelBranchAudienceKeys) return;
                        const nextKeys = branchMembers
                          .filter((m) => m.key !== p.key)
                          .map((m) => m.key);
                        onSetParallelBranchAudienceKeys(branchIndex, nextKeys);
                      }}
                    />
                  ) : null}
                  {showBranchCollaborateButton ? (
                    <button
                      type="button"
                      className="parallelAddButton"
                      disabled={isSubmittingFirstTurn}
                      onClick={() => onQuickAddParallelBranchTemporaryParticipant(branchIndex)}
                      aria-label="Add another model to collaborate"
                    >
                      <CollaborateIcon />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="composerRightGroup">
              <AudienceChip
                audienceParticipants={branchAudienceParticipants}
                allParticipants={branchAudienceKeysLen > 1 ? groupComposerParticipants : undefined}
                onSetAudienceKeys={
                  branchAudienceKeysLen > 1 && onSetParallelBranchAudienceKeys
                    ? (keys) => onSetParallelBranchAudienceKeys(branchIndex, keys)
                    : undefined
                }
                onSingleClick={() => openSidePanelTo('cats')}
                disabled={isSubmittingFirstTurn}
                maxSelectedParticipants={maxAudienceParticipants}
                workflowShape={branchWorkflowShape}
                onToggleWorkflowShape={
                  onToggleParallelBranchWorkflowShape
                    ? () => onToggleParallelBranchWorkflowShape(branchIndex)
                    : undefined
                }
              />
            </div>
          </div>
        </form>

        <div className="composerFooterRow">
          <div className="parallelAddRow parallelAddRowInline">
            {canRemoveBranch ? (
              <button
                type="button"
                className={`parallelStubRemove${useDangerParallelRemoveHover ? ' parallelStubRemoveDanger' : ''}`}
                disabled={isSubmittingFirstTurn}
                onClick={() => onRemoveParallelTarget?.(branchIndex)}
                aria-label={`Remove branch ${branchIndex + 1}`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 8h8" />
                </svg>
              </button>
            ) : null}
            {onAddParallelTarget && canAddMoreBranches ? (
              <button
                type="button"
                className={`parallelAddButton${accentParallelAddButton ? ' parallelAddButtonAccent' : ''}`}
                disabled={isSubmittingFirstTurn}
                onClick={onAddParallelTarget}
                aria-label="Add parallel chat"
              >
                <CompareIcon />
              </button>
            ) : null}
            {showCompareHint && onAddParallelTarget && canAddMoreBranches ? (
              <span className="parallelAddHint parallelAddHintAccent">
                Add another model to compare
              </span>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  const isParallelCarouselActive = isParallelMode
    && Array.isArray(parallelTargets)
    && parallelTargets.length >= 2;

  if (isParallelCarouselActive && parallelTargets) {
    const branchCards: DraftCompareCarouselCard[] = parallelTargets.map((target, branchIndex) => {
      if (branchIndex === 0) {
        return {
          id: `lead-${target.provider}-${target.instance ?? ''}-${target.model ?? ''}`,
          content: (
            <>
              {composerHeaderRowJsx}
              {leadFormJsx}
              {draftComposerFooterJsx}
            </>
          ),
        };
      }
      return {
        id: `shadow-${branchIndex}-${target.provider}-${target.instance ?? ''}-${target.model ?? ''}`,
        content: buildShadowCardContent(branchIndex, target),
      };
    });

    return (
      <div className="viewShell viewShellDraft">
        <section className="draftShell">
          {draftHeaderJsx}
          {draftCustomRegion ? (
            <div className="draftCustomRegion">{draftCustomRegion}</div>
          ) : null}
          <DraftCompareCarousel
            cards={branchCards}
            activeIndex={activeBranchIndex}
            onActiveIndexChange={setActiveBranchIndex}
            disabled={isSubmittingFirstTurn}
          />
          {helperRegionJsx}
        </section>
        {sidePanelJsx}
      </div>
    );
  }

  return (
    <div className="viewShell viewShellDraft">
      <section className="draftShell">
        {draftHeaderJsx}
        {draftCustomRegion ? (
          <div className="draftCustomRegion">{draftCustomRegion}</div>
        ) : null}
        {composerHeaderRowJsx}
        <DraftComposerStack
          card={leadFormJsx}
          footer={draftComposerFooterJsx}
          helperRegion={helperRegionJsx}
        />
      </section>
      {sidePanelJsx}
    </div>
  );
}
