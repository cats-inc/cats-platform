import { randomUUID } from 'node:crypto';

import { upsertCoreProject } from '../../../core/model/planningRecords.js';
import type { CatsCoreState, CoreProjectRecord } from '../../../core/types.js';
import {
  getDefaultModel,
  getDefaultProviderInstance,
  getProviderDisplayName,
} from '../../../shared/providerCatalog.js';
import type {
  CodeRelayConnectorContract,
  CodeRelayDispatchRecord,
  CodeRelayDispatchResult,
  CodeRelayMode,
  CodeRelayRosterEntry,
  CodeRelayRoundRecord,
  CodeRelayThreadRecord,
} from './relayContracts.js';

const CODE_RELAY_METADATA_KEY = 'codeRelay';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readTransport(
  value: unknown,
): CodeRelayConnectorContract['transport'] {
  return value === 'local_cli_subprocess' ? value : 'local_cli_subprocess';
}

function readAvailability(value: unknown): CodeRelayRosterEntry['availability'] {
  return value === 'available' || value === 'unavailable' || value === 'unknown'
    ? value
    : 'unknown';
}

function readRecentRole(value: unknown): CodeRelayRosterEntry['recentRole'] {
  return value === 'drafter'
    || value === 'critic'
    || value === 'reviewer'
    || value === 'main_coder'
    || value === 'summarizer'
    || value === 'idle'
    ? value
    : 'idle';
}

function readRoundStatus(value: unknown): CodeRelayRoundRecord['status'] {
  return value === 'running'
    || value === 'waiting_for_agents'
    || value === 'waiting_for_user'
    || value === 'completed'
    ? value
    : 'waiting_for_user';
}

function readDispatchStatus(value: unknown): CodeRelayDispatchRecord['status'] {
  return value === 'requested'
    || value === 'running'
    || value === 'completed'
    || value === 'failed'
    ? value
    : 'requested';
}

function readMode(value: unknown): CodeRelayMode {
  return value === 'discover'
    || value === 'shape'
    || value === 'fit'
    || value === 'document'
    || value === 'build'
    || value === 'review'
    || value === 'human_verify'
    || value === 'repair'
    ? value
    : 'discover';
}

function readThreadStatus(value: unknown): CodeRelayThreadRecord['status'] {
  return value === 'active'
    || value === 'waiting_for_agents'
    || value === 'waiting_for_user'
    || value === 'archived'
    ? value
    : 'active';
}

function createDefaultContract(): CodeRelayConnectorContract {
  return {
    version: 'phase0-local-cli-v1',
    transport: 'local_cli_subprocess',
    supportedProviders: ['codex', 'claude', 'gemini'],
    notes: [
      'Phase 0 freezes final response payloads from local CLI subprocess connectors.',
      'Streaming normalization and live quota metering remain deferred.',
    ],
  };
}

function createDefaultRosterEntry(provider: 'codex' | 'claude' | 'gemini'): CodeRelayRosterEntry {
  const instance = getDefaultProviderInstance(provider);
  return {
    id: `${provider}:${instance ?? 'default'}`,
    provider,
    label: getProviderDisplayName(provider),
    instance,
    model: getDefaultModel(provider) || null,
    transport: 'local_cli_subprocess',
    availability: 'unknown',
    availabilitySummary: null,
    quotaNote: null,
    recentRole: 'idle',
    enabled: true,
  };
}

export function createDefaultCodeRelayRoster(): CodeRelayRosterEntry[] {
  return [
    createDefaultRosterEntry('codex'),
    createDefaultRosterEntry('claude'),
    createDefaultRosterEntry('gemini'),
  ];
}

function fallbackRecordId(
  projectId: string,
  prefix: string,
  ...parts: Array<string | number>
): string {
  return [projectId, prefix, ...parts].join(':');
}

