import type { ParticipantExecutionLease } from '../../api/contracts.js';
import type {
  RuntimeClient,
  RuntimeSessionInfo,
} from '../../../../platform/runtime/client.js';
import { normalizeRuntimeStatus } from './state.js';

export interface ResumedRuntimeSessionLeasePatch extends Partial<ParticipantExecutionLease> {
  status: ParticipantExecutionLease['status'];
}

export type RuntimeSessionResumeScope =
  | 'dispatch_stale_recovery'
  | 'target_session_revive';

export interface RuntimeSessionResumeOutcome {
  attempted: boolean;
  session: RuntimeSessionInfo | null;
  error: string | null;
}

function normalizeResumeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

export function buildResumedRuntimeSessionLeasePatch(
  session: RuntimeSessionInfo,
  now: Date,
): ResumedRuntimeSessionLeasePatch {
  return {
    sessionId: session.id,
    status: normalizeRuntimeStatus(session.status),
    cwd: session.cwd,
    lastError: null,
    provider: session.provider,
    model: session.model,
    modelSelection: session.modelSelection ?? null,
    lastUsedAt: now.toISOString(),
  };
}

export async function resumeRuntimeSession(input: {
  runtimeClient: RuntimeClient;
  sessionId: string | null | undefined;
  scope: RuntimeSessionResumeScope;
}): Promise<RuntimeSessionResumeOutcome> {
  const sessionId = input.sessionId?.trim() || null;
  if (!sessionId || typeof input.runtimeClient.resumeSession !== 'function') {
    return {
      attempted: false,
      session: null,
      error: null,
    };
  }

  try {
    return {
      attempted: true,
      session: await input.runtimeClient.resumeSession(sessionId),
      error: null,
    };
  } catch (error) {
    const normalizedError = normalizeResumeError(error);
    console.warn('Failed to resume runtime session.', {
      feature: 'runtime_session_resume',
      scope: input.scope,
      sessionId,
      error: normalizedError,
    });
    return {
      attempted: true,
      session: null,
      error: normalizedError,
    };
  }
}
