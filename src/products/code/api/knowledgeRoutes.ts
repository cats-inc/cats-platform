import { inspectLocalKnowledge, mutateLocalKnowledge, LocalKnowledgeError } from '../../../platform/knowledge/localKnowledge.js';
import { LOCAL_KNOWLEDGE_API } from '../../../platform/knowledge/localKnowledgeContracts.js';
import { sendJson, sendMethodNotAllowed } from '../../../shared/http.js';
import type { CodeApiRouteContext } from './index.js';

export async function routeCodeKnowledgeApi(context: CodeApiRouteContext): Promise<boolean> {
  if (context.url.pathname !== LOCAL_KNOWLEDGE_API) return false;
  // A local owner reviews/adopts explicitly; no Runtime tool exposes this mutation.
  if (!context.auth?.principal?.membership.roles.some(role => role === 'owner' || role === 'admin')) {
    sendJson(context.response, 403, { error: { message: 'Administrator access is required.' } });
    return true;
  }
  if (!['GET', 'POST'].includes(context.method)) {
    sendMethodNotAllowed(context.response, ['GET', 'POST']); return true;
  }
  try {
    const options = { platformDir: context.dependencies.config.platformDir };
    let result;
    if (context.method === 'GET') result = await inspectLocalKnowledge(options);
    else {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of context.request) {
        const bytes = Buffer.from(chunk); size += bytes.length;
        if (size > 40 * 1024) throw new LocalKnowledgeError('Knowledge request exceeds 40 KiB.', 413);
        chunks.push(bytes);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new LocalKnowledgeError('Invalid knowledge JSON.'); }
      result = await mutateLocalKnowledge(input, options);
    }
    sendJson(context.response, 200, result, { 'Cache-Control': 'no-store' });
  } catch (error) {
    sendJson(context.response, error instanceof LocalKnowledgeError ? error.status : 500,
      { error: { message: error instanceof LocalKnowledgeError ? error.message : 'Unable to save knowledge. Existing data was retained.' } });
  }
  return true;
}