export function readCodeRelayThread(project: CoreProjectRecord): CodeRelayThreadRecord | null {
  const metadata = asRecord(project.metadata);
  const relayRecord = asRecord(metadata?.[CODE_RELAY_METADATA_KEY]);
  if (!relayRecord) {
    return null;
  }

  const contractRecord = asRecord(relayRecord.contract);
  const rawRoster = Array.isArray(relayRecord.roster) ? relayRecord.roster : [];
  const rawRounds = Array.isArray(relayRecord.rounds) ? relayRecord.rounds : [];

  return {
    version: relayRecord.version === 1 ? 1 : 1,
    contract: {
      version: contractRecord?.version === 'phase0-local-cli-v1'
        ? contractRecord.version
        : 'phase0-local-cli-v1',
      transport: readTransport(contractRecord?.transport),
      supportedProviders: readStringArray(contractRecord?.supportedProviders),
      notes: readStringArray(contractRecord?.notes),
    },
    status: readThreadStatus(relayRecord.status),
    roster: rawRoster
      .map((value) => asRecord(value))
      .filter((value): value is Record<string, unknown> => value !== null)
      .map((entry, rosterIndex) => ({
        id: readString(entry.id) ?? fallbackRecordId(project.id, 'roster', rosterIndex),
        provider: readString(entry.provider) ?? 'unknown',
        label: readString(entry.label) ?? readString(entry.provider) ?? 'Unknown',
        instance: readString(entry.instance),
        model: readString(entry.model),
        transport: readTransport(entry.transport),
        availability: readAvailability(entry.availability),
        availabilitySummary: readString(entry.availabilitySummary),
        quotaNote: readString(entry.quotaNote),
        recentRole: readRecentRole(entry.recentRole),
        enabled: entry.enabled !== false,
      })),
    rounds: rawRounds
      .map((value) => asRecord(value))
      .filter((value): value is Record<string, unknown> => value !== null)
      .map((round, roundIndex) => {
        const resolvedRoundId = readString(round.id) ?? fallbackRecordId(project.id, 'round', roundIndex);
        return {
        id: resolvedRoundId,
        mode: readMode(round.mode),
        objective: readString(round.objective) ?? 'Discussion round',
        status: readRoundStatus(round.status),
        prompt: readString(round.prompt) ?? '',
        startedAt: readString(round.startedAt) ?? new Date().toISOString(),
        endedAt: readString(round.endedAt),
        waitingReason: readString(round.waitingReason),
        linkedArtifactIds: readStringArray(round.linkedArtifactIds),
        dispatches: (Array.isArray(round.dispatches) ? round.dispatches : [])
          .map((value) => asRecord(value))
          .filter((value): value is Record<string, unknown> => value !== null)
          .map((dispatch, dispatchIndex) => ({
            id: readString(dispatch.id) ?? fallbackRecordId(project.id, 'dispatch', resolvedRoundId, dispatchIndex),
            agentId: readString(dispatch.agentId) ?? 'unknown',
            source: dispatch.source === 'relay' ? 'relay' : 'fan_out',
            status: readDispatchStatus(dispatch.status),
            prompt: readString(dispatch.prompt) ?? '',
            responseMessageId: readString(dispatch.responseMessageId),
            requestedAt: readString(dispatch.requestedAt) ?? new Date().toISOString(),
            completedAt: readString(dispatch.completedAt),
            error: readString(dispatch.error),
            connectorVersion: dispatch.connectorVersion === 'phase0-local-cli-v1'
              ? dispatch.connectorVersion
              : 'phase0-local-cli-v1',
            connectorTransport: readTransport(dispatch.connectorTransport),
            stdoutExcerpt: readString(dispatch.stdoutExcerpt),
            stderrExcerpt: readString(dispatch.stderrExcerpt),
          })),
        messages: (Array.isArray(round.messages) ? round.messages : [])
          .map((value) => asRecord(value))
          .filter((value): value is Record<string, unknown> => value !== null)
          .map((message, messageIndex) => ({
            id: readString(message.id) ?? fallbackRecordId(project.id, 'message', resolvedRoundId, messageIndex),
            roundId: readString(message.roundId) ?? resolvedRoundId,
            authorKind: message.authorKind === 'agent'
              || message.authorKind === 'system'
              ? message.authorKind
              : 'user',
            authorId: readString(message.authorId),
            kind: message.kind === 'response'
              || message.kind === 'relay_instruction'
              || message.kind === 'system_note'
              ? message.kind
              : 'prompt',
            content: readString(message.content) ?? '',
            createdAt: readString(message.createdAt) ?? new Date().toISOString(),
            sourceMessageId: readString(message.sourceMessageId),
          })),
      };
      }),
    currentRoundId: readString(relayRecord.currentRoundId),
    provenProviderIds: readStringArray(relayRecord.provenProviderIds),
  };
}

function writeCodeRelayThreadMetadata(
  project: CoreProjectRecord,
  thread: CodeRelayThreadRecord,
): CoreProjectRecord['metadata'] {
  return {
    ...project.metadata,
    [CODE_RELAY_METADATA_KEY]: structuredClone(thread),
  };
}

