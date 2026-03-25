import {
  startTransition,
  useEffect,
  useState,
} from 'react';
import {
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom';

import type { AppShellPayload } from '../api/contracts';
import {
  isNewChatPath,
  readNewChatLeadCatId,
} from '../shared/channelPaths';
import { getDefaultModel } from '../../../shared/providerCatalog';
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
import type { ModelSelectorValue } from './components/ModelSelector';
import {
  Sidebar,
  type SidebarViewMode,
} from './components/Sidebar';
import './styles.css';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const channelMatch = useMatch('/chats/:channelId');
  const myCatMatch = useMatch('/my-cats/:catId');
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
  const [sidebarView, setSidebarView] = useState<SidebarViewMode>('latest');
  const [draftCwd, setDraftCwd] = useState<string | null>(null);
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [channelFiles, setChannelFiles] = useState<File[]>([]);
  const [draftModel, setDraftModel] = useState<ModelSelectorValue>(() => ({
    provider: 'claude',
    model: getDefaultModel('claude') || null,
    instance: null,
  }));
  const [soloChannelModel, setSoloChannelModel] = useState<ModelSelectorValue>(() => ({
    provider: 'claude',
    model: getDefaultModel('claude') || null,
    instance: null,
  }));

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
    closeFolderBrowser,
    folderBrowserOpen,
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
    onDeleteChannel,
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
    setDraftFiles,
    setChannelFiles,
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
    });
  }, [
    readyChat,
    readySelectedChannel?.id,
    readySelectedChannel?.composerMode,
    readySelectedChannel?.pendingProvider,
    readySelectedChannel?.pendingModel,
    readySelectedChannel?.pendingInstance,
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
      });
    }
  }, [readySelectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        onDeleteCat={onDeleteCat}
        onAccountMenuToggle={() => setAccountMenuOpen(!accountMenuOpen)}
        onOverflowMenuToggle={setOverflowMenuOpenId}
        onNavigateSettings={onNavigateSettings}
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
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
            onToggleDraftCat: toggleDraftCat,
            autoResize,
            draftLeadCatId,
            selectedModel: !draftLeadCatId ? draftModel : undefined,
            onModelChange: !draftLeadCatId ? setDraftModel : undefined,
          }}
          onToggleAddCat={toggleAddCatPanel}
          onPayloadUpdate={updatePayload}
          onFeedback={setFeedback}
          onBusy={setBusy}
          onResetSetup={onResetSetup}
          addCatOpen={showAddCatPanel}
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
            onToggleDraftCat: toggleDraftCat,
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
            folderBrowserOpen,
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
            onClose: closeFolderBrowser,
            onSelect: selectCurrentFolder,
          }}
          onOpenDraftAddCat={openDraftAddCatPanel}
          onChangeDraftLeadCat={changeDraftLeadCat}
        />
      </main>
    </div>
  );
}
