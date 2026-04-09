import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  useLocation,
  useMatch,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";

import {
  ConfirmDialog,
  useConfirmDialog,
} from "../../../design/components/ConfirmDialog";
import type { PlatformSurfaceId } from "../../../shared/platform-contract.js";
import {
  getDefaultModel,
  getDefaultProviderInstance,
} from "../../../shared/providerCatalog.js";
import { sameProviderModelSelection } from "../../../shared/providerSelection.js";
import { platformSurfaceRoutePrefix } from "../../../core/platformSurface.js";
import type { AppShellPayload } from "../api/workspaceContracts.js";
import {
  isWorkspaceNewChatPath,
  readWorkspaceNewChatLeadCatId,
} from "../channelPaths.js";
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
  type CatFormState,
  type SelectedChannelView,
  type Surface,
} from "./workspaceChatUtils.js";
import { PlatformSettingsRoutes } from "../../../app/renderer/settings/PlatformSettingsRoutes.js";
import {
  deriveAppRouteState,
  deriveAppViewState,
  type AppLoadState,
} from "./workspaceAppViewState.js";
import { useAppChrome } from "./hooks/useAppChrome.js";
import { useFolderBrowser } from "./hooks/useFolderBrowser.js";
import { useLiveIndicator } from "./hooks/useLiveIndicator.js";
import { useOperatorLoop } from "./hooks/useOperatorLoop.js";
import { useWorkspaceAppDraftUiActions } from "./hooks/useWorkspaceAppDraftUiActions.js";
import { useWorkspaceAppNavigationActions } from "./hooks/useWorkspaceAppNavigationActions.js";
import { useWorkspaceAppShellRouting } from "./hooks/useWorkspaceAppShellRouting.js";
import { useWorkspaceCatAssignmentActions } from "./hooks/useWorkspaceCatAssignmentActions.js";
import { createUseComposerSubmit } from "./hooks/useWorkspaceComposerSubmit.js";
import { useWorkspaceGovernanceActions } from "./hooks/useWorkspaceGovernanceActions.js";

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

function createDefaultModelSelectorValue(): ModelSelectorValue {
  return {
    provider: "claude",
    model: getDefaultModel("claude") || null,
    instance: getDefaultProviderInstance("claude"),
    modelSelection: null,
  };
}

function toModelSelectorValue(
  defaults: AppShellPayload["chat"]["newChatDefaults"] | null | undefined,
): ModelSelectorValue {
  if (!defaults) {
    return createDefaultModelSelectorValue();
  }

  const provider = defaults.provider?.trim() || "claude";
  return {
    provider,
    model: defaults.model ?? (getDefaultModel(provider) || null),
    instance: defaults.instance ?? getDefaultProviderInstance(provider),
    modelSelection: defaults.modelSelection ?? null,
  };
}

