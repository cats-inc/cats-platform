import { useEffect, useState } from 'react';
import { sameProviderModelSelection } from '../../../../shared/providerSelection.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';

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
import {
  labelCodeRelayModeForLocale,
  labelCodeRelayRoleForLocale,
} from './codeStatusLabels.js';
import { presentCodeRelayAvailabilitySummary } from './codeRelayAvailabilitySummaryLabels.js';

interface CodeRelaySelectedChannelContext {
  title: string;
  repoPath: string | null;
  chatCwd: string | null;
}

interface CodeRelayViewProps {
  selectedChannelContext?: CodeRelaySelectedChannelContext | null;
}

function formatTimestamp(
  value: string | null,
  locale: string,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (!value) {
    return t(messageKeys.codeRelayNotRecorded);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(locale);
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

function labelRelayStatus(status: string, t: ReturnType<typeof useI18n>['t']): string {
  switch (status) {
    case 'active':
      return t(messageKeys.codeRelayStatusActive);
    case 'available':
      return t(messageKeys.codeRelayStatusAvailable);
    case 'completed':
      return t(messageKeys.codeRelayStatusCompleted);
    case 'failed':
      return t(messageKeys.codeRelayStatusFailed);
    case 'requested':
      return t(messageKeys.codeRelayStatusRequested);
    case 'running':
      return t(messageKeys.codeRelayStatusRunning);
    case 'unavailable':
      return t(messageKeys.codeRelayStatusUnavailable);
    case 'waiting_for_agents':
      return t(messageKeys.codeRelayStatusWaitingForAgents);
    case 'waiting_for_user':
      return t(messageKeys.codeRelayStatusWaitingForUser);
    default:
      return status.trim() || t(messageKeys.codeRelayStatusUnknown);
  }
}

function labelRelayAuthorKind(kind: string, t: ReturnType<typeof useI18n>['t']): string {
  switch (kind) {
    case 'agent':
      return t(messageKeys.codeRelayAuthorKindAgent);
    case 'system':
      return t(messageKeys.codeRelayAuthorKindSystem);
    case 'user':
      return t(messageKeys.codeRelayAuthorKindUser);
    default:
      return kind.trim() || t(messageKeys.codeRelayAuthorKindUnknown);
  }
}

export function labelRelayTransport(
  transport: string | null | undefined,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const value = transport?.trim();
  if (!value) {
    return t(messageKeys.codeRelayTransportUnknown);
  }
  if (value === 'runtime_session_bridge') {
    return t(messageKeys.codeRelayTransportRuntimeSessionBridge);
  }
  return t(messageKeys.codeRelayTransportUnknownWithValue, { transport: value });
}

function selectedRosterIds(entries: CodeRelayRosterEntryPayload[]): string[] {
  return entries
    .filter((entry) => entry.enabled)
    .map((entry) => entry.id);
}

export function CodeRelayView({ selectedChannelContext = null }: CodeRelayViewProps) {
  const { locale, t } = useI18n();
  const [payload, setPayload] = useState<CodeRelayThreadsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState(() => t(messageKeys.codeRelayDefaultThreadTitle));
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
      applyThreadsPayload(
        await fetchCodeRelayThreads(t(messageKeys.codeRelayErrorThreadLoadFailed)),
        nextSelectedThreadId,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t(messageKeys.codeRelayErrorThreadLoadFailed));
    } finally {
      setLoading(false);
    }
  }

  async function refreshThreads(nextSelectedThreadId: string | null = null): Promise<void> {
    try {
      applyThreadsPayload(
        await fetchCodeRelayThreads(t(messageKeys.codeRelayErrorThreadRefreshFailed)),
        nextSelectedThreadId,
      );
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : t(messageKeys.codeRelayErrorThreadRefreshFailed));
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
      setFanOutObjective(selectedThread.thread.summary ?? t(messageKeys.codeRelayOpenDiscoveryRound));
    }
  }, [fanOutObjective, selectedThread, t]);

  async function handleCreateThread(): Promise<void> {
    if (!createTitle.trim()) {
      setError(t(messageKeys.codeRelayErrorThreadTitleRequired));
      return;
    }

    setBusy('create-thread');
    setError('');
    try {
      applyThreadsPayload(
        await createCodeRelayThread(
          {
            title: createTitle.trim(),
            objective: createObjective.trim() || null,
            repoPath: createRepoPath.trim() || null,
          },
          t(messageKeys.codeRelayErrorThreadCreateFailed),
        ),
      );
      setFanOutPrompt('');
      setFanOutObjective(createObjective.trim() || t(messageKeys.codeRelayOpenDiscoveryRound));
    } catch (createError) {
      setError(createError instanceof Error
        ? createError.message
        : t(messageKeys.codeRelayErrorThreadCreateFailed));
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
        await updateCodeRelayRosterEntry(
          selectedThreadId,
          agentId,
          patch,
          t(messageKeys.codeRelayErrorRosterUpdateFailed),
        ),
        selectedThreadId,
      );
    } catch (patchError) {
      setError(patchError instanceof Error
        ? patchError.message
        : t(messageKeys.codeRelayErrorRosterUpdateFailed));
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
      setError(t(messageKeys.codeRelayErrorThreadRequired));
      return;
    }
    if (!fanOutPrompt.trim()) {
      setError(t(messageKeys.codeRelayErrorFanOutPromptRequired));
      return;
    }
    if (selectedAgentIds.length === 0) {
      setError(t(messageKeys.codeRelayErrorAgentRequired));
      return;
    }

    setBusy('fan-out');
    setError('');
    try {
      applyThreadsPayload(
        await runCodeRelayFanOut(
          selectedThreadId,
          {
            mode: 'discover',
            objective: fanOutObjective.trim() || t(messageKeys.codeRelayOpenDiscoveryRound),
            prompt: fanOutPrompt.trim(),
            agentIds: selectedAgentIds,
          },
          t(messageKeys.codeRelayErrorRelayFailed),
        ),
        selectedThreadId,
      );
    } catch (fanOutError) {
      setError(fanOutError instanceof Error ? fanOutError.message : t(messageKeys.codeRelayErrorRelayFailed));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="codeRelayView">
      <div className="codeBuilderHeader">
        <h1 className="codeBuilderTitle">{t(messageKeys.codeRelayTitle)}</h1>
        <div className="codeRelayHeaderActions">
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => { void loadThreads(selectedThreadId); }}
            disabled={loading || busy.length > 0}
          >
            {t(messageKeys.codeRelayActionRefresh)}
          </button>
        </div>
      </div>

      {error ? (
        <div className="codeBuilderFeedback">{error}</div>
      ) : null}

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codeRelayLabelPhase0)}</p>
            <h2>{t(messageKeys.codeRelayTitleConnectorContract)}</h2>
          </div>
          {payload?.contract ? (
            <span className="operatorStatusBadge isMuted">{payload.contract.version}</span>
          ) : null}
        </div>
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t(messageKeys.codeRelayLabelRuntimeProviderSurface)}</strong>
            <span className="operatorStatusBadge isMuted">
              {labelRelayTransport(payload?.contract.transport, t)}
            </span>
          </div>
          <p>{payload?.contract.supportedProviders.join(', ') || t(messageKeys.codeRelayLabelContractLoading)}</p>
        </article>
      </section>

      <section className="operatorPanel">
        <div className="operatorPanelHeader">
          <div>
            <p className="operatorEyebrow">{t(messageKeys.codeRelayLabelPhase1)}</p>
            <h2>{t(messageKeys.codeRelayTitleProjectThread)}</h2>
          </div>
        </div>
        <div className="codeBuilderForm">
          <label className="codeBuilderLabel">
            {t(messageKeys.codeRelayLabelThreadTitle)}
            <input
              className="codeBuilderInput"
              type="text"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
            />
          </label>
          <label className="codeBuilderLabel">
            {t(messageKeys.codeRelayLabelObjective)}
            <textarea
              className="codeBuilderTextarea"
              rows={3}
              value={createObjective}
              onChange={(event) => setCreateObjective(event.target.value)}
              placeholder={t(messageKeys.codeRelayPlaceholderObjective)}
            />
          </label>
          <label className="codeBuilderLabel">
            {t(messageKeys.codeRelayLabelRepoPath)}
            <input
              className="codeBuilderInput"
              type="text"
              value={createRepoPath}
              onChange={(event) => setCreateRepoPath(event.target.value)}
              placeholder={t(messageKeys.codeRelayPlaceholderOptionalRepo)}
            />
          </label>
          <div className="codeBuilderFormRow">
            <button
              type="button"
              className="operatorActionButton operatorActionButtonPrimary"
              onClick={() => { void handleCreateThread(); }}
              disabled={busy === 'create-thread'}
            >
              {busy === 'create-thread'
                ? t(messageKeys.codeRelayLabelCreate)
                : t(messageKeys.codeRelayActionCreateRelayThread)}
            </button>
            {selectedChannelContext?.title ? (
              <span className="codeRelayHint">
                {t(messageKeys.codeRelayLabelCurrentChat, {
                  title: selectedChannelContext.title,
                })}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="operatorPanel">
          <div className="operatorPanelHeader">
            <h2>{t(messageKeys.codeRelayLabelLoading)}</h2>
          </div>
        </section>
      ) : null}

      {!loading && payload && payload.threads.length > 0 ? (
        <>
          <section className="operatorPanel">
            <div className="operatorPanelHeader">
              <div>
                <p className="operatorEyebrow">{t(messageKeys.codeBuilderResumePrompt)}</p>
                <h2>{t(messageKeys.codeRelayLabelThreadShell)}</h2>
              </div>
            </div>
            <div className="codeBuilderForm">
              <label className="codeBuilderLabel">
                {t(messageKeys.codeRelayLabelActiveThread)}
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
                      {labelRelayStatus(selectedThread.thread.status, t)}
                    </span>
                  </div>
                  <p>{selectedThread.thread.summary ?? t(messageKeys.codeRelayNoObjective)}</p>
                  <div className="codeRelayMetaRow">
                    <span>
                      {t(messageKeys.codeRelayLabelRepoPath, {
                        repoPath: selectedThread.thread.repoPath
                          ?? t(messageKeys.codeRelayLabelRepoNoBound),
                      })}
                    </span>
                    <span>
                      {t(messageKeys.codeRelayLabelUpdated, {
                        updatedAt: formatTimestamp(selectedThread.thread.updatedAt, locale, t),
                      })}
                    </span>
                    <span>
                      {t(messageKeys.codeRelayLabelProven, {
                        providers: selectedThread.provenProviderIds.join(', ')
                          || t(messageKeys.codeRelayLabelNoneYet),
                      })}
                    </span>
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
                    <p className="operatorEyebrow">{t(messageKeys.codeRelayLabelPhaseRoster)}</p>
                    <h2>{t(messageKeys.codeRelayLabelRoster)}</h2>
                  </div>
                </div>
                <div className="codeRelayRosterGrid">
                  {selectedThread.roster.map((entry) => (
                    <article key={entry.id} className="operatorCard codeRelayRosterCard">
                      <div className="operatorCardHeader">
                        <strong>{entry.label}</strong>
                        <span className={relayStatusBadgeClass(entry.availability)}>
                          {labelRelayStatus(entry.availability, t)}
                        </span>
                      </div>
                      <p>{presentCodeRelayAvailabilitySummary(entry, t)}</p>
                      <div className="codeRelayMetaRow">
                        <span>
                          {t(messageKeys.codeRelayLabelModel, {
                            model: entry.model ?? t(messageKeys.codeRelayLabelDefault),
                          })}
                        </span>
                        <span>
                          {t(messageKeys.codeRelayLabelRole, {
                            role: labelCodeRelayRoleForLocale(entry.recentRole, t),
                          })}
                        </span>
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
                        <span>{t(messageKeys.codeRelayLabelEnabled)}</span>
                      </label>
                      <label className="codeBuilderLabel">
                        {t(messageKeys.codeRelayLabelQuotaNote)}
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
                          placeholder={t(messageKeys.codeRelayPlaceholderQuotaNote)}
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </section>

              <section className="operatorPanel">
                <div className="operatorPanelHeader">
                  <div>
                    <p className="operatorEyebrow">{t(messageKeys.codeRelayLabelPhaseFanOut)}</p>
                    <h2>{t(messageKeys.codeRelayModeParallelPrompt)}</h2>
                  </div>
                </div>
                <div className="codeBuilderForm">
                  <label className="codeBuilderLabel">
                    {t(messageKeys.codeRelayLabelRoundObjective)}
                    <input
                      className="codeBuilderInput"
                      type="text"
                      value={fanOutObjective}
                      onChange={(event) => setFanOutObjective(event.target.value)}
                    />
                  </label>
                  <label className="codeBuilderLabel">
                    {t(messageKeys.codeRelayLabelRoundPrompt)}
                    <textarea
                      className="codeBuilderTextarea"
                      rows={5}
                      value={fanOutPrompt}
                      onChange={(event) => setFanOutPrompt(event.target.value)}
                      placeholder={t(messageKeys.codeRelayPlaceholderFanOutPrompt)}
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
                      {busy === 'fan-out'
                        ? t(messageKeys.codeRelayActionDispatching)
                        : t(messageKeys.codeRelayActionFanOutSelected)}
                    </button>
                  </div>
                </div>
              </section>

              <section className="operatorPanel">
                <div className="operatorPanelHeader">
                  <div>
                    <p className="operatorEyebrow">{t(messageKeys.codeRelayLabelRoundTimeline)}</p>
                    <h2>{t(messageKeys.codeRelayLabelRounds)}</h2>
                  </div>
                </div>
                <div className="codeRelayRounds">
                  {selectedThread.rounds.length === 0 ? (
                    <article className="operatorCard">
                      <div className="operatorCardHeader">
                        <strong>{t(messageKeys.codeRelayLabelNoRounds)}</strong>
                        <span className="operatorStatusBadge isMuted">
                          {t(messageKeys.codeRelayLabelStatusWaiting)}
                        </span>
                      </div>
                      <p>{t(messageKeys.codeRelayNoRoundsHint)}</p>
                    </article>
                  ) : selectedThread.rounds.map((round) => (
                    <article key={round.id} className="operatorCard codeRelayRoundCard">
                      <div className="operatorCardHeader">
                        <strong>{round.objective}</strong>
                        <span className={relayThreadStatusClass(round.status)}>
                          {labelRelayStatus(round.status, t)}
                        </span>
                      </div>
                      <p>{round.prompt}</p>
                      <div className="codeRelayMetaRow">
                        <span>
                          {t(messageKeys.codeRelayLabelMode, {
                            mode: labelCodeRelayModeForLocale(round.mode, t),
                          })}
                        </span>
                        <span>
                          {t(messageKeys.codeRelayLabelStarted, {
                            startedAt: formatTimestamp(round.startedAt, locale, t),
                          })}
                        </span>
                        <span>
                          {t(messageKeys.codeRelayLabelEnded, {
                            endedAt: formatTimestamp(round.endedAt, locale, t),
                          })}
                        </span>
                      </div>
                      <div className="codeRelayDispatchList">
                        {round.dispatches.map((dispatch) => {
                          const agent = selectedThread.roster.find((entry) => entry.id === dispatch.agentId);
                          const responseMessage = round.messages.find((message) => message.id === dispatch.responseMessageId) ?? null;
                          return (
                            <div key={dispatch.id} className="codeRelayDispatchCard">
                              <div className="codeRelayDispatchHeader">
                                <strong>{agent?.label ?? dispatch.agentId}</strong>
                                <span className={relayStatusBadgeClass(dispatch.status)}>
                                  {labelRelayStatus(dispatch.status, t)}
                                </span>
                              </div>
                              {dispatch.error ? (
                                <p className="codeRelayDispatchError">{dispatch.error}</p>
                              ) : null}
                              {responseMessage ? (
                                <div className="codeRelayMessageBlock">
                                  <p className="codeRelayMessageMeta">
                                    {labelRelayAuthorKind(responseMessage.authorKind, t)} ·{' '}
                                    {formatTimestamp(responseMessage.createdAt, locale, t)}
                                  </p>
                                  <pre className="codeRelayMessageBody">{responseMessage.content}</pre>
                                </div>
                              ) : null}
                              <button
                                type="button"
                                className="operatorActionButton"
                                disabled
                              >
                                {t(messageKeys.codeRelayLabelRelayToOthers)}
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
