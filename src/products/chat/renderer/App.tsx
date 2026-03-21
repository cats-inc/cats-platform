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
  buildChannelPath,
  isNewChatPath,
  NEW_CHAT_PATH,
  resolveAppEntryPath,
  resolveDefaultChatPath,
} from '../../../shared/channelPaths';
import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../shared/sidebarPreference';
import type {
  AppShellPayload,
  WorkspaceChannelSummary,
  WorkspaceChannelView,
  WorkspaceMessage,
  WorkspacePal,
} from '../../../shared/app-shell';
import {
  activateWorkspaceChannel,
  assignPalToWorkspaceChannel,
  completeSetup,
  createGlobalPal,
  resetSetup,
  createWorkspaceChannel,
  deleteWorkspaceChannel,
  fetchAppShell,
  sendWorkspaceMessage,
  updateSelectedChannel,
  updateVerbosePreference,
  deleteGlobalPal,
} from './api';
import { ProviderModelFields } from './components/ProviderModelFields';
import { getProviderDisplayName } from './providerCatalog';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type Surface = 'chats' | 'settings';

interface PalFormState {
  name: string;
  provider: string;
  instance: string;
  model: string;
}

function emptyPalForm(): PalFormState {
  return {
    name: '',
    provider: 'claude',
    instance: '',
    model: '',
  };
}


function executionLabel(pal: WorkspacePal): string {
  const name = getProviderDisplayName(pal.defaultExecutionTarget.provider);
  const parts = [name];
  if (pal.defaultExecutionTarget.instance) {
    parts.push(pal.defaultExecutionTarget.instance);
  }
  if (pal.defaultExecutionTarget.model) {
    parts.push(pal.defaultExecutionTarget.model);
  }
  return parts.join(' / ');
}

function createDraftChannelTitle(body: string, existingCount: number): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return existingCount > 0 ? `New chat ${existingCount + 1}` : 'New chat';
  }

  return normalized.slice(0, 48);
}

function createDraftChannelTopic(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 120);
}

function messageTone(senderKind: string): string {
  switch (senderKind) {
    case 'user':
      return 'transcriptMessage transcriptMessageUser';
    case 'orchestrator':
      return 'transcriptMessage transcriptMessageOrchestrator';
    case 'agent':
      return 'transcriptMessage transcriptMessageAgent';
    default:
      return 'transcriptMessage transcriptMessageSystem';
  }
}

function presentChannelTitle(title: string): string {
  return title.trim() === 'Untitled chat' ? 'New chat' : title;
}

function palInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function truncatePath(fullPath: string, maxLen = 20): string {
  const name = fullPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? fullPath;
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 3) + '...';
}

const GREETING_LINES = [
  "Meow. Ready when you are.",
  "Your cat hasn't napped yet.",
  "Cats on the keyboard.",
  "Tail up, let's go.",
  "Purring in standby.",
  "Claws sharpened. What's the task?",
  "This cat doesn't sleep on the job.",
];

function pickGreeting(): string {
  return GREETING_LINES[Math.floor(Math.random() * GREETING_LINES.length)];
}

function resolveBossCatName(payload: AppShellPayload): string | null {
  if (!payload.workspace.bossCatId) {
    return null;
  }

  return payload.workspace.pals.find((pal) => pal.id === payload.workspace.bossCatId)?.name ?? null;
}

type SelectedChannelView = NonNullable<AppShellPayload['workspace']['selectedChannel']>;

function createEmptyParticipantLease(): SelectedChannelView['orchestratorLease'] {
  return {
    sessionId: null,
    status: 'not_started',
    cwd: null,
    lastError: null,
    provider: null,
    model: null,
    startedAt: null,
    lastUsedAt: null,
  };
}

function createOptimisticUserMessage(
  channelId: string,
  body: string,
  senderName: string,
  createdAt: string,
): WorkspaceMessage {
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    channelId,
    senderKind: 'user',
    senderName: senderName.trim() || 'User',
    body,
    mentions: [],
    metadata: { optimistic: true },
    usage: null,
    createdAt,
  };
}

function createOptimisticDraftPayload(
  payload: AppShellPayload,
  body: string,
): { payload: AppShellPayload; channelId: string } {
  const createdAt = new Date().toISOString();
  const channelId = `draft-${crypto.randomUUID()}`;
  const title = createDraftChannelTitle(body, payload.workspace.channels.length);
  const topic = createDraftChannelTopic(body);
  const message = createOptimisticUserMessage(channelId, body, payload.ownerDisplayName, createdAt);
  const channelSummary: WorkspaceChannelSummary = {
    id: channelId,
    title,
    topic,
    status: 'planned',
    unreadCount: 0,
    palCount: 0,
    activePalCount: 0,
    repoPath: null,
    workspaceCwd: null,
    lastMessageAt: createdAt,
    lastActivatedAt: null,
  };
  const selectedChannel: WorkspaceChannelView = {
    id: channelId,
    title,
    topic,
    status: 'planned',
    unreadCount: 0,
    repoPath: null,
    workspaceCwd: null,
    language: null,
    responseLanguage: 'en',
    formationMode: 'manual',
    skillProfile: 'workspace-default',
    mcpProfile: 'workspace-memory',
    orchestratorRoles: [],
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: createdAt,
    lastActivatedAt: null,
    orchestratorLease: createEmptyParticipantLease(),
    palAssignments: [],
    messages: [message],
    assignedPals: [],
  };

  return {
    channelId,
    payload: {
      ...structuredClone(payload),
      workspace: {
        ...structuredClone(payload.workspace),
        channels: [channelSummary, ...structuredClone(payload.workspace.channels)],
        selectedChannelId: channelId,
        selectedChannel,
      },
      metadata: {
        ...structuredClone(payload.metadata),
        generatedAt: createdAt,
      },
    },
  };
}

