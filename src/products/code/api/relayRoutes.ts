import {
  upsertCoreRun,
} from '../../../core/model/index.js';
import type {
  CatsCoreState,
  CoreRunStatus,
} from '../../../core/types.js';
import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import { listProductProviders } from '../../../shared/providerCatalog.js';
import { parseProviderModelSelection } from '../../../shared/providerSelection.js';
import { resolveFullResponseText, type RuntimeProviderConfigRegistry } from '../../../runtime/client.js';
import {
  createDurableToolEvidenceSink,
  createSupervisedRuntimeSession,
  sendSupervisedRuntimeMessage,
} from '../../../platform/supervision/index.js';
import type { CodeApiRouteContext } from './index.js';
import {
  applyCodeRelayRosterProbe,
  createCodeRelayThread,
  createCodeRelayDispatchRunId,
  createDefaultCodeRelayRoster,
  finishCodeRelayFanOut,
  listCodeRelayProjects,
  markCodeRelayDispatchesRunning,
  readCodeRelayThread,
  startCodeRelayFanOut,
  updateCodeRelayRosterEntry,
} from '../state/relayState.js';
import type {
  CodeRelayMode,
  CodeRelayRoundRecord,
  CodeRelayRecentRole,
  CodeRelayRosterEntry,
  CodeRelayThreadRecord,
} from '../state/relayContracts.js';
import {
  CODE_API_RELAY_FAN_OUT_PATTERN,
  CODE_API_RELAY_ROSTER_ENTRY_PATTERN,
  CODE_API_RELAY_THREADS_PATH,
} from '../shared/apiPaths.js';
import { createCodeProductRef } from '../shared/productMetadata.js';

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return readNonEmptyString(value);
}

function readMode(value: unknown): CodeRelayMode {
  return value === 'shape'
    || value === 'fit'
    || value === 'document'
    || value === 'build'
    || value === 'review'
    || value === 'human_verify'
    || value === 'repair'
    ? value
    : 'discover';
}

function readRecentRole(value: unknown): CodeRelayRecentRole | null {
  return value === 'idle'
    || value === 'drafter'
    || value === 'critic'
    || value === 'reviewer'
    || value === 'main_coder'
    || value === 'summarizer'
    ? value
    : null;
}

function readAgentIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

async function readRelayRuntimeProviderConfig(
  context: CodeApiRouteContext,
): Promise<RuntimeProviderConfigRegistry | null> {
  try {
    return await context.dependencies.runtimeClient.getProviderConfig();
  } catch {
    return null;
  }
}

function createRelayContract(
  runtimeConfig: RuntimeProviderConfigRegistry | null,
): CodeRelayThreadRecord['contract'] {
  const supportedProviders = runtimeConfig
    ? Object.keys(runtimeConfig)
    : listProductProviders().map((provider) => provider.id);
  return {
    version: 'phase0-runtime-bridge-v1',
    transport: 'runtime_session_bridge',
    supportedProviders,
    notes: runtimeConfig
      ? [
          'Relay fan-out uses cats-runtime session APIs.',
          'Provider availability is derived from runtime provider config.',
        ]
      : [
          'Relay fan-out uses cats-runtime session APIs.',
          'Runtime provider config was unavailable, so the provider list fell back to the product catalog.',
        ],
  };
}

function probeRelayRosterEntries(
  entries: CodeRelayRosterEntry[],
  runtimeConfig: RuntimeProviderConfigRegistry | null,
): CodeRelayRosterEntry[] {
  if (!runtimeConfig) {
    return entries.map((entry) => ({
      ...entry,
      availability: 'unknown',
      availabilitySummary: { kind: 'runtime_config_unavailable' },
    }));
  }

  return entries.map((entry) => {
    const providerConfig = runtimeConfig[entry.provider];
    if (!providerConfig) {
      return {
        ...entry,
        availability: 'unavailable',
        availabilitySummary: {
          kind: 'provider_path_missing',
          providerLabel: entry.label,
        },
      };
    }

    const resolvedInstance = entry.instance?.trim() || providerConfig.defaultInstance || null;
    if (resolvedInstance) {
      const instanceConfig = providerConfig.instances.find((candidate) => candidate.id === resolvedInstance) ?? null;
      if (!instanceConfig) {
        return {
          ...entry,
          availability: 'unavailable',
          availabilitySummary: {
            kind: 'instance_unavailable',
            providerLabel: entry.label,
            instance: resolvedInstance,
          },
        };
      }

      return {
        ...entry,
        instance: resolvedInstance,
        availability: 'available',
        availabilitySummary: {
          kind: 'runtime_ready_via',
          target: instanceConfig.target ?? instanceConfig.id,
        },
      };
    }

    return {
      ...entry,
      availability: 'available',
      availabilitySummary: {
        kind: 'provider_path_ready',
        providerLabel: entry.label,
      },
    };
  });
}

