import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";

import {
  ConfirmDialog,
  useConfirmDialog,
} from "../../../design/components/ConfirmDialog";
import type { PlatformSurfaceId } from "../../../shared/platform-contract.js";
import { platformSurfaceRoutePrefix } from "../../../core/platformSurface.js";
import {
  clearBusyState,
  createCatBusyState,
  type WorkspaceBusyState,
} from "../../../shared/workspaceBusy.js";
import type { AppShellPayload } from "../api/workspaceContracts.js";
import type { AddCatPanelProps } from "./components/AddCatPanel.js";
import type { FolderBrowserContentProps } from "./components/FolderBrowser.js";
import type { ExecutionTargetValue } from "./components/ExecutionTarget.js";
import type { NewChatDraftProps as ChatNewChatDraftProps } from "./components/ChatNewChatDraft.js";
import type { ChatViewProps } from "./components/chat-view/ChatView.js";
import {
  activateChatChannel,
  relayParallelChatMessage,
  resetChannelContinuity,
  updateCatProfile,
  updateChannelParticipantApi,
  updateChannelPendingExecutionTarget,
  updateNewChatDefaultsPreference,
} from "./api/index.js";
import {
  emptyCatForm,
  pickGreeting,
  presentChannelTitle,
  type CatFormState,
  type SelectedChannelView,
  type Surface,
} from "./workspaceChatUtils.js";
import {
  deriveAppRouteState,
  deriveAppViewState,
  type AppLoadState,
} from "./workspaceAppViewState.js";
import {
  ProductAppStateBoundary,
} from "./ProductRendererFrame.js";
import { ProductReadyShell } from "./ProductReadyShell.js";
import { useAppChrome } from "./hooks/useAppChrome.js";
import { useFolderBrowser } from "./hooks/useFolderBrowser.js";
import { useLiveIndicator } from "./hooks/useLiveIndicator.js";
import { setBrowserLiveTraceEnabled } from "../../../shared/liveTrace.js";
import { useWorkspaceDraftCatState } from "./hooks/useWorkspaceDraftCatState.js";
import { useWorkspaceDraftParticipantState } from "./hooks/useWorkspaceDraftParticipantState.js";
import { useWorkspaceAppTransientState } from "./hooks/useWorkspaceAppTransientState.js";
import { useWorkspaceLocationState } from "./hooks/useWorkspaceLocationState.js";
import { useWorkspaceExecutionTargetState } from "./hooks/useWorkspaceExecutionTargetState.js";
import { useOnGenericDraftRouteEntry } from "./hooks/useOnGenericDraftRouteEntry.js";
import { useWorkspaceParallelDraft } from "./hooks/useWorkspaceParallelDraft.js";
import { useProductChannelDocumentTitle } from "./hooks/useProductChannelDocumentTitle.js";
import { useOperatorLoop } from "./hooks/useOperatorLoop.js";
import {
  useWorkspaceDirectLaneModelSave,
  useWorkspaceResetChannelContinuity,
  useWorkspaceResumeChannel,
} from "./hooks/useWorkspaceAppShellChannelActions.js";
import { useWorkspaceChannelParticipantUpdate } from "./hooks/useWorkspaceChannelParticipantUpdate.js";
import { useWorkspaceCompareRelay } from "./hooks/useWorkspaceCompareRelay.js";
import { usePublishReadyPayload } from "./hooks/usePublishReadyPayload.js";
import { useWorkspaceAppDraftUiActions } from "./hooks/useWorkspaceAppDraftUiActions.js";
import { useWorkspaceAppNavigationActions } from "./hooks/useWorkspaceAppNavigationActions.js";
import { useWorkspaceAppShellRouting } from "./hooks/useWorkspaceAppShellRouting.js";
import { useWorkspaceChatEvents } from "./hooks/useWorkspaceChatEvents.js";
import { useWorkspaceCatAssignmentActions } from "./hooks/useWorkspaceCatAssignmentActions.js";
import { createUseComposerSubmit } from "./hooks/useWorkspaceComposerSubmit.js";
import { useWorkspaceGovernanceActions } from "./hooks/useWorkspaceGovernanceActions.js";
import {
  applyChannelSubscriptionPatchToLoadState,
  applyChannelSubscriptionSnapshotToLoadState,
  type ChannelSubscriptionPatch,
  type ChannelSubscriptionState,
} from "./entitySubscriptionChannelDispatcher.js";
import { useEntitySubscription } from "./entitySubscriptionHub.js";
import {
  createDefaultRuntimeSessionPolicy,
  type RuntimeSessionPolicy,
} from "../../../shared/runtimeSessionPolicy.js";
import {
  buildFolderBrowserContentProps,
  resolveVisibleChatChannel,
  resolveVisibleChatChannelId,
} from "./appShellPresentation.js";
import {
  buildCrossSurfaceNavigationMatchPath,
  peekCrossSurfaceNavigationHandoffForMatch,
  peekCrossSurfaceNavigationSnapshot,
} from "./crossSurfaceNavigationHandoff.js";
import type { PendingDispatchHydration } from "./hooks/useComposerRequestLifecycle.js";
import {
  createInitialGroupParticipants,
  createNextGroupTemporaryParticipant,
  createNextParallelTarget,
  createDraftTemporaryParticipant,
  reconcileDraftAudienceKeysAfterParticipantRemoval,
  resolveGenericDraftTemporaryParticipants,
  syncLeadDraftTemporaryParticipantWithTarget,
  type DraftTemporaryParticipant,
} from "./draftChatUtils.js";
import { resolveActiveChannelAudienceState } from "./composerMessageMetadata.js";
import { isAdvancedDraftControlsEnabled } from "../advancedDraftControls.js";
import {
} from "../channelPaths.js";

type ChatSurfaceProps = Omit<ChatViewProps, "payload" | "selectedChannel">;

type DraftSurfaceProps = Omit<
  ChatNewChatDraftProps,
  "payload" | "onOpenAddCat" | "onDraftDefaultRecipientChange" | "allowAddCat"
> & {
  greeting: string;
};

type DraftFolderBrowseTarget =
  | { kind: "lead" }
  | { kind: "parallel-branch"; index: number };

export interface WorkspaceProductAppRoutesProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView | null;
  directLaneChannel: SelectedChannelView | null;
  showDirectLaneBoot: boolean;
  feedback: string;
  busy: WorkspaceBusyState;
  addCatOpen: boolean;
  chatSurfaceProps: ChatSurfaceProps;
  draftSurfaceProps: DraftSurfaceProps;
  addCatPanelProps: Omit<AddCatPanelProps, "busy" | "feedback">;
  folderBrowserProps: FolderBrowserContentProps;
  onToggleAddCat: () => void;
  onOpenDraftAddCat: () => void;
  onChangeDraftDefaultRecipient: (catId: string | null) => void;
}

export interface WorkspaceProductSidebarProps {
  payload: AppShellPayload;
  sidebarOpen: boolean;
  accountMenuOpen: boolean;
  overflowMenuOpenId: string | null;
  busy: WorkspaceBusyState;
  surface: Surface;
  shellSurface: WorkspaceProductShellSurface;
  routeChannelId: string | null;
  accountMenuRef: RefObject<HTMLDivElement>;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenChatsOverview: () => void;
  onStartNewChat: () => void;
  onStartNewGroupChat?: () => void;
  onStartNewParallelChat?: () => void;
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onRenameChannel: (channelId: string, title: string) => void;
  onArchiveCat: (catId: string) => void;
  onAccountMenuToggle: () => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onNavigateSettings: () => void;
  onNavigateRuntime: () => void;
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
  navigate: NavigateFunction;
}

export type WorkspaceProductShellSurface = "work" | "code";

export interface WorkspaceProductAppConfig {
  productName: "Work" | "Code";
  shellSurface: WorkspaceProductShellSurface;
  supportsStructuredDraftModes?: boolean;
  BootShell: ComponentType;
  AppRoutesComponent: ComponentType<WorkspaceProductAppRoutesProps>;
  renderSidebar: (props: WorkspaceProductSidebarProps) => ReactNode;
}