function appendOptimisticUserMessage(
  payload: AppShellPayload,
  channelId: string,
  body: string,
): AppShellPayload {
  const createdAt = new Date().toISOString();
  const next = structuredClone(payload);
  const selectedChannel = next.workspace.selectedChannel;
  const channelSummary = next.workspace.channels.find((channel) => channel.id === channelId);

  if (!selectedChannel || selectedChannel.id !== channelId || !channelSummary) {
    throw new Error('No chat is available for optimistic updates.');
  }

  selectedChannel.messages.push(
    createOptimisticUserMessage(channelId, body, next.ownerDisplayName, createdAt),
  );
  selectedChannel.updatedAt = createdAt;
  selectedChannel.lastMessageAt = createdAt;
  selectedChannel.unreadCount = 0;

  channelSummary.lastMessageAt = createdAt;
  channelSummary.unreadCount = 0;
  next.workspace.selectedChannelId = channelId;
  next.metadata.generatedAt = createdAt;

  return next;
}

function BootShell() {
  return (
    <div className="screen bootShell" aria-label="Loading Cats Chat">
      <div className="bootSpinner" aria-hidden="true" />
    </div>
  );
}

function SetupWizard({
  payload,
  onComplete,
}: {
  payload: AppShellPayload;
  onComplete: (payload: AppShellPayload) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState('');
  const [bossCatName, setBossCatName] = useState('Smelly');
  const [provider, setProvider] = useState('claude');
  const [instance, setInstance] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function handleComplete(): Promise<void> {
    setBusy(true);
    try {
      const result = await completeSetup({
        ownerDisplayName: ownerName.trim(),
        bossCatName: bossCatName.trim() || 'Smelly',
        bossCatProvider: provider,
        bossCatInstance: instance || undefined,
        bossCatModel: model || undefined,
      });
      onComplete(result);
      navigate(resolveDefaultChatPath(result.workspace.selectedChannelId), { replace: true });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screenCentered">
      <div className="setupWizard">
        <div className="setupStepIndicator">
          <span className={step >= 1 ? 'setupDot setupDotActive' : 'setupDot'} />
          <span className={step >= 2 ? 'setupDot setupDotActive' : 'setupDot'} />
        </div>

        {step === 1 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">Cats Chat</p>
            <h1>Welcome to Cats Chat</h1>
            <p className="heroNote">
              Let&apos;s get you set up. This will only take a moment.
            </p>
            <label className="fieldLabel">
              <span>Your name</span>
              <input
                className="textInput"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Your display name"
              />
            </label>
            <button
              className="primaryButton"
              disabled={!ownerName.trim()}
              type="button"
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="contentCard setupCard">
            <p className="eyebrow">Boss Cat</p>
            <h1>Meet your Boss Cat</h1>
            <p className="heroNote">
              Your Boss Cat is your primary AI assistant. You can change these settings later.
            </p>
            <label className="fieldLabel">
              <span>Name</span>
              <input
                className="textInput"
                value={bossCatName}
                onChange={(e) => setBossCatName(e.target.value)}
                placeholder="Smelly"
              />
            </label>
            <ProviderModelFields
              provider={provider}
              instance={instance}
              model={model}
              onTargetChange={(target) => {
                setProvider(target.provider);
                setInstance(target.instance);
                setModel(target.model);
              }}
            />
            <div className="setupRuntimeStatus">
              <span
                className={
                  payload.runtime.reachable
                    ? 'statusChip statusChipReady'
                    : 'statusChip statusChipWarm'
                }
              >
                {payload.runtime.reachable
                  ? 'Cats Runtime connected'
                  : 'Cats Runtime not detected'}
              </span>
            </div>
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <div className="setupActions">
              <button
                className="setupBackButton"
                type="button"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="primaryButton"
                disabled={!bossCatName.trim() || !model.trim() || busy}
                type="button"
                onClick={() => void handleComplete()}
              >
                {busy ? 'Setting up...' : 'Get started'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const channelMatch = useMatch('/chats/:channelId');
  const routeChannelId = channelMatch?.params.channelId ?? null;
  const showingNewChatDraft = isNewChatPath(location.pathname);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [composerDraft, setComposerDraft] = useState('');
  const [palForm, setPalForm] = useState<PalFormState>(emptyPalForm);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [addPalOpen, setAddPalOpen] = useState(false);
  const [addPalTab, setAddPalTab] = useState<'existing' | 'new'>('existing');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    readSidebarOpenPreference(typeof window === 'undefined' ? null : window.localStorage),
  );
  const [overflowMenuOpenId, setOverflowMenuOpenId] = useState<string | null>(null);
  const [greeting] = useState(pickGreeting);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [draftCwd, setDraftCwd] = useState<string | null>(null);
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [draftIncludeBossCat, setDraftIncludeBossCat] = useState(true);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readyWorkspace = state.status === 'ready' ? state.payload.workspace : null;
  const selectedChannelId = readyWorkspace?.selectedChannelId ?? null;
  const selectedChannelViewId = readyWorkspace?.selectedChannel?.id ?? null;
  const routeChannelExists = Boolean(
    routeChannelId && readyWorkspace?.channels.some((channel) => channel.id === routeChannelId),
  );
  const routeChannelTitle = routeChannelId
    ? readyWorkspace?.channels.find((channel) => channel.id === routeChannelId)?.title ?? null
    : null;

  useEffect(() => {
    document.title = routeChannelTitle
      ? `${presentChannelTitle(routeChannelTitle)} - Cats Chat`
      : 'Cats Chat';
  }, [routeChannelTitle]);

  useEffect(() => {
    if (!accountMenuOpen && !overflowMenuOpenId && !plusMenuOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (accountMenuOpen && accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
      if (overflowMenuOpenId) {
        const menu = document.querySelector('.recentOverflowMenu');
        const button = (e.target as Element).closest?.('.recentOverflowButton');
        if (!menu?.contains(target) && !button) {
          setOverflowMenuOpenId(null);
        }
      }
      if (plusMenuOpen && plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setPlusMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accountMenuOpen, overflowMenuOpenId, plusMenuOpen]);

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
    if (selectedChannelId === routeChannelId && selectedChannelViewId === routeChannelId) return;

    if (!routeChannelExists) {
      navigate(resolveDefaultChatPath(selectedChannelId), { replace: true });
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
    selectedChannelViewId,
    state.status,
  ]);

  function onOpenChatsOverview(): void {
    if (state.status !== 'ready') {
      return;
    }

    navigate(resolveDefaultChatPath(state.payload.workspace.selectedChannelId));
    setFeedback('');
    setAddPalOpen(false);
  }

  function onToggleSidebar(): void {
    setSidebarOpen((current) => {
      if (current) setAccountMenuOpen(false);
      return !current;
    });
  }

  function onCollapsedSidebarClick(event: ReactMouseEvent<HTMLElement>): void {
    if (sidebarOpen) {
      return;
    }

    const target = event.target as HTMLElement;
    if (
      target.closest('button, a, input, textarea, select, [role="button"]')
      || target.closest('.accountMenu')
    ) {
      return;
    }

    setSidebarOpen(true);
  }

  function onSelect(channelId: string): void {
    navigate(buildChannelPath(channelId));
    setFeedback('');
    setAddPalOpen(false);
  }

  async function onDeleteChannel(channelId: string): Promise<void> {
    setBusy(`channel:delete:${channelId}`);
    try {
      const payload = await deleteWorkspaceChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setAddPalOpen(false);
        setFeedback('');
      });
      navigate(resolveDefaultChatPath(payload.workspace.selectedChannelId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to delete chat.');
    } finally {
      setBusy('');
    }
  }

  async function onCreatePal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy('pal:create');
    try {
      const payload = await createGlobalPal({
        name: palForm.name,
        provider: palForm.provider,
        instance: palForm.instance || undefined,
        model: palForm.model || undefined,
      });
      startTransition(() => {
        setState({ status: 'ready', payload });
        setPalForm(emptyPalForm());
        setFeedback('Cat saved.');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to save cat.');
    } finally {
      setBusy('');
    }
  }

  async function onCreateAndAssignPal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state.status !== 'ready') return;
    const channelId = state.payload.workspace.selectedChannelId;
    if (!channelId) return;

    setBusy('pal:create-assign');
    try {
      const trimmedName = palForm.name.trim();
      const previousIds = new Set(state.payload.workspace.pals.map((p) => p.id));
      const created = await createGlobalPal({
        name: trimmedName,
        provider: palForm.provider,
        instance: palForm.instance || undefined,
        model: palForm.model || undefined,
      });
      startTransition(() => setState({ status: 'ready', payload: created }));

      const newPal = created.workspace.pals.find((p) => !previousIds.has(p.id));
      if (!newPal) {
        setPalForm(emptyPalForm());
        setFeedback('Cat created. Open "Choose existing" to assign it.');
        setBusy('');
        return;
      }

      const assigned = await assignPalToWorkspaceChannel(channelId, {
        palId: newPal.id,
        provider: newPal.defaultExecutionTarget.provider,
        instance: newPal.defaultExecutionTarget.instance ?? undefined,
        model: newPal.defaultExecutionTarget.model ?? undefined,
      });
      startTransition(() => {
        setState({ status: 'ready', payload: assigned });
        setPalForm(emptyPalForm());
        setAddPalOpen(false);
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to create cat.');
    } finally {
      setBusy('');
    }
  }

  async function onAssignExistingPal(pal: WorkspacePal): Promise<void> {
    if (state.status !== 'ready') return;
    const channelId = state.payload.workspace.selectedChannelId;
    if (!channelId) return;

    setBusy(`pal:assign:${pal.id}`);
    try {
      const payload = await assignPalToWorkspaceChannel(channelId, {
        palId: pal.id,
        provider: pal.defaultExecutionTarget.provider,
        instance: pal.defaultExecutionTarget.instance ?? undefined,
        model: pal.defaultExecutionTarget.model ?? undefined,
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

  async function onResetSetup(): Promise<void> {
    if (!window.confirm('This will erase all chats, cats, and settings. Continue?')) {
      return;
    }
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
    navigate(NEW_CHAT_PATH);
    setComposerDraft('');
    setFeedback('');
    setAddPalOpen(false);
    setPlusMenuOpen(false);
    setDraftCwd(null);
    setDraftCatIds([]);
    setDraftFiles([]);
    setDraftIncludeBossCat(true);
  }

  async function submitComposerMessage(): Promise<void> {
    if (state.status !== 'ready') return;

    const body = composerDraft.trim();
    if (!body) {
      return;
    }

    const initialPayload = state.payload;
    const wasDraftingNewChat = showingNewChatDraft;
    let payload = initialPayload;
    let rollbackPayload = initialPayload;
    let channelId = wasDraftingNewChat ? '' : initialPayload.workspace.selectedChannelId;
    let rollbackPath = wasDraftingNewChat ? NEW_CHAT_PATH : location.pathname;

    setBusy('message:send');
    setFeedback('');
    try {
      if (wasDraftingNewChat) {
        const optimisticDraft = createOptimisticDraftPayload(initialPayload, body);
        payload = optimisticDraft.payload;
        setState({ status: 'ready', payload });
        setComposerDraft('');
        navigate(buildChannelPath(optimisticDraft.channelId), { replace: true });

        const createdPayload = await createWorkspaceChannel({
          title: createDraftChannelTitle(body, initialPayload.workspace.channels.length),
          topic: createDraftChannelTopic(body),
          skipBossCatGreeting: true,
          repoPath: draftCwd ?? undefined,
        });
        channelId = createdPayload.workspace.selectedChannelId;
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }

        let latestPayload = createdPayload;
        for (const palId of draftCatIds) {
          const pal = initialPayload.workspace.pals.find((p) => p.id === palId);
          if (pal) {
            latestPayload = await assignPalToWorkspaceChannel(channelId, {
              palId: pal.id,
              provider: pal.defaultExecutionTarget.provider,
              instance: pal.defaultExecutionTarget.instance ?? undefined,
              model: pal.defaultExecutionTarget.model ?? undefined,
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

      if (!payload.workspace.selectedChannel?.orchestratorLease.sessionId) {
        const activation = await activateWorkspaceChannel(channelId);
        rollbackPayload = activation.appShell;
      }

      const dispatch = await sendWorkspaceMessage(channelId, { body });
      setState({ status: 'ready', payload: dispatch.appShell });
      setComposerDraft('');
      setFeedback('');
      navigate(buildChannelPath(channelId), { replace: true });

      if (wasDraftingNewChat) {
        setDraftCwd(null);
        setDraftCatIds([]);
        setDraftFiles([]);
        setDraftIncludeBossCat(true);
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
    ) {
      return;
    }

    event.preventDefault();
    await submitComposerMessage();
  }

  async function handlePickFolder(): Promise<void> {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as unknown as { showDirectoryPicker(): Promise<{ name: string }> }).showDirectoryPicker();
        setDraftCwd(handle.name);
      }
    } catch {
      // User cancelled or API not available
    }
  }

  function toggleDraftCat(palId: string): void {
    setDraftCatIds((prev) =>
      prev.includes(palId) ? prev.filter((id) => id !== palId) : [...prev, palId],
    );
  }

  async function onCreateAndDraftPal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state.status !== 'ready') return;
    setBusy('pal:create-assign');
    try {
      const previousIds = new Set(state.payload.workspace.pals.map((p) => p.id));
      const created = await createGlobalPal({
        name: palForm.name.trim(),
        provider: palForm.provider,
        instance: palForm.instance || undefined,
        model: palForm.model || undefined,
      });
      startTransition(() => setState({ status: 'ready', payload: created }));
      const newPal = created.workspace.pals.find((p) => !previousIds.has(p.id));
      if (newPal) {
        setDraftCatIds((prev) => [...prev, newPal.id]);
      }
      setPalForm(emptyPalForm());
      setAddPalOpen(false);
      setFeedback('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to create cat.');
    } finally {
      setBusy('');
    }
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
    && payload.workspace.selectedChannel?.id === routeChannelId
    ? payload.workspace.selectedChannel
    : null;

  const activeAssignedPals =
    selectedChannel?.assignedPals.filter((pal) => pal.status === 'active') ?? [];
  const activePalIds = new Set(activeAssignedPals.map((pal) => pal.palId));
  const bossCatName = resolveBossCatName(payload) ?? 'Orchestrator';
  const bossCatAvatarColor = payload.workspace.pals.find(
    (pal) => pal.id === payload.workspace.bossCatId,
  )?.avatarColor ?? null;
  const showBossCatAvatar = Boolean(payload.workspace.bossCatId)
    && !activeAssignedPals.some((pal) => pal.palId === payload.workspace.bossCatId);
  const assignablePalCount = payload.workspace.pals.filter(
    (pal) => pal.status === 'active' && pal.id !== payload.workspace.bossCatId,
  ).length;
  const unassignedPals = payload.workspace.pals.filter(
    (pal) =>
      pal.status === 'active'
      && pal.id !== payload.workspace.bossCatId
      && !activePalIds.has(pal.id),
  );
  const draftPalIds = new Set(draftCatIds);
  const hasConversationStarted =
    selectedChannel?.messages.some((message) => message.senderKind !== 'system') ?? false;

  const palCreationForm = (
    <form
      className="stackForm"
      onSubmit={(event) => {
        if (surface === 'settings') {
          void onCreatePal(event);
        } else if (showingNewChatDraft) {
          void onCreateAndDraftPal(event);
        } else {
          void onCreateAndAssignPal(event);
        }
      }}
    >
      <label className="fieldLabel">
        <span>Name</span>
        <input
          className="textInput"
          value={palForm.name}
          onChange={(event) => setPalForm({ ...palForm, name: event.target.value })}
          placeholder="Ops reviewer"
        />
      </label>
      <ProviderModelFields
        provider={palForm.provider}
        instance={palForm.instance}
        model={palForm.model}
        onTargetChange={(target) =>
          setPalForm({
            ...palForm,
            provider: target.provider,
            instance: target.instance,
            model: target.model,
          })}
      />
      <button
        className="primaryButton"
        disabled={!palForm.name.trim() || !palForm.provider.trim() || !palForm.model.trim()}
        type="submit"
      >
        {busy === 'pal:create' || busy === 'pal:create-assign'
          ? 'Saving...'
          : surface === 'settings'
            ? 'Save Cat'
            : showingNewChatDraft
              ? 'Create & Add'
              : 'Create & Add to Chat'}
      </button>
    </form>
  );

  return (
    <div
      className={
        sidebarOpen
          ? 'screen claudeShell'
          : 'screen claudeShell claudeShellSidebarCollapsed'
      }
    >
      <aside
        className={sidebarOpen ? 'sidebar' : 'sidebar sidebarCollapsed'}
        onClick={(event) => onCollapsedSidebarClick(event)}
      >
        <div className="sidebarInner">
          <div className="brandRow">
            <div className="brandCopy">
              <p className="brandLabel">Cats Chat</p>
            </div>
            <button
              className="chromeButton"
              type="button"
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              onClick={onToggleSidebar}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="2" width="14" height="12" rx="2" />
                <path d="M6 2v12" />
              </svg>
            </button>
          </div>

          <nav className="navGroup" aria-label="Primary">
            <button
              className="navItem"
              onClick={() => void onStartNewChat()}
              type="button"
            >
              <span className="navGlyph" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v10" />
                  <path d="M3 8h10" />
                </svg>
              </span>
              <span className="navLabel">New chat</span>
            </button>
          </nav>

          <nav className="navGroup navGroupWorkspace" aria-label="Workspace">
            <button
              className={surface === 'chats' ? 'navItem navItemActive' : 'navItem'}
              onClick={onOpenChatsOverview}
              type="button"
            >
              <span className="navGlyph navGlyphSquare" aria-hidden="true" />
              <span className="navLabel">Chats</span>
            </button>
          </nav>

          <section className="recentSection">
            <p className="sectionLabel">Recents</p>
            <div className="recentList">
              {payload.workspace.channels.length > 0 ? (
                payload.workspace.channels.map((channel) => (
                  <article
                    key={channel.id}
                    className={
                      routeChannelId === channel.id
                        ? 'recentItemCard recentItemSelected'
                        : 'recentItemCard'
                    }
                  >
                    <button
                      className="recentSelectButton"
                      onClick={() => onSelect(channel.id)}
                      type="button"
                    >
                      <strong>{presentChannelTitle(channel.title)}</strong>
                    </button>
                    <button
                      className="recentOverflowButton"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverflowMenuOpenId(overflowMenuOpenId === channel.id ? null : channel.id);
                      }}
                    >
                      ⋯
                    </button>
                    {overflowMenuOpenId === channel.id ? (
                      <div className="recentOverflowMenu">
                        <button
                          type="button"
                          disabled={busy === `channel:delete:${channel.id}`}
                          onClick={() => {
                            setOverflowMenuOpenId(null);
                            void onDeleteChannel(channel.id);
                          }}
                        >
                          {busy === `channel:delete:${channel.id}` ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="recentEmpty">
                  <p>No chats yet</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="sidebarFooter" ref={accountMenuRef}>
          <button
            className="sidebarFooterButton"
            type="button"
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            aria-label="Account menu"
          >
            <div className="profileBadge">{palInitials(payload.ownerDisplayName)}</div>
            <div className="sidebarFooterMeta">
              <strong>{payload.ownerDisplayName}</strong>
            </div>
          </button>
          {accountMenuOpen ? (
            <div className="accountMenu">
              <button
                className="accountMenuItem"
                type="button"
                onClick={() => {
                  navigate('/settings/general');
                  setAccountMenuOpen(false);
                  setAddPalOpen(false);
                  setFeedback('');
                }}
              >
                Settings
              </button>
            </div>
          ) : null}
        </div>
      </aside>

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
            <div className="settingsShell">
              <nav className="settingsSidebar">
                <button className="settingsTab settingsTabActive" type="button" onClick={() => navigate('/settings/general')}>General</button>
                <button className="settingsTab" type="button" onClick={() => navigate('/settings/cats')}>Cats</button>
                <button className="settingsTab" type="button" onClick={() => navigate('/settings/data')}>Data</button>
              </nav>
              <div className="settingsContent">
                <h1>General</h1>
                {feedback ? <p className="feedbackText">{feedback}</p> : null}
                <div className="contentCard">
                  <label className="fieldLabel">
                    <span>Display name</span>
                    <input className="textInput" value={payload.ownerDisplayName} readOnly />
                  </label>
                  <div style={{ marginTop: 16 }}>
                    <p className="sectionLabel">Runtime</p>
                    <span className={payload.runtime.reachable ? 'statusChip statusChipReady' : 'statusChip statusChipWarm'}>
                      {payload.runtime.reachable ? 'Cats Runtime connected' : 'Cats Runtime not detected'}
                    </span>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <p className="sectionLabel">Chat</p>
                    <button
                      type="button"
                      className="toggleRow"
                      onClick={async () => {
                        const show = !payload.workspace.showVerboseMessages;
                        setState({
                          status: 'ready',
                          payload: {
                            ...payload,
                            workspace: { ...payload.workspace, showVerboseMessages: show },
                          },
                        });
                        try {
                          const next = await updateVerbosePreference(show);
                          startTransition(() => setState({ status: 'ready', payload: next }));
                        } catch (err) {
                          setState({
                            status: 'ready',
                            payload: {
                              ...payload,
                              workspace: { ...payload.workspace, showVerboseMessages: !show },
                            },
                          });
                          setFeedback(err instanceof Error ? err.message : 'Failed to update preference');
                        }
                      }}
                    >
                      <span className={payload.workspace.showVerboseMessages ? 'toggleDot toggleDotOn' : 'toggleDot'} />
                      <span>Show verbose messages</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          } />
          <Route path="/settings/cats" element={
            <div className="settingsShell">
              <nav className="settingsSidebar">
                <button className="settingsTab" type="button" onClick={() => navigate('/settings/general')}>General</button>
                <button className="settingsTab settingsTabActive" type="button" onClick={() => navigate('/settings/cats')}>Cats</button>
                <button className="settingsTab" type="button" onClick={() => navigate('/settings/data')}>Data</button>
              </nav>
              <div className="settingsContent">
                <div className="viewIntro">
                  <h1>Cats</h1>
                  <p className="heroNote">
                    Manage reusable cats across your workspace. Add them to any chat from the chat
                    view.
                  </p>
                  {feedback ? <p className="feedbackText">{feedback}</p> : null}
                </div>

                <div className="palsLayout">
                  <section className="contentCard">
                    <div className="contentCardHeader">
                      <div>
                        <p className="sectionLabel">Registry</p>
                        <h2>{payload.workspace.pals.length > 0 ? 'Saved cats' : 'No cats yet'}</h2>
                      </div>
                      <span className="countBadge">{payload.workspace.pals.length}</span>
                    </div>

                    <div className="palList">
                      {payload.workspace.pals.length > 0 ? (
                        [...payload.workspace.pals]
                          .sort((a, b) => {
                            const aIsBoss = a.id === payload.workspace.bossCatId ? 0 : 1;
                            const bIsBoss = b.id === payload.workspace.bossCatId ? 0 : 1;
                            return aIsBoss - bIsBoss;
                          })
                          .map((pal) => {
                            const isBossCat = pal.id === payload.workspace.bossCatId;
                            return (
                              <article key={pal.id} className="palCard">
                                <div className="palCardTop">
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <strong>{pal.name}</strong>
                                      {isBossCat ? <span className="statusChip statusChipAccent">Boss Cat</span> : null}
                                    </div>
                                    <p>{executionLabel(pal)}</p>
                                  </div>
                                  <div style={{ display: 'flex', alignSelf: 'start', alignItems: 'center', gap: 8 }}>
                                    <span
                                      className={
                                        pal.status === 'active'
                                          ? 'statusChip statusChipReady'
                                          : 'statusChip statusChipMuted'
                                      }
                                    >
                                      {pal.status}
                                    </span>
                                    {!isBossCat ? (
                                      <button
                                        className="chromeButton"
                                        type="button"
                                        disabled={busy === `pal:delete:${pal.id}`}
                                        onClick={async () => {
                                          setBusy(`pal:delete:${pal.id}`);
                                          setFeedback('');
                                          try {
                                            const next = await deleteGlobalPal(pal.id);
                                            setState({ status: 'ready', payload: next });
                                            setFeedback(`${pal.name} deleted.`);
                                          } catch (err) {
                                            setFeedback(err instanceof Error ? err.message : 'Failed to delete cat');
                                          } finally {
                                            setBusy('');
                                          }
                                        }}
                                        title={`Delete ${pal.name}`}
                                      >
                                        ✕
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="palMeta">
                                  <span>{pal.skillProfile ?? 'No skill profile'}</span>
                                  <span>{pal.memory.updatedAt ? 'Memory saved' : 'No memory yet'}</span>
                                </div>
                              </article>
                            );
                          })
                      ) : (
                        <div className="emptyStateCard">
                          <p>Create your first cat from the panel on the right.</p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="contentCard contentCardForm">
                    <div className="contentCardHeader">
                      <div>
                        <p className="sectionLabel">Create</p>
                        <h2>New cat</h2>
                      </div>
                    </div>
                    {palCreationForm}
                  </section>
                </div>
              </div>
            </div>
          } />
          <Route path="/settings/data" element={
            <div className="settingsShell">
              <nav className="settingsSidebar">
                <button className="settingsTab" type="button" onClick={() => navigate('/settings/general')}>General</button>
                <button className="settingsTab" type="button" onClick={() => navigate('/settings/cats')}>Cats</button>
                <button className="settingsTab settingsTabActive" type="button" onClick={() => navigate('/settings/data')}>Data</button>
              </nav>
              <div className="settingsContent">
                <h1>Data</h1>
                <div className="contentCard">
                  <h2>Reset all data</h2>
                  <p className="heroNote">
                    This will erase all chats, cats, and settings. You will be returned to the setup wizard.
                  </p>
                  {feedback ? <p className="feedbackText">{feedback}</p> : null}
                  <button
                    className="dangerButton"
                    type="button"
                    disabled={busy === 'setup:reset'}
                    onClick={() => void onResetSetup()}
                  >
                    {busy === 'setup:reset' ? 'Resetting...' : 'Reset all data'}
                  </button>
                </div>
              </div>
            </div>
          } />
          <Route path="/chats/:channelId" element={
            selectedChannel ? (
              <>
              <header className="channelTopBar">
                <div className="rosterAvatars">
                  {showBossCatAvatar ? (
                    <div className="palAvatar palAvatarOrch" title={bossCatName} style={bossCatAvatarColor ? { background: bossCatAvatarColor } : undefined}>
                      {palInitials(bossCatName)}
                    </div>
                  ) : null}
                  {activeAssignedPals.map((pal) => (
                    <div key={pal.palId} className="palAvatar" title={pal.name} style={pal.avatarColor ? { background: pal.avatarColor } : undefined}>
                      {palInitials(pal.name)}
                    </div>
                  ))}
                </div>
                <button
                  className="addPalButton"
                  type="button"
                  onClick={() => {
                    setAddPalOpen(!addPalOpen);
                    setAddPalTab('existing');
                    setFeedback('');
                    setPalForm(emptyPalForm());
                  }}
                >
                  +
                </button>
              </header>
              <div className="viewShell viewShellChannel">
                <section className={hasConversationStarted ? 'channelShell' : 'channelShell channelShellFresh'}>

                  {feedback ? <p className="feedbackText channelFeedback">{feedback}</p> : null}

                  {hasConversationStarted ? (
                    <section className="transcriptPanel">
                      <div className="transcriptList">
                        {selectedChannel.messages.filter((msg) => payload.workspace.showVerboseMessages || msg.metadata?.verbosity !== 'verbose').map((message) => (
                          <article key={message.id} className={messageTone(message.senderKind)}>
                            {message.senderKind !== 'user' ? (
                              <div className="transcriptMessageTop">
                                <strong>{message.senderName}</strong>
                              </div>
                            ) : null}
                            <p>{message.body}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="freshChatIntro">
                      <div className="draftGreeting"><h1>{greeting}</h1></div>
                    </section>
                  )}

                  <form
                    className={
                      hasConversationStarted
                        ? 'composerCard composerCardDocked'
                        : 'composerCard composerCardFresh'
                    }
                    onSubmit={(event) => void onSendMessage(event)}
                  >
                    <textarea
                      className="composerInput"
                      rows={1}
                      placeholder="How can I help you today?"
                      value={composerDraft}
                      onChange={(event) => { setComposerDraft(event.target.value); autoResize(event.target); }}
                      onKeyDown={(event) => void onComposerKeyDown(event)}
                    />
                    <div className="composerBottomRow">
                      <button className="composerPlusButton" type="button" aria-label="Attach">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3v10" />
                          <path d="M3 8h10" />
                        </svg>
                      </button>
                      <button
                        className="composerSendButton"
                        disabled={!composerDraft.trim() || busy === 'message:send'}
                        type="submit"
                        aria-label="Send"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 13V3" />
                          <path d="M3 7l5-5 5 5" />
                        </svg>
                      </button>
                    </div>
                  </form>
                </section>
              </div>
              </>
            ) : (
              <BootShell />
            )
          } />
          <Route
            path="/chats"
            element={<Navigate to={resolveDefaultChatPath(payload.workspace.selectedChannelId)} replace />}
          />
          <Route path={NEW_CHAT_PATH} element={
            <div className="viewShell viewShellDraft">
              <section className="draftShell">
                <div className="draftGreeting"><h1>{greeting}</h1></div>
                <form className="composerCard composerCardFresh" onSubmit={(event) => void onSendMessage(event)}>
                  {draftFiles.length > 0 ? (
                    <div className="composerAttachments">
                      {draftFiles.map((file, index) => {
                        const isImage = file.type.startsWith('image/');
                        return (
                          <div key={`${file.name}-${file.size}-${index}`} className="attachmentCard">
                            <button
                              className="attachmentRemove"
                              type="button"
                              onClick={() => setDraftFiles((prev) => prev.filter((_, i) => i !== index))}
                              aria-label={`Remove ${file.name}`}
                            >
                              ×
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
                    className="composerInput"
                    rows={1}
                    placeholder="How can I help you today?"
                    value={composerDraft}
                    onChange={(event) => { setComposerDraft(event.target.value); autoResize(event.target); }}
                    onKeyDown={(event) => void onComposerKeyDown(event)}
                  />
                  <div className="composerBottomRow">
                    <div className="composerLeftGroup">
                      <div className="composerPlusWrapper" ref={plusMenuRef}>
                        <button
                          className="composerPlusButton"
                          type="button"
                          aria-label="Attach"
                          onClick={() => setPlusMenuOpen(!plusMenuOpen)}
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
                              onClick={() => { fileInputRef.current?.click(); setPlusMenuOpen(false); }}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
                                <path d="M8 2v8" />
                                <path d="M4 6l4-4 4 4" />
                              </svg>
                              新增照片和檔案
                            </button>
                            <button
                              className="composerPlusMenuItem"
                              type="button"
                              onClick={() => { void handlePickFolder(); setPlusMenuOpen(false); }}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                              </svg>
                              指定本機資料夾
                            </button>
                            <button
                              className="composerPlusMenuItem"
                              type="button"
                              onClick={() => {
                                setPlusMenuOpen(false);
                                setAddPalOpen(true);
                                setAddPalTab('existing');
                                setPalForm(emptyPalForm());
                                setFeedback('');
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="8" cy="5" r="3" />
                                <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" />
                              </svg>
                              增加 Cat
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {draftCwd ? (
                        <span className="composerCwdChip" title={draftCwd}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                          </svg>
                          <span>{truncatePath(draftCwd)}</span>
                          <button
                            className="composerChipClose"
                            type="button"
                            onClick={() => setDraftCwd(null)}
                            aria-label="Remove folder"
                          >
                            ×
                          </button>
                        </span>
                      ) : null}
                      {(() => {
                        const showBoss = draftIncludeBossCat && Boolean(payload.workspace.bossCatId);
                        const totalCats = (showBoss ? 1 : 0) + draftCatIds.length;
                        if (totalCats === 0) return null;
                        return (
                          <div className="composerAvatarStack">
                            {showBoss ? (
                              <div className="composerStackItem">
                                <div
                                  className="palAvatar composerStackAvatar"
                                  title={bossCatName}
                                  style={bossCatAvatarColor ? { background: bossCatAvatarColor } : undefined}
                                >
                                  {palInitials(bossCatName)}
                                </div>
                                {totalCats > 1 ? (
                                  <button
                                    className="composerStackRemove"
                                    type="button"
                                    onClick={() => setDraftIncludeBossCat(false)}
                                    aria-label={`Remove ${bossCatName}`}
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            {draftCatIds.map((id) => {
                              const pal = payload.workspace.pals.find((p) => p.id === id);
                              if (!pal) return null;
                              return (
                                <div key={id} className="composerStackItem">
                                  <div
                                    className="palAvatar composerStackAvatar"
                                    title={pal.name}
                                    style={pal.avatarColor ? { background: pal.avatarColor } : undefined}
                                  >
                                    {palInitials(pal.name)}
                                  </div>
                                  {totalCats > 1 ? (
                                    <button
                                      className="composerStackRemove"
                                      type="button"
                                      onClick={() => toggleDraftCat(id)}
                                      aria-label={`Remove ${pal.name}`}
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      className="composerSendButton"
                      disabled={!composerDraft.trim() || busy === 'message:send'}
                      type="submit"
                      aria-label="Send"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 13V3" />
                        <path d="M3 7l5-5 5 5" />
                      </svg>
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      const input = event.currentTarget;
                      if (input.files && input.files.length > 0) {
                        const selected = Array.from(input.files);
                        setDraftFiles((prev) => [...prev, ...selected]);
                      }
                      input.value = '';
                    }}
                  />
                </form>
              </section>
            </div>
          } />
          <Route
            path="*"
            element={<Navigate to={resolveAppEntryPath(payload.setupCompleteAt)} replace />}
          />
        </Routes>
      </main>

      {addPalOpen && (selectedChannel || showingNewChatDraft) ? (
        <div className="addPalPanel">
          <div className="addPalPanelHeader">
            <h2>Add cat to chat</h2>
            <button
              className="addPalClose"
              type="button"
              onClick={() => setAddPalOpen(false)}
              aria-label="Close"
            >
              x
            </button>
          </div>

          <div className="addPalTabs">
            <button
              className={addPalTab === 'existing' ? 'addPalTab addPalTabActive' : 'addPalTab'}
              type="button"
              onClick={() => setAddPalTab('existing')}
            >
              Choose existing
            </button>
            <button
              className={addPalTab === 'new' ? 'addPalTab addPalTabActive' : 'addPalTab'}
              type="button"
              onClick={() => setAddPalTab('new')}
            >
              Create new
            </button>
          </div>

          {feedback ? <p className="feedbackText">{feedback}</p> : null}

          {addPalTab === 'existing' ? (
            <div className="addPalList">
              {unassignedPals.length > 0 ? (
                unassignedPals.map((pal) => (
                  <div key={pal.id} className="addPalItem">
                    <div>
                      <strong>{pal.name}</strong>
                      <p>{executionLabel(pal)}</p>
                    </div>
                    {showingNewChatDraft ? (
                      <button
                        className={draftPalIds.has(pal.id) ? 'addPalAssignButton addPalRemoveButton' : 'addPalAssignButton'}
                        type="button"
                        onClick={() => toggleDraftCat(pal.id)}
                      >
                        {draftPalIds.has(pal.id) ? 'Remove' : 'Add'}
                      </button>
                    ) : (
                      <button
                        className="addPalAssignButton"
                        type="button"
                        disabled={busy === `pal:assign:${pal.id}`}
                        onClick={() => void onAssignExistingPal(pal)}
                      >
                        {busy === `pal:assign:${pal.id}` ? 'Adding...' : 'Add'}
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="emptyStateCard">
                  <p>
                    {assignablePalCount === 0
                      ? 'No other cats yet. Create one first.'
                      : 'All cats are already in this chat.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="addPalCreate">{palCreationForm}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