function buildThreadProjection(
  project: Awaited<ReturnType<typeof listCodeRelayProjects>>[number],
  thread: CodeRelayThreadRecord,
) {
  return {
    thread: {
      id: project.id,
      title: project.title,
      summary: project.summary,
      repoPath: project.repoPath,
      status: thread.status,
      updatedAt: project.updatedAt,
      currentRoundId: thread.currentRoundId,
    },
    contract: thread.contract,
    provenProviderIds: thread.provenProviderIds,
    roster: thread.roster,
    rounds: thread.rounds,
  };
}

function createRelayEvidenceConversationId(threadId: string): string {
  return `code-relay-${threadId}`;
}

function createRelayRoundBudgetEnvelopeId(threadId: string, roundId: string): string {
  return `code-relay-budget:${threadId}:${roundId}`;
}

function createRelayEvidenceSink(
  context: CodeApiRouteContext,
  threadId: string,
  sessionId: string | null = null,
) {
  return context.dependencies.evidenceDataDir
    ? createDurableToolEvidenceSink({
        dataDir: context.dependencies.evidenceDataDir,
        conversationId: createRelayEvidenceConversationId(threadId),
        sessionId,
      })
    : undefined;
}

function upsertRelayDispatchRun(
  core: CatsCoreState,
  input: {
    threadId: string;
    roundId: string;
    dispatchId: string | null;
    entry: CodeRelayRosterEntry;
    prompt: string;
    repoPath: string | null;
    siblingRunIds: string[];
    status: CoreRunStatus;
    sessionId?: string | null;
    responseExcerpt?: string | null;
    error?: string | null;
    now: Date;
  },
): CatsCoreState {
  const runId = createCodeRelayDispatchRunId(input.threadId, input.roundId, input.entry.id);
  const terminal = input.status === 'completed'
    || input.status === 'failed'
    || input.status === 'cancelled';
  const runtimeBridgeStatus = input.status === 'failed'
    ? 'failed'
    : input.sessionId
      ? 'started'
      : 'pending';
  return upsertCoreRun(
    core,
    {
      id: runId,
      title: `${input.entry.label} relay dispatch`,
      status: input.status,
      conversationId: null,
      taskId: null,
      parentRunId: null,
      orchestratorActorId: input.entry.id,
      traceId: `trace-${runId}`,
      summary: input.error
        ?? input.responseExcerpt
        ?? `Relay fan-out dispatch for ${input.entry.label}.`,
      ...(input.status === 'running' ? { startedAt: input.now.toISOString() } : {}),
      ...(terminal ? { completedAt: input.now.toISOString() } : {}),
      metadata: {
        supervision: {
          source: 'code_relay_fan_out',
          runtimeBridge: {
            status: runtimeBridgeStatus,
            sessionId: input.sessionId ?? null,
            provider: input.entry.provider,
            model: input.entry.model,
            modelSelection: input.entry.modelSelection,
            requestedInstance: input.entry.instance,
            workspacePath: input.repoPath,
          },
          relay: {
            threadId: input.threadId,
            roundId: input.roundId,
            dispatchId: input.dispatchId,
            agentId: input.entry.id,
            mode: 'fan_out',
          },
          budgetEnvelope: {
            id: createRelayRoundBudgetEnvelopeId(input.threadId, input.roundId),
            scope: 'code_relay_round',
            siblingRunIds: input.siblingRunIds,
          },
          convergence: {
            roundId: input.roundId,
            status: terminal ? 'reported_to_round' : 'awaiting_agent_response',
          },
          prompt: {
            length: input.prompt.length,
          },
        },
      },
    },
    input.now,
  ).core;
}

