import { startTransition, useEffect, useState, type FormEvent } from 'react';

import type { AppShellPayload, WorkspacePal } from '../shared/app-shell';
import {
  assignPalToWorkspaceChannel,
  createGlobalPal,
  fetchAppShell,
  updateSelectedChannel,
} from './api';
import { getDefaultModel, getProviderModels, PAL_PROVIDER_ORDER } from './providerCatalog';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type Surface = 'chats' | 'settings';

const primaryNav = ['New chat', 'Search', 'Customize'];
const workspaceNav: Array<{ id: Surface | 'projects' | 'artifacts' | 'code'; label: string }> = [
  { id: 'chats', label: 'Chats' },
  { id: 'projects', label: 'Projects' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'code', label: 'Code' },
];
const promptChips = ['Write', 'Learn', 'Code', 'Life stuff', 'Cats choice'];

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
  return pal.defaultExecutionTarget.model
    ? `${pal.defaultExecutionTarget.provider} / ${pal.defaultExecutionTarget.model}`
    : pal.defaultExecutionTarget.provider;
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [surface, setSurface] = useState<Surface>('chats');
  const [composerDraft, setComposerDraft] = useState('');
  const [palForm, setPalForm] = useState<PalFormState>(emptyPalForm);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [addPalOpen, setAddPalOpen] = useState(false);
  const [addPalTab, setAddPalTab] = useState<'existing' | 'new'>('existing');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

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

  async function onSelect(channelId: string): Promise<void> {
    try {
      const payload = await updateSelectedChannel(channelId);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setSurface('chats');
        setFeedback('');
        setAddPalOpen(false);
      });
    } catch {
      // Keep the shell stable if selection sync fails.
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
      const created = await createGlobalPal({
        name: palForm.name,
        provider: palForm.provider,
        model: palForm.model || getDefaultModel(palForm.provider),
      });
      const newPal = created.workspace.pals.find((p) => p.name === palForm.name);
      if (newPal) {
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
      } else {
        startTransition(() => {
          setState({ status: 'ready', payload: created });
          setPalForm(emptyPalForm());
          setFeedback('Pal created but could not auto-assign.');
        });
      }
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
  const selectedChannel = payload.workspace.selectedChannel;
  const assignedPalIds = new Set(selectedChannel?.assignedPals.map((pal) => pal.palId) ?? []);
  const unassignedPals = payload.workspace.pals.filter(
    (pal) => pal.status === 'active' && !assignedPalIds.has(pal.id),
  );
  const providerModels = getProviderModels(palForm.provider);
  const heroTitle = selectedChannel ? selectedChannel.title : 'Welcome, Kenny';
  const heroNote = selectedChannel?.topic ?? 'How can I help you today?';

  const palCreationForm = (
    <form
      className="stackForm"
      onSubmit={(event) =>
        surface === 'settings'
          ? void onCreatePal(event)
          : void onCreateAndAssignPal(event)
      }
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
            })
          }
        >
          {PAL_PROVIDER_ORDER.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
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
    <div className="screen claudeShell">
      <aside className="sidebar">
        <div className="sidebarInner">
          <div className="brandRow">
            <div>
              <p className="brandLabel">Cats Inc Chat</p>
            </div>
            <button className="chromeButton" type="button" aria-label="Toggle sidebar" />
          </div>

          <nav className="navGroup" aria-label="Primary">
            {primaryNav.map((item) => (
              <button key={item} className="navItem" type="button">
                <span className="navGlyph" aria-hidden="true" />
                <span>{item}</span>
              </button>
            ))}
          </nav>

          <nav className="navGroup navGroupWorkspace" aria-label="Workspace">
            {workspaceNav.map((item) => (
              <button
                key={item.id}
                className={
                  surface === item.id || (surface === 'chats' && item.id === 'chats')
                    ? 'navItem navItemActive'
                    : 'navItem'
                }
                onClick={() => {
                  if (item.id === 'chats') {
                    setSurface(item.id);
                    setAddPalOpen(false);
                  }
                }}
                type="button"
              >
                <span className="navGlyph navGlyphSquare" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <section className="recentSection">
            <p className="sectionLabel">Recents</p>
            <div className="recentList">
              {payload.workspace.channels.length > 0 ? (
                payload.workspace.channels.map((channel) => (
                  <button
                    key={channel.id}
                    className={
                      payload.workspace.selectedChannelId === channel.id
                        ? 'recentItem recentItemSelected'
                        : 'recentItem'
                    }
                    onClick={() => void onSelect(channel.id)}
                    type="button"
                  >
                    <div className="recentTitleRow">
                      <strong>{channel.title}</strong>
                      <span className={sessionTone(channel.status)}>{channel.status}</span>
                    </div>
                    <p>{channel.topic}</p>
                  </button>
                ))
              ) : (
                <div className="recentEmpty">
                  <p>No chats yet</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="sidebarFooter" style={{ position: 'relative' }}>
          <div className="profileBadge">KC</div>
          <div style={{ flex: 1 }}>
            <strong>Kenny Chou</strong>
            <p>Max plan</p>
          </div>
          <button
            className="footerSettingsButton"
            type="button"
            onClick={() => setAccountMenuOpen(!accountMenuOpen)}
            aria-label="Account menu"
          >
            ...
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
          <div className="viewShell palsShell">
            <div className="viewIntro">
              <div className="settingsBreadcrumb">
                <button
                  className="breadcrumbLink"
                  type="button"
                  onClick={() => setSurface('chats')}
                >
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
        ) : (
          <div className="viewShell">
            <div className="welcomeShell">
              <div className="planPill">Your local workspace shell is ready</div>
              <h1>{heroTitle}</h1>
              <p className="heroNote">{heroNote}</p>

              {selectedChannel ? (
                <div className="chatRoster">
                  <div className="rosterHeader">
                    <span className="rosterLabel">
                      {selectedChannel.assignedPals.length} pal
                      {selectedChannel.assignedPals.length !== 1 ? 's' : ''} in this chat
                    </span>
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
                      + Add pal
                    </button>
                  </div>
                  {selectedChannel.assignedPals.length > 0 ? (
                    <div className="rosterChips">
                      {selectedChannel.assignedPals
                        .filter((p) => p.status === 'active')
                        .map((pal) => (
                          <span key={pal.palId} className="rosterChip">
                            {pal.name}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <form className="composerCard">
                <textarea
                  className="composerInput"
                  rows={3}
                  placeholder="How can I help you today?"
                  value={composerDraft}
                  onChange={(event) => setComposerDraft(event.target.value)}
                />
                <div className="composerFooter">
                  <button className="composerAction" type="button" aria-label="Add attachment">
                    <span className="composerPlus" aria-hidden="true" />
                  </button>
                  <div className="composerMeta">
                    <span>{selectedChannel ? selectedChannel.title : 'No chat selected'}</span>
                    <span>sonnet 4.6</span>
                  </div>
                </div>
              </form>

              <div className="chipRow">
                {promptChips.map((item) => (
                  <button key={item} className="promptChip" type="button">
                    {item}
                  </button>
                ))}
              </div>
            </div>

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
                  <div className="addPalCreate">
                    {palCreationForm}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