function sortRelayProjects(projects: CoreProjectRecord[]): CoreProjectRecord[] {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function listCodeRelayProjects(core: CatsCoreState): CoreProjectRecord[] {
  return sortRelayProjects(
    core.projects.filter((project) => readCodeRelayThread(project) !== null),
  );
}

export function createCodeRelayThread(
  core: CatsCoreState,
  input: {
    title: string;
    objective: string | null;
    repoPath: string | null;
  },
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; thread: CodeRelayThreadRecord } {
  const thread: CodeRelayThreadRecord = {
    version: 1,
    contract: createDefaultContract(),
    status: 'active',
    roster: createDefaultCodeRelayRoster(),
    rounds: [],
    currentRoundId: null,
    provenProviderIds: [],
  };

  const result = upsertCoreProject(core, {
    title: input.title,
    status: 'active',
    summary: input.objective,
    repoPath: input.repoPath,
    metadata: {
      [CODE_RELAY_METADATA_KEY]: thread,
    },
  }, now);

  return {
    core: result.core,
    project: result.project,
    thread,
  };
}

export function findCodeRelayProject(
  core: CatsCoreState,
  threadId: string,
): { project: CoreProjectRecord; thread: CodeRelayThreadRecord } | null {
  const project = core.projects.find((candidate) => candidate.id === threadId) ?? null;
  if (!project) {
    return null;
  }

  const thread = readCodeRelayThread(project);
  if (!thread) {
    return null;
  }

  return { project, thread };
}

export function updateCodeRelayRosterEntry(
  core: CatsCoreState,
  threadId: string,
  agentId: string,
  patch: Partial<Pick<CodeRelayRosterEntry, 'enabled' | 'quotaNote' | 'recentRole'>>,
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; thread: CodeRelayThreadRecord } | null {
  const found = findCodeRelayProject(core, threadId);
  if (!found) {
    return null;
  }

  const nextThread = structuredClone(found.thread);
  nextThread.roster = nextThread.roster.map((entry) => {
    if (entry.id !== agentId) {
      return entry;
    }

    return {
      ...entry,
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.quotaNote === undefined ? {} : { quotaNote: patch.quotaNote }),
      ...(patch.recentRole === undefined ? {} : { recentRole: patch.recentRole }),
    };
  });

  const result = upsertCoreProject(core, {
    id: found.project.id,
    title: found.project.title,
    status: found.project.status,
    summary: found.project.summary,
    repoPath: found.project.repoPath,
    primaryConversationId: found.project.primaryConversationId,
    metadata: writeCodeRelayThreadMetadata(found.project, nextThread),
  }, now);

  return {
    core: result.core,
    project: result.project,
    thread: nextThread,
  };
}

export function applyCodeRelayRosterProbe(
  core: CatsCoreState,
  threadId: string,
  roster: CodeRelayRosterEntry[],
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; thread: CodeRelayThreadRecord } | null {
  const found = findCodeRelayProject(core, threadId);
  if (!found) {
    return null;
  }

  const nextThread = structuredClone(found.thread);
  nextThread.roster = structuredClone(roster);
  const result = upsertCoreProject(core, {
    id: found.project.id,
    title: found.project.title,
    status: found.project.status,
    summary: found.project.summary,
    repoPath: found.project.repoPath,
    primaryConversationId: found.project.primaryConversationId,
    metadata: writeCodeRelayThreadMetadata(found.project, nextThread),
  }, now);

  return {
    core: result.core,
    project: result.project,
    thread: nextThread,
  };
}

export function startCodeRelayFanOut(
  core: CatsCoreState,
  threadId: string,
  input: {
    mode: CodeRelayMode;
    objective: string;
    prompt: string;
    agentIds: string[];
  },
  now: Date = new Date(),
): {
  core: CatsCoreState;
  project: CoreProjectRecord;
  thread: CodeRelayThreadRecord;
  round: CodeRelayRoundRecord;
  targetEntries: CodeRelayRosterEntry[];
} | null {
  const found = findCodeRelayProject(core, threadId);
  if (!found) {
    return null;
  }

  const nextThread = structuredClone(found.thread);
  const targetEntries = nextThread.roster.filter((entry) =>
    entry.enabled && input.agentIds.includes(entry.id));

  const startedAt = now.toISOString();
  const roundId = `round-${randomUUID()}`;
  const userMessageId = `message-${randomUUID()}`;
  const round: CodeRelayRoundRecord = {
    id: roundId,
    mode: input.mode,
    objective: input.objective,
    status: 'waiting_for_agents',
    prompt: input.prompt,
    startedAt,
    endedAt: null,
    waitingReason: targetEntries.length > 0 ? 'Awaiting agent responses.' : 'No enabled agents selected.',
    linkedArtifactIds: [],
    dispatches: targetEntries.map((entry) => ({
      id: `dispatch-${randomUUID()}`,
      agentId: entry.id,
      source: 'fan_out',
      status: 'requested',
      prompt: input.prompt,
      responseMessageId: null,
      requestedAt: startedAt,
      completedAt: null,
      error: null,
      connectorVersion: nextThread.contract.version,
      connectorTransport: nextThread.contract.transport,
      stdoutExcerpt: null,
      stderrExcerpt: null,
    })),
    messages: [
      {
        id: userMessageId,
        roundId,
        authorKind: 'user',
        authorId: null,
        kind: 'prompt',
        content: input.prompt,
        createdAt: startedAt,
        sourceMessageId: null,
      },
    ],
  };

  nextThread.status = targetEntries.length > 0 ? 'waiting_for_agents' : 'waiting_for_user';
  nextThread.currentRoundId = roundId;
  nextThread.rounds = [round, ...nextThread.rounds];
  nextThread.roster = nextThread.roster.map((entry) =>
    input.agentIds.includes(entry.id)
      ? { ...entry, recentRole: 'drafter' }
      : entry);

  const result = upsertCoreProject(core, {
    id: found.project.id,
    title: found.project.title,
    status: found.project.status,
    summary: found.project.summary,
    repoPath: found.project.repoPath,
    primaryConversationId: found.project.primaryConversationId,
    metadata: writeCodeRelayThreadMetadata(found.project, nextThread),
  }, now);

  return {
    core: result.core,
    project: result.project,
    thread: nextThread,
    round,
    targetEntries,
  };
}

