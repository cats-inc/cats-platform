import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Routes, Route, Navigate,
  useNavigate, useLocation, useMatch,
} from 'react-router-dom';

import { shouldSubmitComposerOnKeyDown } from '../../../shared/composer';
import {
  buildNewChatPath,
  buildChannelPath,
  isNewChatPath,
  NEW_CHAT_PATH,
  readNewChatLeadCatId,
  resolveAppEntryPath,
  resolveDefaultChatPath,
} from '../../../shared/channelPaths';
import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../shared/sidebarPreference';
import type { AppShellPayload } from '../../../shared/app-shell';
import {
  assignCatToChannelApi,
  browseDirectories,
  type BrowseDirectoryEntry,
  createGlobalCat,
  resetSetup,
  createChatChannel,
  deleteChatChannel,
  fetchOperatorLoopSnapshot,
  fetchAppShell,
  removeCatFromChannelApi,
  sendChatMessage,
  updateSelectedChannel,
  uploadChannelAttachments,
  writeCoreApprovalDecision,
} from './api';

import {
  type CatFormState,
  type Surface,
  emptyCatForm,
  resolveBossCatName,
  createOptimisticDraftPayload,
  appendOptimisticUserMessage,
  createDraftChannelTitle,
  createDraftChannelTopic,
  pickGreeting,
  BootShell,
} from './chatUtils';
import {
  normalizeSelectedChannelView,
  resolveSelectedChannelEntryLifecycle,
  shouldWakeRouteChannelOnEntry,
} from '../shared/channelEntry';
import type { ChatOperatorSnapshot } from '../shared/operatorLoop';

