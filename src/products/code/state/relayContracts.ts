import type { ProviderModelSelection } from '../../../shared/providerSelection.js';

export type CodeRelayMode =
  | 'discover'
  | 'shape'
  | 'fit'
  | 'document'
  | 'build'
  | 'review'
  | 'human_verify'
  | 'repair';

export type CodeRelayThreadStatus =
  | 'active'
  | 'waiting_for_agents'
  | 'waiting_for_user'
  | 'archived';

export type CodeRelayRoundStatus =
  | 'running'
  | 'waiting_for_agents'
  | 'waiting_for_user'
  | 'completed';

export type CodeRelayDispatchStatus =
  | 'requested'
  | 'running'
  | 'completed'
  | 'failed';

export type CodeRelayAvailabilityState = 'unknown' | 'available' | 'unavailable';

export type CodeRelayRecentRole =
  | 'idle'
  | 'drafter'
  | 'critic'
  | 'reviewer'
  | 'main_coder'
  | 'summarizer';

export type CodeRelayMessageAuthorKind = 'user' | 'agent' | 'system';

export type CodeRelayMessageKind = 'prompt' | 'response' | 'relay_instruction' | 'system_note';

export interface CodeRelayConnectorContract {
  version: 'phase0-runtime-bridge-v1';
  transport: 'runtime_session_bridge';
  supportedProviders: string[];
  notes: string[];
}

export interface CodeRelayRosterEntry {
  id: string;
  provider: string;
  label: string;
  instance: string | null;
  model: string | null;
  modelSelection: ProviderModelSelection | null;
  transport: 'runtime_session_bridge';
  availability: CodeRelayAvailabilityState;
  availabilitySummary: string | null;
  quotaNote: string | null;
  recentRole: CodeRelayRecentRole;
  enabled: boolean;
}

export interface CodeRelayDispatchRecord {
  id: string;
  agentId: string;
  runId: string | null;
  source: 'fan_out' | 'relay';
  status: CodeRelayDispatchStatus;
  prompt: string;
  responseMessageId: string | null;
  requestedAt: string;
  completedAt: string | null;
  error: string | null;
  connectorVersion: CodeRelayConnectorContract['version'];
  connectorTransport: CodeRelayConnectorContract['transport'];
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
}

export interface CodeRelayMessageRecord {
  id: string;
  roundId: string;
  authorKind: CodeRelayMessageAuthorKind;
  authorId: string | null;
  kind: CodeRelayMessageKind;
  content: string;
  createdAt: string;
  sourceMessageId: string | null;
}

export interface CodeRelayRoundRecord {
  id: string;
  mode: CodeRelayMode;
  objective: string;
  status: CodeRelayRoundStatus;
  prompt: string;
  startedAt: string;
  endedAt: string | null;
  waitingReason: string | null;
  linkedArtifactIds: string[];
  dispatches: CodeRelayDispatchRecord[];
  messages: CodeRelayMessageRecord[];
}

export interface CodeRelayThreadRecord {
  version: 1;
  contract: CodeRelayConnectorContract;
  status: CodeRelayThreadStatus;
  roster: CodeRelayRosterEntry[];
  rounds: CodeRelayRoundRecord[];
  currentRoundId: string | null;
  provenProviderIds: string[];
}

export interface CodeRelayDispatchResult {
  entryId: string;
  content: string;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
}
