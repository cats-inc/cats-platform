import { sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import type { WorkApiRouteContext } from './index.js';
import { importPracticeProposal } from '../state/practiceProposal.js';

export async function routeWorkPracticeProposalApi(context: WorkApiRouteContext): Promise<boolean> {
  if (context.url.pathname !== '/api/work/practice-proposals') return false;
  if (!context.auth?.principal?.membership.roles.some(role => role === 'owner' || role === 'admin')) {
    sendJson(context.response, 403, { error: { message: 'Administrator access is required.' } }); return true;
  }
  if (context.method !== 'POST') { sendMethodNotAllowed(context.response, ['POST']); return true; }
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of context.request) {
      const bytes = Buffer.from(chunk); size += bytes.length;
      if (size > 16 * 1024) throw new Error('practice_proposal_too_large');
      chunks.push(bytes);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    if (!body || Array.isArray(body) || body.confirmed !== true || Object.keys(body).sort().join(',') !== 'confirmed,proposal') {
      throw new Error('practice_proposal_confirmation_required');
    }
    const result = await importPracticeProposal(context.dependencies.coreStore, body.proposal);
    sendJson(context.response, result.created ? 201 : 200, result, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const reason = error instanceof Error && /^[a-z_]+$/u.test(error.message) ? error.message : 'invalid_practice_proposal';
    sendJson(context.response, 409, { error: { message: reason } });
  }
  return true;
}
