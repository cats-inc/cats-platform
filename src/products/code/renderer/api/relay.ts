import { expectJson } from './http.js';
import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';
import { messageKeys, t as translate } from '../../../../shared/i18n/index.js';
import {
  buildCodeApiRelayFanOutPath,
  buildCodeApiRelayRosterEntryPath,
  CODE_API_RELAY_THREADS_PATH,
} from '../../shared/apiPaths.js';
import { CODE_PRODUCT_NAME } from '../../shared/productMetadata.js';
import type { CodeRelayAvailabilitySummary } from '../../shared/relayAvailabilitySummary.js';

export interface CodeRelayRosterEntryPayload {
  id: string;
  provider: string;
  label: string;
  instance: string | null;
  model: string | null;
  modelSelection: ProviderModelSelection | null;
  transport: string;
  availability: 'unknown' | 'available' | 'unavailable';
  availabilitySummary: CodeRelayAvailabilitySummary | null;
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
  runId: string | null;
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
    name: typeof CODE_PRODUCT_NAME;
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

export async function fetchCodeRelayThreads(
  errorMessage = translate(messageKeys.codeRelayErrorThreadLoadFailed),
): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(CODE_API_RELAY_THREADS_PATH);
  return expectJson<CodeRelayThreadsPayload>(response, errorMessage);
}

export async function createCodeRelayThread(input: {
  title: string;
  objective?: string | null;
  repoPath?: string | null;
}, errorMessage = translate(
  messageKeys.codeRelayErrorThreadCreateFailed,
)): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(CODE_API_RELAY_THREADS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return expectJson<CodeRelayThreadsPayload>(response, errorMessage);
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
  errorMessage = translate(messageKeys.codeRelayErrorRosterUpdateFailed),
): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(
    buildCodeApiRelayRosterEntryPath(threadId, agentId),
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return expectJson<CodeRelayThreadsPayload>(response, errorMessage);
}

export async function runCodeRelayFanOut(
  threadId: string,
  input: {
    mode?: string;
    objective?: string | null;
    prompt: string;
    agentIds: string[];
  },
  errorMessage = translate(messageKeys.codeRelayErrorRelayFailed),
): Promise<CodeRelayThreadsPayload> {
  const response = await fetch(
    buildCodeApiRelayFanOutPath(threadId),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return expectJson<CodeRelayThreadsPayload>(response, errorMessage);
}
