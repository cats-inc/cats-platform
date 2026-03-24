import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Routes, Route, Navigate,
  useNavigate, useLocation, useMatch,
} from 'react-router-dom';

import {
  buildNewChatPath,
  buildChannelPath,
  isNewChatPath,
  NEW_CHAT_PATH,
  readNewChatLeadCatId,
  resolveAppEntryPath,
  resolveVisibleChatPath,
} from '../shared/channelPaths';
import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../shared/sidebarPreference';
import type { AppShellPayload } from '../api/contracts';
import {
  deleteGlobalCat,
  resetSetup,
  deleteChatChannel,
  writeCoreApprovalDecision,
  writeCoreOperatorAction,
} from './api';

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
import type { ChatOperatorSnapshot } from '../shared/operatorLoop';
import { useOperatorLoop } from './useOperatorLoop';
import { useAppShellRouting } from './useAppShellRouting';
import { useCatAssignmentActions } from './useCatAssignmentActions';
import { useComposerSubmit } from './useComposerSubmit';
import { useFolderBrowser } from './useFolderBrowser';

import { SetupWizard } from './components/SetupWizard';
import type { ModelSelectorValue } from './components/ModelSelector';
import { Sidebar, type SidebarViewMode } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import type { MessageChoicesSubmitInput } from './components/MessageChoices';
import { NewChatDraft } from './components/NewChatDraft';
import { SettingsGeneral } from './components/SettingsGeneral';
import { SettingsCats } from './components/SettingsCats';
import { SettingsData } from './components/SettingsData';
import { AddCatPanel } from './components/AddCatPanel';
import { FolderBrowser } from './components/FolderBrowser';
import { resolveMyCatNavigationTarget } from './myCatNavigation';
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
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addCatTab, setAddCatTab] = useState<'existing' | 'new'>('existing');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    readSidebarOpenPreference(typeof window === 'undefined' ? null : window.localStorage),
  );
  const [overflowMenuOpenId, setOverflowMenuOpenId] = useState<string | null>(null);
  const [greeting] = useState(pickGreeting);
  const [sidebarView, setSidebarView] = useState<SidebarViewMode>('latest');
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [draftCwd, setDraftCwd] = useState<string | null>(null);
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [channelFiles, setChannelFiles] = useState<File[]>([]);
  const [channelPlusMenuOpen, setChannelPlusMenuOpen] = useState(false);
  const [draftModel, setDraftModel] = useState<ModelSelectorValue>(() => ({
    provider: 'claude', model: getDefaultModel('claude') || null, instance: null,
  }));
  const [soloChannelModel, setSoloChannelModel] = useState<ModelSelectorValue>(() => ({
    provider: 'claude', model: getDefaultModel('claude') || null, instance: null,
  }));
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const addCatPanelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelPlusMenuRef = useRef<HTMLDivElement>(null);
  const channelFileInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (!accountMenuOpen && !overflowMenuOpenId && !plusMenuOpen && !channelPlusMenuOpen && !addCatOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (accountMenuOpen && accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (overflowMenuOpenId) {
        const menu = document.querySelector('.recentOverflowMenu') ?? document.querySelector('.myCatOverflowMenu');
        const button = (e.target as Element).closest?.('.recentOverflowButton, .myCatOverflowButton');
        if (!menu?.contains(target) && !button) {
          setOverflowMenuOpenId(null);
        }
      }
      if (plusMenuOpen && plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setPlusMenuOpen(false);
      }
      if (channelPlusMenuOpen && channelPlusMenuRef.current && !channelPlusMenuRef.current.contains(target)) {
        setChannelPlusMenuOpen(false);
      }
      if (addCatOpen && addCatPanelRef.current && !addCatPanelRef.current.contains(target)) {
        setAddCatOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accountMenuOpen, overflowMenuOpenId, plusMenuOpen, channelPlusMenuOpen, addCatOpen]);

  useEffect(() => {
    writeSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
      sidebarOpen,
    );
  }, [sidebarOpen]);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    const max = 200;
    if (el.scrollHeight > max) {
      el.style.height = `${max}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflowY = 'hidden';
    }
  }, []);

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

  function onOpenChatsOverview(): void {
    if (state.status !== 'ready') return;
    navigate(resolveVisibleChatPath(state.payload.chat.channels, state.payload.chat.selectedChannelId));
    setFeedback('');
    setAddCatOpen(false);
  }

  function onToggleSidebar(): void {
    setSidebarOpen((current) => {
      if (current) setAccountMenuOpen(false);
      return !current;
    });
  }

  function onCollapsedSidebarClick(event: ReactMouseEvent<HTMLElement>): void {
    if (sidebarOpen) return;
    const target = event.target as HTMLElement;
    if (
      target.closest('button, a, input, textarea, select, [role="button"]')
      || target.closest('.accountMenu')
    ) return;
    setSidebarOpen(true);
  }

  function onSelect(channelId: string): void {
    navigate(buildChannelPath(channelId));
    setFeedback('');
    setAddCatOpen(false);
    setChannelFiles([]);
    setChannelPlusMenuOpen(false);
  }

  async function onDeleteChannel(channelId: string): Promise<void> {
    setBusy(`channel:delete:${channelId}`);
    try {
      const payload = await deleteChatChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddCatOpen(false);
        setFeedback('');
      });
      navigate(resolveVisibleChatPath(payload.chat.channels, payload.chat.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete chat.');
    } finally {
      setBusy('');
    }
  }

  async function onApprovalDecision(
    taskId: string,
    action: 'approve' | 'reroute' | 'reject',
  ): Promise<void> {
    if (!operatorState.snapshot) {
      return;
    }

    setBusy(`approval:${taskId}:${action}`);
    try {
      const snapshot = await writeCoreApprovalDecision({
        taskId,
        status: action === 'approve' ? 'approved' : 'rejected',
        action,
        decidedByActorId: operatorState.snapshot.core.ownerProfile.actorId,
      });
      startTransition(() => {
        setOperatorState({
          status: 'ready',
          snapshot,
          message: '',
        });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to update approval.');
    } finally {
      setBusy('');
    }
  }

  async function onChoiceSubmit(input: MessageChoicesSubmitInput): Promise<void> {
    if (state.status !== 'ready') {
      return;
    }

    const channelId = input.channelId;
    if (!channelId) {
      return;
    }

    setBusy(`choice:${input.choiceResponse.sourceMessageId}:${input.choiceResponse.status}`);
    try {
      const dispatch = await sendChatMessage(channelId, {
        body: input.body,
        senderName: state.payload.ownerDisplayName,
        choiceResponse: input.choiceResponse,
      });
      startTransition(() => {
        setState({ status: 'ready', payload: dispatch.appShell });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to submit choice response.');
    } finally {
      setBusy('');
    }
  }

  async function onOperatorAction(input: {
    action: 'retry' | 'acknowledge';
    taskId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
  }): Promise<void> {
    if (!operatorState.snapshot) {
      return;
    }

    const busyKey = input.runId ?? input.taskId ?? input.checkpointId ?? input.outcomeId ?? 'global';
    setBusy(`operator-action:${input.action}:${busyKey}`);
    try {
      const snapshot = await writeCoreOperatorAction({
        ...input,
        actorId: operatorState.snapshot.core.ownerProfile.actorId,
      });
      startTransition(() => {
        setOperatorState({
          status: 'ready',
          snapshot,
          message: '',
        });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to record operator action.');
    } finally {
      setBusy('');
    }
  }

  async function onResetSetup(): Promise<void> {
    if (!window.confirm('This will erase all chats, cats, and settings. Continue?')) return;
    setBusy('setup:reset');
    try {
      const payload = await resetSetup();
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAccountMenuOpen(false);
      });
      navigate('/setup');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to reset setup.');
    } finally {
      setBusy('');
    }
  }

  async function onStartNewChat(): Promise<void> {
    navigate(buildNewChatPath(null));
    setComposerDraft('');
    setFeedback('');
    setAddCatOpen(false);
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftFiles([]);
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
        onDeleteCat={async (catId) => {
          setBusy(`cat:delete:${catId}`);
          try {
            const next = await deleteGlobalCat(catId);
            startTransition(() => setState({ status: 'ready', payload: next }));
          } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Failed to delete cat.');
          } finally {
            setBusy('');
          }
        }}
        onAccountMenuToggle={() => setAccountMenuOpen(!accountMenuOpen)}
        onOverflowMenuToggle={setOverflowMenuOpenId}
        onNavigateSettings={() => {
          navigate('/settings/general');
          setAccountMenuOpen(false);
          setAddCatOpen(false);
          setFeedback('');
        }}
        sidebarView={sidebarView}
        onSidebarViewChange={setSidebarView}
        activeMyCatId={activeMyCatId}
        onDirectChatCat={async (catId) => {
          const target = resolveMyCatNavigationTarget(payload.chat.channels, catId);
          setFeedback('');
          setAddCatOpen(false);
          setPlusMenuOpen(false);
          setDraftCwd(null);
          setDraftCatIds([]);
          setDraftFiles([]);
          setChannelPlusMenuOpen(false);
          setChannelFiles([]);
          navigate(target.path);
        }}
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
