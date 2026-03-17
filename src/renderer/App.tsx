import { startTransition, useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

import { shouldSubmitComposerOnKeyDown } from '../shared/composer';
import type {
  AppShellPayload,
  WorkspaceChannelSummary,
  WorkspacePal,
} from '../shared/app-shell';
import {
  activateWorkspaceChannel,
  assignPalToWorkspaceChannel,
  createGlobalPal,
  createWorkspaceChannel,
  deleteWorkspaceChannel,
  fetchAppShell,
  sendWorkspaceMessage,
  updateSelectedChannel,
} from './api';
import { getDefaultModel, getProviderDisplayName, getProviderModels, PAL_PROVIDER_ORDER } from './providerCatalog';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type Surface = 'chats' | 'settings';
type ChatView = 'overview' | 'channel';

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

function sessionTone(status: string): string {
  switch (status) {
    case 'active':
      return 'statusChip statusChipReady';
    case 'configured':
    case 'watching':
      return 'statusChip statusChipWarm';
    case 'archived':
      return 'statusChip statusChipMuted';
    default:
      return 'statusChip statusChipMuted';
  }
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

function formatActivityLabel(timestamp: string | null): string {
  if (!timestamp) {
    return 'No recent activity';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Recent activity unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function summarizeChannelActivity(channel: WorkspaceChannelSummary): string {
  return formatActivityLabel(channel.lastMessageAt ?? channel.lastActivatedAt);
}

function presentChannelTitle(title: string): string {
  return title.trim() === 'Untitled chat' ? 'New chat' : title;
}

function presentChannelTopic(topic: string): string {
  return topic.trim() === 'This chat is still taking shape.' ? '' : topic;
}

const GREETING_LINES = [
  "Hi, I'm your Ugly Cat.",
  "Meow. What's on your mind?",
  "Your cat is ready to work.",
  "Let's get things done today.",
  "What can I help you with?",
];

function pickGreeting(): string {
  return GREETING_LINES[Math.floor(Math.random() * GREETING_LINES.length)];
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [surface, setSurface] = useState<Surface>('chats');
  const [chatView, setChatView] = useState<ChatView>('overview');
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
          setChatView(payload.workspace.selectedChannel ? 'channel' : 'overview');
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

  function onOpenChatsOverview(): void {
    void onStartNewChat();
  }

  function onToggleSidebar(): void {
    setSidebarOpen((current) => {
      if (current) setAccountMenuOpen(false);
      return !current;
    });
  }

  async function onSelect(channelId: string): Promise<void> {
    try {
      const payload = await updateSelectedChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setSurface('chats');
        setChatView('channel');
        setDraftingNewChat(false);
        setFeedback('');
        setAddPalOpen(false);
      });
    } catch {
      // Keep the shell stable if selection sync fails.
    }
  }

  async function onDeleteChannel(channelId: string): Promise<void> {
    setBusy(`channel:delete:${channelId}`);
    try {
      const payload = await deleteWorkspaceChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setSurface('chats');
        setChatView('overview');
        setDraftingNewChat(false);
        setAddPalOpen(false);
        setFeedback('');
      });
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
        setFeedback('Pal saved.');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to save pal.');
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
        setFeedback('Pal created. Open "Choose existing" to assign it.');
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
      setFeedback(error instanceof Error ? error.message : 'Failed to create pal.');
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
      setFeedback(error instanceof Error ? error.message : 'Failed to assign pal.');
    } finally {
      setBusy('');
    }
  }

  async function onStartNewChat(): Promise<void> {
    setSurface('chats');
    setChatView('channel');
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

    setBusy('message:send');
    try {
      let payload = state.payload;
      let channelId = draftingNewChat ? '' : payload.workspace.selectedChannelId;

      if (!channelId) {
        payload = await createWorkspaceChannel({
          title: createDraftChannelTitle(body, payload.workspace.channels.length),
          topic: createDraftChannelTopic(body),
        });
        channelId = payload.workspace.selectedChannelId;
        startTransition(() => setState({ status: 'ready', payload }));
      }

      if (!channelId) {
        throw new Error('No chat is available for sending messages.');
      }

      if (!payload.workspace.selectedChannel?.orchestratorLease.sessionId) {
        const activation = await activateWorkspaceChannel(channelId);
        payload = activation.appShell;
        startTransition(() => setState({ status: 'ready', payload }));
      }

      const dispatch = await sendWorkspaceMessage(channelId, { body });
      startTransition(() => {
        setState({ status: 'ready', payload: dispatch.appShell });
        setSurface('chats');
        setChatView('channel');
        setDraftingNewChat(false);
        setComposerDraft('');
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to send message.');
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
  const selectedChannel = draftingNewChat ? null : payload.workspace.selectedChannel;
  const activeAssignedPals =
    selectedChannel?.assignedPals.filter((pal) => pal.status === 'active') ?? [];
  const activePalIds = new Set(activeAssignedPals.map((pal) => pal.palId));
  const unassignedPals = payload.workspace.pals.filter(
    (pal) => pal.status === 'active' && !activePalIds.has(pal.id),
  );
  const providerModels = getProviderModels(palForm.provider);
  const hasConversationStarted =
    selectedChannel?.messages.some((message) => message.senderKind !== 'system') ?? false;
  const showDraftComposer = surface === 'chats' && (draftingNewChat || !selectedChannel);
  const showChatOverview = false;

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
      <label className="fieldLabel">
        <span>Provider</span>
        <select
          className="textInput"
          value={palForm.provider}
          onChange={(event) =>
            setPalForm({
              ...palForm,
              provider: event.target.value,
              model: getDefaultModel(event.target.value),
            })}
        >
          {PAL_PROVIDER_ORDER.map((provider) => (
            <option key={provider} value={provider}>
              {getProviderDisplayName(provider)}
            </option>
          ))}
        </select>
      </label>
      <label className="fieldLabel">
        <span>Model</span>
        <select
          className="textInput"
          value={palForm.model}
          onChange={(event) => setPalForm({ ...palForm, model: event.target.value })}
        >
          {providerModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primaryButton"
        disabled={!palForm.name.trim() || !palForm.provider.trim()}
        type="submit"
      >
        {busy === 'pal:create' || busy === 'pal:create-assign'
          ? 'Saving...'
          : surface === 'settings'
            ? 'Save Pal'
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
              className={surface === 'chats' && !showDraftComposer ? 'navItem navItemActive' : 'navItem'}
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
                      !draftingNewChat
                        && payload.workspace.selectedChannelId === channel.id
                        && chatView === 'channel'
                        ? 'recentItemCard recentItemSelected'
                        : 'recentItemCard'
                    }
                  >
                    <button
                      className="recentSelectButton"
                      onClick={() => void onSelect(channel.id)}
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

        <div className="sidebarFooter">
          <button
            className="sidebarFooterButton"
            type="button"
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            aria-label="Account menu"
          >
            <div className="profileBadge">KC</div>
            <div className="sidebarFooterMeta">
              <strong>Kenny Chou</strong>
            </div>
          </button>
          {accountMenuOpen ? (
            <div className="accountMenu">
              <button
                className="accountMenuItem"
                type="button"
                onClick={() => {
                  setSurface('settings');
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
        {surface === 'settings' ? (
          <div className="viewShell viewShellScrollable palsShell">
            <div className="viewIntro">
              <div className="settingsBreadcrumb">
                <button className="breadcrumbLink" type="button" onClick={onOpenChatsOverview}>
                  Chat
                </button>
                <span className="breadcrumbSep">/</span>
                <span>Settings</span>
                <span className="breadcrumbSep">/</span>
                <span>Pals</span>
              </div>
              <h1>Pals</h1>
              <p className="heroNote">
                Manage reusable pals across your workspace. Add them to any chat from the chat
                view.
              </p>
              {feedback ? <p className="feedbackText">{feedback}</p> : null}
            </div>

            <div className="palsLayout">
              <section className="contentCard">
                <div className="contentCardHeader">
                  <div>
                    <p className="sectionLabel">Registry</p>
                    <h2>{payload.workspace.pals.length > 0 ? 'Saved pals' : 'No pals yet'}</h2>
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
                      <p>Create your first pal from the panel on the right.</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="contentCard contentCardForm">
                <div className="contentCardHeader">
                  <div>
                    <p className="sectionLabel">Create</p>
                    <h2>New pal</h2>
                  </div>
                </div>
                {palCreationForm}
              </section>
            </div>
          </div>
        ) : showChatOverview ? (
          <div className="viewShell viewShellScrollable">
            <section className="overviewShell">
              <div className="overviewHeader">
                <div>
                  <p className="sectionLabel">Chats</p>
                  <h1>Recent chats</h1>
                </div>
                <button className="primaryButton" type="button" onClick={() => void onStartNewChat()}>
                  New chat
                </button>
              </div>

              {feedback ? <p className="feedbackText">{feedback}</p> : null}

              <div className="overviewList">
                {payload.workspace.channels.length > 0 ? (
                  payload.workspace.channels.map((channel) => (
                    <article key={channel.id} className="overviewCard">
                      <button
                        className="overviewCardSelect"
                        type="button"
                        onClick={() => void onSelect(channel.id)}
                      >
                        <div className="overviewCardTop">
                          <div>
                            <strong>{presentChannelTitle(channel.title)}</strong>
                            {presentChannelTopic(channel.topic) ? (
                              <p>{presentChannelTopic(channel.topic)}</p>
                            ) : null}
                          </div>
                          <span className={sessionTone(channel.status)}>{channel.status}</span>
                        </div>
                        <div className="overviewCardMeta">
                          <span>
                            {channel.activePalCount} active pal
                            {channel.activePalCount === 1 ? '' : 's'}
                          </span>
                          <span>{channel.unreadCount} unread</span>
                          <span>{summarizeChannelActivity(channel)}</span>
                        </div>
                      </button>
                      <button
                        className="overviewDeleteButton"
                        type="button"
                        disabled={busy === `channel:delete:${channel.id}`}
                        onClick={() => void onDeleteChannel(channel.id)}
                      >
                        {busy === `channel:delete:${channel.id}` ? 'Deleting...' : 'Delete'}
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="emptyStateCard overviewEmpty">
                    <button className="primaryButton" type="button" onClick={() => void onStartNewChat()}>
                      New chat
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : showDraftComposer ? (
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
        ) : selectedChannel ? (
          <div className="viewShell viewShellChannel">
            <section className={hasConversationStarted ? 'channelShell' : 'channelShell channelShellFresh'}>
              <header className="channelTopBar">
                <div className="channelParticipantsBar">
                  <div className="channelParticipantsList">
                    {activeAssignedPals.length > 0 ? (
                      activeAssignedPals.map((pal) => (
                        <span key={pal.palId} className="rosterChip">
                          {pal.name}
                        </span>
                      ))
                    ) : (
                      <span className="rosterLabel">No pals in this chat yet</span>
                    )}
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
                </div>
              </header>

              {feedback ? <p className="feedbackText channelFeedback">{feedback}</p> : null}

              {hasConversationStarted ? (
                <section className="transcriptPanel">
                  <div className="transcriptList">
                    {selectedChannel.messages.map((message) => (
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
        ) : null}
      </main>

      {addPalOpen && selectedChannel ? (
        <div className="addPalPanel">
          <div className="addPalPanelHeader">
            <h2>Add pal to chat</h2>
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
                    {payload.workspace.pals.length === 0
                      ? 'No pals yet. Create one first.'
                      : 'All pals are already in this chat.'}
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
