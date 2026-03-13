import { startTransition, useEffect, useState, type FormEvent } from 'react';

import type { AppShellPayload, WorkspacePal } from '../shared/app-shell';
import { createGlobalPal, fetchAppShell, updateSelectedChannel } from './api';
import { getDefaultModel, getProviderModels, PAL_PROVIDER_ORDER } from './providerCatalog';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

type Surface = 'chats' | 'pals';

const primaryNav = ['New chat', 'Search', 'Customize'];
const workspaceNav: Array<{ id: Surface | 'projects' | 'artifacts' | 'code'; label: string }> = [
  { id: 'chats', label: 'Chats' },
  { id: 'pals', label: 'Pals' },
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
        setSurface('pals');
        setFeedback('Pal saved.');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to save pal.');
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
  const providerModels = getProviderModels(palForm.provider);
  const heroTitle = selectedChannel ? selectedChannel.title : 'Welcome, Kenny';
  const heroNote = selectedChannel?.topic ?? 'How can I help you today?';

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
                  if (item.id === 'chats' || item.id === 'pals') {
                    setSurface(item.id);
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

        <div className="sidebarFooter">
          <div className="profileBadge">KC</div>
          <div>
            <strong>Kenny Chou</strong>
            <p>Max plan</p>
          </div>
        </div>
      </aside>

      <main className="canvas">
        {surface === 'pals' ? (
          <div className="viewShell palsShell">
            <div className="viewIntro">
              <div className="planPill">Workspace</div>
              <h1>Pals</h1>
              <p className="heroNote">
                Reusable pals live here. Add them once, then use them in whichever chat needs
                them.
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
                            className={assignedPalIds.has(pal.id) ? 'statusChip statusChipReady' : 'statusChip statusChipMuted'}
                          >
                            {assignedPalIds.has(pal.id) ? 'In current chat' : pal.status}
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

                <form className="stackForm" onSubmit={(event) => void onCreatePal(event)}>
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
                    {busy === 'pal:create' ? 'Saving...' : 'Save Pal'}
                  </button>
                </form>
              </section>
            </div>
          </div>
        ) : (
          <div className="viewShell">
            <div className="welcomeShell">
              <div className="planPill">Your local workspace shell is ready</div>
              <h1>{heroTitle}</h1>
              <p className="heroNote">{heroNote}</p>

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
          </div>
        )}
      </main>
    </div>
  );
}
