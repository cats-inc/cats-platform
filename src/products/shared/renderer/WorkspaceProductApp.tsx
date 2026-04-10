import {
  startTransition,
  useCallback,
  useEffect,
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
import type { AppShellPayload } from "../api/workspaceContracts.js";
import type { AddCatPanelProps } from "./components/AddCatPanel.js";
import type { FolderBrowserContentProps } from "./components/FolderBrowser.js";
import type { ModelSelectorValue } from "./components/ModelSelector.js";
import type { NewChatDraftProps } from "./components/NewChatDraft.js";
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
import { useWorkspaceDraftCatState } from "./hooks/useWorkspaceDraftCatState.js";
import { useWorkspaceLocationState } from "./hooks/useWorkspaceLocationState.js";
import { useWorkspaceModelSelectionState } from "./hooks/useWorkspaceModelSelectionState.js";
import { useOnGenericDraftRouteEntry } from "./hooks/useOnGenericDraftRouteEntry.js";
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

type ChatSurfaceProps = Omit<ChatViewProps, "payload" | "selectedChannel">;

type DraftSurfaceProps = Omit<
  NewChatDraftProps,
  "payload" | "onOpenAddCat" | "onDraftDefaultRecipientChange" | "allowAddCat"
>;

export interface WorkspaceProductAppRoutesProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView | null;
  directLaneChannel: SelectedChannelView | null;
  showDirectLaneBoot: boolean;
  feedback: string;
  busy: string;
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
  busy: string;
  surface: Surface;
  shellSurface: WorkspaceProductShellSurface;
  routeChannelId: string | null;
  accountMenuRef: RefObject<HTMLDivElement>;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenChatsOverview: () => void;
  onStartNewChat: () => void;
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
  BootShell: ComponentType;
  AppRoutesComponent: ComponentType<WorkspaceProductAppRoutesProps>;
  renderSidebar: (props: WorkspaceProductSidebarProps) => ReactNode;
}

export function createWorkspaceProductApp({
  productName,
  chatPrefix,
  shellSurface,
  BootShell,
  AppRoutesComponent,
  renderSidebar,
}: WorkspaceProductAppConfig) {
  const useComposerSubmit =
    createUseComposerSubmit<ModelSelectorValue>(chatPrefix);

  return function WorkspaceProductApp() {
    const navigate = useNavigate();
    const {
      location,
      settingsMode,
      routeChannelId,
      routeMyCatId,
      showingNewChatDraft,
      draftDefaultRecipientCatId,
      showingMyCatDirectLane,
    } = useWorkspaceLocationState(chatPrefix);

    const [state, setState] = useState<AppLoadState>({ status: "loading" });
    const [composerDraft, setComposerDraft] = useState("");
    const [catForm, setCatForm] = useState<CatFormState>(emptyCatForm);
    const [busy, setBusy] = useState("");
    const [feedback, setFeedback] = useState("");
    const [addCatTab, setAddCatTab] = useState<"existing" | "new">("existing");
    const [greeting] = useState(pickGreeting);
    const [draftCwd, setDraftCwd] = useState<string | null>(null);
    const [draftFiles, setDraftFiles] = useState<File[]>([]);
    const [channelFiles, setChannelFiles] = useState<File[]>([]);
    const {
      draftCatIds,
      setDraftCatIds,
      draftHighlightedCatId,
      setDraftHighlightedCatId,
      draftCatModelOverrides,
      setDraftCatModelOverrides,
      onToggleDraftCat,
      onDraftCatModelOverride,
      resetDraftCats,
    } = useWorkspaceDraftCatState();
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
    } = useWorkspaceAppNavigationActions<ModelSelectorValue>({
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
      setDraftHighlightedCatId,
      setDraftCatModelOverrides,
      setDraftFiles,
      setChannelFiles,
      confirm: appConfirm,
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

        setBusy(`cat:archive:${catId}`);
        try {
          const payload = await updateCatProfile(catId, { archive: true });
          setState({ status: "ready", payload });
        } catch (error) {
          setFeedback(
            error instanceof Error ? error.message : "Failed to archive cat.",
          );
        } finally {
          setBusy("");
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
      draftModel,
      setDraftModel,
      soloChannelModel,
      setSoloChannelModel,
    } = useWorkspaceModelSelectionState({
      state,
      readyChat,
      readySelectedChannel,
      setState,
      setFeedback,
      updateNewChatDefaultsPreference,
      updateChannelPendingExecutionTarget,
    });
    const liveIndicatorChannel = selectedChannel ?? selectedDirectLane ?? null;
    const liveIndicator = useLiveIndicator({
      channelId: liveIndicatorChannel?.id ?? null,
      busy,
      selectedChannel: liveIndicatorChannel,
    });
    const { onComposerKeyDown, onSendMessage } = useComposerSubmit({
      state,
      setState,
      navigate,
      currentPathname: location.pathname,
      composerDraft,
      setComposerDraft,
      showingNewChatDraft,
      showingMyCatDirectLane,
      draftDefaultRecipientCatId,
      draftCatIds,
      draftCwd,
      draftFiles,
      channelFiles,
      setDraftCwd,
      setDraftCatIds,
      setDraftHighlightedCatId,
      setDraftCatModelOverrides,
      setDraftFiles,
      setChannelFiles,
      draftModel,
      soloChannelModel,
      selectedChannel,
      setBusy,
      setFeedback,
    });
    const {
      onAssignExistingCat,
      onCreateAndAssignCat,
      onCreateAndDraftCat,
      onRemoveAssignedCat,
      toggleDraftCat,
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

    useOnGenericDraftRouteEntry(
      showingNewChatDraft && !draftDefaultRecipientCatId,
      resetDraftCats,
    );

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

    const onDraftModelChange = useCallback(
      (nextDraftModel: ModelSelectorValue): void => {
        setDraftModel(nextDraftModel);
      },
      [],
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
                    selectedModel:
                      selectedChannel?.composerMode === "solo"
                        ? soloChannelModel
                        : undefined,
                    onModelChange:
                      selectedChannel?.composerMode === "solo"
                        ? setSoloChannelModel
                        : undefined,
                    onDirectLaneModelChange: onDirectLaneModelSave,
                    liveIndicator,
                  }}
                  draftSurfaceProps={{
                    composerDraft,
                    busy,
                    greeting,
                    draftFiles,
                    draftCwd,
                    draftCatIds,
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
                    onToggleDraftCat,
                    autoResize,
                    draftDefaultRecipientCatId,
                    selectedModel: draftModel,
                    onModelChange: onDraftModelChange,
                    draftHighlightedCatId,
                    onHighlightDraftCat: setDraftHighlightedCatId,
                    draftCatModelOverrides,
                    onDraftCatModelOverride,
                    onDirectLaneModelChange: onDirectLaneModelSave,
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
                    onToggleDraftCat: toggleDraftCat,
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
