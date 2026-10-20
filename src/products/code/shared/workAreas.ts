import type { RuntimeWorkspaceIdentity, RuntimeWorkspaceOperation,
  WorkspaceActivityCoverage } from '../../../runtime/workspaceActivity.js';

export interface CodeWorkAreaOperation extends RuntimeWorkspaceOperation {
  sessionId: string;
  turnId: string;
  laneId: string;
  runId: string;
  active: boolean;
  displayState: RuntimeWorkspaceOperation['state'];
}

export interface CodeWorkAreaCheckout extends RuntimeWorkspaceIdentity {
  identityObservedAt: string;
  association: 'session_binding' | 'observed_operation';
  operations: CodeWorkAreaOperation[];
}

export interface CodeWorkAreaExecution {
  sessionId: string;
  current: boolean;
  continuity: 'current' | 'last_known' | 'interrupted' | 'not_reported';
  coverage: WorkspaceActivityCoverage;
  observationEpoch: string | null;
  revision: number | null;
  observedAt: string | null;
  startupCwd: string | null;
  runtimeCwd: string | null;
}

export interface CodeParticipantWorkAreas {
  participantId: string;
  canonicalParticipantId: string;
  name: string;
  sourceKind: string;
  sourceRefId: string | null;
  coordinator: boolean;
  executions: CodeWorkAreaExecution[];
  repositories: Array<{ id: string; label: string | null; executionLocationId: string;
    checkouts: CodeWorkAreaCheckout[] }>;
}

export interface CodeConversationWorkAreas {
  schemaVersion: 1;
  conversationId: string;
  channelId: string;
  codespace: { path: string | null };
  participants: CodeParticipantWorkAreas[];
  truncated: boolean;
}