function upsertRelayDispatchRuns(
  core: CatsCoreState,
  input: {
    threadId: string;
    roundId: string;
    round: CodeRelayRoundRecord;
    prompt: string;
    repoPath: string | null;
    targetEntries: CodeRelayRosterEntry[];
    now: Date;
  },
): CatsCoreState {
  const siblingRunIds = input.targetEntries.map((entry) =>
    createCodeRelayDispatchRunId(input.threadId, input.roundId, entry.id));
  return input.targetEntries.reduce((nextCore, entry) => {
    const dispatch = input.round.dispatches.find((candidate) => candidate.agentId === entry.id) ?? null;
    return upsertRelayDispatchRun(nextCore, {
      threadId: input.threadId,
      roundId: input.roundId,
      dispatchId: dispatch?.id ?? null,
      entry,
      prompt: input.prompt,
      repoPath: input.repoPath,
      siblingRunIds,
      status: 'running',
      now: input.now,
    });
  }, core);
}

async function buildRelayThreadsPayload(
  context: CodeApiRouteContext,
  options: {
    selectedThreadId?: string | null;
  } = {},
) {
  const core = await context.dependencies.coreStore.readCore();
  const runtimeConfig = await readRelayRuntimeProviderConfig(context);
  const projects = listCodeRelayProjects(core);
  const defaultRoster = probeRelayRosterEntries(createDefaultCodeRelayRoster(), runtimeConfig);
  const threads = projects.map((project) => {
    const relay = readCodeRelayThread(project);
    if (!relay) {
      return null;
    }
    const probedRoster = probeRelayRosterEntries(relay.roster, runtimeConfig);
    return buildThreadProjection(project, {
      ...relay,
      roster: probedRoster,
    });
  });
  const selectedThreadId = options.selectedThreadId
    ?? threads.find((thread) => thread !== null)?.thread.id
    ?? null;

  return {
    product: createCodeProductRef(),
    contract: createRelayContract(runtimeConfig),
    defaults: {
      roster: defaultRoster,
    },
    threads: threads.filter((thread): thread is NonNullable<typeof thread> => thread !== null),
    selection: {
      selectedThreadId,
    },
  };
}

async function completeFanOutInBackground(
  context: CodeApiRouteContext,
  input: {
    threadId: string;
    roundId: string;
    round: CodeRelayRoundRecord;
    prompt: string;
    repoPath: string | null;
    targetEntries: CodeRelayThreadRecord['roster'];
  },
): Promise<void> {
  const dispatchResults = await Promise.all(input.targetEntries.map(async (entry) => {
    let sessionId: string | null = null;
    const runId = createCodeRelayDispatchRunId(input.threadId, input.roundId, entry.id);
    const supervision = {
      product: 'cats-code',
      surface: 'code-relay-fan-out',
      runId,
      actionId: `${runId}:runtime-session`,
      actorRef: entry.id,
      reason: 'code_relay_fan_out',
      evidenceSink: createRelayEvidenceSink(context, input.threadId),
    };
    try {
      const session = await createSupervisedRuntimeSession({
        runtimeClient: context.dependencies.runtimeClient,
        input: {
          provider: entry.provider,
          instance: entry.instance,
          model: entry.model,
          modelSelection: entry.modelSelection ?? undefined,
          cwd: input.repoPath,
          workspaceKind: input.repoPath ? 'source' : undefined,
          workspaceAccess: 'read_only',
          context: {
            source: 'interactive',
            reason: 'code_relay_fan_out',
            ...(input.repoPath ? { workspace: { cwd: input.repoPath } } : {}),
            metadata: {
              product: 'cats-code',
              surface: 'relay',
              relayAgentId: entry.id,
              relayMode: 'fan_out',
            },
          },
        },
        supervision,
      });
      sessionId = session.id;
      const result = await sendSupervisedRuntimeMessage({
        runtimeClient: context.dependencies.runtimeClient,
        sessionId: session.id,
        content: input.prompt,
        input: {
          context: {
            source: 'interactive',
            reason: 'code_relay_fan_out',
            ...(input.repoPath ? { workspace: { cwd: input.repoPath } } : {}),
          },
        },
        supervision: {
          ...supervision,
          actionId: `${runId}:runtime-message`,
          reason: 'code_relay_fan_out_prompt',
          evidenceSink: createRelayEvidenceSink(context, input.threadId, session.id),
        },
      });
      return {
        entryId: entry.id,
        runId,
        sessionId,
        content: resolveFullResponseText(result.segments).trim(),
        stdoutExcerpt: null,
        stderrExcerpt: null,
      };
    } catch (error) {
      return {
        entryId: entry.id,
        runId,
        sessionId,
        error: error instanceof Error ? error.message : 'Relay dispatch failed.',
      };
    } finally {
      if (sessionId) {
        try {
          await context.dependencies.runtimeClient.closeSession(sessionId);
        } catch {
          // Best-effort cleanup; the relay round result already records completion/failure.
        }
      }
    }
  }));

  const latestCore = await context.dependencies.coreStore.readCore();
  const finished = finishCodeRelayFanOut(
    latestCore,
    input.threadId,
    input.roundId,
    dispatchResults,
    context.dependencies.now?.() ?? new Date(),
  );
  if (!finished) {
    return;
  }

  const completedAt = context.dependencies.now?.() ?? new Date();
  const siblingRunIds = input.targetEntries.map((entry) =>
    createCodeRelayDispatchRunId(input.threadId, input.roundId, entry.id));
  let completedCore = finished.core;
  for (const result of dispatchResults) {
    const entry = input.targetEntries.find((candidate) => candidate.id === result.entryId) ?? null;
    if (!entry) {
      continue;
    }
    const dispatch = input.round.dispatches.find((candidate) => candidate.agentId === entry.id) ?? null;
    completedCore = upsertRelayDispatchRun(completedCore, {
      threadId: input.threadId,
      roundId: input.roundId,
      dispatchId: dispatch?.id ?? null,
      entry,
      prompt: input.prompt,
      repoPath: input.repoPath,
      siblingRunIds,
      status: 'error' in result ? 'failed' : 'completed',
      sessionId: result.sessionId,
      responseExcerpt: 'error' in result ? null : result.content.slice(0, 240),
      error: 'error' in result ? result.error : null,
      now: completedAt,
    });
  }

  await context.dependencies.coreStore.writeCore(completedCore);
}