export function createWorkspaceProductApp({
  productName,
  shellSurface,
  supportsStructuredDraftModes = false,
  BootShell,
  AppRoutesComponent,
  renderSidebar,
}: WorkspaceProductAppConfig) {
  const chatPrefix = platformSurfaceRoutePrefix(shellSurface);
  const useComposerSubmit =
    createUseComposerSubmit<ExecutionTargetValue>(chatPrefix);

  return function WorkspaceProductApp() {
    const navigate = useNavigate();
    const {
      location,
      settingsMode,
      routeChannelId,
      showingNewChatDraft,
      newChatPreset,
      draftDefaultRecipientCatId,
      showingMyCatDirectLane,
    } = useWorkspaceLocationState(chatPrefix);
    const effectiveNewChatPreset = supportsStructuredDraftModes ? newChatPreset : "default";
    const showingParallelChatDraft = effectiveNewChatPreset === "parallel";
    const showingGenericNewChatDraft = !draftDefaultRecipientCatId;
    const currentNavigationPath = useMemo(
      () => buildCrossSurfaceNavigationMatchPath(location.pathname, location.search),
      [location.pathname, location.search],
    );
    const initialWarmPayload = useMemo(
      () => peekCrossSurfaceNavigationSnapshot({
        surface: shellSurface,
        path: currentNavigationPath,
      }),
      [currentNavigationPath, shellSurface],
    );
    const pendingDispatchHydration = useMemo<PendingDispatchHydration | null>(() => {
      if (!initialWarmPayload) {
        return null;
      }
      const bundle = peekCrossSurfaceNavigationHandoffForMatch({
        surface: shellSurface,
        path: currentNavigationPath,
      });
      if (!bundle?.optimisticState?.pendingExecution) {
        return null;
      }
      const { entityKind, entityId } = bundle.destination;
      if (entityKind === 'channel') {
        const channelId =
          bundle.optimisticState.selectedChannelId
          ?? initialWarmPayload.chat.selectedChannelId
          ?? entityId
          ?? null;
        return channelId ? { kind: 'channel', channelId } : null;
      }
      if (entityKind === 'parallel-group') {
        const groupId = entityId;
        const group = initialWarmPayload.chat.parallelChatGroups.find(
          (candidate) => candidate.id === groupId,
        );
        if (!group || group.memberChannelIds.length === 0) {
          return null;
        }
        const activeChannelId =
          bundle.optimisticState.selectedChannelId
          ?? initialWarmPayload.chat.selectedChannelId
          ?? group.memberChannelIds[0];
        return {
          kind: 'parallel',
          groupId,
          activeChannelId,
          channelIds: group.memberChannelIds,
        };
      }
      return null;
    }, [currentNavigationPath, initialWarmPayload, shellSurface]);

    const {
      state,
      setState,
      composerDraft,
      setComposerDraft,
      catForm,
      setCatForm,
      busy,
      setBusy,
      feedback,
      setFeedback,
      addCatTab,
      setAddCatTab,
      greeting,
      draftCwd,
      setDraftCwd,
      draftFiles,
      setDraftFiles,
      channelFiles,
      setChannelFiles,
    } = useWorkspaceAppTransientState<AppLoadState, CatFormState>({
      initialState: initialWarmPayload
        ? { status: "ready", payload: initialWarmPayload }
        : { status: "loading" },
      createEmptyCatForm: emptyCatForm,
      pickGreeting,
    });
    const draftFolderBrowseTargetRef = useRef<DraftFolderBrowseTarget>({ kind: "lead" });
    const parallelBranchCwdSetterRef = useRef<(
      (index: number, cwd: string | null) => void
    ) | null>(null);
    const applyDraftFolderSelection = useCallback((path: string): void => {
      const target = draftFolderBrowseTargetRef.current;
      if (target.kind === "parallel-branch") {
        parallelBranchCwdSetterRef.current?.(target.index, path);
        return;
      }
      setDraftCwd(path);
    }, [setDraftCwd]);
    const {
      draftCatIds,
      setDraftCatIds,
      draftHighlightedCatId,
      setDraftHighlightedCatId,
      draftCatExecutionTargetOverrides,
      setDraftCatExecutionTargetOverrides,
      onToggleDraftCat,
      onDraftCatExecutionTargetOverride,
      resetDraftCats,
    } = useWorkspaceDraftCatState();
    const maxDraftGroupParticipants =
      state.status === "ready"
        ? (state.payload.chat.capabilities.maxChatParticipants ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
    const maxDraftAudienceParticipants =
      state.status === "ready"
        ? (state.payload.chat.capabilities.maxAudienceParticipants ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
    const maxParallelChats =
      state.status === "ready"
        ? (state.payload.chat.capabilities.maxParallelChats ?? 3)
        : 3;
    const [draftWorkflowShape, setDraftWorkflowShape] = useState<"sequential" | "concurrent">(
      "sequential",
    );
    const [draftSessionPolicy, setDraftSessionPolicy] = useState<RuntimeSessionPolicy>(
      () => createDefaultRuntimeSessionPolicy(),
    );
    const [draftAudienceKeys, setDraftAudienceKeys] = useState<string[] | null>(null);
    const [activeWorkflowShape, setActiveWorkflowShape] = useState<"sequential" | "concurrent">(
      "sequential",
    );
    const [activeAudienceKeys, setActiveAudienceKeys] = useState<string[] | null>(null);
    const [compareSendScope, setCompareSendScope] = useState<'all_members' | 'active_only'>(
      'all_members',
    );
    const {
      draftTemporaryParticipants,
      setDraftTemporaryParticipants,
      draftParticipants,
      onAddDraftTemporaryParticipant,
      onRemoveDraftTemporaryParticipant,
      onUpdateDraftTemporaryParticipant,
    } = useWorkspaceDraftParticipantState({
      state,
      draftDefaultRecipientCatId,
      draftCatIds,
      maxDraftGroupParticipants,
    });
    const {
      dialog: appDialog,
      confirm: appConfirm,
      handleClose: appHandleClose,
    } = useConfirmDialog();

    const publishReadyPayload = usePublishReadyPayload<AppShellPayload>(setState);

    const onDirectLaneModelSave =
      useWorkspaceDirectLaneModelSave<AppShellPayload>({
        updateCatProfile,
        publishReadyPayload,
      });

    const {
      accountMenuOpen,
      setAccountMenuOpen,
      sidebarOpen,
      overflowMenuOpenId,
      setOverflowMenuOpenId,
      plusMenuOpen,
      setPlusMenuOpen,
      addCatOpen,
      setAddCatOpen,
      channelPlusMenuOpen,
      setChannelPlusMenuOpen,
      accountMenuRef,
      plusMenuRef,
      addCatPanelRef,
      fileInputRef,
      channelPlusMenuRef,
      channelFileInputRef,
      autoResize,
      onToggleSidebar,
      onCollapsedSidebarClick,
    } = useAppChrome();
    const {
      browseFolder,
      folderBrowseCurrentPath,
      folderBrowseEntries,
      folderBrowseError,
      folderBrowseLoading,
      folderBrowseParentPath,
      folderBrowsePath,
      openFolderBrowser,
      selectCurrentFolder,
      setFolderBrowsePath,
    } = useFolderBrowser({
      onSelectPath: applyDraftFolderSelection,
      surface: shellSurface,
      directLaneCatId: null,
      initialPreferences:
        state.status === "ready"
          ? state.payload.chat.folderBrowsePreferences
          : undefined,
    });
    const openLeadFolderBrowser = useCallback(async (path?: string | null): Promise<void> => {
      draftFolderBrowseTargetRef.current = { kind: "lead" };
      await openFolderBrowser(path);
    }, [openFolderBrowser]);
    const {
      toggleAddCatPanel,
      toggleChannelPlusMenu,
      openChannelFilePicker,
      toggleDraftPlusMenu,
      openDraftFilePicker,
      openDraftFolderPicker,
      openDraftAddCatPanel,
      changeDraftDefaultRecipient,
    } = useWorkspaceAppDraftUiActions({
      addCatOpen,
      channelPlusMenuOpen,
      plusMenuOpen,
      draftCwd,
      draftDefaultRecipientCatId,
      navigate,
      chatPrefix,
      emptyCatForm,
      setAddCatOpen,
      setAddCatTab,
      setFeedback,
      setCatForm,
      setPlusMenuOpen,
      setChannelPlusMenuOpen,
      channelFileInputRef,
      fileInputRef,
      openFolderBrowser: openLeadFolderBrowser,
    });
    const onArchiveCat = useCallback(
      async (catId: string): Promise<void> => {
        const catName =
          state.status === "ready"
            ? (state.payload.chat.cats.find((cat) => cat.id === catId)?.name ??
              "this cat")
            : "this cat";
        const confirmed = await appConfirm({
          title: "Archive cat",
          message: `Archive "${catName}"? Telegram bot bindings will be removed, but you can still recover the cat later from Settings.`,
          confirmLabel: "Archive",
        });
        if (!confirmed) {
          return;
        }

        setBusy(createCatBusyState('archive', catId));
        try {
          const payload = await updateCatProfile(catId, { archive: true });
          setState({ status: "ready", payload });
        } catch (error) {
          setFeedback(
            error instanceof Error ? error.message : "Failed to archive cat.",
          );
        } finally {
          setBusy(clearBusyState());
        }
      },
      [appConfirm, state],
    );

    const {
      readyPayload,
      readyChat,
      readySelectedChannel,
      selectedChannelId,
      selectedChannelViewId,
      selectedChannelEntryLifecycle,
      routeChannelExists,
      routeChannelTitle,
      routeDirectLaneSummary,
      selectedChannel,
      selectedDirectLane,
      operatorRefreshKey,
    } = deriveAppRouteState({
      state,
      routeChannelId,
      draftDefaultRecipientCatId,
      showingMyCatDirectLane,
    });
    const { operatorState, setOperatorState } = useOperatorLoop(
      readyPayload,
      operatorRefreshKey,
    );
    const advancedDraftControlsEnabled = readyPayload
      ? isAdvancedDraftControlsEnabled(readyPayload.chat.advancedDraftControls, shellSurface)
      : false;
    const {
      draftExecutionTarget,
      setDraftExecutionTarget,
      soloChannelExecutionTarget,
      setSoloChannelExecutionTarget,
    } = useWorkspaceExecutionTargetState({
      state,
      readyChat,
      readySelectedChannel,
      setState,
      setFeedback,
      updateNewChatDefaultsPreference,
      updateChannelPendingExecutionTarget,
    });
    const draftEntryKind: "solo" | "group" | "direct" = showingMyCatDirectLane
      ? "direct"
      : supportsStructuredDraftModes
        && (
          effectiveNewChatPreset === "group"
          || draftParticipants.participantCatIds.length > 0
          || draftTemporaryParticipants.length > 0
        )
        ? "group"
        : "solo";
    const {
      draftParallelChatTargets,
      resetDraftParallelChatTargets,
      onDraftParallelChatTargetChange,
      onAddDraftParallelChatTarget,
      onRemoveDraftParallelChatTarget,
      onSetDraftParallelBranchAudienceKeys,
      onSetDraftParallelBranchCwd,
      onSetDraftParallelBranchRuntimeSessionPolicy,
      onToggleDraftParallelBranchWorkflowShape,
    } = useWorkspaceParallelDraft({
      draftExecutionTarget,
      maxParallelChats,
      seedCompareTarget: showingParallelChatDraft,
    });
    useEffect(() => {
      parallelBranchCwdSetterRef.current = onSetDraftParallelBranchCwd;
    }, [onSetDraftParallelBranchCwd]);
    const openDraftParallelBranchFolderPicker = useCallback((branchIndex: number): void => {
      draftFolderBrowseTargetRef.current = { kind: "parallel-branch", index: branchIndex };
      const branchCwd = draftParallelChatTargets[branchIndex]?.cwd ?? draftCwd;
      void openFolderBrowser(branchCwd);
      setPlusMenuOpen(false);
    }, [draftCwd, draftParallelChatTargets, openFolderBrowser, setPlusMenuOpen]);
    const hasVisibleParallelDraftTargets = draftParallelChatTargets.length > 1;
    const draftParallelTargetAudienceKeys = useMemo(
      () => draftParallelChatTargets.map((target) => target.audienceKeys ?? []),
      [draftParallelChatTargets],
    );
    const draftParallelTargetWorkflowShapes = useMemo(
      () => draftParallelChatTargets.map((target) => target.workflowShape ?? "sequential"),
      [draftParallelChatTargets],
    );
    const seedDraftGroupParticipants = useCallback(
      () => createInitialGroupParticipants(draftExecutionTarget, maxDraftGroupParticipants),
      [
        draftExecutionTarget.instance,
        draftExecutionTarget.model,
        draftExecutionTarget.modelSelection,
        draftExecutionTarget.provider,
        maxDraftGroupParticipants,
      ],
    );
    const draftParticipantKeys = useMemo(
      () => [
        ...draftParticipants.participantCatIds.map((catId) => `cat:${catId}`),
        ...draftTemporaryParticipants.map((participant) => `temp:${participant.participantId}`),
      ],
      [draftParticipants.participantCatIds, draftTemporaryParticipants],
    );
    const appendAudienceKeyWithinLimit = useCallback((
      currentKeys: readonly string[],
      nextKey: string,
    ): string[] => {
      const normalized = currentKeys.filter((key, index, source) =>
        source.indexOf(key) === index);
      if (normalized.includes(nextKey)) {
        return normalized;
      }
      if (
        Number.isFinite(maxDraftAudienceParticipants)
        && normalized.length >= maxDraftAudienceParticipants
      ) {
        return normalized;
      }
      return [...normalized, nextKey];
    }, [maxDraftAudienceParticipants]);
    const resolveParallelAudienceSeed = useCallback((): string[] => {
      const primaryBranchAudience = draftParallelTargetAudienceKeys[0];
      if (primaryBranchAudience && primaryBranchAudience.length > 0) {
        return [...primaryBranchAudience];
      }
      if (draftAudienceKeys && draftAudienceKeys.length > 0) {
        return [...draftAudienceKeys];
      }
      if (!Number.isFinite(maxDraftAudienceParticipants)) {
        return [...draftParticipantKeys];
      }
      return draftParticipantKeys.slice(0, maxDraftAudienceParticipants);
    }, [
      draftAudienceKeys,
      draftParallelTargetAudienceKeys,
      draftParticipantKeys,
      maxDraftAudienceParticipants,
    ]);
    const onQuickAddDraftTemporaryParticipant = useCallback(() => {
      if (!supportsStructuredDraftModes || state.status !== "ready") {
        return;
      }

      const visibleCatNames = draftParticipants.participantCatIds
        .map((catId) => state.payload.chat.cats.find((cat) => cat.id === catId)?.name ?? "")
        .filter((name) => name.trim().length > 0);
      let addedParticipantId: string | null = null;

      setDraftTemporaryParticipants((current) => {
        if (draftParticipants.participantCatIds.length + current.length >= maxDraftGroupParticipants) {
          return current;
        }

        const nextParticipant =
          current.length === 0 && draftParticipants.participantCatIds.length === 0
            ? createDraftTemporaryParticipant({
                provider: draftExecutionTarget.provider,
                instance: draftExecutionTarget.instance,
                model: draftExecutionTarget.model,
                modelSelection: draftExecutionTarget.modelSelection,
                takenNames: [...visibleCatNames, ...current.map((participant) => participant.name)],
                randomUUID: () =>
                  globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
              })
            : createNextGroupTemporaryParticipant({
                baseProvider: draftExecutionTarget.provider,
                existingParticipants: current,
                takenNames: [...visibleCatNames, ...current.map((participant) => participant.name)],
                randomUUID: () =>
                  globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
              });
        addedParticipantId = nextParticipant.participantId;
        return [...current, nextParticipant];
      });

      if (!addedParticipantId) {
        return;
      }

      setDraftAudienceKeys((current) => {
        const visibleCatKeys = draftParticipants.participantCatIds.map((catId) => `cat:${catId}`);
        const currentParticipantKeys = [
          ...visibleCatKeys,
          ...draftTemporaryParticipants.map((participant) => `temp:${participant.participantId}`),
        ];
        const nextParticipantKey = `temp:${addedParticipantId}`;
        const baseAudienceKeys = current ?? currentParticipantKeys;
        const normalizedAudienceKeys = baseAudienceKeys.filter((key, index, source) =>
          source.indexOf(key) === index && currentParticipantKeys.includes(key));

        if (
          Number.isFinite(maxDraftAudienceParticipants)
          && normalizedAudienceKeys.length >= maxDraftAudienceParticipants
        ) {
          return normalizedAudienceKeys;
        }

        return [...normalizedAudienceKeys, nextParticipantKey];
      });
    }, [
      draftExecutionTarget.instance,
      draftExecutionTarget.model,
      draftExecutionTarget.modelSelection,
      draftExecutionTarget.provider,
      draftParticipants.participantCatIds,
      draftTemporaryParticipants,
      maxDraftAudienceParticipants,
      maxDraftGroupParticipants,
      setDraftTemporaryParticipants,
      state,
      supportsStructuredDraftModes,
    ]);
    const onToggleDraftCatWithAudienceSync = useCallback((catId: string) => {
      if (!supportsStructuredDraftModes) {
        onToggleDraftCat(catId);
        return;
      }

      const isRemoving = draftParticipants.participantCatIds.includes(catId);
      if (
        !isRemoving
        && draftParticipants.participantCatIds.length + draftTemporaryParticipants.length
          >= maxDraftGroupParticipants
      ) {
        return;
      }
      onToggleDraftCat(catId);

      if (!isRemoving) {
        const addedKey = `cat:${catId}`;
        setDraftAudienceKeys((current) => {
          const baseKeys = current ?? draftParticipantKeys;
          const normalized = baseKeys.filter((key, index, source) => source.indexOf(key) === index);
          if (
            Number.isFinite(maxDraftAudienceParticipants)
            && normalized.length >= maxDraftAudienceParticipants
          ) {
            return normalized;
          }
          return [...normalized, addedKey];
        });
        return;
      }

      const removedParticipantKey = `cat:${catId}`;
      const nextParticipantKeys = draftParticipantKeys.filter((key) => key !== removedParticipantKey);
      setDraftAudienceKeys((current) =>
        reconcileDraftAudienceKeysAfterParticipantRemoval({
          draftAudienceKeys: current,
          previousParticipantKeys: draftParticipantKeys,
          nextParticipantKeys,
          removedParticipantKey,
          maxAudienceParticipants: maxDraftAudienceParticipants,
        }));
      if (draftParallelChatTargets.length >= 2) {
        draftParallelTargetAudienceKeys.forEach((branchAudienceKeys, index) => {
          if (!branchAudienceKeys.includes(removedParticipantKey)) {
            return;
          }
          onSetDraftParallelBranchAudienceKeys(index, reconcileDraftAudienceKeysAfterParticipantRemoval({
            draftAudienceKeys: branchAudienceKeys,
            previousParticipantKeys: draftParticipantKeys,
            nextParticipantKeys,
            removedParticipantKey,
            maxAudienceParticipants: maxDraftAudienceParticipants,
          }) ?? []);
        });
      }
    }, [
      draftParticipantKeys,
      draftParticipants.participantCatIds,
      draftParallelTargetAudienceKeys,
      draftParallelChatTargets.length,
      draftTemporaryParticipants.length,
      maxDraftAudienceParticipants,
      maxDraftGroupParticipants,
      onToggleDraftCat,
      onSetDraftParallelBranchAudienceKeys,
      supportsStructuredDraftModes,
    ]);
    const onRemoveDraftTemporaryParticipantWithAudienceSync = useCallback((participantId: string) => {
      if (!supportsStructuredDraftModes) {
        onRemoveDraftTemporaryParticipant(participantId);
        return;
      }

      const removedParticipantKey = `temp:${participantId}`;
      const nextParticipantKeys = draftParticipantKeys.filter((key) => key !== removedParticipantKey);
      onRemoveDraftTemporaryParticipant(participantId);
      setDraftAudienceKeys((current) =>
        reconcileDraftAudienceKeysAfterParticipantRemoval({
          draftAudienceKeys: current,
          previousParticipantKeys: draftParticipantKeys,
          nextParticipantKeys,
          removedParticipantKey,
          maxAudienceParticipants: maxDraftAudienceParticipants,
        }));
      if (draftParallelChatTargets.length >= 2) {
        draftParallelTargetAudienceKeys.forEach((branchAudienceKeys, index) => {
          if (!branchAudienceKeys.includes(removedParticipantKey)) {
            return;
          }
          onSetDraftParallelBranchAudienceKeys(index, reconcileDraftAudienceKeysAfterParticipantRemoval({
            draftAudienceKeys: branchAudienceKeys,
            previousParticipantKeys: draftParticipantKeys,
            nextParticipantKeys,
            removedParticipantKey,
            maxAudienceParticipants: maxDraftAudienceParticipants,
          }) ?? []);
        });
      }
    }, [
      draftParticipantKeys,
      draftParallelTargetAudienceKeys,
      draftParallelChatTargets.length,
      maxDraftAudienceParticipants,
      onRemoveDraftTemporaryParticipant,
      onSetDraftParallelBranchAudienceKeys,
      supportsStructuredDraftModes,
    ]);
    const onAddDraftTemporaryParticipantWithAudienceSync = useCallback((
      participant: Omit<DraftTemporaryParticipant, "participantId"> & {
        participantId?: string | null;
      },
    ) => {
      onAddDraftTemporaryParticipant(participant);
      if (!supportsStructuredDraftModes) {
        return;
      }

      const isNewLeadParticipant =
        showingNewChatDraft
        && effectiveNewChatPreset === "group"
        && draftParticipants.participantCatIds.length === 0
        && draftTemporaryParticipants.length === 0;
      if (isNewLeadParticipant && participant.provider.trim()) {
        setDraftExecutionTarget({
          provider: participant.provider.trim(),
          model: participant.model?.trim() || null,
          instance: participant.instance?.trim() || null,
          modelSelection: participant.modelSelection ?? null,
        });
      }
      const addedKey = `temp:${participant.participantId ?? ""}`;
      if (!addedKey || addedKey === "temp:") {
        return;
      }
      setDraftAudienceKeys((current) => {
        const baseKeys = current ?? draftParticipantKeys;
        const normalized = baseKeys.filter((key, index, source) => source.indexOf(key) === index);
        if (
          Number.isFinite(maxDraftAudienceParticipants)
          && normalized.length >= maxDraftAudienceParticipants
        ) {
          return normalized;
        }
        return [...normalized, addedKey];
      });
    }, [
      draftParticipantKeys,
      draftParticipants.participantCatIds.length,
      draftTemporaryParticipants.length,
      effectiveNewChatPreset,
      maxDraftAudienceParticipants,
      onAddDraftTemporaryParticipant,
      setDraftExecutionTarget,
      showingNewChatDraft,
      supportsStructuredDraftModes,
    ]);
    const onQuickAddDraftTemporaryParticipantToBranch = useCallback((branchIndex: number | null = null) => {
      if (!supportsStructuredDraftModes || state.status !== "ready") {
        return;
      }

      const isBranchScoped = branchIndex !== null && draftParallelChatTargets.length >= 2;

      if (isBranchScoped) {
        // Parallel branch: each branch is its own sub-chat, so
        // maxChatParticipants caps branch membership. The shared pool
        // can legitimately grow past that total when multiple
        // branches each hold their own members.
        const branchMembers = draftParallelTargetAudienceKeys[branchIndex] ?? [];
        if (
          Number.isFinite(maxDraftGroupParticipants)
          && branchMembers.length >= maxDraftGroupParticipants
        ) {
          return;
        }
      } else if (
        draftParticipants.participantCatIds.length + draftTemporaryParticipants.length >= maxDraftGroupParticipants
      ) {
        return;
      }

      // Build the temp synchronously so its id is available for the
      // audience update below. Creating it inside the setter defers
      // execution to React's commit phase, which runs after this
      // callback returns — the closure read afterwards would always
      // miss the freshly-generated id.
      const visibleCatNames = draftParticipants.participantCatIds
        .map((catId) => state.payload.chat.cats.find((cat) => cat.id === catId)?.name ?? "")
        .filter((name) => name.trim().length > 0);
      const takenNames = [
        ...visibleCatNames,
        ...draftTemporaryParticipants.map((participant) => participant.name),
      ];
      const nextParticipant =
        draftTemporaryParticipants.length === 0
        && draftParticipants.participantCatIds.length === 0
          ? createDraftTemporaryParticipant({
              provider: draftExecutionTarget.provider,
              instance: draftExecutionTarget.instance,
              model: draftExecutionTarget.model,
              modelSelection: draftExecutionTarget.modelSelection,
              takenNames,
              randomUUID: () =>
                globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
            })
          : createNextGroupTemporaryParticipant({
              baseProvider: draftExecutionTarget.provider,
              existingParticipants: draftTemporaryParticipants,
              takenNames,
              randomUUID: () =>
                globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
            });
      const nextParticipantKey = `temp:${nextParticipant.participantId}`;

      setDraftTemporaryParticipants((current) => [...current, nextParticipant]);

      if (isBranchScoped) {
        // Branch membership list — dedupe + append. Bypasses
        // appendAudienceKeyWithinLimit because that helper caps at
        // maxDraftAudienceParticipants, which is the chip-selection
        // cap, not the per-branch membership cap
        // (maxDraftGroupParticipants).
        const currentBranchKeys = draftParallelTargetAudienceKeys[branchIndex] ?? [];
        const dedupedKeys = currentBranchKeys.filter((key, index, source) =>
          source.indexOf(key) === index);
        const nextBranchKeys = dedupedKeys.includes(nextParticipantKey)
          ? dedupedKeys
          : [...dedupedKeys, nextParticipantKey];
        onSetDraftParallelBranchAudienceKeys(branchIndex, nextBranchKeys);
        return;
      }

      setDraftAudienceKeys((current) => {
        const visibleCatKeys = draftParticipants.participantCatIds.map((catId) => `cat:${catId}`);
        const currentParticipantKeys = [
          ...visibleCatKeys,
          ...draftTemporaryParticipants.map((participant) => `temp:${participant.participantId}`),
        ];
        const baseAudienceKeys = current ?? currentParticipantKeys;
        const normalizedAudienceKeys = baseAudienceKeys.filter((key, index, source) =>
          source.indexOf(key) === index && currentParticipantKeys.includes(key));

        if (
          Number.isFinite(maxDraftAudienceParticipants)
          && normalizedAudienceKeys.length >= maxDraftAudienceParticipants
        ) {
          return normalizedAudienceKeys;
        }

        return [...normalizedAudienceKeys, nextParticipantKey];
      });
    }, [
      appendAudienceKeyWithinLimit,
      draftExecutionTarget.instance,
      draftExecutionTarget.model,
      draftExecutionTarget.modelSelection,
      draftExecutionTarget.provider,
      draftParallelTargetAudienceKeys,
      draftParallelChatTargets.length,
      draftParticipants.participantCatIds,
      draftTemporaryParticipants,
      maxDraftAudienceParticipants,
      maxDraftGroupParticipants,
      onSetDraftParallelBranchAudienceKeys,
      setDraftAudienceKeys,
      setDraftTemporaryParticipants,
      state,
      supportsStructuredDraftModes,
    ]);
    const onDraftParallelBranchGroupAddButtonClick = useCallback((branchIndex: number): void => {
      if (!supportsStructuredDraftModes || state.status !== "ready") {
        return;
      }

      // Empty-draft bootstrap: no cats and no temps anywhere — seed
      // the global pool with 2 participants and attribute them to
      // this branch.
      if (draftParticipants.participantCatIds.length === 0 && draftTemporaryParticipants.length === 0) {
        const seededParticipants = seedDraftGroupParticipants();
        const seededKeys = seededParticipants.map((participant) => `temp:${participant.participantId}`);
        setDraftTemporaryParticipants((current) => current.length === 0 ? seededParticipants : current);
        onSetDraftParallelBranchAudienceKeys(branchIndex, seededKeys);
        return;
      }

      // Branch bootstrap: pool is non-empty but THIS branch is empty.
      // The first +collaborate click on an empty shadow should jump
      // straight to 2 members so the roster becomes visible (roster
      // hides itself at length <= 1). Matches the lead-row bootstrap.
      const currentBranchKeys = draftParallelTargetAudienceKeys[branchIndex] ?? [];
      if (currentBranchKeys.length === 0) {
        const branchTarget = draftParallelChatTargets[branchIndex] ?? draftExecutionTarget;
        const visibleCatNames = draftParticipants.participantCatIds
          .map((catId) => state.payload.chat.cats.find((cat) => cat.id === catId)?.name ?? "")
          .filter((name) => name.trim().length > 0);
        const randomUUID = () =>
          globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`;
        const firstTemp = createDraftTemporaryParticipant({
          provider: branchTarget.provider,
          instance: branchTarget.instance,
          model: branchTarget.model,
          modelSelection: branchTarget.modelSelection,
          takenNames: [
            ...visibleCatNames,
            ...draftTemporaryParticipants.map((participant) => participant.name),
          ],
          randomUUID,
        });
        const poolAfterFirst = [...draftTemporaryParticipants, firstTemp];
        const secondTemp = createNextGroupTemporaryParticipant({
          baseProvider: branchTarget.provider,
          existingParticipants: poolAfterFirst,
          takenNames: [
            ...visibleCatNames,
            ...poolAfterFirst.map((participant) => participant.name),
          ],
          randomUUID,
        });
        setDraftTemporaryParticipants((current) => [...current, firstTemp, secondTemp]);
        onSetDraftParallelBranchAudienceKeys(branchIndex, [
          `temp:${firstTemp.participantId}`,
          `temp:${secondTemp.participantId}`,
        ]);
        return;
      }

      onQuickAddDraftTemporaryParticipantToBranch(branchIndex);
    }, [
      draftExecutionTarget,
      draftParallelTargetAudienceKeys,
      draftParallelChatTargets,
      draftParticipants.participantCatIds,
      draftTemporaryParticipants,
      onQuickAddDraftTemporaryParticipantToBranch,
      onSetDraftParallelBranchAudienceKeys,
      seedDraftGroupParticipants,
      setDraftTemporaryParticipants,
      state,
      supportsStructuredDraftModes,
    ]);
    const {
      onOpenChatsOverview,
      onSelect,
      onRenameChannel,
      onDeleteChannel,
      onDeleteCat,
      onNavigateSettings,
      onNavigateRuntime,
      onDirectChatCat,
      onResetSetup,
      onStartNewChat,
      onStartNewGroupChat,
      onStartNewParallelChat,
    } = useWorkspaceAppNavigationActions<ExecutionTargetValue, AppShellPayload, DraftTemporaryParticipant>({
      state,
      setState,
      navigate,
      platformShellSurface: shellSurface,
      setBusy,
      setFeedback,
      setComposerDraft,
      setAccountMenuOpen,
      setAddCatOpen,
      setPlusMenuOpen,
      setChannelPlusMenuOpen,
      setDraftCwd,
      setDraftCatIds,
      setDraftTemporaryParticipants,
      setDraftHighlightedCatId,
      setDraftCatExecutionTargetOverrides,
      setDraftWorkflowShape,
      setDraftRuntimeSessionPolicy: setDraftSessionPolicy,
      setDraftAudienceKeys,
      resetDraftParallelChatTargets,
      createInitialGroupParticipants: supportsStructuredDraftModes
        ? seedDraftGroupParticipants
        : undefined,
      setDraftFiles,
      setChannelFiles,
      confirm: appConfirm,
    });
    const liveIndicatorChannel = selectedChannel ?? selectedDirectLane ?? null;
    const liveIndicator = useLiveIndicator({
      channelId: liveIndicatorChannel?.id ?? null,
      busy,
      selectedChannel: liveIndicatorChannel,
      debugTraceEnabled: readyPayload?.chat.capabilities.debugLiveTrace === true,
    });
    const subscribedChannelId = liveIndicatorChannel
      && readyPayload?.chat.selectedChannelId === liveIndicatorChannel.id
      ? liveIndicatorChannel.id
      : null;
    useEntitySubscription<ChannelSubscriptionState, ChannelSubscriptionPatch>({
      kind: 'channel',
      id: subscribedChannelId,
      enabled: state.status === 'ready' && Boolean(subscribedChannelId),
      onSnapshot: (snapshot) => {
        startTransition(() => {
          setState((current) =>
            applyChannelSubscriptionSnapshotToLoadState(current, snapshot));
        });
      },
      onPatch: (patch) => {
        startTransition(() => {
          setState((current) =>
            applyChannelSubscriptionPatchToLoadState(current, patch));
        });
      },
    });
    const latestActiveUserMessage = selectedChannel?.messages
      ? [...selectedChannel.messages].reverse().find((message) => message.senderKind === 'user') ?? null
      : null;
    const latestActiveUserRecipientIdsKey = Array.isArray(
      latestActiveUserMessage?.metadata?.recipientParticipantIds,
    )
      ? latestActiveUserMessage.metadata.recipientParticipantIds
        .filter((value): value is string => typeof value === 'string')
        .join('|')
      : '';
    const latestActiveUserWorkflowShape =
      typeof latestActiveUserMessage?.metadata?.workflowShape === 'string'
        ? latestActiveUserMessage.metadata.workflowShape
        : '';
    const activeAudienceParticipantIdsKey = (selectedChannel?.assignedCats ?? [])
      .filter((participant) => participant.status === 'active')
      .map((participant) => participant.catId)
      .join('|');
    const selectedParallelChatGroup = useMemo(
      () => readyPayload && selectedChannel
        ? readyPayload.chat.parallelChatGroups.find((group) =>
            group.memberChannelIds.includes(selectedChannel.id),
          ) ?? null
        : null,
      [readyPayload, selectedChannel],
    );

    useEffect(() => {
      const nextAudienceState = resolveActiveChannelAudienceState({
        selectedChannel,
        maxAudienceParticipants: maxDraftAudienceParticipants,
      });
      setActiveWorkflowShape(nextAudienceState?.workflowShape ?? 'sequential');
      setActiveAudienceKeys(nextAudienceState?.audienceKeys ?? null);
    }, [
      activeAudienceParticipantIdsKey,
      latestActiveUserMessage?.id,
      latestActiveUserRecipientIdsKey,
      latestActiveUserWorkflowShape,
      maxDraftAudienceParticipants,
      selectedChannel?.id,
    ]);

    useEffect(() => {
      setCompareSendScope('all_members');
    }, [selectedParallelChatGroup?.id]);

    const {
      onComposerKeyDown,
      onCancelPendingSend,
      onSendMessage,
      onStopMessage,
      onRetryMessage,
    } = useComposerSubmit({
      state,
      setState,
      navigate,
      originSurface: shellSurface,
      currentPath: `${location.pathname}${location.search}`,
      composerDraft,
      setComposerDraft,
      showingNewChatDraft,
      showingMyCatDirectLane,
      draftEntryKind,
      draftDefaultRecipientCatId,
      draftCatIds,
      draftTemporaryParticipants,
      draftCwd,
      draftSessionPolicy,
      draftFiles,
      channelFiles,
      setDraftCwd,
      setDraftCatIds,
      setDraftTemporaryParticipants,
      setDraftHighlightedCatId,
      setDraftCatExecutionTargetOverrides,
      setDraftRuntimeSessionPolicy: setDraftSessionPolicy,
      setDraftFiles,
      setChannelFiles,
      setDraftWorkflowShape,
      setDraftAudienceKeys,
      draftExecutionTarget,
      soloChannelExecutionTarget,
      showingParallelChatDraft: supportsStructuredDraftModes && showingParallelChatDraft,
      draftParallelChatTargets,
      draftWorkflowShape,
      draftAudienceKeys,
      activeWorkflowShape,
      activeAudienceKeys,
      resetDraftParallelChatTargets,
      compareGroupId: selectedParallelChatGroup?.id ?? null,
      compareSendScope,
      selectedChannel,
      busy,
      setBusy,
      setFeedback,
      hydratePendingDispatch: pendingDispatchHydration,
    });
    const {
      onAssignExistingCat,
      onCreateAndAssignCat,
      onCreateAndDraftCat,
      onRemoveAssignedCat,
    } = useWorkspaceCatAssignmentActions<CatFormState>({
      state,
      setState,
      catForm,
      emptyCatForm,
      setCatForm,
      setBusy,
      setFeedback,
      setAddCatOpen,
      setDraftCatIds,
    });
    const { onApprovalDecision, onChoiceSubmit, onOperatorAction } =
      useWorkspaceGovernanceActions({
        state,
        setState,
        operatorState,
        setOperatorState,
        setBusy,
        setFeedback,
      });

    useProductChannelDocumentTitle(
      `Cats ${productName}`,
      routeChannelTitle,
    );

    useEffect(() => {
      setBrowserLiveTraceEnabled(readyPayload?.chat.capabilities.debugLiveTrace === true);
    }, [readyPayload?.chat.capabilities.debugLiveTrace]);

    useOnGenericDraftRouteEntry(
      showingNewChatDraft && !draftDefaultRecipientCatId,
      useCallback(() => {
        resetDraftCats();
        setDraftTemporaryParticipants((current) =>
          supportsStructuredDraftModes
            ? resolveGenericDraftTemporaryParticipants(
                effectiveNewChatPreset,
                current,
                seedDraftGroupParticipants,
              )
            : []);
        setDraftWorkflowShape("sequential");
        setDraftAudienceKeys(null);
        resetDraftParallelChatTargets();
      }, [
        effectiveNewChatPreset,
        resetDraftCats,
        resetDraftParallelChatTargets,
        seedDraftGroupParticipants,
        setDraftAudienceKeys,
        setDraftTemporaryParticipants,
        setDraftWorkflowShape,
        supportsStructuredDraftModes,
      ]),
      effectiveNewChatPreset,
    );

    useEffect(() => {
      if (
        !supportsStructuredDraftModes
        || !showingNewChatDraft
        || effectiveNewChatPreset !== "group"
      ) {
        return;
      }

      setDraftTemporaryParticipants((current) =>
        syncLeadDraftTemporaryParticipantWithTarget({
          participants: current,
          target: draftExecutionTarget,
        }));
    }, [
      draftExecutionTarget.instance,
      draftExecutionTarget.model,
      draftExecutionTarget.modelSelection,
      draftExecutionTarget.provider,
      effectiveNewChatPreset,
      setDraftTemporaryParticipants,
      showingNewChatDraft,
      supportsStructuredDraftModes,
    ]);

    useWorkspaceAppShellRouting({
      state,
      setState,
      navigate,
      busy,
      surface: shellSurface,
      currentPath: currentNavigationPath,
      chatPrefix,
      routeChannelId,
      routeChannelExists,
      selectedChannelId,
      selectedChannelViewId,
      selectedChannelEntryLifecycle,
      draftDefaultRecipientCatId,
      showingMyCatDirectLane,
      routeDirectLaneSummary,
      readySelectedChannel,
    });
    // ADR-041 owns collection-tier chat invalidations on every product shell.
    // ADR-075 owns mounted channel state, so refetches must preserve active
    // entity subscriptions instead of replacing the whole app-shell payload.
    useWorkspaceChatEvents({
      state,
      setState,
      enabled: state.status === 'ready',
    });

    const onDraftExecutionTargetChange = useCallback(
      (nextDraftExecutionTarget: ExecutionTargetValue): void => {
        setDraftExecutionTarget(nextDraftExecutionTarget);
        if (
          supportsStructuredDraftModes
          && showingNewChatDraft
          && effectiveNewChatPreset === "group"
        ) {
          setDraftTemporaryParticipants((current) =>
            syncLeadDraftTemporaryParticipantWithTarget({
              participants: current,
              target: nextDraftExecutionTarget,
            }));
        }
      },
      [
        effectiveNewChatPreset,
        setDraftTemporaryParticipants,
        showingNewChatDraft,
        supportsStructuredDraftModes,
      ],
    );
    const onDraftParallelChatTargetChangeWithSharedDefault = useCallback(
      (index: number, value: ExecutionTargetValue): void => {
        onDraftParallelChatTargetChange(index, value);
        if (index === 0) {
          setDraftExecutionTarget(value);
        }
      },
      [onDraftParallelChatTargetChange, setDraftExecutionTarget],
    );
    const onDraftGroupAddButtonClick = useCallback((): void => {
      if (!supportsStructuredDraftModes) {
        return;
      }

      if (
        (effectiveNewChatPreset === "default" || effectiveNewChatPreset === "parallel")
        && draftParticipants.participantCatIds.length === 0
        && draftTemporaryParticipants.length === 0
      ) {
        const seededParticipants = resolveGenericDraftTemporaryParticipants(
          "group",
          [],
          seedDraftGroupParticipants,
        );
        setDraftTemporaryParticipants((current) => current.length === 0 ? seededParticipants : current);
        if (hasVisibleParallelDraftTargets) {
          onSetDraftParallelBranchAudienceKeys(
            0,
            seededParticipants.map((participant) => `temp:${participant.participantId}`),
          );
        } else {
          setDraftAudienceKeys(null);
        }
        return;
      }

      if (hasVisibleParallelDraftTargets) {
        onQuickAddDraftTemporaryParticipantToBranch(0);
        return;
      }

      onQuickAddDraftTemporaryParticipant();
    }, [
      draftParticipants.participantCatIds.length,
      draftTemporaryParticipants.length,
      effectiveNewChatPreset,
      onQuickAddDraftTemporaryParticipant,
      onQuickAddDraftTemporaryParticipantToBranch,
      onSetDraftParallelBranchAudienceKeys,
      hasVisibleParallelDraftTargets,
      seedDraftGroupParticipants,
      setDraftAudienceKeys,
      setDraftTemporaryParticipants,
      supportsStructuredDraftModes,
    ]);
    const onDraftParallelAddButtonClick = useCallback((): void => {
      if (!supportsStructuredDraftModes || state.status !== "ready") {
        return;
      }

      const seedWorkflowShape = draftParallelTargetWorkflowShapes[0] ?? draftWorkflowShape;

      // +compare only appends a parallel target — it never creates a
      // temp or seeds a branch audience. Each shadow row starts solo
      // (target-derived chip) and must earn its members via the
      // branch's own +collaborate, which is the only entrypoint that
      // consumes a pool slot (maxChatParticipants). Seeding the lead
      // audience on first transition stays free because it only
      // references existing participants.
      if (!hasVisibleParallelDraftTargets) {
        const leadAudienceSeed = resolveParallelAudienceSeed();
        onSetDraftParallelBranchAudienceKeys(0, leadAudienceSeed);
      }
      onAddDraftParallelChatTarget({
        seedAudienceKeys: [],
        seedWorkflowShape,
      });
    }, [
      draftParallelTargetWorkflowShapes,
      draftWorkflowShape,
      hasVisibleParallelDraftTargets,
      onAddDraftParallelChatTarget,
      onSetDraftParallelBranchAudienceKeys,
      resolveParallelAudienceSeed,
      state,
      supportsStructuredDraftModes,
    ]);

    const onResumeChannel = useWorkspaceResumeChannel<AppShellPayload>({
      activateChatChannel,
      publishReadyPayload,
      setBusy,
      setFeedback,
    });
    const onStartFreshChannel = useWorkspaceResetChannelContinuity<AppShellPayload>({
      resetChannelContinuity,
      publishReadyPayload,
      setBusy,
      setFeedback,
    });
    const onUpdateChannelParticipant = useWorkspaceChannelParticipantUpdate<AppShellPayload>({
      updateChannelParticipantApi,
      setBusy,
      setFeedback,
      setState,
    });
    const onRelayCompareMessage = useWorkspaceCompareRelay<AppShellPayload>({
      selectedChannel,
      selectedParallelChatGroup,
      relayParallelChatMessage,
      setBusy,
      setFeedback,
      setState,
    });

    return (
      <ProductAppStateBoundary
        state={state}
        BootShell={BootShell}
        unavailableTitle="Chat unavailable"
        renderReady={(payload) => {
          const {
            surface,
            directLaneChannel,
            activeMyCatId,
            activeAssignedCats,
            assignedCatIds,
            bossCatName,
            bossCatAvatarColor,
            showBossCatAvatar,
            selectableCats,
            assignableCatCount,
            draftCatIdSet,
            showDirectLaneBoot,
            showAddCatPanel,
          } = deriveAppViewState({
            pathname: location.pathname,
            payload,
            draftDefaultRecipientCatId,
            selectedChannel,
            selectedDirectLane,
            routeDirectLaneSummary,
            showingMyCatDirectLane,
            addCatOpen,
            showingNewChatDraft,
            draftCatIds,
          });
          const visibleChatChannelId = resolveVisibleChatChannelId(
            selectedChannel,
            directLaneChannel,
          );
          const visibleChannel = resolveVisibleChatChannel(
            selectedChannel,
            directLaneChannel,
          );

          function onSwitchProduct(nextSurface: PlatformSurfaceId): void {
            navigate(platformSurfaceRoutePrefix(nextSurface));
          }

          return (
            <ProductReadyShell
              payload={payload}
              sidebarOpen={sidebarOpen}
              sidebar={renderSidebar({
                payload,
                sidebarOpen,
                accountMenuOpen,
                overflowMenuOpenId,
                busy,
                surface,
                shellSurface,
                routeChannelId,
                accountMenuRef,
                onToggleSidebar,
                onCollapsedSidebarClick,
                onOpenChatsOverview,
                onStartNewChat,
                onStartNewGroupChat: supportsStructuredDraftModes
                  ? onStartNewGroupChat
                  : undefined,
                onStartNewParallelChat: supportsStructuredDraftModes
                  ? onStartNewParallelChat
                  : undefined,
                onSelect,
                onDeleteChannel,
                onRenameChannel,
                onArchiveCat,
                onAccountMenuToggle: () => setAccountMenuOpen(!accountMenuOpen),
                onOverflowMenuToggle: setOverflowMenuOpenId,
                onNavigateSettings,
                onNavigateRuntime,
                onSwitchProduct,
                activeMyCatId,
                onDirectChatCat,
                navigate,
              })}
              settingsMode={settingsMode}
              busy={busy}
              appContent={(
                <AppRoutesComponent
                  payload={payload}
                  selectedChannel={selectedChannel}
                  directLaneChannel={directLaneChannel}
                  showDirectLaneBoot={showDirectLaneBoot}
                  feedback={feedback}
                  busy={busy}
                  chatSurfaceProps={{
                    operatorSnapshot: operatorState.snapshot,
                    operatorLoading:
                      operatorState.status === "loading" &&
                      operatorState.snapshot === null,
                    operatorError:
                      operatorState.status === "error" ? operatorState.message : "",
                    composerDraft,
                    busy,
                    feedback,
                    greeting,
                    channelFiles,
                    channelPlusMenuOpen,
                    channelPlusMenuRef,
                    channelFileInputRef,
                    activeAssignedCats,
                    bossCatName,
                    bossCatAvatarColor,
                    showBossCatAvatar,
                    onComposerChange: setComposerDraft,
                    onComposerKeyDown,
                    onSendMessage,
                    onCancelPendingSend,
                    onStopMessage,
                    onRetryMessage,
                    onToggleChannelPlusMenu: toggleChannelPlusMenu,
                    onChannelFileSelect: openChannelFilePicker,
                    onChannelFilesChange: setChannelFiles,
                    onApprovalDecision,
                    onChoiceSubmit,
                    onResumeChannel: visibleChatChannelId
                      ? () => onResumeChannel(visibleChatChannelId)
                      : undefined,
                    onStartFresh:
                      visibleChatChannelId && visibleChannel?.composerMode === 'solo'
                        ? () => onStartFreshChannel(visibleChatChannelId)
                        : undefined,
                    onRelayMessage: onRelayCompareMessage,
                    onUpdateChannelParticipant: visibleChatChannelId
                      ? (participantId, input) =>
                          onUpdateChannelParticipant(visibleChatChannelId, participantId, input)
                      : undefined,
                    onOperatorAction,
                    autoResize,
                    selectedExecutionTarget:
                      visibleChannel?.composerMode === "solo"
                        ? soloChannelExecutionTarget
                        : undefined,
                    onExecutionTargetChange:
                      visibleChannel?.composerMode === "solo"
                        ? setSoloChannelExecutionTarget
                        : undefined,
                    onDirectLaneExecutionTargetChange: onDirectLaneModelSave,
                    activeWorkflowShape,
                    onToggleActiveWorkflowShape:
                      visibleChannel?.composerMode === "cat_led"
                        ? () =>
                            setActiveWorkflowShape((prev) =>
                              prev === 'concurrent' ? 'sequential' : 'concurrent')
                        : undefined,
                    activeAudienceKeys,
                    onSetActiveAudienceKeys:
                      visibleChannel?.composerMode === "cat_led"
                        ? setActiveAudienceKeys
                        : undefined,
                    onSelect,
                    liveIndicator,
                    compareGroup: selectedParallelChatGroup,
                    compareSendScope,
                    onCompareSendScopeChange: setCompareSendScope,
                  }}
                  draftSurfaceProps={{
                    composerDraft,
                    busy,
                    greeting,
                    draftFiles,
                    draftCwd,
                    draftCatIds,
                    draftTemporaryParticipants,
                    plusMenuOpen,
                    plusMenuRef,
                    fileInputRef,
                    bossCatName,
                    bossCatAvatarColor,
                    onComposerChange: setComposerDraft,
                    onComposerKeyDown,
                    onSendMessage,
                    onTogglePlusMenu: toggleDraftPlusMenu,
                    onFileSelect: openDraftFilePicker,
                    onPickFolder: openDraftFolderPicker,
                    onDraftFilesChange: setDraftFiles,
                    onDraftCwdClear: () => setDraftCwd(null),
                    onToggleDraftCat: onToggleDraftCatWithAudienceSync,
                    onAddDraftTemporaryParticipant: onAddDraftTemporaryParticipantWithAudienceSync,
                    onQuickAddDraftTemporaryParticipant: supportsStructuredDraftModes
                      ? onDraftGroupAddButtonClick
                      : undefined,
                    onRemoveDraftTemporaryParticipant: onRemoveDraftTemporaryParticipantWithAudienceSync,
                    onUpdateDraftTemporaryParticipant,
                    autoResize,
                    draftDefaultRecipientCatId,
                    entryPreset: effectiveNewChatPreset,
                    selectedExecutionTarget: draftExecutionTarget,
                    onExecutionTargetChange: onDraftExecutionTargetChange,
                    draftHighlightedCatId,
                    onHighlightDraftCat: setDraftHighlightedCatId,
                    draftCatExecutionTargetOverrides,
                    onDraftCatExecutionTargetOverride,
                    onDirectLaneExecutionTargetChange: onDirectLaneModelSave,
                    parallelTargets:
                      supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && hasVisibleParallelDraftTargets
                        ? draftParallelChatTargets
                        : undefined,
                    onParallelTargetChange:
                      supportsStructuredDraftModes
                        && (showingParallelChatDraft || hasVisibleParallelDraftTargets)
                        ? onDraftParallelChatTargetChangeWithSharedDefault
                        : undefined,
                    onAddParallelTarget:
                      supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && (advancedDraftControlsEnabled || hasVisibleParallelDraftTargets)
                        ? onDraftParallelAddButtonClick
                        : undefined,
                    onRemoveParallelTarget:
                      supportsStructuredDraftModes
                        && (showingParallelChatDraft || hasVisibleParallelDraftTargets)
                        ? onRemoveDraftParallelChatTarget
                        : undefined,
                    onPickParallelBranchFolder:
                      advancedDraftControlsEnabled
                        && supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && hasVisibleParallelDraftTargets
                        ? openDraftParallelBranchFolderPicker
                        : undefined,
                    showDraftParallelAddButton:
                      supportsStructuredDraftModes
                      && showingGenericNewChatDraft
                      && (advancedDraftControlsEnabled || hasVisibleParallelDraftTargets),
                    draftWorkflowShape,
                    draftRuntimeSessionPolicy: draftSessionPolicy,
                    onDraftRuntimeSessionPolicyChange: setDraftSessionPolicy,
                    onToggleDraftWorkflowShape: supportsStructuredDraftModes
                      ? () =>
                          setDraftWorkflowShape((prev) =>
                            prev === "concurrent" ? "sequential" : "concurrent")
                      : undefined,
                    draftAudienceKeys,
                    onSetAudienceKeys: supportsStructuredDraftModes
                      ? setDraftAudienceKeys
                      : undefined,
                    onSetParallelBranchAudienceKeys:
                      supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && hasVisibleParallelDraftTargets
                        ? onSetDraftParallelBranchAudienceKeys
                        : undefined,
                    onSetParallelBranchCwd:
                      supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && hasVisibleParallelDraftTargets
                        ? onSetDraftParallelBranchCwd
                        : undefined,
                    onSetParallelBranchRuntimeSessionPolicy:
                      supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && hasVisibleParallelDraftTargets
                        ? onSetDraftParallelBranchRuntimeSessionPolicy
                        : undefined,
                    onToggleParallelBranchWorkflowShape:
                      supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && hasVisibleParallelDraftTargets
                        ? onToggleDraftParallelBranchWorkflowShape
                        : undefined,
                    onQuickAddParallelBranchTemporaryParticipant:
                      advancedDraftControlsEnabled
                        && supportsStructuredDraftModes
                        && showingGenericNewChatDraft
                        && hasVisibleParallelDraftTargets
                        ? onDraftParallelBranchGroupAddButtonClick
                        : undefined,
                    showDraftGroupAddButton:
                      advancedDraftControlsEnabled
                      && showingGenericNewChatDraft
                      && effectiveNewChatPreset !== "group",
                    hideDraftGroupHint:
                      advancedDraftControlsEnabled
                      && showingGenericNewChatDraft
                      && effectiveNewChatPreset !== "group",
                    hideDraftParallelHint:
                      advancedDraftControlsEnabled
                      && showingGenericNewChatDraft
                      && effectiveNewChatPreset !== "parallel",
                  }}
                  addCatOpen={showAddCatPanel}
                  onToggleAddCat={toggleAddCatPanel}
                  addCatPanelProps={{
                    panelRef: addCatPanelRef,
                    selectableCats,
                    assignableCatCount,
                    addCatTab,
                    showingNewChatDraft:
                      showingNewChatDraft && !draftDefaultRecipientCatId,
                    draftCatIdSet,
                    assignedCatIds,
                    catForm,
                    onClose: () => setAddCatOpen(false),
                    onTabChange: setAddCatTab,
                    onAssignExistingCat,
                    onRemoveAssignedCat,
                    onToggleDraftCat: onToggleDraftCatWithAudienceSync,
                    onCatFormChange: setCatForm,
                    onCreateCat: (event) => {
                      if (showingNewChatDraft && !draftDefaultRecipientCatId) {
                        void onCreateAndDraftCat(event);
                        return;
                      }
                      void onCreateAndAssignCat(event);
                    },
                  }}
                  folderBrowserProps={buildFolderBrowserContentProps({
                    folderBrowsePath,
                    folderBrowseCurrentPath,
                    folderBrowseParentPath,
                    folderBrowseEntries,
                    folderBrowseLoading,
                    folderBrowseError,
                    onPathChange: setFolderBrowsePath,
                    browseFolder,
                    selectCurrentFolder,
                  })}
                  onOpenDraftAddCat={openDraftAddCatPanel}
                  onChangeDraftDefaultRecipient={changeDraftDefaultRecipient}
                />
              )}
              confirmDialog={appDialog}
              onPayloadUpdate={publishReadyPayload}
              onFeedback={setFeedback}
              onBusy={setBusy}
              onResetSetup={onResetSetup}
              onConfirmClose={appHandleClose}
            />
          );
        }}
      />
    );
  };
}
