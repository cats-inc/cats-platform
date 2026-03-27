import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom';

import type { AppShellPayload } from '../api/contracts';
import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog';
import {
  CHAT_PREFIX,
  isNewChatPath,
  readNewChatLeadCatId,
} from '../shared/channelPaths';
import {
  getDefaultModel,
  getDefaultProviderInstance,
} from '../../../shared/providerCatalog';
import { sameProviderModelSelection } from '../../../shared/providerSelection';
import {
  BootShell,
  emptyCatForm,
  pickGreeting,
  type CatFormState,
} from './chatUtils';
import { AppRoutes } from './AppRoutes';
import { deriveAppRouteState, deriveAppViewState, type AppLoadState } from './appViewState';
import { useAppChrome } from './hooks/useAppChrome';
import { useAppDraftUiActions } from './hooks/useAppDraftUiActions';
import { useAppNavigationActions } from './hooks/useAppNavigationActions';
import { useAppShellRouting } from './hooks/useAppShellRouting';
import { useCatAssignmentActions } from './hooks/useCatAssignmentActions';
import { useComposerSubmit } from './hooks/useComposerSubmit';
import { useFolderBrowser } from './hooks/useFolderBrowser';
import { useGovernanceActions } from './hooks/useGovernanceActions';
import { useOperatorLoop } from './hooks/useOperatorLoop';
import {
  updateCatProfile,
  updateChannelPendingExecutionTarget,
  updateNewChatDefaultsPreference,
} from './api';
import type { ModelSelectorValue } from './components/ModelSelector';
import {
  Sidebar,
} from './components/Sidebar';
import './styles.css';

function createDefaultModelSelectorValue(): ModelSelectorValue {
  return {
    provider: 'claude',
    model: getDefaultModel('claude') || null,
    instance: getDefaultProviderInstance('claude'),
    modelSelection: null,
  };
}

