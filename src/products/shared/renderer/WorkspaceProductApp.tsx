import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
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
  updateCatProfile,
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
  useWorkspaceResumeChannel,
} from "./hooks/useWorkspaceAppShellChannelActions.js";
import { usePublishReadyPayload } from "./hooks/usePublishReadyPayload.js";
import { useWorkspaceAppDraftUiActions } from "./hooks/useWorkspaceAppDraftUiActions.js";
import { useWorkspaceAppNavigationActions } from "./hooks/useWorkspaceAppNavigationActions.js";
import { useWorkspaceAppShellRouting } from "./hooks/useWorkspaceAppShellRouting.js";
import { useWorkspaceCatAssignmentActions } from "./hooks/useWorkspaceCatAssignmentActions.js";
import { createUseComposerSubmit } from "./hooks/useWorkspaceComposerSubmit.js";
import { useWorkspaceGovernanceActions } from "./hooks/useWorkspaceGovernanceActions.js";
import {
  buildFolderBrowserContentProps,
  resolveVisibleChatChannelId,
} from "./appShellPresentation.js";
import {
  createInitialGroupParticipants,
  createNextGroupTemporaryParticipant,
  createDraftTemporaryParticipant,
  reconcileDraftAudienceKeysAfterParticipantRemoval,
  resolveGenericDraftTemporaryParticipants,
  syncLeadDraftTemporaryParticipantWithTarget,
  type DraftTemporaryParticipant,
} from "./draftChatUtils.js";
import { resolveActiveChannelAudienceState } from "./composerMessageMetadata.js";

type ChatSurfaceProps = Omit<ChatViewProps, "payload" | "selectedChannel">;

type DraftSurfaceProps = Omit<
  ChatNewChatDraftProps,
  "payload" | "onOpenAddCat" | "onDraftDefaultRecipientChange" | "allowAddCat"
> & {
  greeting: string;
};

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
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
  navigate: NavigateFunction;
}

export type WorkspaceProductShellSurface = "work" | "code";

export interface WorkspaceProductAppConfig {
  productName: "Work" | "Code";
  chatPrefix: string;
  shellSurface: WorkspaceProductShellSurface;
  supportsStructuredDraftModes?: boolean;
  BootShell: ComponentType;
  AppRoutesComponent: ComponentType<WorkspaceProductAppRoutesProps>;
  renderSidebar: (props: WorkspaceProductSidebarProps) => ReactNode;
}

