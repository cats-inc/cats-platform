import { startTransition, useEffect, useState } from 'react';

import type { AppShellPayload, WorkspaceChannelSummary } from '../shared/app-shell';
import { fetchAppShell } from './api';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

function channelTone(status: WorkspaceChannelSummary['status']): string {
  switch (status) {
    case 'active':
      return 'channelBadge channelBadgeActive';
    case 'watching':
      return 'channelBadge channelBadgeWatching';
    default:
      return 'channelBadge channelBadgePlanned';
  }
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');

  useEffect(() => {
    const controller = new AbortController();

    void fetchAppShell(controller.signal)
      .then((payload) => {
        startTransition(() => {
          setState({ status: 'ready', payload });
          setSelectedChannelId(payload.workspace.selectedChannelId);
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown renderer error',
        });
      });

    return () => controller.abort();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="screen screenCentered">
        <div className="loadingPanel">
          <p className="eyebrow">cats-inc</p>
          <h1>Warming the workspace shell</h1>
          <p>Waiting for app-shell data from the local cats-inc server.</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="screen screenCentered">
        <div className="errorPanel">
          <p className="eyebrow">Renderer Error</p>
          <h1>Workspace shell unavailable</h1>
          <p>{state.message}</p>
          <p>Start the API server with <code>npm run dev:server</code> and reload the page.</p>
        </div>
      </div>
    );
  }

  const { payload } = state;
  const selectedChannel =
    payload.workspace.channels.find((channel) => channel.id === selectedChannelId) ??
    payload.workspace.channels[0];

  return (
    <div className="screen">
      <div className="shellBackdrop" />
      <aside className="sidebar">
        <div className="brandBlock">
          <p className="eyebrow">cats-inc</p>
          <h1>{payload.workspace.name}</h1>
          <p className="muted">A multi-channel shell above cats-runtime.</p>
        </div>

        <section className="sidebarSection">
          <div className="sectionHeading">
            <span>Channels</span>
            <span>{payload.workspace.channels.length}</span>
          </div>
          <div className="channelList">
            {payload.workspace.channels.map((channel) => {
              const isSelected = selectedChannel.id === channel.id;

              return (
                <button
                  key={channel.id}
                  className={isSelected ? 'channelCard channelCardSelected' : 'channelCard'}
                  onClick={() => setSelectedChannelId(channel.id)}
                  type="button"
                >
                  <div className="channelCardTop">
                    <strong>{channel.title}</strong>
                    <span className={channelTone(channel.status)}>{channel.status}</span>
                  </div>
                  <p>{channel.topic}</p>
                  <div className="channelMeta">
                    <span>{channel.memberCount} members</span>
                    <span>{channel.unreadCount} unread</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="workspaceHeader">
          <div>
            <p className="eyebrow">Selected Channel</p>
            <h2>{selectedChannel.title}</h2>
            <p className="workspaceLead">{selectedChannel.topic}</p>
          </div>
          <div className="runtimePill">
            <span className={payload.runtime.reachable ? 'runtimeDot runtimeDotOk' : 'runtimeDot'} />
            <div>
              <strong>{payload.runtime.reachable ? 'Runtime reachable' : 'Runtime degraded'}</strong>
              <p>{payload.runtime.baseUrl}</p>
            </div>
          </div>
        </header>

        <section className="workspaceGrid">
          <article className="heroPanel">
            <p className="eyebrow">Global Orchestrator</p>
            <h3>{payload.workspace.globalOrchestrator.nextFocus}</h3>
            <p className="heroCopy">
              The product shell keeps orchestration above channels so future Telegram and
              desktop entrypoints do not collapse back into a single-room workflow.
            </p>
            <div className="noteList">
              {payload.workspace.globalOrchestrator.notes.map((note) => (
                <div key={note} className="noteItem">
                  {note}
                </div>
              ))}
            </div>
          </article>

          <article className="statusPanel">
            <p className="eyebrow">Capabilities</p>
            <div className="capabilityList">
              <div className="capabilityCard">
                <strong>Multi-channel</strong>
                <span>{payload.workspace.capabilities.multiChannel ? 'wired into shell' : 'off'}</span>
              </div>
              <div className="capabilityCard">
                <strong>Persistence</strong>
                <span>{payload.workspace.capabilities.persistence}</span>
              </div>
              <div className="capabilityCard">
                <strong>@mentions</strong>
                <span>{payload.workspace.capabilities.mentions}</span>
              </div>
              <div className="capabilityCard">
                <strong>Split view</strong>
                <span>{payload.workspace.capabilities.splitView}</span>
              </div>
            </div>
          </article>

          <article className="detailPanel">
            <p className="eyebrow">Channel Operating Notes</p>
            <div className="detailList">
              <div className="detailRow">
                <span>Status</span>
                <strong>{selectedChannel.status}</strong>
              </div>
              <div className="detailRow">
                <span>Members</span>
                <strong>{selectedChannel.memberCount}</strong>
              </div>
              <div className="detailRow">
                <span>Unread</span>
                <strong>{selectedChannel.unreadCount}</strong>
              </div>
              <div className="detailRow">
                <span>Renderer stage</span>
                <strong>{payload.app.stage}</strong>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
