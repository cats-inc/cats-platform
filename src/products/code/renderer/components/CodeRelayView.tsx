import { useEffect, useState } from 'react';
import { sameProviderModelSelection } from '../../../../shared/providerSelection.js';

import {
  createCodeRelayThread,
  fetchCodeRelayThreads,
  runCodeRelayFanOut,
  updateCodeRelayRosterEntry,
  type CodeRelayRosterEntryPayload,
  type CodeRelayThreadPayload,
  type CodeRelayThreadsPayload,
} from '../api/relay.js';
import { ProviderModelFields } from './ProviderModelFields.js';

interface CodeRelaySelectedChannelContext {
  title: string;
  repoPath: string | null;
  chatCwd: string | null;
}

interface CodeRelayViewProps {
  selectedChannelContext?: CodeRelaySelectedChannelContext | null;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Not recorded';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function relayStatusBadgeClass(status: string): string {
  switch (status) {
    case 'available':
    case 'completed':
      return 'operatorStatusBadge isSuccess';
    case 'waiting_for_agents':
    case 'running':
      return 'operatorStatusBadge isProgress';
    case 'unavailable':
    case 'failed':
      return 'operatorStatusBadge isError';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

function relayThreadStatusClass(status: string): string {
  switch (status) {
    case 'waiting_for_user':
      return 'operatorStatusBadge isAttention';
    case 'waiting_for_agents':
      return 'operatorStatusBadge isProgress';
    case 'active':
      return 'operatorStatusBadge isSuccess';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

function selectedRosterIds(entries: CodeRelayRosterEntryPayload[]): string[] {
  return entries
    .filter((entry) => entry.enabled)
    .map((entry) => entry.id);
}

export function CodeRelayView({ selectedChannelContext = null }: CodeRelayViewProps) {
  const [payload, setPayload] = useState<CodeRelayThreadsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState('New relay thread');
  const [createObjective, setCreateObjective] = useState('');
  const [createRepoPath, setCreateRepoPath] = useState('');
  const [fanOutObjective, setFanOutObjective] = useState('');
  const [fanOutPrompt, setFanOutPrompt] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({});

  function applyThreadsPayload(
    nextPayload: CodeRelayThreadsPayload,
    nextSelectedThreadId: string | null = null,
  ): void {
    setPayload(nextPayload);
    setSelectedThreadId(
      nextSelectedThreadId
      ?? nextPayload.selection.selectedThreadId
      ?? nextPayload.threads[0]?.thread.id
      ?? null,
    );
  }

  async function loadThreads(nextSelectedThreadId: string | null = null): Promise<void> {
    setLoading(true);
    setError('');
    try {
      applyThreadsPayload(await fetchCodeRelayThreads(), nextSelectedThreadId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load relay threads.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshThreads(nextSelectedThreadId: string | null = null): Promise<void> {
    try {
      applyThreadsPayload(await fetchCodeRelayThreads(), nextSelectedThreadId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to refresh relay threads.');
    }
  }

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    if (!createRepoPath && (selectedChannelContext?.repoPath || selectedChannelContext?.chatCwd)) {
      setCreateRepoPath(selectedChannelContext?.repoPath ?? selectedChannelContext?.chatCwd ?? '');
    }
  }, [createRepoPath, selectedChannelContext?.chatCwd, selectedChannelContext?.repoPath]);

  const selectedThread = payload?.threads.find((thread) => thread.thread.id === selectedThreadId) ?? null;

  useEffect(() => {
    if (selectedThread?.thread.status !== 'waiting_for_agents' || !selectedThreadId) {
      return undefined;
    }

    const interval = setInterval(() => {
      void refreshThreads(selectedThreadId);
    }, 3_000);
    return () => clearInterval(interval);
  }, [selectedThread?.thread.status, selectedThreadId]);

  useEffect(() => {
    if (!selectedThread) {
      setSelectedAgentIds([]);
      setQuotaDrafts({});
      return;
    }

    setSelectedAgentIds((current) => {
      const nextIds = selectedRosterIds(selectedThread.roster);
      return current.length > 0 ? current.filter((id) => nextIds.includes(id)) : nextIds;
    });
    setQuotaDrafts(
      Object.fromEntries(
        selectedThread.roster.map((entry) => [entry.id, entry.quotaNote ?? '']),
      ),
    );
    if (!fanOutObjective.trim()) {
      setFanOutObjective(selectedThread.thread.summary ?? 'Open discovery round');
    }
  }, [selectedThread]);

  async function handleCreateThread(): Promise<void> {
    if (!createTitle.trim()) {
      setError('Thread title is required.');
      return;
    }

    setBusy('create-thread');
    setError('');
    try {
      applyThreadsPayload(await createCodeRelayThread({
        title: createTitle.trim(),
        objective: createObjective.trim() || null,
        repoPath: createRepoPath.trim() || null,
      }));
      setFanOutPrompt('');
      setFanOutObjective(createObjective.trim() || 'Open discovery round');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create relay thread.');
    } finally {
      setBusy('');
    }
  }

  async function handleRosterPatch(
    agentId: string,
    patch: {
      enabled?: boolean;
      provider?: string;
      instance?: string | null;
      model?: string | null;
      modelSelection?: CodeRelayRosterEntryPayload['modelSelection'];
      quotaNote?: string | null;
    },
  ): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    setBusy(`roster:${agentId}`);
    setError('');
    try {
      applyThreadsPayload(
        await updateCodeRelayRosterEntry(selectedThreadId, agentId, patch),
        selectedThreadId,
      );
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : 'Failed to update relay roster.');
    } finally {
      setBusy('');
    }
  }

  async function handleRosterTargetChange(
    entry: CodeRelayRosterEntryPayload,
    target: {
      provider: string;
      instance: string;
      model: string;
      modelSelection?: CodeRelayRosterEntryPayload['modelSelection'];
    },
  ): Promise<void> {
    const normalizedInstance = target.instance.trim() || null;
    const normalizedModel = target.model.trim() || null;
    const normalizedSelection = target.modelSelection ?? null;
    if (
      entry.provider === target.provider
      && (entry.instance ?? null) === normalizedInstance
      && (entry.model ?? null) === normalizedModel
      && sameProviderModelSelection(entry.modelSelection ?? null, normalizedSelection)
    ) {
      return;
    }

    await handleRosterPatch(entry.id, {
      provider: target.provider,
      instance: normalizedInstance,
      model: normalizedModel,
      modelSelection: normalizedSelection,
    });
  }

  async function handleFanOut(): Promise<void> {
    if (!selectedThreadId) {
      setError('Create or select a relay thread first.');
      return;
    }
    if (!fanOutPrompt.trim()) {
      setError('Fan out prompt is required.');
      return;
    }
    if (selectedAgentIds.length === 0) {
      setError('Select at least one agent.');
      return;
    }

    setBusy('fan-out');
    setError('');
    try {
      applyThreadsPayload(await runCodeRelayFanOut(selectedThreadId, {
        mode: 'discover',
        objective: fanOutObjective.trim() || 'Open discovery round',
        prompt: fanOutPrompt.trim(),
        agentIds: selectedAgentIds,
      }), selectedThreadId);
    } catch (fanOutError) {
      setError(fanOutError instanceof Error ? fanOutError.message : 'Failed to run relay fan-out.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="codeRelayView">
      <div className="codeBuilderHeader">
        <h1 className="codeBuilderTitle">Code Relay</h1>
        <div className="codeRelayHeaderActions">
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => { void loadThreads(selectedThreadId); }}
            disabled={loading || busy.length > 0}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="codeBuilderFeedback">{error}</div>
      ) : null}

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Phase 0</p>
            <h2>Connector Contract</h2>
          </div>
          {payload?.contract ? (
            <span className="operatorStatusBadge isMuted">{payload.contract.version}</span>
          ) : null}
        </div>
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>Runtime provider surface</strong>
            <span className="operatorStatusBadge isMuted">
              {payload?.contract.transport ?? 'runtime_session_bridge'}
            </span>
          </div>
          <p>{payload?.contract.supportedProviders.join(', ') || 'Loading connector contract...'}</p>
        </article>
      </section>

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">Phase 1</p>
            <h2>Project Thread</h2>
          </div>
        </div>
        <div className="codeBuilderForm">
          <label className="codeBuilderLabel">
            Thread title
            <input
              className="codeBuilderInput"
              type="text"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
            />
          </label>
          <label className="codeBuilderLabel">
            Objective
            <textarea
              className="codeBuilderTextarea"
              rows={3}
              value={createObjective}
              onChange={(event) => setCreateObjective(event.target.value)}
              placeholder="What are we trying to decide or build?"
            />
          </label>
          <label className="codeBuilderLabel">
            Repo path
            <input
              className="codeBuilderInput"
              type="text"
              value={createRepoPath}
              onChange={(event) => setCreateRepoPath(event.target.value)}
              placeholder="Optional local repo binding"
            />
          </label>
          <div className="codeBuilderFormRow">
            <button
              type="button"
              className="operatorActionButton operatorActionButtonPrimary"
              onClick={() => { void handleCreateThread(); }}
              disabled={busy === 'create-thread'}
            >
              {busy === 'create-thread' ? 'Creating...' : 'Create relay thread'}
            </button>
            {selectedChannelContext?.title ? (
              <span className="codeRelayHint">Current chat: {selectedChannelContext.title}</span>
            ) : null}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="operatorPanel">
          <div className="operatorPanelHeader">
            <h2>Loading relay workspace...</h2>
          </div>
        </section>
      ) : null}

      {!loading && payload && payload.threads.length > 0 ? (
        <>
          <section className="operatorPanel">
            <div className="operatorPanelHeader">
              <div>
                <p className="operatorEyebrow">Resume</p>
                <h2>Thread Shell</h2>
              </div>
            </div>
            <div className="codeBuilderForm">
              <label className="codeBuilderLabel">
                Active thread
                <select
                  className="codeBuilderInput"
                  value={selectedThreadId ?? ''}
                  onChange={(event) => setSelectedThreadId(event.target.value || null)}
                >
                  {payload.threads.map((thread) => (
                    <option key={thread.thread.id} value={thread.thread.id}>
                      {thread.thread.title}
                    </option>
                  ))}
                </select>
              </label>

              {selectedThread ? (
                <article className="operatorCard">
                  <div className="operatorCardHeader">
                    <strong>{selectedThread.thread.title}</strong>
                    <span className={relayThreadStatusClass(selectedThread.thread.status)}>
                      {selectedThread.thread.status}
                    </span>
                  </div>
                  <p>{selectedThread.thread.summary ?? 'No objective recorded yet.'}</p>
                  <div className="codeRelayMetaRow">
                    <span>Repo: {selectedThread.thread.repoPath ?? 'Not bound'}</span>
                    <span>Updated: {formatTimestamp(selectedThread.thread.updatedAt)}</span>
                    <span>Proven: {selectedThread.provenProviderIds.join(', ') || 'none yet'}</span>
                  </div>
                </article>
              ) : null}
            </div>
          </section>

          {selectedThread ? (
            <>
              <section className="operatorPanel">
                <div className="operatorPanelHeader">
                  <div>
                    <p className="operatorEyebrow">Roster</p>
                    <h2>Agent Roster</h2>
                  </div>
                </div>
                <div className="codeRelayRosterGrid">
                  {selectedThread.roster.map((entry) => (
                    <article key={entry.id} className="operatorCard codeRelayRosterCard">
                      <div className="operatorCardHeader">
                        <strong>{entry.label}</strong>
                        <span className={relayStatusBadgeClass(entry.availability)}>
                          {entry.availability}
                        </span>
                      </div>
                      <p>{entry.availabilitySummary ?? `${entry.provider}:${entry.instance ?? 'default'}`}</p>
                      <div className="codeRelayMetaRow">
                        <span>Model: {entry.model ?? 'default'}</span>
                        <span>Role: {entry.recentRole}</span>
                      </div>
                      <div
                        className="codeRelayProviderFields"
                        style={busy === `roster:${entry.id}` ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
                      >
                        <ProviderModelFields
                          provider={entry.provider}
                          instance={entry.instance ?? ''}
                          model={entry.model ?? ''}
                          modelSelection={entry.modelSelection ?? null}
                          onTargetChange={(target) => {
                            void handleRosterTargetChange(entry, target);
                          }}
                        />
                      </div>
                      <label className="codeRelayToggle">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(event) => {
                            void handleRosterPatch(entry.id, { enabled: event.target.checked });
                          }}
                          disabled={busy === `roster:${entry.id}`}
                        />
                        <span>Enabled</span>
                      </label>
                      <label className="codeBuilderLabel">
                        Quota note
                        <input
                          className="codeBuilderInput"
                          type="text"
                          value={quotaDrafts[entry.id] ?? ''}
                          onChange={(event) => {
                            setQuotaDrafts((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }));
                          }}
                          onBlur={() => {
                            const normalized = (quotaDrafts[entry.id] ?? '').trim() || null;
                            if ((entry.quotaNote ?? null) === normalized) {
                              return;
                            }
                            void handleRosterPatch(entry.id, {
                              quotaNote: normalized,
                            });
                          }}
                          placeholder="Optional advisory note"
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </section>

              <section className="operatorPanel">
                <div className="operatorPanelHeader">
                  <div>
                    <p className="operatorEyebrow">Fan-Out</p>
                    <h2>Parallel Prompt</h2>
                  </div>
                </div>
                <div className="codeBuilderForm">
                  <label className="codeBuilderLabel">
                    Round objective
                    <input
                      className="codeBuilderInput"
                      type="text"
                      value={fanOutObjective}
                      onChange={(event) => setFanOutObjective(event.target.value)}
                    />
                  </label>
                  <label className="codeBuilderLabel">
                    Fan out prompt
                    <textarea
                      className="codeBuilderTextarea"
                      rows={5}
                      value={fanOutPrompt}
                      onChange={(event) => setFanOutPrompt(event.target.value)}
                      placeholder="Ask the same requirement question to multiple coding agents."
                    />
                  </label>
                  <div className="codeRelayAgentChecklist">
                    {selectedThread.roster.map((entry) => (
                      <label key={entry.id} className="codeRelayAgentChoice">
                        <input
                          type="checkbox"
                          checked={selectedAgentIds.includes(entry.id)}
                          onChange={(event) => {
                            setSelectedAgentIds((current) => (
                              event.target.checked
                                ? [...new Set([...current, entry.id])]
                                : current.filter((id) => id !== entry.id)
                            ));
                          }}
                          disabled={!entry.enabled}
                        />
                        <span>{entry.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="codeBuilderFormRow">
                    <button
                      type="button"
                      className="operatorActionButton operatorActionButtonPrimary"
                      onClick={() => { void handleFanOut(); }}
                      disabled={busy === 'fan-out'}
                    >
                      {busy === 'fan-out' ? 'Dispatching...' : 'Fan out to selected agents'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="operatorPanel">
                <div className="operatorPanelHeader">
                  <div>
                    <p className="operatorEyebrow">Timeline</p>
                    <h2>Rounds</h2>
                  </div>
                </div>
                <div className="codeRelayRounds">
                  {selectedThread.rounds.length === 0 ? (
                    <article className="operatorCard">
                      <div className="operatorCardHeader">
                        <strong>No rounds yet</strong>
                        <span className="operatorStatusBadge isMuted">waiting</span>
                      </div>
                      <p>Use the fan-out form above to open the first discovery round.</p>
                    </article>
                  ) : selectedThread.rounds.map((round) => (
                    <article key={round.id} className="operatorCard codeRelayRoundCard">
                      <div className="operatorCardHeader">
                        <strong>{round.objective}</strong>
                        <span className={relayThreadStatusClass(round.status)}>{round.status}</span>
                      </div>
                      <p>{round.prompt}</p>
                      <div className="codeRelayMetaRow">
                        <span>Mode: {round.mode}</span>
                        <span>Started: {formatTimestamp(round.startedAt)}</span>
                        <span>Ended: {formatTimestamp(round.endedAt)}</span>
                      </div>
                      <div className="codeRelayDispatchList">
                        {round.dispatches.map((dispatch) => {
                          const agent = selectedThread.roster.find((entry) => entry.id === dispatch.agentId);
                          const responseMessage = round.messages.find((message) => message.id === dispatch.responseMessageId) ?? null;
                          return (
                            <div key={dispatch.id} className="codeRelayDispatchCard">
                              <div className="codeRelayDispatchHeader">
                                <strong>{agent?.label ?? dispatch.agentId}</strong>
                                <span className={relayStatusBadgeClass(dispatch.status)}>{dispatch.status}</span>
                              </div>
                              {dispatch.error ? (
                                <p className="codeRelayDispatchError">{dispatch.error}</p>
                              ) : null}
                              {responseMessage ? (
                                <div className="codeRelayMessageBlock">
                                  <p className="codeRelayMessageMeta">
                                    {responseMessage.authorKind} · {formatTimestamp(responseMessage.createdAt)}
                                  </p>
                                  <pre className="codeRelayMessageBody">{responseMessage.content}</pre>
                                </div>
                              ) : null}
                              <button
                                type="button"
                                className="operatorActionButton"
                                disabled
                              >
                                Relay to others (Phase 2)
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
