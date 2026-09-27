import type { CodeCatlasHelpRequest } from './catlasHelp.js';

/** One definition is supplied to the guide, displayed by the UI and executed by the host. */
export const CODE_SESSION_OPERATION = {
  id: 'code.session.open', revision: 1,
  steps: ['target', 'workspace', 'access', 'open', 'verify'] as const,
  postcondition: 'Read the linked Runtime session and verify its target, workspace and access.',
  recovery: 'Inspect the retained conversation after interruption; never automatically repeat session creation.',
} as const;

export interface CodeSessionInspection {
  operation: typeof CODE_SESSION_OPERATION;
  revision: string;
  ready: boolean;
  checks: { target: boolean; workspace: boolean; access: boolean };
  reason: string | null;
  resolvedTarget: { provider: string; instance: string; model: string | null } | null;
}

export interface CodeSessionOpenRequest {
  requestId: string;
  revision: string;
}

export interface CodeSessionOutcome {
  operationId: 'code.session.open';
  requestId: string;
  status: 'verified' | 'unconfirmed' | 'rejected';
  channelId: string | null;
  sessionId: string | null;
  path: string | null;
  reason: string | null;
  workspace?: { kind: string; access: string; cwd: string };
}

export type CodeSessionDraft = CodeCatlasHelpRequest['draft'];
