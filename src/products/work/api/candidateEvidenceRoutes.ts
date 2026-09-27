import { sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { attachWorkCandidateEvidence, prepareWorkCandidate, type AttachCandidateRequest } from '../state/candidateEvidence.js';
import { controlWorkCandidate, listWorkCandidates } from '../state/candidateLifecycle.js';
import type { WorkApiRouteContext } from './index.js';

export async function routeWorkCandidateEvidenceApi(context: WorkApiRouteContext): Promise<boolean> {
  const match = /^\/api\/work\/tasks\/([^/]+)\/candidate-(evidence|preparation|control)$/u.exec(context.url.pathname);
  if (!match) return false;
  if (!context.auth?.principal?.membership.roles.some(role => role === 'owner' || role === 'admin')) {
    sendJson(context.response, 403, { error: { message: 'Administrator access is required.' } }); return true;
  }
  const listing = match[2] === 'control' && context.method === 'GET';
  if (context.method !== 'POST' && !listing) { sendMethodNotAllowed(context.response, match[2] === 'control' ? ['GET', 'POST'] : ['POST']); return true; }
  try {
    if (listing) {
      sendJson(context.response, 200, await listWorkCandidates(context.dependencies.coreStore, decodeURIComponent(match[1]!)), { 'Cache-Control': 'no-store' });
      return true;
    }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of context.request) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > 8192) throw new Error('candidate_request_too_large');
      chunks.push(bytes);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (match[2] === 'control') {
      const body = value as { artifactId: string; action: 'status' | 'stop' };
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2
        || typeof body.artifactId !== 'string' || !body.artifactId || body.artifactId.length > 256
        || !['status', 'stop'].includes(body.action)) throw new Error('invalid_candidate_request');
      sendJson(context.response, 200, await controlWorkCandidate({ coreStore: context.dependencies.coreStore,
        taskId: decodeURIComponent(match[1]!), ...body }), { 'Cache-Control': 'no-store' }); return true;
    }
    if (match[2] === 'preparation') {
      const body = value as { requestId: string; root: string; companionTaskId?: string };
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['requestId', 'root', 'companionTaskId'].includes(key))
        || typeof body.requestId !== 'string' || typeof body.root !== 'string'
        || ('companionTaskId' in body && (typeof body.companionTaskId !== 'string' || !body.companionTaskId))) throw new Error('invalid_candidate_request');
      const result = await prepareWorkCandidate({ coreStore: context.dependencies.coreStore,
        taskId: decodeURIComponent(match[1]!), request: body });
      sendJson(context.response, result.created ? 201 : 200, result, { 'Cache-Control': 'no-store' }); return true;
    }
    const body = value as AttachCandidateRequest;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['root', 'launchId', 'instanceId'].includes(key))
      || typeof body.root !== 'string' || body.root.length > 4096
      || typeof body.launchId !== 'string' || typeof body.instanceId !== 'string') throw new Error('invalid_candidate_request');
    const result = await attachWorkCandidateEvidence({ coreStore: context.dependencies.coreStore,
      taskId: decodeURIComponent(match[1]!), request: body });
    sendJson(context.response, result.created ? 201 : 200, result, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const reason = error instanceof Error && /^[a-z_]+$/u.test(error.message) ? error.message : 'candidate_evidence_unavailable';
    sendJson(context.response, 409, { error: { message: reason } });
  }
  return true;
}