export function createWorkspaceProductApp({
  productName,
  chatPrefix,
  shellSurface,
  supportsStructuredDraftModes = false,
  BootShell,
  AppRoutesComponent,
  renderSidebar,
}: WorkspaceProductAppConfig) {
  const useComposerSubmit =
    createUseComposerSubmit<ExecutionTargetValue>(chatPrefix);

  return function WorkspaceProductApp() {
    const navigate = useNavigate();
    const {
      location,
      settingsMode,
      routeChannelId,
      showingNewChatDraft,
      newChatMode,
      draftDefaultRecipientCatId,
      showingMyCatDirectLane,
    } = useWorkspaceLocationState(chatPrefix);
    const effectiveNewChatMode = supportsStructuredDraftModes ? newChatMode : "default";
    const showingParallelChatDraft = effectiveNewChatMode === "parallel";

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
      initialState: { status: "loading" },
      createEmptyCatForm: emptyCatForm,
      pickGreeting,
    });
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
      onSelectPath: setDraftCwd,
    });
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
      openFolderBrowser,
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
          effectiveNewChatMode === "group"
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
    } = useWorkspaceParallelDraft({
      draftExecutionTarget,
      maxParallelChats,
    });
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
    }, [
      draftParticipantKeys,
      draftParticipants.participantCatIds,
      draftTemporaryParticipants.length,
      maxDraftAudienceParticipants,
      maxDraftGroupParticipants,
      onToggleDraftCat,
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
    }, [
      draftParticipantKeys,
      maxDraftAudienceParticipants,
      onRemoveDraftTemporaryParticipant,
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
        && effectiveNewChatMode === "group"
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
      effectiveNewChatMode,
      maxDraftAudienceParticipants,
      onAddDraftTemporaryParticipant,
      setDraftExecutionTarget,
      showingNewChatDraft,
      supportsStructuredDraftModes,
    ]);
    const {
      onOpenChatsOverview,
      onSelect,
      onRenameChannel,
      onDeleteChannel,
      onDeleteCat,
      onNavigateSettings,
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

    const { onComposerKeyDown, onSendMessage } = useComposerSubmit({
      state,
      setState,
      navigate,
      currentPathname: location.pathname,
      composerDraft,
      setComposerDraft,
      showingNewChatDraft,
      showingMyCatDirectLane,
      draftEntryKind,
      draftDefaultRecipientCatId,
      draftCatIds,
      draftTemporaryParticipants,
      draftCwd,
      draftFiles,
      channelFiles,
      setDraftCwd,
      setDraftCatIds,
      setDraftTemporaryParticipants,
      setDraftHighlightedCatId,
      setDraftCatExecutionTargetOverrides,
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
                effectiveNewChatMode,
                current,
                seedDraftGroupParticipants,
              )
            : []);
        setDraftWorkflowShape("sequential");
        setDraftAudienceKeys(null);
        resetDraftParallelChatTargets();
      }, [
        effectiveNewChatMode,
        resetDraftCats,
        resetDraftParallelChatTargets,
        seedDraftGroupParticipants,
        setDraftAudienceKeys,
        setDraftTemporaryParticipants,
        setDraftWorkflowShape,
        supportsStructuredDraftModes,
      ]),
    );

    useEffect(() => {
      if (
        !supportsStructuredDraftModes
        || !showingNewChatDraft
        || effectiveNewChatMode !== "group"
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
      effectiveNewChatMode,
      setDraftTemporaryParticipants,
      showingNewChatDraft,
      supportsStructuredDraftModes,
    ]);

    useWorkspaceAppShellRouting({
      state,
      setState,
      navigate,
      busy,
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

    const onDraftExecutionTargetChange = useCallback(
      (nextDraftExecutionTarget: ExecutionTargetValue): void => {
        setDraftExecutionTarget(nextDraftExecutionTarget);
        if (
          supportsStructuredDraftModes
          && showingNewChatDraft
          && effectiveNewChatMode === "group"
        ) {
          setDraftTemporaryParticipants((current) =>
            syncLeadDraftTemporaryParticipantWithTarget({
              participants: current,
              target: nextDraftExecutionTarget,
            }));
        }
      },
      [
        effectiveNewChatMode,
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

    const onResumeChannel = useWorkspaceResumeChannel<AppShellPayload>({
      activateChatChannel,
      publishReadyPayload,
      setBusy,
      setFeedback,
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
                onSwitchProduct,
                activeMyCatId,
                onDirectChatCat,
                navigate,
              })}
              settingsMode={settingsMode}
              feedback={feedback}
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
                    onToggleChannelPlusMenu: toggleChannelPlusMenu,
                    onChannelFileSelect: openChannelFilePicker,
                    onChannelFilesChange: setChannelFiles,
                    onApprovalDecision,
                    onChoiceSubmit,
                    onResumeChannel: visibleChatChannelId
                      ? () => onResumeChannel(visibleChatChannelId)
                      : undefined,
                    onOperatorAction,
                    autoResize,
                    selectedExecutionTarget:
                      selectedChannel?.composerMode === "solo"
                        ? soloChannelExecutionTarget
                        : undefined,
                    onExecutionTargetChange:
                      selectedChannel?.composerMode === "solo"
                        ? setSoloChannelExecutionTarget
                        : undefined,
                    onDirectLaneExecutionTargetChange: onDirectLaneModelSave,
                    activeWorkflowShape,
                    onToggleActiveWorkflowShape:
                      selectedChannel?.composerMode === "cat_led"
                        ? () =>
                            setActiveWorkflowShape((prev) =>
                              prev === 'concurrent' ? 'sequential' : 'concurrent')
                        : undefined,
                    activeAudienceKeys,
                    onSetActiveAudienceKeys:
                      selectedChannel?.composerMode === "cat_led"
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
                      ? onQuickAddDraftTemporaryParticipant
                      : undefined,
                    onRemoveDraftTemporaryParticipant: onRemoveDraftTemporaryParticipantWithAudienceSync,
                    onUpdateDraftTemporaryParticipant,
                    autoResize,
                    draftDefaultRecipientCatId,
                    entryMode: effectiveNewChatMode,
                    selectedExecutionTarget: draftExecutionTarget,
                    onExecutionTargetChange: onDraftExecutionTargetChange,
                    draftHighlightedCatId,
                    onHighlightDraftCat: setDraftHighlightedCatId,
                    draftCatExecutionTargetOverrides,
                    onDraftCatExecutionTargetOverride,
                    onDirectLaneExecutionTargetChange: onDirectLaneModelSave,
                    parallelTargets:
                      supportsStructuredDraftModes && showingParallelChatDraft
                        ? draftParallelChatTargets
                        : undefined,
                    onParallelTargetChange:
                      supportsStructuredDraftModes && showingParallelChatDraft
                        ? onDraftParallelChatTargetChangeWithSharedDefault
                        : undefined,
                    onAddParallelTarget:
                      supportsStructuredDraftModes && showingParallelChatDraft
                        ? onAddDraftParallelChatTarget
                        : undefined,
                    onRemoveParallelTarget:
                      supportsStructuredDraftModes && showingParallelChatDraft
                        ? onRemoveDraftParallelChatTarget
                        : undefined,
                    draftWorkflowShape,
                    onToggleDraftWorkflowShape: supportsStructuredDraftModes
                      ? () =>
                          setDraftWorkflowShape((prev) =>
                            prev === "concurrent" ? "sequential" : "concurrent")
                      : undefined,
                    draftAudienceKeys,
                    onSetAudienceKeys: supportsStructuredDraftModes
                      ? setDraftAudienceKeys
                      : undefined,
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