function toModelSelectorValue(
  defaults: AppShellPayload['chat']['newChatDefaults'] | null | undefined,
): ModelSelectorValue {
  if (!defaults) {
    return createDefaultModelSelectorValue();
  }

  const provider = defaults.provider?.trim() || 'claude';
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
  return left.provider === right.provider
    && (left.instance ?? null) === (right.instance ?? null)
    && (left.model ?? null) === (right.model ?? null)
    && sameProviderModelSelection(left.modelSelection, right.modelSelection);
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const channelMatch = useMatch(`${CHAT_PREFIX}/chats/:channelId`);
  const myCatMatch = useMatch(`${CHAT_PREFIX}/my-cats/:catId`);
  const routeChannelId = channelMatch?.params.channelId ?? null;
  const routeMyCatId = myCatMatch?.params.catId ?? null;
  const showingNewChatDraft = isNewChatPath(location.pathname);
  const draftLeadCatId = routeMyCatId ?? readNewChatLeadCatId(location.search);
  const showingMyCatDirectLane = Boolean(routeMyCatId);

  const [state, setState] = useState<AppLoadState>({ status: 'loading' });
  const [composerDraft, setComposerDraft] = useState('');
  const [catForm, setCatForm] = useState<CatFormState>(emptyCatForm);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [addCatTab, setAddCatTab] = useState<'existing' | 'new'>('existing');
  const [greeting] = useState(pickGreeting);
  const [draftCwd, setDraftCwd] = useState<string | null>(null);
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [channelFiles, setChannelFiles] = useState<File[]>([]);
  const [draftModel, setDraftModel] = useState<ModelSelectorValue>(createDefaultModelSelectorValue);
  const [soloChannelModel, setSoloChannelModel] = useState<ModelSelectorValue>(createDefaultModelSelectorValue);
  const [draftHighlightedCatId, setDraftHighlightedCatId] = useState<string | null>(null);
  const [draftCatModelOverrides, setDraftCatModelOverrides] = useState<Map<string, ModelSelectorValue>>(new Map);
  const wasGenericNewChatRoute = useRef(false);
  const latestNewChatDefaultsSaveId = useRef(0);
  const pendingNewChatDefaultsSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNewChatDefaultsSaveAbort = useRef<AbortController | null>(null);
  const latestSoloChannelModelSaveId = useRef(0);
  const pendingSoloChannelModelSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSoloChannelModelSaveAbort = useRef<AbortController | null>(null);
  const { dialog: appDialog, confirm: appConfirm, handleClose: appHandleClose } = useConfirmDialog();

  const onToggleDraftCat = useCallback((catId: string) => {
    setDraftCatIds((prev) => {
      const isRemoving = prev.includes(catId);
      const next = isRemoving ? prev.filter((id) => id !== catId) : [...prev, catId];
      if (isRemoving) {
        setDraftHighlightedCatId((current) =>
          current === catId ? (next.length > 0 ? next[0] : null) : current);
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

  const onDirectLaneModelSave = useCallback(async (catId: string, value: ModelSelectorValue) => {
    try {
      const result = await updateCatProfile(catId, {
        provider: value.provider,
        instance: value.instance,
        model: value.model,
        modelSelection: value.modelSelection,
      });
      startTransition(() => setState({ status: 'ready', payload: result }));
    } catch {
      // Silent fail — the panel shows current state from payload
    }
  }, [setState]);

  const onDraftCatModelOverride = useCallback((catId: string, value: ModelSelectorValue) => {
    setDraftCatModelOverrides((prev) => {
      const copy = new Map(prev);
      copy.set(catId, value);
      return copy;
    });
  }, []);

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
    changeDraftLeadCat,
  } = useAppDraftUiActions({
    addCatOpen,
    channelPlusMenuOpen,
    plusMenuOpen,
    draftCwd,
    draftLeadCatId,
    navigate,
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
    onArchiveCat,
    onDeleteCat,
    onNavigateSettings,
    onDirectChatCat,
    onResetSetup,
    onStartNewChat,
  } = useAppNavigationActions({
    state,
    setState,
    navigate,
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
    draftLeadCatId,
    showingMyCatDirectLane,
  });
  const {
    operatorState,
    setOperatorState,
  } = useOperatorLoop(readyPayload, operatorRefreshKey);
  const {
    onComposerKeyDown,
    onSendMessage,
  } = useComposerSubmit({
    state,
    setState,
    navigate,
    currentPathname: location.pathname,
    composerDraft,
    setComposerDraft,
    showingNewChatDraft,
    showingMyCatDirectLane,
    draftLeadCatId,
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
  } = useCatAssignmentActions({
    state,
    setState,
    catForm,
    setCatForm,
    setBusy,
    setFeedback,
    setAddCatOpen,
    setDraftCatIds,
  });
  const {
    onApprovalDecision,
    onChoiceSubmit,
    onOperatorAction,
  } = useGovernanceActions({
    state,
    setState,
    operatorState,
    setOperatorState,
    setBusy,
    setFeedback,
  });

  useEffect(() => {
    document.title = routeChannelTitle
      ? `${routeChannelTitle.trim() === 'Untitled chat' ? 'New chat' : routeChannelTitle} - Cats Chat`
      : 'Cats Chat';
  }, [routeChannelTitle]);

  useEffect(() => {
    const isGenericNewChatRoute = showingNewChatDraft && !draftLeadCatId;
    const justEnteredGenericNewChatRoute = isGenericNewChatRoute && !wasGenericNewChatRoute.current;
    wasGenericNewChatRoute.current = isGenericNewChatRoute;
    if (!justEnteredGenericNewChatRoute) {
      return;
    }

    setDraftCatIds([]);
    setDraftHighlightedCatId(null);
    setDraftCatModelOverrides(new Map());
  }, [draftLeadCatId, setDraftCatIds, showingNewChatDraft]);

  useEffect(() => {
    if (!readyChat) {
      return;
    }

    const nextDraftModel = toModelSelectorValue(readyChat.newChatDefaults);
    setDraftModel((currentDraftModel) =>
      sameModelSelectorValue(currentDraftModel, nextDraftModel)
        ? currentDraftModel
        : nextDraftModel);
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
    if (!readyChat || !readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
      return;
    }

    setSoloChannelModel({
      provider:
        readySelectedChannel.pendingProvider
        ?? readyChat.globalOrchestrator.executionTarget.provider,
      model:
        readySelectedChannel.pendingModel
        ?? readyChat.globalOrchestrator.executionTarget.model
        ?? null,
      instance:
        readySelectedChannel.pendingInstance
        ?? readyChat.globalOrchestrator.executionTarget.instance
        ?? null,
      modelSelection:
        readySelectedChannel.pendingModelSelection
        ?? readyChat.globalOrchestrator.executionModelSelection
        ?? null,
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

  useAppShellRouting({
    state,
    setState,
    navigate,
    routeChannelId,
    routeChannelExists,
    selectedChannelId,
    selectedChannelViewId,
    selectedChannelEntryLifecycle,
    draftLeadCatId,
    showingMyCatDirectLane,
    routeDirectLaneSummary,
    readySelectedChannel,
  });

  useEffect(() => {
    if (!readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
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

  const onDraftModelChange = useCallback((nextDraftModel: ModelSelectorValue): void => {
    setDraftModel(nextDraftModel);
  }, []);

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const persistedDraftModel = toModelSelectorValue(state.payload.chat.newChatDefaults);
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
          if (controller.signal.aborted || latestNewChatDefaultsSaveId.current !== saveId) {
            return;
          }
          pendingNewChatDefaultsSaveAbort.current = null;
          startTransition(() => setState({ status: 'ready', payload }));
        })
        .catch((error) => {
          if (controller.signal.aborted || latestNewChatDefaultsSaveId.current !== saveId) {
            return;
          }
          pendingNewChatDefaultsSaveAbort.current = null;
          setFeedback(
            error instanceof Error
              ? error.message
              : 'Failed to save new chat model defaults.',
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
    state.status === 'ready' ? state.payload.chat.newChatDefaults.instance : null,
    state.status === 'ready' ? state.payload.chat.newChatDefaults.model : null,
    state.status === 'ready' ? state.payload.chat.newChatDefaults.modelSelection : null,
    state.status === 'ready' ? state.payload.chat.newChatDefaults.provider : null,
  ]);

  useEffect(() => {
    if (state.status !== 'ready' || !readyChat || !readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
      return;
    }

    const persistedSoloModel: ModelSelectorValue = {
      provider:
        readySelectedChannel.pendingProvider
        ?? readyChat.globalOrchestrator.executionTarget.provider,
      model:
        readySelectedChannel.pendingModel
        ?? readyChat.globalOrchestrator.executionTarget.model
        ?? null,
      instance:
        readySelectedChannel.pendingInstance
        ?? readyChat.globalOrchestrator.executionTarget.instance
        ?? null,
      modelSelection:
        readySelectedChannel.pendingModelSelection
        ?? readyChat.globalOrchestrator.executionModelSelection
        ?? null,
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

      void updateChannelPendingExecutionTarget(channelId, nextSoloModel, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted || latestSoloChannelModelSaveId.current !== saveId) {
            return;
          }
          pendingSoloChannelModelSaveAbort.current = null;
          startTransition(() => setState({ status: 'ready', payload }));
        })
        .catch((error) => {
          if (controller.signal.aborted || latestSoloChannelModelSaveId.current !== saveId) {
            return;
          }
          pendingSoloChannelModelSaveAbort.current = null;
          setFeedback(
            error instanceof Error
              ? error.message
              : 'Failed to save this chat AI reply settings.',
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

  function updatePayload(payload: AppShellPayload): void {
    startTransition(() => setState({ status: 'ready', payload }));
  }

  if (state.status === 'loading') {
    return <BootShell />;
  }

  if (state.status === 'error') {
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
    draftLeadCatId,
    selectedChannel,
    selectedDirectLane,
    routeDirectLaneSummary,
    showingMyCatDirectLane,
    addCatOpen,
    showingNewChatDraft,
    draftCatIds,
  });

  return (
    <div
      className={
        sidebarOpen
          ? 'screen claudeShell'
          : 'screen claudeShell claudeShellSidebarCollapsed'
      }
    >
      <Sidebar
        payload={payload}
        sidebarOpen={sidebarOpen}
        accountMenuOpen={accountMenuOpen}
        overflowMenuOpenId={overflowMenuOpenId}
        busy={busy}
        surface={surface}
        routeChannelId={routeChannelId}
        accountMenuRef={accountMenuRef}
        onToggleSidebar={onToggleSidebar}
        onCollapsedSidebarClick={onCollapsedSidebarClick}
        onOpenChatsOverview={onOpenChatsOverview}
        onStartNewChat={onStartNewChat}
        onSelect={onSelect}
        onDeleteChannel={onDeleteChannel}
        onRenameChannel={onRenameChannel}
        onArchiveCat={onArchiveCat}
        onAccountMenuToggle={() => setAccountMenuOpen(!accountMenuOpen)}
        onOverflowMenuToggle={setOverflowMenuOpenId}
        onNavigateSettings={onNavigateSettings}
        activeMyCatId={activeMyCatId}
        onDirectChatCat={onDirectChatCat}
      />

      <main className="canvas">
        <AppRoutes
          payload={payload}
          selectedChannel={selectedChannel}
          directLaneChannel={directLaneChannel}
          showDirectLaneBoot={showDirectLaneBoot}
          feedback={feedback}
          busy={busy}
          chatSurfaceProps={{
            operatorSnapshot: operatorState.snapshot,
            operatorLoading:
              operatorState.status === 'loading' && operatorState.snapshot === null,
            operatorError: operatorState.status === 'error' ? operatorState.message : '',
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
            onOperatorAction,
            autoResize,
            selectedModel:
              selectedChannel?.composerMode === 'solo' ? soloChannelModel : undefined,
            onModelChange:
              selectedChannel?.composerMode === 'solo' ? setSoloChannelModel : undefined,
            onDirectLaneModelChange: onDirectLaneModelSave,
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
            onToggleDraftCat: onToggleDraftCat,
            autoResize,
            draftLeadCatId,
            selectedModel: draftModel,
            onModelChange: onDraftModelChange,
            draftHighlightedCatId,
            onHighlightDraftCat: setDraftHighlightedCatId,
            draftCatModelOverrides,
            onDraftCatModelOverride,
            onDirectLaneModelChange: onDirectLaneModelSave,
          }}
          onPayloadUpdate={updatePayload}
          onFeedback={setFeedback}
          onBusy={setBusy}
          onResetSetup={onResetSetup}
          addCatOpen={showAddCatPanel}
          onToggleAddCat={toggleAddCatPanel}
          addCatPanelProps={{
            panelRef: addCatPanelRef,
            selectableCats,
            assignableCatCount,
            addCatTab,
            showingNewChatDraft: showingNewChatDraft && !draftLeadCatId,
            draftCatIdSet,
            assignedCatIds,
            catForm,
            onClose: () => setAddCatOpen(false),
            onTabChange: setAddCatTab,
            onAssignExistingCat,
            onRemoveAssignedCat,
            onToggleDraftCat: onToggleDraftCat,
            onCatFormChange: setCatForm,
            onCreateCat: (event) => {
              if (showingNewChatDraft && !draftLeadCatId) {
                void onCreateAndDraftCat(event);
                return;
              }
              void onCreateAndAssignCat(event);
            },
          }}
          folderBrowserProps={{
            folderBrowsePath,
            folderBrowseCurrentPath: folderBrowseCurrentPath ?? '',
            folderBrowseParentPath: folderBrowseParentPath ?? '',
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
          onChangeDraftLeadCat={changeDraftLeadCat}
        />
      </main>
      <ConfirmDialog dialog={appDialog} onClose={appHandleClose} />
    </div>
  );
}