export async function routeCodeRelayApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === CODE_API_RELAY_THREADS_PATH) {
    if (context.method === 'GET') {
      sendJson(context.response, 200, await buildRelayThreadsPayload(context));
      return true;
    }

    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['GET', 'POST']);
      return true;
    }

    const body = await readJsonBody<Record<string, unknown>>(context.request);
    const title = readNonEmptyString(body.title);
    if (!title) {
      sendJson(context.response, 400, {
        error: { code: 'relay_thread_title_required', message: 'title is required.' },
      });
      return true;
    }

    const now = context.dependencies.now?.() ?? new Date();
    let core = await context.dependencies.coreStore.readCore();
    const created = createCodeRelayThread(core, {
      title,
      objective: readNullableString(body.objective),
      repoPath: readNullableString(body.repoPath),
    }, now);
    core = created.core;
    const runtimeConfig = await readRelayRuntimeProviderConfig(context);
    const probedRoster = probeRelayRosterEntries(created.thread.roster, runtimeConfig);
    const probed = applyCodeRelayRosterProbe(core, created.project.id, probedRoster, now);
    if (probed) {
      core = probed.core;
    }
    await context.dependencies.coreStore.writeCore(core);
    sendJson(context.response, 201, await buildRelayThreadsPayload(context, {
      selectedThreadId: created.project.id,
    }));
    return true;
  }

  const rosterMatch = matchRoute(
    context.url.pathname,
    CODE_API_RELAY_ROSTER_ENTRY_PATTERN,
  );
  if (rosterMatch) {
    if (context.method !== 'PATCH') {
      sendMethodNotAllowed(context.response, ['PATCH']);
      return true;
    }

    const [threadId, agentId] = rosterMatch;
    if (!threadId || !agentId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_relay_roster_target', message: 'Thread id and agent id are required.' },
      });
      return true;
    }

    const body = await readJsonBody<Record<string, unknown>>(context.request);
    const recentRole = readRecentRole(body.recentRole);
    const provider = body.provider === undefined ? undefined : readNonEmptyString(body.provider);
    if (body.provider !== undefined && !provider) {
      sendJson(context.response, 400, {
        error: { code: 'relay_provider_required', message: 'provider must be a non-empty string.' },
      });
      return true;
    }

    const modelSelection = body.modelSelection === undefined
      ? undefined
      : parseProviderModelSelection(body.modelSelection);
    if (
      body.modelSelection !== undefined
      && body.modelSelection !== null
      && modelSelection === null
    ) {
      sendJson(context.response, 400, {
        error: {
          code: 'relay_model_selection_invalid',
          message: 'modelSelection must be null or a valid provider model selection.',
        },
      });
      return true;
    }

    const now = context.dependencies.now?.() ?? new Date();
    const updated = updateCodeRelayRosterEntry(
      await context.dependencies.coreStore.readCore(),
      threadId,
      agentId,
      {
        ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
        ...(provider ? { provider } : {}),
        ...(body.instance !== undefined ? { instance: readNullableString(body.instance) } : {}),
        ...(body.model !== undefined ? { model: readNullableString(body.model) } : {}),
        ...(body.modelSelection !== undefined ? { modelSelection } : {}),
        ...(body.quotaNote !== undefined ? { quotaNote: readNullableString(body.quotaNote) } : {}),
        ...(recentRole ? { recentRole } : {}),
      },
      now,
    );

    if (!updated) {
      sendJson(context.response, 404, {
        error: { code: 'relay_thread_not_found', message: `No relay thread found for id ${threadId}.` },
      });
      return true;
    }

    const runtimeConfig = await readRelayRuntimeProviderConfig(context);
    const probedRoster = probeRelayRosterEntries(updated.thread.roster, runtimeConfig);
    const probed = applyCodeRelayRosterProbe(updated.core, threadId, probedRoster, now);
    await context.dependencies.coreStore.writeCore(probed?.core ?? updated.core);
    sendJson(context.response, 200, await buildRelayThreadsPayload(context, {
      selectedThreadId: threadId,
    }));
    return true;
  }

  const fanOutMatch = matchRoute(
    context.url.pathname,
    CODE_API_RELAY_FAN_OUT_PATTERN,
  );
  if (fanOutMatch) {
    if (context.method !== 'POST') {
      sendMethodNotAllowed(context.response, ['POST']);
      return true;
    }

    const threadId = fanOutMatch[0];
    if (!threadId) {
      sendJson(context.response, 400, {
        error: { code: 'invalid_relay_thread_id', message: 'Thread id is required.' },
      });
      return true;
    }

    const body = await readJsonBody<Record<string, unknown>>(context.request);
    const prompt = readNonEmptyString(body.prompt);
    if (!prompt) {
      sendJson(context.response, 400, {
        error: { code: 'relay_prompt_required', message: 'prompt is required.' },
      });
      return true;
    }

    const agentIds = readAgentIds(body.agentIds);
    if (agentIds.length === 0) {
      sendJson(context.response, 400, {
        error: { code: 'relay_agents_required', message: 'At least one agent must be selected.' },
      });
      return true;
    }

    const now = context.dependencies.now?.() ?? new Date();
    let core = await context.dependencies.coreStore.readCore();
    const started = startCodeRelayFanOut(core, threadId, {
      mode: readMode(body.mode),
      objective: readNonEmptyString(body.objective) ?? 'Open discussion round',
      prompt,
      agentIds,
    }, now);
    if (!started) {
      sendJson(context.response, 404, {
        error: { code: 'relay_thread_not_found', message: `No relay thread found for id ${threadId}.` },
      });
      return true;
    }

    if (started.targetEntries.length === 0) {
      sendJson(context.response, 400, {
        error: { code: 'relay_agents_unavailable', message: 'No enabled relay agents were available.' },
      });
      return true;
    }

    core = started.core;
    await context.dependencies.coreStore.writeCore(core);

    const running = markCodeRelayDispatchesRunning(
      core,
      threadId,
      started.round.id,
      started.targetEntries.map((entry) => entry.id),
      now,
    );
    if (!running) {
      sendJson(context.response, 500, {
        error: { code: 'relay_round_start_failed', message: 'Failed to mark relay dispatches as running.' },
      });
      return true;
    }

    core = upsertRelayDispatchRuns(running.core, {
      threadId,
      roundId: started.round.id,
      round: started.round,
      prompt,
      repoPath: started.project.repoPath,
      targetEntries: started.targetEntries,
      now,
    });
    await context.dependencies.coreStore.writeCore(core);
    sendJson(context.response, 202, await buildRelayThreadsPayload(context, {
      selectedThreadId: threadId,
    }));
    void completeFanOutInBackground(context, {
      threadId,
      roundId: started.round.id,
      round: started.round,
      prompt,
      repoPath: started.project.repoPath,
      targetEntries: started.targetEntries,
    }).catch(() => {
      // Background dispatch failures are recorded per-agent during completion.
    });
    return true;
  }

  return false;
}
