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
import { SidePanel, type SidePanelSection } from '../../../../design/components/SidePanel.js';
import type { BrowseDirectoryEntry } from '../api/index.js';
import { type NewChatPreset } from '../draftStarterSuggestionContext.js';
import {
  type DraftParallelTarget,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import {
  resolveBranchAudienceKeys,
  resolveBranchPrompt,
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
  resolveChatNewChatDraftSidePanelCopy,
  type BuildChatNewChatDraftSidePanelSectionsInput,
  type ChatNewChatDraftSidePanelCopy,
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
import {
  completeRuntimeSessionPolicy,
  createDefaultRuntimeSessionPolicy,
  resolveCreateRuntimeSessionPolicy,
  resolveDraftPermissionModeFromRuntimeAccess,
  resolveDraftWorkspaceModeFromRuntimeKind,
  resolveRuntimePermissionPolicyFromDraft,
  resolveRuntimeWorkspaceKindFromDraft,
  type RuntimeSessionPolicy,
} from '../../../../shared/runtimeSessionPolicy.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromExecutionTarget,
  buildAudienceParticipantFromTemporaryParticipant,
} from '../audienceParticipantBuilder.js';
import { AudienceChip } from './AudienceChip.js';
import { PermissionModeChip } from './PermissionModeChip.js';
import { WorkspaceModeChip } from './WorkspaceModeChip.js';
import { useRepoProbe } from '../hooks/useRepoProbe.js';
import { useVoiceInputComposer } from '../hooks/useVoiceInputComposer.js';

function formatBranchRuntimeSessionPolicy(policy: RuntimeSessionPolicy): string {
  const workspaceLabel = policy.workspaceKind === 'worktree'
    ? 'Worktree'
    : policy.workspaceKind === 'source'
      ? 'Current folder'
      : 'Sandbox';
  const permissionLabel = policy.workspaceAccess === 'read_only' ? 'Read only' : 'Full access';
  return `${workspaceLabel} / ${permissionLabel}`;
}

function resolveDraftBranchRuntimeSessionPolicy(input: {
  target: DraftParallelTarget;
  draftCwd: string | null;
  draftRuntimeSessionPolicy: RuntimeSessionPolicy | null;
}): RuntimeSessionPolicy {
  return resolveCreateRuntimeSessionPolicy({
    repoPath: input.target.cwd ?? input.draftCwd,
    policy: input.target.runtimeSessionPolicy
      ?? input.draftRuntimeSessionPolicy
      ?? createDefaultRuntimeSessionPolicy(),
  });
}

interface BranchRuntimeSessionPolicyControlsProps {
  branchIndex: number;
  target: DraftParallelTarget;
  draftCwd: string | null;
  draftRuntimeSessionPolicy: RuntimeSessionPolicy | null;
  isSubmittingFirstTurn: boolean;
  onSetParallelBranchRuntimeSessionPolicy?: (
    index: number,
    policy: RuntimeSessionPolicy | null,
  ) => void;
}

type BranchRuntimeSessionPolicyPatch = Partial<
  Pick<RuntimeSessionPolicy, 'workspaceKind' | 'workspaceAccess' | 'permissionMode'>
>;

export function createDraftCompareShadowCardId(
  branchIndex: number,
  target: Pick<DraftParallelTarget, 'provider' | 'instance' | 'model'>,
): string {
  return `shadow-${branchIndex}-${target.provider}-${target.instance ?? ''}-${target.model ?? ''}`;
}

export interface ParallelBranchDraftActions {
  onPickFolder?: (index: number) => void;
  onSetAudienceKeys?: (index: number, keys: string[]) => void;
  onSetCwd?: (index: number, cwd: string | null) => void;
  onSetRuntimeSessionPolicy?: (
    index: number,
    policy: RuntimeSessionPolicy | null,
  ) => void;
  onSetPromptOverride?: (index: number, promptOverride: string | null) => void;
  onToggleWorkflowShape?: (index: number) => void;
  onQuickAddTemporaryParticipant?: (index: number) => void;
}

export interface ChatNewChatDraftChrome {
  headerAccessory?: ReactNode;
  headerWhereExtras?: ReactNode;
  footerAccessory?: ReactNode;
  customRegion?: ReactNode;
  surfaceTag?: ReactNode;
  chooseFolderPlacement?: 'header' | 'plusMenu';
}

export interface ChatNewChatDraftBuilderControls {
  showGroupAddButton?: boolean;
  showParallelAddButton?: boolean;
  hideGroupHint?: boolean;
  hideParallelHint?: boolean;
}

export interface ChatNewChatDraftCopy {
  composerPlaceholder?: string;
  folderActionLabel?: string;
  sidePanel?: ChatNewChatDraftSidePanelCopy;
}

export interface ChatNewChatDraftStarterChips {
  leading?: ReadonlyArray<{
    id: string;
    label: string;
    onClick: () => void;
  }>;
  preserveOnSelect?: boolean;
}

export interface ChatNewChatDraftSidePanelComposition {
  title?: string;
  buildSections?: (
    input: BuildChatNewChatDraftSidePanelSectionsInput,
  ) => SidePanelSection[];
}

function BranchRuntimeSessionPolicyControls({
  branchIndex,
  target,
  draftCwd,
  draftRuntimeSessionPolicy,
  isSubmittingFirstTurn,
  onSetParallelBranchRuntimeSessionPolicy,
}: BranchRuntimeSessionPolicyControlsProps) {
  const branchSessionPolicy = target.runtimeSessionPolicy ?? null;
  const canEditBranchSessionPolicy = onSetParallelBranchRuntimeSessionPolicy != null;
  const branchCwd = target.cwd ?? draftCwd;
  const { isRepo, repoRoot } = useRepoProbe(branchCwd);
  const repoReady = Boolean(branchCwd && isRepo && repoRoot);
  const effectiveBranchSessionPolicy = resolveDraftBranchRuntimeSessionPolicy({
    target,
    draftCwd,
    draftRuntimeSessionPolicy,
  });

  function updateDraftBranchRuntimePolicy(
    patch: BranchRuntimeSessionPolicyPatch,
  ): void {
    const currentPolicy = target.runtimeSessionPolicy ?? effectiveBranchSessionPolicy;
    onSetParallelBranchRuntimeSessionPolicy?.(
      branchIndex,
      completeRuntimeSessionPolicy({
        workspaceKind: currentPolicy.workspaceKind,
        workspaceAccess: currentPolicy.workspaceAccess,
        permissionMode: currentPolicy.permissionMode,
        ...patch,
      }),
    );
  }

  if (branchSessionPolicy && canEditBranchSessionPolicy) {
    return (
      <div
        className="composerBranchPolicyControl"
        data-tooltip={formatBranchRuntimeSessionPolicy(branchSessionPolicy)}
      >
        {repoReady ? (
          <WorkspaceModeChip
            value={resolveDraftWorkspaceModeFromRuntimeKind(branchSessionPolicy.workspaceKind)}
            onChange={(nextMode) =>
              updateDraftBranchRuntimePolicy({
                workspaceKind: resolveRuntimeWorkspaceKindFromDraft({
                  hasCwd: Boolean(branchCwd),
                  isRepo: repoReady,
                  workspaceMode: nextMode,
                }),
              })}
            disabled={isSubmittingFirstTurn}
          />
        ) : null}
        <PermissionModeChip
          value={resolveDraftPermissionModeFromRuntimeAccess(
            branchSessionPolicy.workspaceAccess,
          )}
          onChange={(nextMode) =>
            updateDraftBranchRuntimePolicy(resolveRuntimePermissionPolicyFromDraft(nextMode))}
          disabled={isSubmittingFirstTurn}
        />
        <button
          className="composerChipClose"
          type="button"
          disabled={isSubmittingFirstTurn}
          onClick={() => onSetParallelBranchRuntimeSessionPolicy(branchIndex, null)}
          aria-label="Re-link branch session policy to lead"
        >
          &times;
        </button>
      </div>
    );
  }

  if (branchSessionPolicy) {
    return (
      <span
        className="composerSelectChip composerPermissionChip composerBranchPolicyChip"
        data-tooltip={formatBranchRuntimeSessionPolicy(branchSessionPolicy)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 1.5l5.5 2v4c0 3.3-2.4 6.2-5.5 7-3.1-.8-5.5-3.7-5.5-7v-4z" />
        </svg>
        <span>{formatBranchRuntimeSessionPolicy(branchSessionPolicy)}</span>
      </span>
    );
  }

  if (!canEditBranchSessionPolicy) {
    return null;
  }

  return (
    <button
      type="button"
      className="composerFollowsLeadChip composerFollowsLeadChipClickable"
      disabled={isSubmittingFirstTurn}
      onClick={() =>
        onSetParallelBranchRuntimeSessionPolicy(
          branchIndex,
          effectiveBranchSessionPolicy,
        )}
      aria-label="Detach branch session policy"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 1.5l5.5 2v4c0 3.3-2.4 6.2-5.5 7-3.1-.8-5.5-3.7-5.5-7v-4z" />
      </svg>
      <span>Policy follows lead</span>
    </button>
  );
}

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
  onTakeScreenshot?: () => void;
  screenshotCaptureDisabled?: boolean;
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
  parallelBranchActions?: ParallelBranchDraftActions;
  builderControls?: ChatNewChatDraftBuilderControls;
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
  draftRuntimeSessionPolicy?: RuntimeSessionPolicy | null;
  onDraftRuntimeSessionPolicyChange?: (policy: RuntimeSessionPolicy) => void;
  onCatAvatarSave?: (catId: string, dataUrl: string) => void;
  draftChrome?: ChatNewChatDraftChrome;
  draftCopy?: ChatNewChatDraftCopy;
  starterChips?: ChatNewChatDraftStarterChips;
  sidePanel?: ChatNewChatDraftSidePanelComposition;
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
  onTakeScreenshot,
  screenshotCaptureDisabled = false,
  onPickFolder,
  onOpenAddCat,
  onDraftFilesChange,
  onDraftCwdClear,
  onToggleDraftCat,
  onAddDraftTemporaryParticipant,
  onQuickAddDraftTemporaryParticipant,
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
  parallelBranchActions,
  builderControls,
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
  draftRuntimeSessionPolicy = null,
  onDraftRuntimeSessionPolicyChange,
  onCatAvatarSave,
  draftChrome,
  draftCopy,
  starterChips,
  sidePanel,
}: NewChatDraftProps) {
  const {
    headerAccessory: composerHeaderAccessory = null,
    headerWhereExtras: composerHeaderWhereExtras = null,
    footerAccessory: composerFooterAccessory = null,
    customRegion: draftCustomRegion = null,
    surfaceTag = null,
    chooseFolderPlacement = 'header',
  } = draftChrome ?? {};
  const {
    showGroupAddButton: showDraftGroupAddButton = false,
    showParallelAddButton: showDraftParallelAddButton = false,
    hideGroupHint: hideDraftGroupHint = false,
    hideParallelHint: hideDraftParallelHint = false,
  } = builderControls ?? {};
  const composerPlaceholder = draftCopy?.composerPlaceholder ?? 'How can I help you today?';
  const folderActionLabel = draftCopy?.folderActionLabel ?? 'Choose folder';
  const sidePanelCopy = draftCopy?.sidePanel;
  const leadingStarterChips = starterChips?.leading;
  const preserveHelperChipsOnSelect = starterChips?.preserveOnSelect ?? false;
  const onPickParallelBranchFolder = parallelBranchActions?.onPickFolder;
  const onSetParallelBranchAudienceKeys = parallelBranchActions?.onSetAudienceKeys;
  const onSetParallelBranchCwd = parallelBranchActions?.onSetCwd;
  const onSetParallelBranchRuntimeSessionPolicy =
    parallelBranchActions?.onSetRuntimeSessionPolicy;
  const onSetParallelBranchPromptOverride = parallelBranchActions?.onSetPromptOverride;
  const onToggleParallelBranchWorkflowShape = parallelBranchActions?.onToggleWorkflowShape;
  const onQuickAddParallelBranchTemporaryParticipant =
    parallelBranchActions?.onQuickAddTemporaryParticipant;
  const resolvedSidePanelCopy = resolveChatNewChatDraftSidePanelCopy(sidePanelCopy);
  const sidePanelTitle = sidePanel?.title ?? resolvedSidePanelCopy.title;
  const buildDraftSidePanelSections =
    sidePanel?.buildSections ?? buildChatNewChatDraftSidePanelSections;
  const isParallelMode = (parallelTargets?.length ?? 0) >= 2;
  const [activeBranchIndex, setActiveBranchIndex] = useState(0);
  const [
    promptDetachConfirmBranchIndex,
    setPromptDetachConfirmBranchIndex,
  ] = useState<number | null>(null);
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
  const {
    supported: voiceInputSupported,
    listening: voiceInputListening,
    toggle: toggleVoiceInput,
    textareaRef,
  } = useVoiceInputComposer({
    value: composerDraft,
    onChange: onComposerChange,
    autoResize,
    disabled: isSubmittingFirstTurn,
  });
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
  function resolveParallelBranchAudienceKeys(branchIndex: number): string[] {
    const target = parallelTargets?.[branchIndex];
    if (!target) {
      return [];
    }
    return resolveBranchAudienceKeys(target, draftLeadContext);
  }

  function resolveParallelBranchWorkflowShape(
    branchIndex: number,
  ): DraftRoomWorkflowShape {
    const target = parallelTargets?.[branchIndex];
    if (!target) {
      return 'sequential';
    }
    return resolveBranchWorkflowShape(target, draftLeadContext);
  }

  function resolveParallelBranchPrompt(branchIndex: number): string {
    const target = parallelTargets?.[branchIndex];
    if (!target) {
      return composerDraft;
    }
    return resolveBranchPrompt(target, draftLeadContext);
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
      coverStorageKey={defaultRecipientCat.id}
      onAvatarSave={
        onCatAvatarSave
          ? (dataUrl) => onCatAvatarSave(defaultRecipientCat.id, dataUrl)
          : undefined
      }
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
        ref={textareaRef}
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
                {onTakeScreenshot ? (
                  <button
                    className="composerPlusMenuItem"
                    type="button"
                    disabled={isSubmittingFirstTurn || screenshotCaptureDisabled}
                    onClick={onTakeScreenshot}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 3.5l1-1h4l1 1h2a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h2z" />
                      <circle cx="8" cy="8.5" r="2.5" />
                    </svg>
                    Take screenshot
                  </button>
                ) : null}
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
          {voiceInputSupported ? (
            <button
              className={`composerPlusButton composerVoiceButton${voiceInputListening ? ' composerVoiceButtonActive' : ''}`}
              type="button"
              aria-label={voiceInputListening ? 'Stop voice input' : 'Start voice input'}
              aria-pressed={voiceInputListening}
              disabled={isSubmittingFirstTurn}
              onClick={toggleVoiceInput}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="6" y="2" width="4" height="8" rx="2" />
                <path d="M3 8a5 5 0 0 0 10 0" />
                <path d="M8 13v2" />
                <path d="M6 15h4" />
              </svg>
            </button>
          ) : null}
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
              disabled={
                (!composerDraft.trim() && draftFiles.length === 0)
                || isSubmittingFirstTurn
                || (isGroupDraft && draftParticipantCount < 2)
              }
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
      title={sidePanelTitle}
      activeSection={sidePanelSection}
      onSectionToggle={isSubmittingFirstTurn ? () => {} : switchSection}
      onClose={isSubmittingFirstTurn ? () => {} : () => setSidePanelOpen(false)}
      className="chatPaneSidePanel"
      sections={buildDraftSidePanelSections({
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
        draftRuntimeSessionPolicy,
        onDraftRuntimeSessionPolicyChange,
        onCloseSidePanel: () => setSidePanelOpen(false),
        sidePanelCopy: resolvedSidePanelCopy,
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

  function buildShadowCardContent(branchIndex: number, target: DraftParallelTarget): ReactNode {
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
    const branchCwd = target.cwd?.trim() || null;
    const canEditBranchPrompt = onSetParallelBranchPromptOverride != null;
    const branchPromptDetached = target.promptOverride != null && target.promptOverride !== '';
    const branchPromptValue = resolveParallelBranchPrompt(branchIndex);
    const showPromptDetachConfirm =
      promptDetachConfirmBranchIndex === branchIndex
      && canEditBranchPrompt
      && !branchPromptDetached;
    const branchPromptClassName = [
      'composerInput',
      canEditBranchPrompt && !branchPromptDetached ? 'composerInputPromptFollowsLead' : null,
      branchPromptDetached ? 'composerInputPromptDetached' : null,
    ].filter(Boolean).join(' ');

    return (
      <>
        <div className="composerHeaderRow">
          <div className="composerHeaderLeft">
            {surfaceTag}
            {branchCwd ? (
              <span className="composerCwdChip" data-tooltip={branchCwd}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                </svg>
                <span>{truncatePath(branchCwd)}</span>
                {onSetParallelBranchCwd ? (
                  <button
                    className="composerChipClose"
                    type="button"
                    disabled={isSubmittingFirstTurn}
                    onClick={() => onSetParallelBranchCwd(branchIndex, null)}
                    aria-label="Re-link branch folder to lead"
                  >
                    &times;
                  </button>
                ) : null}
              </span>
            ) : onPickParallelBranchFolder ? (
              <button
                type="button"
                className="composerFollowsLeadChip composerFollowsLeadChipClickable"
                disabled={isSubmittingFirstTurn}
                onClick={() => {
                  onPickParallelBranchFolder(branchIndex);
                  openSidePanelTo('cwd', { skipSectionAction: true });
                }}
                aria-label="Choose branch folder"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 3l-3 5 3 5" />
                  <path d="M3 8h10" />
                </svg>
                <span>Follows lead</span>
              </button>
            ) : (
              <span className="composerFollowsLeadChip">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 3l-3 5 3 5" />
                  <path d="M3 8h10" />
                </svg>
                <span>Follows lead</span>
              </span>
            )}
            <BranchRuntimeSessionPolicyControls
              branchIndex={branchIndex}
              target={target}
              draftCwd={draftCwd}
              draftRuntimeSessionPolicy={draftRuntimeSessionPolicy ?? null}
              isSubmittingFirstTurn={isSubmittingFirstTurn}
              onSetParallelBranchRuntimeSessionPolicy={onSetParallelBranchRuntimeSessionPolicy}
            />
          </div>
        </div>

        <form className="composerCard composerCardFresh parallelComposerAnchor" onSubmit={(event) => event.preventDefault()}>
          {branchPromptDetached ? (
            <div className="composerPromptDetachToolbar">
              <span className="composerBranchChip composerPromptOverrideChip">
                <span>Prompt detached</span>
                {onSetParallelBranchPromptOverride ? (
                  <button
                    className="composerChipClose"
                    type="button"
                    disabled={isSubmittingFirstTurn}
                    onClick={() => onSetParallelBranchPromptOverride(branchIndex, null)}
                    aria-label="Re-link branch prompt to lead"
                  >
                    &times;
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}
          <textarea
            className={branchPromptClassName}
            rows={1}
            placeholder={composerPlaceholder}
            value={branchPromptValue}
            disabled={isSubmittingFirstTurn}
            readOnly={!branchPromptDetached || !onSetParallelBranchPromptOverride}
            title={
              canEditBranchPrompt && !branchPromptDetached
                ? 'Click to detach this branch prompt'
                : undefined
            }
            aria-label={
              canEditBranchPrompt && !branchPromptDetached
                ? 'Open branch prompt detach confirmation'
                : undefined
            }
            onClick={
              canEditBranchPrompt && !branchPromptDetached
                ? () => setPromptDetachConfirmBranchIndex(branchIndex)
                : undefined
            }
            onChange={
              branchPromptDetached && onSetParallelBranchPromptOverride
                ? (event) => {
                    onSetParallelBranchPromptOverride(branchIndex, event.currentTarget.value);
                    autoResize(event.currentTarget);
                  }
                : undefined
            }
          />
          {showPromptDetachConfirm ? (
            <div className="composerPromptDetachConfirm">
              <span>Detach this branch prompt from the lead?</span>
              <button
                type="button"
                className="composerPromptDetachButton"
                disabled={isSubmittingFirstTurn}
                onClick={() => {
                  onSetParallelBranchPromptOverride?.(branchIndex, composerDraft);
                  setPromptDetachConfirmBranchIndex(null);
                }}
              >
                Detach prompt
              </button>
              <button
                type="button"
                className="composerPromptKeepLinkedButton"
                disabled={isSubmittingFirstTurn}
                onClick={() => setPromptDetachConfirmBranchIndex(null)}
              >
                Keep linked
              </button>
            </div>
          ) : null}
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
        id: createDraftCompareShadowCardId(branchIndex, target),
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
