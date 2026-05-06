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

export async function tryResumeRuntimeSession(input: {
  runtimeClient: RuntimeClient;
  sessionId: string | null | undefined;
  scope: RuntimeSessionResumeScope;
}): Promise<RuntimeSessionInfo | null> {
  const sessionId = input.sessionId?.trim() || null;
  if (!sessionId || typeof input.runtimeClient.resumeSession !== 'function') {
    return null;
  }

  try {
    return await input.runtimeClient.resumeSession(sessionId);
  } catch (error) {
    console.warn('Failed to resume runtime session, falling back to replacement-session path.', {
      feature: 'runtime_session_resume',
      scope: input.scope,
      sessionId,
      error: normalizeResumeError(error),
    });
    return null;
  }
}
