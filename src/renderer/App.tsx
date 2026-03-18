import { startTransition, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Routes, Route, Navigate,
  useNavigate, useLocation, useMatch,
} from 'react-router-dom';

import { shouldSubmitComposerOnKeyDown } from '../shared/composer';
import type {
  AppShellPayload,
  WorkspaceChannelSummary,
  WorkspaceChannelView,
  WorkspaceMessage,
  WorkspacePal,
} from '../shared/app-shell';
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
} from './api';
import { ProviderModelFields } from './components/ProviderModelFields';
import { getDefaultModel, getProviderDisplayName } from './providerCatalog';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type Surface = 'chats' | 'settings';

interface PalFormState {
  name: string;
  provider: string;
  model: string;
}

function emptyPalForm(): PalFormState {
  return {
    name: '',
    provider: 'claude',
    model: getDefaultModel('claude'),
  };
}


function executionLabel(pal: WorkspacePal): string {
  const name = getProviderDisplayName(pal.defaultExecutionTarget.provider);
  return pal.defaultExecutionTarget.model
    ? `${name} / ${pal.defaultExecutionTarget.model}`
    : name;
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
  const [model, setModel] = useState(getDefaultModel('claude'));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function handleComplete(): Promise<void> {
    setBusy(true);
    try {
      const result = await completeSetup({
        ownerDisplayName: ownerName.trim(),
        bossCatName: bossCatName.trim() || 'Smelly',
        bossCatProvider: provider,
        bossCatModel: model || undefined,
      });
      onComplete(result);
      navigate(`/chats/${result.workspace.selectedChannelId}`, { replace: true });
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
              model={model}
              onProviderChange={(nextProvider, defaultModel) => {
                setProvider(nextProvider);
                setModel(defaultModel);
              }}
              onModelChange={setModel}
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
                disabled={!bossCatName.trim() || busy}
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

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [draftingNewChat, setDraftingNewChat] = useState(false);
  const [composerDraft, setComposerDraft] = useState('');
  const [palForm, setPalForm] = useState<PalFormState>(emptyPalForm);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [addPalOpen, setAddPalOpen] = useState(false);
  const [addPalTab, setAddPalTab] = useState<'existing' | 'new'>('existing');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [overflowMenuOpenId, setOverflowMenuOpenId] = useState<string | null>(null);
  const [greeting] = useState(pickGreeting);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen && !overflowMenuOpenId) return;
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
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [accountMenuOpen, overflowMenuOpenId]);

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
    const { selectedChannelId, selectedChannel } = state.payload.workspace;
    if (selectedChannelId === routeChannelId && selectedChannel?.id === routeChannelId) return;

    const exists = state.payload.workspace.channels.some(ch => ch.id === routeChannelId);
    if (!exists) {
      navigate('/chats', { replace: true });
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
          navigate('/chats', { replace: true });
        }
      });

    return () => controller.abort();
  }, [routeChannelId, state.status]);

  function onOpenChatsOverview(): void {
    void onStartNewChat();
  }

  function onToggleSidebar(): void {
    setSidebarOpen((current) => {
      if (current) setAccountMenuOpen(false);
      return !current;
    });
  }

  function onSelect(channelId: string): void {
    navigate(`/chats/${channelId}`);
    setDraftingNewChat(false);
    setFeedback('');
    setAddPalOpen(false);
  }

  async function onDeleteChannel(channelId: string): Promise<void> {
    setBusy(`channel:delete:${channelId}`);
    try {
      const payload = await deleteWorkspaceChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setDraftingNewChat(false);
        setAddPalOpen(false);
        setFeedback('');
      });
      navigate('/chats');
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
        model: palForm.model || getDefaultModel(palForm.provider),
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
        model: palForm.model || getDefaultModel(palForm.provider),
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
    navigate('/chats');
    setDraftingNewChat(true);
    setComposerDraft('');
    setFeedback('');
    setAddPalOpen(false);
  }

  async function submitComposerMessage(): Promise<void> {
    if (state.status !== 'ready') return;

    const body = composerDraft.trim();
    if (!body) {
      return;
    }

    const initialPayload = state.payload;
    const wasDraftingNewChat = draftingNewChat;
    let payload = initialPayload;
    let rollbackPayload = initialPayload;
    let channelId = wasDraftingNewChat ? '' : initialPayload.workspace.selectedChannelId;
    let rollbackPath = wasDraftingNewChat ? '/chats' : location.pathname;
    let shouldRestoreDraftShell = wasDraftingNewChat;

    setBusy('message:send');
    setFeedback('');
    try {
      if (wasDraftingNewChat) {
        const optimisticDraft = createOptimisticDraftPayload(initialPayload, body);
        payload = optimisticDraft.payload;
        setState({ status: 'ready', payload });
        setDraftingNewChat(false);
        setComposerDraft('');
        navigate(`/chats/${optimisticDraft.channelId}`, { replace: true });

        const createdPayload = await createWorkspaceChannel({
          title: createDraftChannelTitle(body, initialPayload.workspace.channels.length),
          topic: createDraftChannelTopic(body),
          skipBossCatGreeting: true,
        });
        channelId = createdPayload.workspace.selectedChannelId;
        if (!channelId) {
          throw new Error('No chat is available for sending messages.');
        }
        rollbackPayload = createdPayload;
        rollbackPath = `/chats/${channelId}`;
        shouldRestoreDraftShell = false;
        payload = appendOptimisticUserMessage(createdPayload, channelId, body);
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
      setDraftingNewChat(false);
      setComposerDraft('');
      setFeedback('');
      navigate(`/chats/${channelId}`, { replace: true });
    } catch (error) {
      setState({ status: 'ready', payload: rollbackPayload });
      setDraftingNewChat(shouldRestoreDraftShell);
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

  if (state.status === 'loading') {
    return (
      <div className="screen screenCentered">
        <div className="loadingPanel">
          <p className="eyebrow">Cats Inc</p>
          <h1>Chat</h1>
        </div>
      </div>
    );
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
  const hasConversationStarted =
    selectedChannel?.messages.some((message) => message.senderKind !== 'system') ?? false;

  const palCreationForm = (
    <form
      className="stackForm"
      onSubmit={(event) => (
        surface === 'settings' ? void onCreatePal(event) : void onCreateAndAssignPal(event)
      )}
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
        model={palForm.model}
        onProviderChange={(provider, defaultModel) =>
          setPalForm({
            ...palForm,
            provider,
            model: defaultModel,
          })}
        onModelChange={(model) => setPalForm({ ...palForm, model })}
      />
      <button
        className="primaryButton"
        disabled={!palForm.name.trim() || !palForm.provider.trim()}
        type="submit"
      >
        {busy === 'pal:create' || busy === 'pal:create-assign'
          ? 'Saving...'
          : surface === 'settings'
            ? 'Save Cat'
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
              className={surface === 'chats' && routeChannelId ? 'navItem navItemActive' : 'navItem'}
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
                      ...
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
          <Route path="/" element={<Navigate to="/chats" replace />} />
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
                        payload.workspace.pals.map((pal) => (
                          <article key={pal.id} className="palCard">
                            <div className="palCardTop">
                              <div>
                                <strong>{pal.name}</strong>
                                <p>{executionLabel(pal)}</p>
                              </div>
                              <span
                                className={
                                  pal.status === 'active'
                                    ? 'statusChip statusChipReady'
                                    : 'statusChip statusChipMuted'
                                }
                              >
                                {pal.status}
                              </span>
                            </div>
                            <div className="palMeta">
                              <span>{pal.skillProfile ?? 'No skill profile'}</span>
                              <span>{pal.memory.updatedAt ? 'Memory saved' : 'No memory yet'}</span>
                            </div>
                          </article>
                        ))
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
                    <div className="palAvatar palAvatarOrch" title={bossCatName}>
                      {palInitials(bossCatName)}
                    </div>
                  ) : null}
                  {activeAssignedPals.map((pal) => (
                    <div key={pal.palId} className="palAvatar" title={pal.name}>
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
              <div className="screen screenCentered">
                <div className="loadingPanel">
                  <p className="eyebrow">Cats Inc</p>
                  <h1>Chat</h1>
                </div>
              </div>
            )
          } />
          <Route path="/chats" element={
            !draftingNewChat && payload.workspace.selectedChannelId
              ? <Navigate to={`/chats/${payload.workspace.selectedChannelId}`} replace />
              : (
                <div className="viewShell viewShellDraft">
                  <section className="draftShell">
                    <div className="draftGreeting"><h1>{greeting}</h1></div>
                    <form className="composerCard composerCardFresh" onSubmit={(event) => void onSendMessage(event)}>
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
              )
          } />
          <Route path="*" element={<Navigate to="/chats" replace />} />
        </Routes>
      </main>

      {addPalOpen && selectedChannel ? (
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
                    <button
                      className="addPalAssignButton"
                      type="button"
                      disabled={busy === `pal:assign:${pal.id}`}
                      onClick={() => void onAssignExistingPal(pal)}
                    >
                      {busy === `pal:assign:${pal.id}` ? 'Adding...' : 'Add'}
                    </button>
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