import { SetupWizard } from './components/SetupWizard';
import { Sidebar, type SidebarViewMode } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { NewChatDraft } from './components/NewChatDraft';
import { SettingsGeneral } from './components/SettingsGeneral';
import { SettingsCats } from './components/SettingsCats';
import { SettingsData } from './components/SettingsData';
import { AddCatPanel } from './components/AddCatPanel';
import { FolderBrowser } from './components/FolderBrowser';
import { resolveMyCatNavigationTarget } from './myCatNavigation';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type OperatorLoadState =
  | { status: 'idle'; snapshot: null; message: string }
  | { status: 'loading'; snapshot: ChatOperatorSnapshot | null; message: string }
  | { status: 'ready'; snapshot: ChatOperatorSnapshot; message: string }
  | { status: 'error'; snapshot: ChatOperatorSnapshot | null; message: string };

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const channelMatch = useMatch('/chats/:channelId');
  const routeChannelId = channelMatch?.params.channelId ?? null;
  const showingNewChatDraft = isNewChatPath(location.pathname);
  const draftLeadCatId = readNewChatLeadCatId(location.search);

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
  const [operatorState, setOperatorState] = useState<OperatorLoadState>({
    status: 'idle',
    snapshot: null,
    message: '',
  });
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [folderBrowsePath, setFolderBrowsePath] = useState('');
  const [folderBrowseCurrentPath, setFolderBrowseCurrentPath] = useState('');
  const [folderBrowseParentPath, setFolderBrowseParentPath] = useState('');
  const [folderBrowseEntries, setFolderBrowseEntries] = useState<BrowseDirectoryEntry[]>([]);
  const [folderBrowseLoading, setFolderBrowseLoading] = useState(false);
  const [folderBrowseError, setFolderBrowseError] = useState('');
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

  // --- Effects ---

  useEffect(() => {
    document.title = routeChannelTitle
      ? `${routeChannelTitle.trim() === 'Untitled chat' ? 'New chat' : routeChannelTitle} - Cats Chat`
      : 'Cats Chat';
  }, [routeChannelTitle]);

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
    if (!folderBrowserOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFolderBrowserOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown as never);
    return () => document.removeEventListener('keydown', handleKeyDown as never);
  }, [folderBrowserOpen]);

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

  useEffect(() => {
    const controller = new AbortController();

    void fetchAppShell(controller.signal)
      .then((payload) => {
        startTransition(() => {
          setState({ status: 'ready', payload });
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown renderer error',
          });
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || !routeChannelId) return;

    if (!routeChannelExists) {
      navigate(resolveDefaultChatPath(selectedChannelId), { replace: true });
      return;
    }

    if (!shouldWakeRouteChannelOnEntry({
      routeChannelId,
      routeChannelExists,
      selectedChannelId,
      selectedChannelViewId,
      entryLifecycleState: selectedChannelEntryLifecycle,
    })) {
      return;
    }

    const controller = new AbortController();
    updateSelectedChannel(routeChannelId, controller.signal)
      .then(p => {
        if (!controller.signal.aborted) {
          startTransition(() => setState({ status: 'ready', payload: p }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          navigate(resolveDefaultChatPath(selectedChannelId), { replace: true });
        }
      });

    return () => controller.abort();
  }, [
    navigate,
    routeChannelExists,
    routeChannelId,
    selectedChannelId,
    selectedChannelEntryLifecycle,
    selectedChannelViewId,
    state.status,
  ]);

  useEffect(() => {
    if (state.status !== 'ready' || !showingNewChatDraft || !draftLeadCatId) {
      return;
    }

    const catExists = state.payload.chat.cats.some((cat) =>
      cat.id === draftLeadCatId && cat.status === 'active');
    if (!catExists) {
      navigate(NEW_CHAT_PATH, { replace: true });
    }
  }, [draftLeadCatId, navigate, showingNewChatDraft, state]);

  useEffect(() => {
    if (!readyPayload?.setupCompleteAt) {
      setOperatorState({
        status: 'idle',
        snapshot: null,
        message: '',
      });
      return;
    }

    const controller = new AbortController();
    setOperatorState((current) => ({
      status: 'loading',
      snapshot: current.snapshot,
      message: '',
    }));

    void fetchOperatorLoopSnapshot(controller.signal)
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          startTransition(() => {
            setOperatorState({
              status: 'ready',
              snapshot,
              message: '',
            });
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOperatorState((current) => ({
            status: 'error',
            snapshot: current.snapshot,
            message: error instanceof Error ? error.message : 'Failed to load operator loop.',
          }));
        }
      });

    return () => controller.abort();
  }, [operatorRefreshKey, readyPayload?.setupCompleteAt]);

  // --- Callbacks ---

  function updatePayload(payload: AppShellPayload): void {
    startTransition(() => setState({ status: 'ready', payload }));
  }

  function onOpenChatsOverview(): void {
    if (state.status !== 'ready') return;
    navigate(resolveDefaultChatPath(state.payload.chat.selectedChannelId));
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
      navigate(resolveDefaultChatPath(payload.chat.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete chat.');
    } finally {
      setBusy('');
    }
  }

  async function onApprovalDecision(
    taskId: string,
    status: 'approved' | 'rejected',
  ): Promise<void> {
    if (!operatorState.snapshot) {
      return;
    }

    setBusy(`approval:${taskId}:${status}`);
    try {
      const snapshot = await writeCoreApprovalDecision({
        taskId,
        status,
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

  async function onCreateAndAssignCat(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state.status !== 'ready') return;
    const channelId = state.payload.chat.selectedChannelId;
    if (!channelId) return;

    setBusy('cat:create-assign');
    try {
      const trimmedName = catForm.name.trim();
      const previousIds = new Set(state.payload.chat.cats.map((p) => p.id));
      const created = await createGlobalCat({
        name: trimmedName,
        provider: catForm.provider,
        instance: catForm.instance || undefined,
        model: catForm.model || undefined,
      });
      startTransition(() => setState({ status: 'ready', payload: created }));

      const newCat = created.chat.cats.find((p) => !previousIds.has(p.id));
      if (!newCat) {
        setCatForm(emptyCatForm());
        setFeedback('Cat created. Open "Choose existing" to assign it.');
        setBusy('');
        return;
      }

      const assigned = await assignCatToChannelApi(channelId, {
        catId: newCat.id,
        provider: newCat.defaultExecutionTarget.provider,
        instance: newCat.defaultExecutionTarget.instance ?? undefined,
        model: newCat.defaultExecutionTarget.model ?? undefined,
      });
      startTransition(() => {
        setState({ status: 'ready', payload: assigned });
        setCatForm(emptyCatForm());
        setAddCatOpen(false);
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to create cat.');
    } finally {
      setBusy('');
    }
  }

  async function onAssignExistingCat(cat: { id: string; defaultExecutionTarget: { provider: string; instance: string | null; model: string | null } }): Promise<void> {
    if (state.status !== 'ready') return;
    const channelId = state.payload.chat.selectedChannelId;
    if (!channelId) return;

    setBusy(`cat:assign:${cat.id}`);
    try {
      const payload = await assignCatToChannelApi(channelId, {
        catId: cat.id,
        provider: cat.defaultExecutionTarget.provider,
        instance: cat.defaultExecutionTarget.instance ?? undefined,
        model: cat.defaultExecutionTarget.model ?? undefined,
      });
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to assign cat.');
    } finally {
      setBusy('');
    }
  }

  async function onRemoveAssignedCat(cat: { id: string }): Promise<void> {
    if (state.status !== 'ready') return;
    const channelId = state.payload.chat.selectedChannelId;
    if (!channelId) return;

    setBusy(`cat:remove:${cat.id}`);
    try {
      const payload = await removeCatFromChannelApi(channelId, cat.id);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to remove cat.');
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

  const loadFolderBrowse = useCallback(async (targetPath?: string): Promise<void> => {
    setFolderBrowseLoading(true);
    setFolderBrowseError('');
    try {
      const result = await browseDirectories(targetPath);
      setFolderBrowseCurrentPath(result.current);
      setFolderBrowseParentPath(result.parent);
      setFolderBrowsePath(result.current);
      setFolderBrowseEntries(result.entries);
      setFolderBrowseError(result.error ?? '');
    } catch (error) {
      setFolderBrowseError(error instanceof Error ? error.message : 'Failed to load folders.');
      setFolderBrowseEntries([]);
      if (targetPath) {
        setFolderBrowsePath(targetPath);
      }
    } finally {
      setFolderBrowseLoading(false);
    }
  }, []);

  async function submitComposerMessage(): Promise<void> {
    if (state.status !== 'ready') return;

    const body = composerDraft.trim();
    if (!body) return;

    const initialPayload = state.payload;
    const wasDraftingNewChat = showingNewChatDraft;
    let payload = initialPayload;
    let rollbackPayload = initialPayload;
    let channelId = wasDraftingNewChat ? '' : initialPayload.chat.selectedChannelId;
    let rollbackPath = wasDraftingNewChat ? buildNewChatPath(draftLeadCatId) : location.pathname;

    setBusy('message:send');
    setFeedback('');
    try {
      if (wasDraftingNewChat) {
        const optimisticDraft = createOptimisticDraftPayload(initialPayload, body, draftLeadCatId);
        payload = optimisticDraft.payload;
        setState({ status: 'ready', payload });
        setComposerDraft('');
        navigate(buildChannelPath(optimisticDraft.channelId), { replace: true });

        const createdPayload = await createChatChannel({
          title: createDraftChannelTitle(body, initialPayload.chat.channels.length),
          topic: createDraftChannelTopic(body),
          skipBossCatGreeting: true,
          repoPath: draftCwd ?? undefined,
          ...(draftLeadCatId ? {
            roomMode: 'direct_cat_chat' as const,
            leadParticipantId: draftLeadCatId,
            participantCatIds: [draftLeadCatId, ...draftCatIds.filter((id) => id !== draftLeadCatId)],
          } : draftCatIds.length > 0 ? {
            participantCatIds: draftCatIds,
          } : {}),
        });
        channelId = createdPayload.chat.selectedChannelId;
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }

        let latestPayload = createdPayload;
        for (const catId of draftCatIds.filter((id) => id !== draftLeadCatId)) {
          const cat = initialPayload.chat.cats.find((p) => p.id === catId);
          if (cat) {
            latestPayload = await assignCatToChannelApi(channelId, {
              catId: cat.id,
              provider: cat.defaultExecutionTarget.provider,
              instance: cat.defaultExecutionTarget.instance ?? undefined,
              model: cat.defaultExecutionTarget.model ?? undefined,
            });
          }
        }

        rollbackPayload = latestPayload;
        rollbackPath = buildChannelPath(channelId);
        payload = appendOptimisticUserMessage(latestPayload, channelId, body);
        setState({ status: 'ready', payload });
        navigate(rollbackPath, { replace: true });
      } else {
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }
        payload = appendOptimisticUserMessage(payload, channelId, body);
        setState({ status: 'ready', payload });
        setComposerDraft('');
      }

      if (!channelId) {
        throw new Error('No chat is available for sending messages.');
      }

      let messageBody = body;
      const filesToUpload = wasDraftingNewChat ? draftFiles : channelFiles;
      if (filesToUpload.length > 0) {
        const selectedForFiles =
          payload.chat.selectedChannel?.id === channelId
            ? payload.chat.selectedChannel
            : null;
        if (!selectedForFiles?.repoPath && !selectedForFiles?.chatCwd) {
          const warmed = await updateSelectedChannel(channelId);
          payload = warmed;
          rollbackPayload = warmed;
          setState({ status: 'ready', payload: warmed });
        }
        const attachments = await uploadChannelAttachments(channelId, filesToUpload);
        const refs = attachments.map((a) => `- ${a.relativePath}`).join('\n');
        messageBody = `[Attached files in working directory:]\n${refs}\n\n${body}`;
      }

      const dispatch = await sendChatMessage(channelId, { body: messageBody });
      setState({ status: 'ready', payload: dispatch.appShell });
      setComposerDraft('');
      setFeedback('');
      navigate(buildChannelPath(channelId), { replace: true });

      if (wasDraftingNewChat) {
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftFiles([]);
      } else {
        setChannelFiles([]);
      }
    } catch (error) {
      setState({ status: 'ready', payload: rollbackPayload });
      setComposerDraft(body);
      setFeedback(error instanceof Error ? error.message : 'Failed to send message.');
      navigate(rollbackPath, { replace: true });
    } finally {
      setBusy('');
    }
  }

  async function onSendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submitComposerMessage();
  }

  async function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): Promise<void> {
    if (
      !shouldSubmitComposerOnKeyDown({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) return;
    event.preventDefault();
    await submitComposerMessage();
  }

  async function handlePickFolder(): Promise<void> {
    setFolderBrowsePath(draftCwd ?? '');
    setFolderBrowserOpen(true);
    await loadFolderBrowse(draftCwd ?? undefined);
  }

  function toggleDraftCat(catId: string): void {
    setDraftCatIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    );
  }

  async function onCreateAndDraftCat(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state.status !== 'ready') return;
    setBusy('cat:create-assign');
    try {
      const previousIds = new Set(state.payload.chat.cats.map((p) => p.id));
      const created = await createGlobalCat({
        name: catForm.name.trim(),
        provider: catForm.provider,
        instance: catForm.instance || undefined,
        model: catForm.model || undefined,
      });
      startTransition(() => setState({ status: 'ready', payload: created }));
      const newCat = created.chat.cats.find((p) => !previousIds.has(p.id));
      if (newCat) {
        setDraftCatIds((prev) => [...prev, newCat.id]);
      }
      setCatForm(emptyCatForm());
      setAddCatOpen(false);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to create cat.');
    } finally {
      setBusy('');
    }
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

  const selectedChannel = routeChannelId
    && readySelectedChannel?.id === routeChannelId
    ? readySelectedChannel
    : null;
  const activeMyCatId = showingNewChatDraft
    ? draftLeadCatId
    : selectedChannel?.roomRouting?.mode === 'direct_cat_chat'
      ? selectedChannel.roomRouting.leadParticipantId ?? null
      : null;

  const activeAssignedCats =
    selectedChannel?.assignedCats.filter((cat) => cat.status === 'active') ?? [];
  const assignedCatIds = new Set(selectedChannel?.assignedCats.map((cat) => cat.catId) ?? []);
  const bossCatName = resolveBossCatName(payload) ?? 'Orchestrator';
  const bossCatAvatarColor = payload.chat.cats.find(
    (cat) => cat.id === payload.chat.bossCatId,
  )?.avatarColor ?? null;
  const showBossCatAvatar = Boolean(payload.chat.bossCatId)
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
          if (target.kind === 'existing_channel') {
            onSelect(target.channelId);
            return;
          }
          setFeedback('');
          setAddCatOpen(false);
          setPlusMenuOpen(false);
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
                autoResize={autoResize}
              />
            ) : (
              <BootShell />
            )
          } />
          <Route
            path="/chats"
            element={<Navigate to={resolveDefaultChatPath(payload.chat.selectedChannelId)} replace />}
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
              onPickFolder={() => { void handlePickFolder(); setPlusMenuOpen(false); }}
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
            />
          } />
          <Route
            path="*"
            element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
          />
        </Routes>
      </main>

      {addCatOpen && (selectedChannel || showingNewChatDraft) ? (
        <AddCatPanel
          panelRef={addCatPanelRef}
          selectableCats={selectableCats}
          assignableCatCount={assignableCatCount}
          addCatTab={addCatTab}
          busy={busy}
          feedback={feedback}
          showingNewChatDraft={showingNewChatDraft}
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
            if (showingNewChatDraft) {
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
          onBrowse={(path) => void loadFolderBrowse(path)}
          onClose={() => { setFolderBrowserOpen(false); setFolderBrowseError(''); }}
          onSelect={() => {
            if (!folderBrowseCurrentPath || folderBrowseError) return;
            setDraftCwd(folderBrowseCurrentPath);
            setFolderBrowserOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
