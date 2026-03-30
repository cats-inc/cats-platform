import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import type { CodeApiRouteContext } from './index.js';
import {
  applyCodeRelayRosterProbe,
  createCodeRelayThread,
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
  CodeRelayRecentRole,
  CodeRelayThreadRecord,
} from '../state/relayContracts.js';

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

async function buildRelayThreadsPayload(
  context: CodeApiRouteContext,
  options: {
    selectedThreadId?: string | null;
  } = {},
) {
  const core = await context.dependencies.coreStore.readCore();
  const projects = listCodeRelayProjects(core);
  const defaultRoster = await context.dependencies.relayRuntime.probeRosterEntries(
    createDefaultCodeRelayRoster(),
  );
  const threads = await Promise.all(projects.map(async (project) => {
    const relay = readCodeRelayThread(project);
    if (!relay) {
      return null;
    }
    const probedRoster = await context.dependencies.relayRuntime.probeRosterEntries(relay.roster);
    return buildThreadProjection(project, {
      ...relay,
      roster: probedRoster,
    });
  }));
  const selectedThreadId = options.selectedThreadId
    ?? threads.find((thread) => thread !== null)?.thread.id
    ?? null;

  return {
    product: {
      id: 'code',
      name: 'Cats Code',
    },
    contract: context.dependencies.relayRuntime.describeContract(),
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
    prompt: string;
    repoPath: string | null;
    targetEntries: CodeRelayThreadRecord['roster'];
  },
): Promise<void> {
  const dispatchResults = await Promise.all(input.targetEntries.map(async (entry) => {
    try {
      return await context.dependencies.relayRuntime.dispatch({
        entry,
        prompt: input.prompt,
        repoPath: input.repoPath,
      });
    } catch (error) {
      return {
        entryId: entry.id,
        error: error instanceof Error ? error.message : 'Relay dispatch failed.',
      };
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

  await context.dependencies.coreStore.writeCore(finished.core);
}

export async function routeCodeRelayApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/code/relay/threads') {
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
    const probedRoster = await context.dependencies.relayRuntime.probeRosterEntries(created.thread.roster);
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
    /^\/api\/code\/relay\/threads\/([^/]+)\/roster\/([^/]+)$/u,
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
    const now = context.dependencies.now?.() ?? new Date();
    const updated = updateCodeRelayRosterEntry(
      await context.dependencies.coreStore.readCore(),
      threadId,
      agentId,
      {
        ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
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

    await context.dependencies.coreStore.writeCore(updated.core);
    sendJson(context.response, 200, await buildRelayThreadsPayload(context, {
      selectedThreadId: threadId,
    }));
    return true;
  }

  const fanOutMatch = matchRoute(
    context.url.pathname,
    /^\/api\/code\/relay\/threads\/([^/]+)\/fan-out$/u,
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

    core = running.core;
    await context.dependencies.coreStore.writeCore(core);
    sendJson(context.response, 202, await buildRelayThreadsPayload(context, {
      selectedThreadId: threadId,
    }));
    void completeFanOutInBackground(context, {
      threadId,
      roundId: started.round.id,
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