function sameModelSelectorValue(
  left: ModelSelectorValue,
  right: ModelSelectorValue,
): boolean {
  return (
    left.provider === right.provider &&
    (left.instance ?? null) === (right.instance ?? null) &&
    (left.model ?? null) === (right.model ?? null) &&
    sameProviderModelSelection(left.modelSelection, right.modelSelection)
  );
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
    const location = useLocation();
    const settingsMode =
      location.pathname === "/settings" ||
      location.pathname.startsWith("/settings/");
    const channelMatch = useMatch(`${chatPrefix}/chats/:channelId`);
    const myCatMatch = useMatch(`${chatPrefix}/my-cats/:catId`);
    const routeChannelId = channelMatch?.params.channelId ?? null;
    const routeMyCatId = myCatMatch?.params.catId ?? null;
    const showingNewChatDraft = isWorkspaceNewChatPath(
      chatPrefix,
      location.pathname,
    );
    const draftDefaultRecipientCatId =
      routeMyCatId ?? readWorkspaceNewChatLeadCatId(location.search);
    const showingMyCatDirectLane = Boolean(routeMyCatId);

    const [state, setState] = useState<AppLoadState>({ status: "loading" });
    const [composerDraft, setComposerDraft] = useState("");
    const [catForm, setCatForm] = useState<CatFormState>(emptyCatForm);
    const [busy, setBusy] = useState("");
    const [feedback, setFeedback] = useState("");
    const [addCatTab, setAddCatTab] = useState<"existing" | "new">("existing");
    const [greeting] = useState(pickGreeting);
    const [draftCwd, setDraftCwd] = useState<string | null>(null);
    const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
    const [draftFiles, setDraftFiles] = useState<File[]>([]);
    const [channelFiles, setChannelFiles] = useState<File[]>([]);
    const [draftModel, setDraftModel] = useState<ModelSelectorValue>(
      createDefaultModelSelectorValue,
    );
    const [soloChannelModel, setSoloChannelModel] =
      useState<ModelSelectorValue>(createDefaultModelSelectorValue);
    const [draftHighlightedCatId, setDraftHighlightedCatId] = useState<
      string | null
    >(null);
    const [draftCatModelOverrides, setDraftCatModelOverrides] = useState<
      Map<string, ModelSelectorValue>
    >(new Map());
    const wasGenericNewChatRoute = useRef(false);
    const latestNewChatDefaultsSaveId = useRef(0);
    const pendingNewChatDefaultsSaveTimeout = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    const pendingNewChatDefaultsSaveAbort = useRef<AbortController | null>(
      null,
    );
    const latestSoloChannelModelSaveId = useRef(0);
    const pendingSoloChannelModelSaveTimeout = useRef<ReturnType<
      typeof setTimeout
    > | null>(null);
    const pendingSoloChannelModelSaveAbort = useRef<AbortController | null>(
      null,
    );
    const {
      dialog: appDialog,
      confirm: appConfirm,
      handleClose: appHandleClose,
    } = useConfirmDialog();

    const onToggleDraftCat = useCallback((catId: string) => {
      setDraftCatIds((prev) => {
        const isRemoving = prev.includes(catId);
        const next = isRemoving
          ? prev.filter((id) => id !== catId)
          : [...prev, catId];
        if (isRemoving) {
          setDraftHighlightedCatId((current) =>
            current === catId ? (next.length > 0 ? next[0] : null) : current,
          );
          setDraftCatModelOverrides((overrides) => {
            const copy = new Map(overrides);
            copy.delete(catId);
            return copy;
          });
        } else {
          setDraftHighlightedCatId(catId);
        }
        return next;
      });
    }, []);

    const onDirectLaneModelSave = useCallback(
      async (catId: string, value: ModelSelectorValue) => {
        try {
          const result = await updateCatProfile(catId, {
            provider: value.provider,
            instance: value.instance,
            model: value.model,
            modelSelection: value.modelSelection,
          });
          startTransition(() => setState({ status: "ready", payload: result }));
        } catch {
          // Silent fail; the panel continues showing payload-backed state.
        }
      },
      [],
    );

    const onDraftCatModelOverride = useCallback(
      (catId: string, value: ModelSelectorValue) => {
        setDraftCatModelOverrides((prev) => {
          const copy = new Map(prev);
          copy.set(catId, value);
          return copy;
        });
      },
      [],
    );

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

    useEffect(() => {
      const appTitle = `Cats ${productName}`;
      document.title = routeChannelTitle
        ? `${routeChannelTitle.trim() === "Untitled chat" ? "New chat" : routeChannelTitle} - ${appTitle}`
        : appTitle;
    }, [productName, routeChannelTitle]);

    useEffect(() => {
      const isGenericNewChatRoute =
        showingNewChatDraft && !draftDefaultRecipientCatId;
      const justEnteredGenericNewChatRoute =
        isGenericNewChatRoute && !wasGenericNewChatRoute.current;
      wasGenericNewChatRoute.current = isGenericNewChatRoute;
      if (!justEnteredGenericNewChatRoute) {
        return;
      }

      setDraftCatIds([]);
      setDraftHighlightedCatId(null);
      setDraftCatModelOverrides(new Map());
    }, [draftDefaultRecipientCatId, setDraftCatIds, showingNewChatDraft]);

    useEffect(() => {
      if (!readyChat) {
        return;
      }

      const nextDraftModel = toModelSelectorValue(readyChat.newChatDefaults);
      setDraftModel((currentDraftModel) =>
        sameModelSelectorValue(currentDraftModel, nextDraftModel)
          ? currentDraftModel
          : nextDraftModel,
      );
    }, [
      readyChat?.newChatDefaults.instance,
      readyChat?.newChatDefaults.model,
      readyChat?.newChatDefaults.modelSelection,
      readyChat?.newChatDefaults.provider,
    ]);

    useEffect(() => {
      return () => {
        if (pendingNewChatDefaultsSaveTimeout.current) {
          clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
          pendingNewChatDefaultsSaveTimeout.current = null;
        }
        pendingNewChatDefaultsSaveAbort.current?.abort();
        pendingNewChatDefaultsSaveAbort.current = null;
        if (pendingSoloChannelModelSaveTimeout.current) {
          clearTimeout(pendingSoloChannelModelSaveTimeout.current);
          pendingSoloChannelModelSaveTimeout.current = null;
        }
        pendingSoloChannelModelSaveAbort.current?.abort();
        pendingSoloChannelModelSaveAbort.current = null;
      };
    }, []);

    useEffect(() => {
      if (
        !readyChat ||
        !readySelectedChannel ||
        readySelectedChannel.composerMode !== "solo"
      ) {
        return;
      }

      setSoloChannelModel({
        provider:
          readySelectedChannel.pendingProvider ??
          readyChat.globalOrchestrator.executionTarget.provider,
        model:
          readySelectedChannel.pendingModel ??
          readyChat.globalOrchestrator.executionTarget.model ??
          null,
        instance:
          readySelectedChannel.pendingInstance ??
          readyChat.globalOrchestrator.executionTarget.instance ??
          null,
        modelSelection:
          readySelectedChannel.pendingModelSelection ??
          readyChat.globalOrchestrator.executionModelSelection ??
          null,
      });
    }, [
      readySelectedChannel?.id,
      readySelectedChannel?.composerMode,
      readySelectedChannel?.pendingProvider,
      readySelectedChannel?.pendingModel,
      readySelectedChannel?.pendingInstance,
      readySelectedChannel?.pendingModelSelection,
      readyChat?.globalOrchestrator.executionTarget.provider,
      readyChat?.globalOrchestrator.executionTarget.model,
      readyChat?.globalOrchestrator.executionTarget.instance,
      readyChat?.globalOrchestrator.executionModelSelection,
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

    useEffect(() => {
      if (
        !readySelectedChannel ||
        readySelectedChannel.composerMode !== "solo"
      ) {
        return;
      }

      const pending = readySelectedChannel as {
        pendingProvider?: string | null;
        pendingModel?: string | null;
        pendingInstance?: string | null;
      };
      if (pending.pendingProvider) {
        setSoloChannelModel({
          provider: pending.pendingProvider,
          model: pending.pendingModel ?? null,
          instance: pending.pendingInstance ?? null,
          modelSelection: readySelectedChannel.pendingModelSelection ?? null,
        });
      }
    }, [readySelectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const onDraftModelChange = useCallback(
      (nextDraftModel: ModelSelectorValue): void => {
        setDraftModel(nextDraftModel);
      },
      [],
    );

    const onResumeChannel = useCallback(
      async (channelId: string): Promise<void> => {
        setBusy("channel:resume");
        setFeedback("");
        try {
          const activation = await activateChatChannel(channelId);
          startTransition(() =>
            setState({ status: "ready", payload: activation.appShell }),
          );
          const errors = activation.results.filter(
            (result) => result.status === "error",
          );
          if (errors.length > 0) {
            setFeedback(
              errors
                .map(
                  (result) =>
                    result.error || `Failed to resume ${result.targetName}.`,
                )
                .join(" "),
            );
          }
        } catch (error) {
          setFeedback(
            error instanceof Error
              ? error.message
              : "Failed to resume chat session.",
          );
        } finally {
          setBusy("");
        }
      },
      [],
    );

    useEffect(() => {
      if (state.status !== "ready") {
        return;
      }

      const persistedDraftModel = toModelSelectorValue(
        state.payload.chat.newChatDefaults,
      );
      if (sameModelSelectorValue(draftModel, persistedDraftModel)) {
        return;
      }

      if (pendingNewChatDefaultsSaveTimeout.current) {
        clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
        pendingNewChatDefaultsSaveTimeout.current = null;
      }
      pendingNewChatDefaultsSaveAbort.current?.abort();

      const saveId = latestNewChatDefaultsSaveId.current + 1;
      latestNewChatDefaultsSaveId.current = saveId;
      const controller = new AbortController();
      pendingNewChatDefaultsSaveAbort.current = controller;
      const nextDraftModel = {
        provider: draftModel.provider,
        instance: draftModel.instance,
        model: draftModel.model,
        modelSelection: draftModel.modelSelection,
      };

      pendingNewChatDefaultsSaveTimeout.current = setTimeout(() => {
        pendingNewChatDefaultsSaveTimeout.current = null;

        void updateNewChatDefaultsPreference(nextDraftModel, controller.signal)
          .then((payload) => {
            if (
              controller.signal.aborted ||
              latestNewChatDefaultsSaveId.current !== saveId
            ) {
              return;
            }
            pendingNewChatDefaultsSaveAbort.current = null;
            startTransition(() => setState({ status: "ready", payload }));
          })
          .catch((error) => {
            if (
              controller.signal.aborted ||
              latestNewChatDefaultsSaveId.current !== saveId
            ) {
              return;
            }
            pendingNewChatDefaultsSaveAbort.current = null;
            setFeedback(
              error instanceof Error
                ? error.message
                : "Failed to save new chat model defaults.",
            );
          });
      }, 150);

      return () => {
        if (pendingNewChatDefaultsSaveTimeout.current) {
          clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
          pendingNewChatDefaultsSaveTimeout.current = null;
        }
        controller.abort();
      };
    }, [
      draftModel.instance,
      draftModel.model,
      draftModel.modelSelection,
      draftModel.provider,
      setFeedback,
      state.status,
      state.status === "ready"
        ? state.payload.chat.newChatDefaults.instance
        : null,
      state.status === "ready"
        ? state.payload.chat.newChatDefaults.model
        : null,
      state.status === "ready"
        ? state.payload.chat.newChatDefaults.modelSelection
        : null,
      state.status === "ready"
        ? state.payload.chat.newChatDefaults.provider
        : null,
    ]);

    useEffect(() => {
      if (
        state.status !== "ready" ||
        !readyChat ||
        !readySelectedChannel ||
        readySelectedChannel.composerMode !== "solo"
      ) {
        return;
      }

      const persistedSoloModel: ModelSelectorValue = {
        provider:
          readySelectedChannel.pendingProvider ??
          readyChat.globalOrchestrator.executionTarget.provider,
        model:
          readySelectedChannel.pendingModel ??
          readyChat.globalOrchestrator.executionTarget.model ??
          null,
        instance:
          readySelectedChannel.pendingInstance ??
          readyChat.globalOrchestrator.executionTarget.instance ??
          null,
        modelSelection:
          readySelectedChannel.pendingModelSelection ??
          readyChat.globalOrchestrator.executionModelSelection ??
          null,
      };

      if (sameModelSelectorValue(soloChannelModel, persistedSoloModel)) {
        return;
      }

      if (pendingSoloChannelModelSaveTimeout.current) {
        clearTimeout(pendingSoloChannelModelSaveTimeout.current);
        pendingSoloChannelModelSaveTimeout.current = null;
      }
      pendingSoloChannelModelSaveAbort.current?.abort();

      const channelId = readySelectedChannel.id;
      const saveId = latestSoloChannelModelSaveId.current + 1;
      latestSoloChannelModelSaveId.current = saveId;
      const controller = new AbortController();
      pendingSoloChannelModelSaveAbort.current = controller;
      const nextSoloModel = {
        pendingProvider: soloChannelModel.provider,
        pendingModel: soloChannelModel.model,
        pendingInstance: soloChannelModel.instance,
        pendingModelSelection: soloChannelModel.modelSelection,
      };

      pendingSoloChannelModelSaveTimeout.current = setTimeout(() => {
        pendingSoloChannelModelSaveTimeout.current = null;

        void updateChannelPendingExecutionTarget(
          channelId,
          nextSoloModel,
          controller.signal,
        )
          .then((payload) => {
            if (
              controller.signal.aborted ||
              latestSoloChannelModelSaveId.current !== saveId
            ) {
              return;
            }
            pendingSoloChannelModelSaveAbort.current = null;
            startTransition(() => setState({ status: "ready", payload }));
          })
          .catch((error) => {
            if (
              controller.signal.aborted ||
              latestSoloChannelModelSaveId.current !== saveId
            ) {
              return;
            }
            pendingSoloChannelModelSaveAbort.current = null;
            setFeedback(
              error instanceof Error
                ? error.message
                : "Failed to save this chat AI reply settings.",
            );
          });
      }, 150);

      return () => {
        if (pendingSoloChannelModelSaveTimeout.current) {
          clearTimeout(pendingSoloChannelModelSaveTimeout.current);
          pendingSoloChannelModelSaveTimeout.current = null;
        }
        controller.abort();
      };
    }, [
      readyChat,
      readySelectedChannel,
      setFeedback,
      soloChannelModel.instance,
      soloChannelModel.model,
      soloChannelModel.modelSelection,
      soloChannelModel.provider,
      state.status,
    ]);

    if (state.status === "loading") {
      return <BootShell />;
    }

    if (state.status === "error") {
      return (
        <div className="screen screenCentered">
          <div className="errorPanel">
            <p className="eyebrow">Renderer Error</p>
            <h1>Chat unavailable</h1>
            <p>{state.message}</p>
          </div>
        </div>
      );
    }

    const { payload } = state;
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
    const visibleChatChannelId =
      selectedChannel?.id ?? directLaneChannel?.id ?? null;

    function onSwitchProduct(nextSurface: PlatformSurfaceId): void {
      navigate(platformSurfaceRoutePrefix(nextSurface));
    }

    return (
      <div
        className={
          sidebarOpen
            ? "screen claudeShell"
            : "screen claudeShell claudeShellSidebarCollapsed"
        }
      >
        {renderSidebar({
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

        <main className="canvas">
          {settingsMode ? (
            <PlatformSettingsRoutes
              payload={payload}
              onPayloadUpdate={(nextPayload) => {
                startTransition(() =>
                  setState({ status: "ready", payload: nextPayload }),
                );
              }}
              feedback={feedback}
              busy={busy}
              onFeedback={setFeedback}
              onBusy={setBusy}
              onResetSetup={onResetSetup}
            />
          ) : (
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
              folderBrowserProps={{
                folderBrowsePath,
                folderBrowseCurrentPath: folderBrowseCurrentPath ?? "",
                folderBrowseParentPath: folderBrowseParentPath ?? "",
                folderBrowseEntries,
                folderBrowseLoading,
                folderBrowseError,
                onPathChange: setFolderBrowsePath,
                onBrowse: (path) => {
                  void browseFolder(path);
                },
                onSelect: selectCurrentFolder,
              }}
              onOpenDraftAddCat={openDraftAddCatPanel}
              onChangeDraftDefaultRecipient={changeDraftDefaultRecipient}
            />
          )}
        </main>
        <ConfirmDialog dialog={appDialog} onClose={appHandleClose} />
      </div>
    );
  };
}
