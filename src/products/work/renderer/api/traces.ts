/**
 * Renderer-side fetcher for Core trace records, used by Run detail to
 * render the trace timeline. Backed by `GET /api/core/traces?runIds=...`
 * which already accepts a comma-joined list of run ids.
 */

import { expectJson } from './http.js';

export type CoreTraceKind =
  | 'note'
  | 'status'
  | 'dispatch'
  | 'approval'
  | 'checkpoint'
  | 'outcome'
  | 'error';

export interface CoreTraceSummary {
  id: string;
  traceId: string;
  kind: CoreTraceKind;
  conversationId: string | null;
  runId: string | null;
  taskId: string | null;
  actorId: string | null;
  message: string;
  createdAt: string;
}

interface CoreTraceListResponse {
  traces: CoreTraceSummary[];
}

export async function fetchTracesByRunId(
  runId: string,
  errorMessage: string,
  signal?: AbortSignal,
): Promise<CoreTraceSummary[]> {
  const params = new URLSearchParams();
  params.set('runId', runId);
  const response = await fetch(`/api/core/traces?${params.toString()}`, { signal });
  const payload = await expectJson<CoreTraceListResponse>(
    response,
    errorMessage,
  );
  return payload.traces;
}
