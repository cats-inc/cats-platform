import { startTransition, useEffect, useState, type FormEvent } from 'react';

import type { AppShellPayload, WorkspaceMember } from '../shared/app-shell';
import {
  activateWorkspaceChannel,
  addWorkspaceMember,
  createWorkspaceChannel,
  fetchAppShell,
  removeWorkspaceMember,
  sendWorkspaceMessage,
  updateSelectedChannel,
  updateWorkspaceOrchestrator,
} from './api';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; payload: AppShellPayload }
  | { status: 'error'; message: string };

interface ChannelFormState {
  title: string;
  topic: string;
  repoPath: string;
  language: string;
  responseLanguage: string;
  formationMode: 'manual' | 'orchestrator_suggested';
}

interface MemberFormState {
  name: string;
  provider: string;
  model: string;
  roles: string;
}

function emptyChannelForm(): ChannelFormState {
  return {
    title: '',
    topic: '',
    repoPath: '',
    language: '',
    responseLanguage: 'en',
    formationMode: 'manual',
  };
}

function emptyMemberForm(): MemberFormState {
  return {
    name: '',
    provider: 'claude',
    model: '',
    roles: 'coder',
  };
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
}

function sessionTone(status: string): string {
  switch (status) {
    case 'ready':
      return 'statusChip statusChipReady';
    case 'initializing':
      return 'statusChip statusChipWarm';
    case 'error':
      return 'statusChip statusChipError';
    default:
      return 'statusChip statusChipMuted';
  }
}

