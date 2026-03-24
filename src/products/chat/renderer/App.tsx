import {
  startTransition,
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import {
  Routes, Route, Navigate,
  useNavigate, useLocation, useMatch,
} from 'react-router-dom';

import {
  buildNewChatPath,
  isNewChatPath,
  NEW_CHAT_PATH,
  readNewChatLeadCatId,
  resolveAppEntryPath,
  resolveVisibleChatPath,
} from '../shared/channelPaths';
import type { AppShellPayload } from '../api/contracts';

import {
  type CatFormState,
  type SelectedChannelView,
  type Surface,
  emptyCatForm,
  resolveBossCatName,
  pickGreeting,
  BootShell,
} from './chatUtils';
import { getDefaultModel } from '../../../shared/providerCatalog';
import {
  normalizeSelectedChannelView,
  resolveSelectedChannelEntryLifecycle,
  shouldWakeRouteChannelOnEntry,
} from '../shared/channelEntry';
import { useOperatorLoop } from './useOperatorLoop';
import { useAppShellRouting } from './useAppShellRouting';
import { useAppChrome } from './useAppChrome';
import { useAppNavigationActions } from './useAppNavigationActions';
import { useCatAssignmentActions } from './useCatAssignmentActions';
import { useComposerSubmit } from './useComposerSubmit';
import { useFolderBrowser } from './useFolderBrowser';
import { useGovernanceActions } from './useGovernanceActions';

import { SetupWizard } from './components/SetupWizard';
import type { ModelSelectorValue } from './components/ModelSelector';
import { Sidebar, type SidebarViewMode } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { NewChatDraft } from './components/NewChatDraft';
import { SettingsGeneral } from './components/SettingsGeneral';
import { SettingsCats } from './components/SettingsCats';
import { SettingsData } from './components/SettingsData';
import { AddCatPanel } from './components/AddCatPanel';
import { FolderBrowser } from './components/FolderBrowser';
import { findDirectLaneForCat } from './myCatNavigation';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

function isDirectLaneSelectedForCat(
  channel: SelectedChannelView | null,
  catId: string | null,
): channel is SelectedChannelView {
  if (!channel || !catId) {
    return false;
  }

  return channel.roomRouting.mode === 'direct_cat_chat'
    && channel.roomRouting.leadParticipantId === catId;
}

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

  const [state, setState] = useState<LoadState>({ status: 'loading' });
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
    provider: 'claude', model: getDefaultModel('claude') || null, instance: null,
  }));
  const [soloChannelModel, setSoloChannelModel] = useState<ModelSelectorValue>(() => ({
    provider: 'claude', model: getDefaultModel('claude') || null, instance: null,
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
  const readyPayload = state.status === 'ready' ? state.payload : null;
  const readyChat = state.status === 'ready' ? state.payload.chat : null;
  const readySelectedChannel = normalizeSelectedChannelView(readyChat?.selectedChannel ?? null);
  const selectedChannelId = readyChat?.selectedChannelId ?? null;
  const selectedChannelViewId = readySelectedChannel?.id ?? null;
  const selectedChannelEntryLifecycle = resolveSelectedChannelEntryLifecycle(readySelectedChannel);
  const routeChannelExists = Boolean(
    routeChannelId && readyChat?.channels.some((channel) => channel.id === routeChannelId),
  );
  const routeChannelTitle = routeChannelId
    ? readyChat?.channels.find((channel) => channel.id === routeChannelId)?.title ?? null
    : null;
  const routeDirectLaneSummary =
    showingMyCatDirectLane && draftLeadCatId && readyChat
      ? findDirectLaneForCat(readyChat.channels, draftLeadCatId)
      : null;
  const selectedChannel = routeChannelId
    && readySelectedChannel?.id === routeChannelId
    ? readySelectedChannel
    : null;
  const selectedDirectLane =
    showingMyCatDirectLane && draftLeadCatId && isDirectLaneSelectedForCat(readySelectedChannel, draftLeadCatId)
      ? readySelectedChannel
      : null;
  const operatorRefreshKey = readyChat
    ? [
        readyChat.selectedChannelId,
        readySelectedChannel?.id ?? '',
        readySelectedChannel?.updatedAt ?? '',
        readySelectedChannel?.messages.length ?? 0,
        readySelectedChannel?.roomRouting.workflow.activeTurn?.updatedAt ?? '',
        readyChat.channels.length,
      ].join('|')
    : '';
  const {
    operatorState,
    refreshOperatorSnapshot,
    setOperatorState,
  } = useOperatorLoop(readyPayload, operatorRefreshKey);
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

  // --- Effects ---

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

  // Sync solo channel model from the selected channel's pending state
  useEffect(() => {
    if (!readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
      return;
    }
    const pending = readySelectedChannel as { pendingProvider?: string | null; pendingModel?: string | null; pendingInstance?: string | null };
    if (pending.pendingProvider) {
      setSoloChannelModel({
        provider: pending.pendingProvider,
        model: pending.pendingModel ?? null,
        instance: pending.pendingInstance ?? null,
      });
    }
  }, [readySelectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Callbacks ---

  function updatePayload(payload: AppShellPayload): void {
    startTransition(() => setState({ status: 'ready', payload }));
  }

  // --- Render ---

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

  if (!payload.setupCompleteAt) {
    return (
      <Routes>
        <Route
          path="/setup"
          element={
            <SetupWizard
              payload={payload}
              onComplete={(next) => {
                startTransition(() => setState({ status: 'ready', payload: next }));
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  const surface: Surface = location.pathname.startsWith('/settings')
    ? 'settings' : 'chats';

  const directLaneChannel = showingMyCatDirectLane
    ? selectedDirectLane
    : null;
  const activeChannelView = selectedChannel ?? directLaneChannel;
  const activeMyCatId = draftLeadCatId
    ? draftLeadCatId
    : selectedChannel?.roomRouting?.mode === 'direct_cat_chat'
      ? selectedChannel.roomRouting.leadParticipantId ?? null
      : null;

  const activeAssignedCats =
    activeChannelView?.assignedCats.filter((cat) => cat.status === 'active') ?? [];
  const assignedCatIds = new Set(activeChannelView?.assignedCats.map((cat) => cat.catId) ?? []);
  const bossCatName = resolveBossCatName(payload) ?? 'Orchestrator';
  const bossCatAvatarColor = payload.chat.cats.find(
    (cat) => cat.id === payload.chat.bossCatId,
  )?.avatarColor ?? null;
  const showBossCatAvatar = Boolean(payload.chat.bossCatId)
    && selectedChannel?.composerMode !== 'solo'
    && !activeAssignedCats.some((cat) => cat.catId === payload.chat.bossCatId);
  const selectableCats = payload.chat.cats.filter(
    (cat) =>
      cat.status === 'active'
      && cat.id !== payload.chat.bossCatId,
  );
  const assignableCatCount = selectableCats.length;
  const draftCatIdSet = new Set(draftCatIds);

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
        onStartNewChat={() => void onStartNewChat()}
        onSelect={onSelect}
        onDeleteChannel={(id) => void onDeleteChannel(id)}
        onDeleteCat={(catId) => void onDeleteCat(catId)}
        onAccountMenuToggle={() => setAccountMenuOpen(!accountMenuOpen)}
        onOverflowMenuToggle={setOverflowMenuOpenId}
        onNavigateSettings={onNavigateSettings}
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        activeMyCatId={activeMyCatId}
        onDirectChatCat={(catId) => void onDirectChatCat(catId)}
      />

      <main className="canvas">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
          />
          <Route
            path="/setup"
            element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
          />
          <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
          <Route path="/settings/general" element={
            <SettingsGeneral
              payload={payload}
              feedback={feedback}
              onPayloadUpdate={updatePayload}
              onFeedback={setFeedback}
            />
          } />
          <Route path="/settings/cats" element={
            <SettingsCats
              payload={payload}
              feedback={feedback}
              busy={busy}
              onPayloadUpdate={updatePayload}
              onFeedback={setFeedback}
              onBusy={setBusy}
            />
          } />
          <Route path="/settings/data" element={
            <SettingsData
              feedback={feedback}
              busy={busy}
              onResetSetup={() => void onResetSetup()}
            />
          } />
          <Route path="/chats/:channelId" element={
            selectedChannel ? (
              <ChatView
                payload={payload}
                selectedChannel={selectedChannel}
                operatorSnapshot={operatorState.snapshot}
                operatorLoading={operatorState.status === 'loading' && operatorState.snapshot === null}
                operatorError={operatorState.status === 'error' ? operatorState.message : ''}
                composerDraft={composerDraft}
                busy={busy}
                feedback={feedback}
                greeting={greeting}
                channelFiles={channelFiles}
                channelPlusMenuOpen={channelPlusMenuOpen}
                channelPlusMenuRef={channelPlusMenuRef}
                channelFileInputRef={channelFileInputRef}
                activeAssignedCats={activeAssignedCats}
                bossCatName={bossCatName}
                bossCatAvatarColor={bossCatAvatarColor}
                showBossCatAvatar={showBossCatAvatar}
                addCatOpen={addCatOpen}
                onComposerChange={setComposerDraft}
                onComposerKeyDown={(e) => void onComposerKeyDown(e)}
                onSendMessage={(e) => void onSendMessage(e)}
                onToggleAddCat={() => {
                  setAddCatOpen(!addCatOpen);
                  setAddCatTab('existing');
                  setFeedback('');
                  setCatForm(emptyCatForm());
                }}
                onToggleChannelPlusMenu={() => setChannelPlusMenuOpen(!channelPlusMenuOpen)}
                onChannelFileSelect={() => { channelFileInputRef.current?.click(); setChannelPlusMenuOpen(false); }}
                onChannelFilesChange={setChannelFiles}
                onApprovalDecision={(taskId, status) => void onApprovalDecision(taskId, status)}
                onChoiceSubmit={(input) => void onChoiceSubmit(input)}
                onOperatorAction={(input) => void onOperatorAction(input)}
                autoResize={autoResize}
                selectedModel={
                  selectedChannel.composerMode === 'solo'
                    ? soloChannelModel
                    : undefined
                }
                onModelChange={
                  selectedChannel.composerMode === 'solo'
                    ? setSoloChannelModel
                    : undefined
                }
              />
            ) : (
              <BootShell />
            )
          } />
          <Route
            path="/chats"
            element={<Navigate to={resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId)} replace />}
          />
          <Route
            path="/my-cats/:catId"
            element={
              routeDirectLaneSummary && !directLaneChannel ? (
                <BootShell />
              ) : directLaneChannel ? (
                <ChatView
                  payload={payload}
                  selectedChannel={directLaneChannel}
                  operatorSnapshot={operatorState.snapshot}
                  operatorLoading={operatorState.status === 'loading' && operatorState.snapshot === null}
                  operatorError={operatorState.status === 'error' ? operatorState.message : ''}
                  composerDraft={composerDraft}
                  busy={busy}
                  feedback={feedback}
                  greeting={greeting}
                  channelFiles={channelFiles}
                  channelPlusMenuOpen={channelPlusMenuOpen}
                  channelPlusMenuRef={channelPlusMenuRef}
                  channelFileInputRef={channelFileInputRef}
                  activeAssignedCats={activeAssignedCats}
                  bossCatName={bossCatName}
                  bossCatAvatarColor={bossCatAvatarColor}
                  showBossCatAvatar={showBossCatAvatar}
                  addCatOpen={false}
                  onComposerChange={setComposerDraft}
                  onComposerKeyDown={(e) => void onComposerKeyDown(e)}
                  onSendMessage={(e) => void onSendMessage(e)}
                  onToggleAddCat={() => {}}
                  onToggleChannelPlusMenu={() => setChannelPlusMenuOpen(!channelPlusMenuOpen)}
                  onChannelFileSelect={() => { channelFileInputRef.current?.click(); setChannelPlusMenuOpen(false); }}
                  onChannelFilesChange={setChannelFiles}
                  onApprovalDecision={(taskId, status) => void onApprovalDecision(taskId, status)}
                  onChoiceSubmit={(input) => void onChoiceSubmit(input)}
                  onOperatorAction={(input) => void onOperatorAction(input)}
                  autoResize={autoResize}
                  showAddCatButton={false}
                />
              ) : (
                <NewChatDraft
                  payload={payload}
                  composerDraft={composerDraft}
                  busy={busy}
                  greeting={greeting}
                  draftFiles={draftFiles}
                  draftCwd={draftCwd}
                  draftCatIds={draftCatIds}
                  plusMenuOpen={plusMenuOpen}
                  plusMenuRef={plusMenuRef}
                  fileInputRef={fileInputRef}
                  bossCatName={bossCatName}
                  bossCatAvatarColor={bossCatAvatarColor}
                  onComposerChange={setComposerDraft}
                  onComposerKeyDown={(e) => void onComposerKeyDown(e)}
                  onSendMessage={(e) => void onSendMessage(e)}
                  onTogglePlusMenu={() => setPlusMenuOpen(!plusMenuOpen)}
                  onFileSelect={() => { fileInputRef.current?.click(); setPlusMenuOpen(false); }}
                  onPickFolder={() => { void openFolderBrowser(draftCwd); setPlusMenuOpen(false); }}
                  onOpenAddCat={() => {}}
                  onDraftFilesChange={setDraftFiles}
                  onDraftCwdClear={() => setDraftCwd(null)}
                  onToggleDraftCat={toggleDraftCat}
                  autoResize={autoResize}
                  draftLeadCatId={draftLeadCatId}
                  onDraftLeadCatChange={() => {}}
                  allowAddCat={false}
                />
              )
            }
          />
          <Route path={NEW_CHAT_PATH} element={
            <NewChatDraft
              payload={payload}
              composerDraft={composerDraft}
              busy={busy}
              greeting={greeting}
              draftFiles={draftFiles}
              draftCwd={draftCwd}
              draftCatIds={draftCatIds}
              plusMenuOpen={plusMenuOpen}
              plusMenuRef={plusMenuRef}
              fileInputRef={fileInputRef}
              bossCatName={bossCatName}
              bossCatAvatarColor={bossCatAvatarColor}
              onComposerChange={setComposerDraft}
              onComposerKeyDown={(e) => void onComposerKeyDown(e)}
              onSendMessage={(e) => void onSendMessage(e)}
              onTogglePlusMenu={() => setPlusMenuOpen(!plusMenuOpen)}
              onFileSelect={() => { fileInputRef.current?.click(); setPlusMenuOpen(false); }}
              onPickFolder={() => { void openFolderBrowser(draftCwd); setPlusMenuOpen(false); }}
              onOpenAddCat={() => {
                setPlusMenuOpen(false);
                setAddCatOpen(true);
                setAddCatTab('existing');
                setCatForm(emptyCatForm());
                setFeedback('');
              }}
              onDraftFilesChange={setDraftFiles}
              onDraftCwdClear={() => setDraftCwd(null)}
              onToggleDraftCat={toggleDraftCat}
              autoResize={autoResize}
              draftLeadCatId={draftLeadCatId}
              onDraftLeadCatChange={(catId) => {
                if (catId === draftLeadCatId) {
                  return;
                }
                navigate(buildNewChatPath(catId), { replace: true });
              }}
              selectedModel={!draftLeadCatId ? draftModel : undefined}
              onModelChange={!draftLeadCatId ? setDraftModel : undefined}
            />
          } />
          <Route
            path="*"
            element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
          />
        </Routes>
      </main>

      {addCatOpen && (selectedChannel || (showingNewChatDraft && !draftLeadCatId)) ? (
        <AddCatPanel
          panelRef={addCatPanelRef}
          selectableCats={selectableCats}
          assignableCatCount={assignableCatCount}
          addCatTab={addCatTab}
          busy={busy}
          feedback={feedback}
          showingNewChatDraft={showingNewChatDraft && !draftLeadCatId}
          draftCatIdSet={draftCatIdSet}
          assignedCatIds={assignedCatIds}
          catForm={catForm}
          onClose={() => setAddCatOpen(false)}
          onTabChange={setAddCatTab}
          onAssignExistingCat={(cat) => void onAssignExistingCat(cat)}
          onRemoveAssignedCat={(cat) => void onRemoveAssignedCat(cat)}
          onToggleDraftCat={toggleDraftCat}
          onCatFormChange={setCatForm}
          onCreateCat={(e) => {
            if (showingNewChatDraft && !draftLeadCatId) {
              void onCreateAndDraftCat(e);
            } else {
              void onCreateAndAssignCat(e);
            }
          }}
        />
      ) : null}

      {folderBrowserOpen ? (
        <FolderBrowser
          folderBrowsePath={folderBrowsePath}
          folderBrowseCurrentPath={folderBrowseCurrentPath}
          folderBrowseParentPath={folderBrowseParentPath}
          folderBrowseEntries={folderBrowseEntries}
          folderBrowseLoading={folderBrowseLoading}
          folderBrowseError={folderBrowseError}
          onPathChange={setFolderBrowsePath}
          onBrowse={(path) => void browseFolder(path)}
          onClose={closeFolderBrowser}
          onSelect={selectCurrentFolder}
        />
      ) : null}
    </div>
  );
}
