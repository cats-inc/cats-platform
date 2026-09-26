import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeClient, RuntimeSendMessageInput } from '../runtime/client.js';
import { isLoopbackAuthHost } from '../auth/effectiveMode.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';
import { inspectLocalKnowledge, LocalKnowledgeError, mutateLocalKnowledge } from './localKnowledge.js';

export const AGENT_KNOWLEDGE_PATH = '/api/code/knowledge/agent';
const TTL_MS = 15 * 60_000;
interface Receipt { draftId: string; status: 'pending_review'; reviewPath: '/code/knowledge' }
interface Grant {
  sessionId: string;
  source: string;
  expiresAt: number;
  submission?: { payload: string; result: Promise<Receipt> };
}

/** A per-server, per-turn capability. It never authenticates any owner API. */
export function createAgentKnowledgeBridge(options: {
  platformDir: string;
  endpoint: () => string | null;
  resolveSource: (sessionId: string, input: RuntimeSendMessageInput) => Promise<string | null>;
  now?: () => number;
  submit?: typeof mutateLocalKnowledge;
}) {
  const grants = new Map<string, Grant>();
  const pendingTurns = new Set<{ sessionId: string; cancelled: boolean }>();
  let closed = false;
  const now = options.now ?? Date.now;
  const store = { platformDir: options.platformDir };

  function instructions(endpoint: string, token: string): string {
    return [
      'Only when asked to contribute product knowledge, use your permitted HTTP/shell tool during this turn:',
      `Endpoint: ${endpoint}`,
      `Authorization: Bearer ${token}`,
      'GET current revision/targets first; POST JSON {revision,target,entryId,content:{en,"zh-TW"},note?}.',
      'target: catlas|orchestrator; existing entryId; each language 1–4000 characters; note <=800. Preserve unrelated guidance.',
      'One submission attempt per turn; retry only the identical payload. Do not include private data or credentials.',
      'Only a successful draftId/pending_review response proves submission. User reviews/adopts at /code/knowledge (Code > Artifacts).',
      'No automatic adoption or verification. Never expose the token. If HTTP/shell is unavailable, report that limitation.',
    ].join('\n');
  }

  function wrapClient(client: RuntimeClient): RuntimeClient {
    return new Proxy(client, {
      get(target, property) {
        if (property === 'sendMessage') return async (
          sessionId: string, content: string, input?: RuntimeSendMessageInput,
        ) => {
          const endpoint = options.endpoint();
          if (!endpoint || !input) return target.sendMessage(sessionId, content, input);
          const turn = { sessionId, cancelled: false };
          pendingTurns.add(turn);
          let token: string | undefined;
          try {
            const source = await options.resolveSource(sessionId, input);
            if (closed || turn.cancelled) throw new Error('Runtime turn cancelled before dispatch.');
            if (!source) return await target.sendMessage(sessionId, content, input);
            for (const [key, grant] of grants) if (grant.expiresAt <= now()) grants.delete(key);
            if (grants.size >= 100) return await target.sendMessage(sessionId, content, input);
            token = randomBytes(32).toString('hex');
            grants.set(token, { source, sessionId, expiresAt: now() + TTL_MS });
            return await target.sendMessage(sessionId, content, {
              ...input,
              instructions: [input.instructions, instructions(endpoint, token)].filter(Boolean).join('\n\n'),
            });
          } finally {
            if (token) grants.delete(token);
            pendingTurns.delete(turn);
          }
        };
        if (property === 'cancelSession' || property === 'closeSession' || property === 'deleteSession') {
          return (sessionId: string) => {
            for (const turn of pendingTurns) if (turn.sessionId === sessionId) turn.cancelled = true;
            for (const [token, grant] of grants) if (grant.sessionId === sessionId) grants.delete(token);
            return target[property](sessionId);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== AGENT_KNOWLEDGE_PATH) return false;
    const token = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/u)?.[1];
    const grant = token ? grants.get(token) : undefined;
    const peer = request.socket.remoteAddress?.replace(/^::ffff:/u, '') ?? '';
    // Browser cookies and cross-origin requests cannot use this capability endpoint.
    if (!grant || grant.expiresAt <= now() || request.headers.origin || !isLoopbackAuthHost(peer)) {
      sendJson(response, 403, { error: { message: 'An active agent contribution grant is required.' } });
      return true;
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      sendMethodNotAllowed(response, ['GET', 'POST']);
      return true;
    }
    try {
      if (request.method === 'GET') {
        const { revision, targets } = await inspectLocalKnowledge(store);
        sendJson(response, 200, { revision, targets }, { 'Cache-Control': 'no-store' });
        return true;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > 40 * 1024) throw new LocalKnowledgeError('Knowledge request exceeds 40 KiB.', 413);
        chunks.push(bytes);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new LocalKnowledgeError('Invalid knowledge JSON.'); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new LocalKnowledgeError('Invalid knowledge request.');
      const draft = input as Record<string, unknown>;
      if (Object.keys(draft).some(key => !['revision', 'target', 'entryId', 'content', 'note'].includes(key))
        || (draft.note !== undefined && (typeof draft.note !== 'string' || draft.note.length > 800))) {
        throw new LocalKnowledgeError('Only a draft may be submitted; note must be at most 800 characters.');
      }
      const assertAllowed = () => {
        if (!token || grants.get(token) !== grant || grant.expiresAt <= now()) {
          throw new LocalKnowledgeError('Agent contribution grant expired.', 403);
        }
      };
      assertAllowed();
      const payload = JSON.stringify(draft);
      if (grant.submission && grant.submission.payload !== payload) {
        throw new LocalKnowledgeError('Only one knowledge draft may be submitted per turn.', 409);
      }
      if (!grant.submission) {
        const result = (options.submit ?? mutateLocalKnowledge)({
          ...draft, action: 'submit', note: `${grant.source}\n${draft.note ?? ''}`.trim(),
        }, store, assertAllowed).then(workspace => ({
          draftId: workspace.drafts[0]!.id, status: 'pending_review' as const, reviewPath: '/code/knowledge' as const,
        }));
        grant.submission = { payload, result };
        // Keep uncertain failures consumed: the store may have committed before
        // its final read failed. A retry must never create a second draft.
      }
      sendJson(response, 200, await grant.submission.result, { 'Cache-Control': 'no-store' });
    } catch (error) {
      sendJson(response, error instanceof LocalKnowledgeError ? error.status : 500,
        { error: { message: error instanceof LocalKnowledgeError ? error.message : 'Unable to submit knowledge.' } });
    }
    return true;
  }

  return { wrapClient, route, close: () => {
    closed = true;
    for (const turn of pendingTurns) turn.cancelled = true;
    grants.clear();
  } };
}
