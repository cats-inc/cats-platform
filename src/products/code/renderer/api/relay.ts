import { expectJson } from './http.js';
import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import {
  buildCodeApiRelayFanOutPath,
  buildCodeApiRelayRosterEntryPath,
  CODE_API_RELAY_THREADS_PATH,
} from '../../shared/apiPaths.js';

export interface CodeRelayRosterEntryPayload {
  id: string;
  provider: string;
  label: string;
  instance: string | null;
  model: string | null;
  modelSelection: ProviderModelSelection | null;
  transport: string;
  availability: 'unknown' | 'available' | 'unavailable';
  availabilitySummary: string | null;
  quotaNote: string | null;
  recentRole: string;
  enabled: boolean;
}

export interface CodeRelayMessagePayload {
  id: string;
  roundId: string;
  authorKind: 'user' | 'agent' | 'system';
  authorId: string | null;
  kind: string;
  content: string;
  createdAt: string;
  sourceMessageId: string | null;
}

export interface CodeRelayDispatchPayload {
  id: string;
  agentId: string;
  source: 'fan_out' | 'relay';
  status: 'requested' | 'running' | 'completed' | 'failed';
  prompt: string;
  responseMessageId: string | null;
  requestedAt: string;
  completedAt: string | null;
  error: string | null;
  connectorVersion: string;
  connectorTransport: string;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
}

export interface CodeRelayRoundPayload {
  id: string;
  mode: string;
  objective: string;
  status: 'running' | 'waiting_for_agents' | 'waiting_for_user' | 'completed';
  prompt: string;
  startedAt: string;
  endedAt: string | null;
  waitingReason: string | null;
  linkedArtifactIds: string[];
  dispatches: CodeRelayDispatchPayload[];
  messages: CodeRelayMessagePayload[];
}

export interface CodeRelayThreadPayload {
  thread: {
    id: string;
    title: string;
    summary: string | null;
    repoPath: string | null;
    status: string;
    updatedAt: string;
    currentRoundId: string | null;
  };
  contract: {
    version: string;
    transport: string;
    supportedProviders: string[];
    notes: string[];
  };
  provenProviderIds: string[];
  roster: CodeRelayRosterEntryPayload[];
  rounds: CodeRelayRoundPayload[];
}

export interface CodeRelayThreadsPayload {
  product: {
    id: 'code';
    name: 'Cats Code';
  };
  contract: CodeRelayThreadPayload['contract'];
  defaults: {
    roster: CodeRelayRosterEntryPayload[];
  };
  threads: CodeRelayThreadPayload[];
  selection: {
    selectedThreadId: string | null;
  };
}

export async function fetchCodeRelayThreads(): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(CODE_API_RELAY_THREADS_PATH);
  return expectJson<CodeRelayThreadsPayload>(response, 'Failed to load Code relay threads.');
}

export async function createCodeRelayThread(input: {
  title: string;
  objective?: string | null;
  repoPath?: string | null;
}): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(CODE_API_RELAY_THREADS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return expectJson<CodeRelayThreadsPayload>(response, 'Failed to create Code relay thread.');
}

export async function updateCodeRelayRosterEntry(
  threadId: string,
  agentId: string,
  patch: {
    enabled?: boolean;
    provider?: string;
    instance?: string | null;
    model?: string | null;
    modelSelection?: ProviderModelSelection | null;
    quotaNote?: string | null;
    recentRole?: string | null;
  },
): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(
    buildCodeApiRelayRosterEntryPath(threadId, agentId),
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return expectJson<CodeRelayThreadsPayload>(response, 'Failed to update relay roster entry.');
}

export async function runCodeRelayFanOut(
  threadId: string,
  input: {
    mode?: string;
    objective?: string | null;
    prompt: string;
    agentIds: string[];
  },
): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(
    buildCodeApiRelayFanOutPath(threadId),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return expectJson<CodeRelayThreadsPayload>(response, 'Failed to run relay fan-out.');
}