function messageTone(senderKind: string): string {
  switch (senderKind) {
    case 'user':
      return 'messageCard messageUser';
    case 'orchestrator':
      return 'messageCard messageOrchestrator';
    case 'agent':
      return 'messageCard messageAgent';
    default:
      return 'messageCard messageSystem';
  }
}

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [syncMessage, setSyncMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [channelForm, setChannelForm] = useState<ChannelFormState>(emptyChannelForm);
  const [draftMember, setDraftMember] = useState<MemberFormState>(emptyMemberForm);
  const [draftMembers, setDraftMembers] = useState<MemberFormState[]>([]);
  const [memberForm, setMemberForm] = useState<MemberFormState>(emptyMemberForm);
  const [messageDraft, setMessageDraft] = useState('');
  const [orchestratorForm, setOrchestratorForm] = useState({
    provider: 'claude',
    model: '',
    systemPrompt: '',
    skillProfile: '',
    mcpProfile: '',
    telegramBotName: '',
  });

  useEffect(() => {
    const controller = new AbortController();

    void fetchAppShell(controller.signal)
      .then((payload) => {
        startTransition(() => {
          setState({ status: 'ready', payload });
          setOrchestratorForm({
            provider: payload.workspace.globalOrchestrator.provider,
            model: payload.workspace.globalOrchestrator.model ?? '',
            systemPrompt: payload.workspace.globalOrchestrator.systemPrompt,
            skillProfile: payload.workspace.globalOrchestrator.skillProfile ?? '',
            mcpProfile: payload.workspace.globalOrchestrator.mcpProfile ?? '',
            telegramBotName: payload.workspace.globalOrchestrator.telegramBotName ?? '',
          });
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
  const selectedChannel = payload.workspace.selectedChannel;
  const exportHref = selectedChannel ? `/api/workspace/channels/${selectedChannel.id}/export` : '#';

  function applyPayload(nextPayload: AppShellPayload, message: string): void {
    startTransition(() => {
      setState({ status: 'ready', payload: nextPayload });
      setSyncMessage(message);
      setOrchestratorForm({
        provider: nextPayload.workspace.globalOrchestrator.provider,
        model: nextPayload.workspace.globalOrchestrator.model ?? '',
        systemPrompt: nextPayload.workspace.globalOrchestrator.systemPrompt,
        skillProfile: nextPayload.workspace.globalOrchestrator.skillProfile ?? '',
        mcpProfile: nextPayload.workspace.globalOrchestrator.mcpProfile ?? '',
        telegramBotName: nextPayload.workspace.globalOrchestrator.telegramBotName ?? '',
      });
    });
  }

  async function onSelect(channelId: string): Promise<void> {
    setBusy(`select:${channelId}`);
    try {
      applyPayload(await updateSelectedChannel(channelId), 'Workspace selection saved.');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to select channel.');
    } finally {
      setBusy('');
    }
  }

  async function onCreateChannel(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy('create');
    try {
      applyPayload(
        await createWorkspaceChannel({
          title: channelForm.title,
          topic: channelForm.topic,
          repoPath: channelForm.repoPath,
          language: channelForm.language,
          responseLanguage: channelForm.responseLanguage,
          formationMode: channelForm.formationMode,
          members: draftMembers.map((member) => ({
            name: member.name,
            provider: member.provider,
            model: member.model,
            roles: splitList(member.roles),
          })),
        }),
        'Channel configured and persisted locally.',
      );
      setChannelForm(emptyChannelForm());
      setDraftMembers([]);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to create channel.');
    } finally {
      setBusy('');
    }
  }

  async function onActivate(): Promise<void> {
    if (!selectedChannel) return;
    setBusy(`activate:${selectedChannel.id}`);
    try {
      const result = await activateWorkspaceChannel(selectedChannel.id);
      applyPayload(result.appShell, `${result.results.length} runtime target(s) processed.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to activate channel.');
    } finally {
      setBusy('');
    }
  }

  async function onSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedChannel || !messageDraft.trim()) return;
    setBusy(`message:${selectedChannel.id}`);
    try {
      const result = await sendWorkspaceMessage(selectedChannel.id, { body: messageDraft });
      applyPayload(result.appShell, 'Channel message routed through runtime.');
      setMessageDraft('');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to send message.');
    } finally {
      setBusy('');
    }
  }

  async function onAddMember(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedChannel || !memberForm.name.trim()) return;
    setBusy(`member:add:${selectedChannel.id}`);
    try {
      applyPayload(
        await addWorkspaceMember(selectedChannel.id, {
          name: memberForm.name,
          provider: memberForm.provider,
          model: memberForm.model,
          roles: splitList(memberForm.roles),
        }),
        'Member added to the channel.',
      );
      setMemberForm(emptyMemberForm());
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to add member.');
    } finally {
      setBusy('');
    }
  }

  async function onRemoveMember(member: WorkspaceMember): Promise<void> {
    if (!selectedChannel) return;
    setBusy(`member:remove:${member.id}`);
    try {
      applyPayload(
        await removeWorkspaceMember(selectedChannel.id, member.id),
        `${member.name} removed from the channel.`,
      );
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to remove member.');
    } finally {
      setBusy('');
    }
  }

  async function onSaveOrchestrator(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy('orchestrator');
    try {
      applyPayload(await updateWorkspaceOrchestrator(orchestratorForm), 'Global orchestrator saved.');
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Failed to save orchestrator.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="screen">
      <div className="shellBackdrop" />
      <aside className="sidebar">
        <div className="brandBlock">
          <p className="eyebrow">cats-inc</p>
          <h1>{payload.workspace.name}</h1>
          <p className="muted">A multi-channel shell above cats-runtime with local transcripts.</p>
        </div>

        <section className="sidebarSection">
          <div className="sectionHeading"><span>Channels</span><span>{payload.workspace.channels.length}</span></div>
          <div className="channelList">
            {payload.workspace.channels.map((channel) => (
              <button
                key={channel.id}
                className={payload.workspace.selectedChannelId === channel.id ? 'channelCard channelCardSelected' : 'channelCard'}
                onClick={() => void onSelect(channel.id)}
                type="button"
              >
                <div className="channelCardTop"><strong>{channel.title}</strong><span className={sessionTone(channel.status)}>{channel.status}</span></div>
                <p>{channel.topic}</p>
                <div className="channelMeta"><span>{channel.activeMemberCount} active</span><span>{channel.unreadCount} unread</span></div>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebarSection">
          <div className="sectionHeading"><span>Channel Setup</span><span>{draftMembers.length} draft</span></div>
          <form className="stackForm" onSubmit={(event) => void onCreateChannel(event)}>
            <input className="textInput" placeholder="Title" value={channelForm.title} onChange={(event) => setChannelForm({ ...channelForm, title: event.target.value })} />
            <textarea className="textInput textAreaInput" placeholder="Topic" rows={3} value={channelForm.topic} onChange={(event) => setChannelForm({ ...channelForm, topic: event.target.value })} />
            <div className="fieldGrid">
              <input className="textInput" placeholder="Repo path" value={channelForm.repoPath} onChange={(event) => setChannelForm({ ...channelForm, repoPath: event.target.value })} />
              <input className="textInput" placeholder="Language" value={channelForm.language} onChange={(event) => setChannelForm({ ...channelForm, language: event.target.value })} />
            </div>
            <div className="fieldGrid">
              <input className="textInput" placeholder="Response language" value={channelForm.responseLanguage} onChange={(event) => setChannelForm({ ...channelForm, responseLanguage: event.target.value })} />
              <select className="textInput" value={channelForm.formationMode} onChange={(event) => setChannelForm({ ...channelForm, formationMode: event.target.value as 'manual' | 'orchestrator_suggested' })}>
                <option value="manual">manual</option>
                <option value="orchestrator_suggested">orchestrator_suggested</option>
              </select>
            </div>
            <div className="inlinePanel">
              <div className="inlinePanelHeader"><strong>Initial Members</strong><span>{draftMembers.length}</span></div>
              <div className="fieldGrid">
                <input className="textInput" placeholder="Name" value={draftMember.name} onChange={(event) => setDraftMember({ ...draftMember, name: event.target.value })} />
                <input className="textInput" placeholder="Provider" value={draftMember.provider} onChange={(event) => setDraftMember({ ...draftMember, provider: event.target.value })} />
              </div>
              <div className="fieldGrid">
                <input className="textInput" placeholder="Model" value={draftMember.model} onChange={(event) => setDraftMember({ ...draftMember, model: event.target.value })} />
                <input className="textInput" placeholder="Roles: coder, tester" value={draftMember.roles} onChange={(event) => setDraftMember({ ...draftMember, roles: event.target.value })} />
              </div>
              <button className="secondaryButton" type="button" onClick={() => {
                if (!draftMember.name.trim() || !draftMember.provider.trim()) return;
                setDraftMembers([...draftMembers, draftMember]);
                setDraftMember(emptyMemberForm());
              }}>Add Draft Member</button>
              <div className="draftList">
                {draftMembers.map((member, index) => (
                  <div key={`${member.name}-${index}`} className="draftItem">
                    <div><strong>{member.name}</strong><p>{member.provider}{member.model ? ` / ${member.model}` : ''}</p></div>
                    <button className="textButton" type="button" onClick={() => setDraftMembers(draftMembers.filter((_, currentIndex) => currentIndex !== index))}>remove</button>
                  </div>
                ))}
              </div>
            </div>
            <button className="primaryButton" disabled={!channelForm.title.trim() || !channelForm.topic.trim()} type="submit">
              {busy === 'create' ? 'Creating...' : 'Create Channel'}
            </button>
          </form>
        </section>
      </aside>

      <main className="workspace">
        <header className="workspaceHeader">
          <div>
            <p className="eyebrow">Selected Channel</p>
            <h2>{selectedChannel?.title ?? 'No channel selected'}</h2>
            <p className="workspaceLead">{selectedChannel?.topic ?? 'Create or select a channel to continue.'}</p>
          </div>
          <div className="runtimePill">
            <span className={payload.runtime.reachable ? 'runtimeDot runtimeDotOk' : 'runtimeDot'} />
            <div><strong>{payload.runtime.reachable ? 'Runtime reachable' : 'Runtime degraded'}</strong><p>{payload.runtime.baseUrl}</p><p>{syncMessage || `State sync via ${payload.workspace.capabilities.persistence}`}</p></div>
          </div>
        </header>

        <section className="workspaceGrid">
          <article className="panel conversationPanel">
            <div className="panelHeader">
              <div><p className="eyebrow">Conversation</p><h3>Transcript and composer</h3></div>
              <div className="actionRow">
                <button className="secondaryButton" disabled={!selectedChannel} onClick={() => void onActivate()} type="button">{busy === `activate:${selectedChannel?.id}` ? 'Activating...' : 'Activate'}</button>
                <a className="secondaryButton secondaryButtonLink" href={exportHref}>Export JSON</a>
              </div>
            </div>
            <div className="detailList compactDetails">
              <div className="detailRow"><span>Status</span><strong>{selectedChannel?.status ?? 'n/a'}</strong></div>
              <div className="detailRow"><span>Repo</span><strong>{selectedChannel?.repoPath || 'not set'}</strong></div>
              <div className="detailRow"><span>Orchestrator Session</span><strong>{selectedChannel?.orchestratorSession.status ?? 'not_started'}</strong></div>
            </div>
            <div className="messageList">
              {selectedChannel?.messages.map((message) => (
                <div key={message.id} className={messageTone(message.senderKind)}>
                  <div className="messageMeta"><strong>{message.senderName}</strong><span>{message.senderKind}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div>
                  <p>{message.body}</p>
                  <div className="messageFooter"><span>{message.mentions.length > 0 ? message.mentions.map((item) => `@${item}`).join(', ') : 'no mentions'}</span>{message.usage ? <span>{message.usage.tokensUsed} tokens</span> : null}</div>
                </div>
              ))}
            </div>
            <form className="messageComposer" onSubmit={(event) => void onSend(event)}>
              <textarea className="textInput textAreaInput" placeholder="Message the workspace. Use @Orchestrator or @Agent-1 to route explicitly." rows={4} value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} />
              <div className="composerMeta"><span>Basic @mention routing is enabled.</span><button className="primaryButton" disabled={!selectedChannel || !messageDraft.trim()} type="submit">{busy === `message:${selectedChannel?.id}` ? 'Sending...' : 'Send'}</button></div>
            </form>
          </article>

          <article className="panel membersPanel">
            <div className="panelHeader"><div><p className="eyebrow">Members</p><h3>Participant management</h3></div></div>
            <div className="memberList">
              {selectedChannel?.members.map((member) => (
                <div key={member.id} className="memberCard">
                  <div className="memberTop"><div><strong>{member.name}</strong><p>{member.provider}{member.model ? ` / ${member.model}` : ''}</p></div><span className={sessionTone(member.session.status)}>{member.session.status}</span></div>
                  <div className="tagList">{member.roles.map((role) => <span key={role} className="tagChip">{role}</span>)}</div>
                  <div className="memberActions"><span>{member.status}</span>{member.status === 'active' ? <button className="textButton" onClick={() => void onRemoveMember(member)} type="button">{busy === `member:remove:${member.id}` ? 'Removing...' : 'Remove'}</button> : null}</div>
                </div>
              ))}
            </div>
            <form className="stackForm compactForm" onSubmit={(event) => void onAddMember(event)}>
              <div className="fieldGrid">
                <input className="textInput" placeholder="Name" value={memberForm.name} onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })} />
                <input className="textInput" placeholder="Provider" value={memberForm.provider} onChange={(event) => setMemberForm({ ...memberForm, provider: event.target.value })} />
              </div>
              <div className="fieldGrid">
                <input className="textInput" placeholder="Model" value={memberForm.model} onChange={(event) => setMemberForm({ ...memberForm, model: event.target.value })} />
                <input className="textInput" placeholder="Roles: coder, tester" value={memberForm.roles} onChange={(event) => setMemberForm({ ...memberForm, roles: event.target.value })} />
              </div>
              <button className="secondaryButton" disabled={!selectedChannel} type="submit">{busy === `member:add:${selectedChannel?.id}` ? 'Adding...' : 'Add Member'}</button>
            </form>
          </article>

          <article className="panel orchestratorPanel">
            <div className="panelHeader"><div><p className="eyebrow">Global Orchestrator</p><h3>Provider and prompt surface</h3></div></div>
            <form className="stackForm" onSubmit={(event) => void onSaveOrchestrator(event)}>
              <div className="fieldGrid">
                <input className="textInput" placeholder="Provider" value={orchestratorForm.provider} onChange={(event) => setOrchestratorForm({ ...orchestratorForm, provider: event.target.value })} />
                <input className="textInput" placeholder="Model" value={orchestratorForm.model} onChange={(event) => setOrchestratorForm({ ...orchestratorForm, model: event.target.value })} />
              </div>
              <div className="fieldGrid">
                <input className="textInput" placeholder="Skill profile" value={orchestratorForm.skillProfile} onChange={(event) => setOrchestratorForm({ ...orchestratorForm, skillProfile: event.target.value })} />
                <input className="textInput" placeholder="MCP profile" value={orchestratorForm.mcpProfile} onChange={(event) => setOrchestratorForm({ ...orchestratorForm, mcpProfile: event.target.value })} />
              </div>
              <input className="textInput" placeholder="Telegram bot name" value={orchestratorForm.telegramBotName} onChange={(event) => setOrchestratorForm({ ...orchestratorForm, telegramBotName: event.target.value })} />
              <textarea className="textInput textAreaInput" rows={6} value={orchestratorForm.systemPrompt} onChange={(event) => setOrchestratorForm({ ...orchestratorForm, systemPrompt: event.target.value })} />
              <button className="primaryButton" type="submit">{busy === 'orchestrator' ? 'Saving...' : 'Save Orchestrator'}</button>
            </form>
          </article>
        </section>
      </main>
    </div>
  );
}
