import { sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import { attachWorkCandidateEvidence, prepareWorkCandidate, type AttachCandidateRequest } from '../state/candidateEvidence.js';
import type { WorkApiRouteContext } from './index.js';

export async function routeWorkCandidateEvidenceApi(context: WorkApiRouteContext): Promise<boolean> {
  const match = /^\/api\/work\/tasks\/([^/]+)\/candidate-(evidence|preparation)$/u.exec(context.url.pathname);
  if (!match) return false;
  if (!context.auth?.principal?.membership.roles.some(role => role === 'owner' || role === 'admin')) {
    sendJson(context.response, 403, { error: { message: 'Administrator access is required.' } }); return true;
  }
  if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of context.request) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > 8192) throw new Error('candidate_request_too_large');
      chunks.push(bytes);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