export function markCodeRelayDispatchesRunning(
  core: CatsCoreState,
  threadId: string,
  roundId: string,
  agentIds: string[],
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; thread: CodeRelayThreadRecord } | null {
  const found = findCodeRelayProject(core, threadId);
  if (!found) {
    return null;
  }

  const nextThread = structuredClone(found.thread);
  const roundIndex = nextThread.rounds.findIndex((round) => round.id === roundId);
  if (roundIndex < 0) {
    return null;
  }

  const round = structuredClone(nextThread.rounds[roundIndex]);
  round.dispatches = round.dispatches.map((dispatch) => (
    agentIds.includes(dispatch.agentId)
      ? {
          ...dispatch,
          status: dispatch.status === 'requested' ? 'running' : dispatch.status,
        }
      : dispatch
  ));
  round.status = 'waiting_for_agents';
  round.waitingReason = 'Waiting for agent responses.';
  nextThread.rounds[roundIndex] = round;
  nextThread.status = 'waiting_for_agents';

  const result = upsertCoreProject(core, {
    id: found.project.id,
    title: found.project.title,
    status: found.project.status,
    summary: found.project.summary,
    repoPath: found.project.repoPath,
    primaryConversationId: found.project.primaryConversationId,
    metadata: writeCodeRelayThreadMetadata(found.project, nextThread),
  }, now);

  return {
    core: result.core,
    project: result.project,
    thread: nextThread,
  };
}

export function finishCodeRelayFanOut(
  core: CatsCoreState,
  threadId: string,
  roundId: string,
  results: Array<CodeRelayDispatchResult | { entryId: string; error: string }>,
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; thread: CodeRelayThreadRecord } | null {
  const found = findCodeRelayProject(core, threadId);
  if (!found) {
    return null;
  }

  const nextThread = structuredClone(found.thread);
  const roundIndex = nextThread.rounds.findIndex((round) => round.id === roundId);
  if (roundIndex < 0) {
    return null;
  }

  const round = structuredClone(nextThread.rounds[roundIndex]);
  const completedAt = now.toISOString();

  round.dispatches = round.dispatches.map((dispatch) => {
    const result = results.find((candidate) => candidate.entryId === dispatch.agentId);
    if (!result) {
      return dispatch;
    }

    if ('error' in result) {
      return {
        ...dispatch,
        status: 'failed',
        completedAt,
        error: result.error,
      };
    }

    const messageId = `message-${randomUUID()}`;
    round.messages.push({
      id: messageId,
      roundId,
      authorKind: 'agent',
      authorId: dispatch.agentId,
      kind: 'response',
      content: result.content,
      createdAt: completedAt,
      sourceMessageId: null,
    });
    return {
      ...dispatch,
      status: 'completed',
      responseMessageId: messageId,
      completedAt,
      error: null,
      stdoutExcerpt: result.stdoutExcerpt,
      stderrExcerpt: result.stderrExcerpt,
    };
  });

  round.status = 'waiting_for_user';
  round.waitingReason = 'Review the round and decide whether to relay, summarize, or open a new objective.';
  round.endedAt = completedAt;
  nextThread.rounds[roundIndex] = round;
  nextThread.status = 'waiting_for_user';
  nextThread.provenProviderIds = Array.from(new Set([
    ...nextThread.provenProviderIds,
    ...results
      .filter((candidate): candidate is CodeRelayDispatchResult => !('error' in candidate))
      .map((candidate) => candidate.entryId.split(':')[0] ?? candidate.entryId),
  ]));

  const result = upsertCoreProject(core, {
    id: found.project.id,
    title: found.project.title,
    status: found.project.status,
    summary: found.project.summary,
    repoPath: found.project.repoPath,
    primaryConversationId: found.project.primaryConversationId,
    metadata: writeCodeRelayThreadMetadata(found.project, nextThread),
  }, now);

  return {
    core: result.core,
    project: result.project,
    thread: nextThread,
  };
}
