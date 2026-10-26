import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeClient, RuntimeSendMessageInput, RuntimeSessionResumeInput } from '../runtime/client.js';
import { handleMcpHttpRequest } from '../mcp/jsonRpcServer.js';
import { McpSessionGrantStore } from '../mcp/sessionGrants.js';
import { MediaImageError } from './imageExecution.js';
import { CatImageService, presentCatImage } from './catImages.js';
import type { CatImageCaller } from './catImagePolicy.js';

export const CAT_IMAGE_TOOLS_PATH = '/api/internal/cat-image-tools/mcp';
interface Turn { caller: CatImageCaller; actionId: string; expiresAt: number; active: boolean; cancelled?: boolean; }
interface Session { token: string; turn?: Turn; }
export interface CatImageTurnResolution {
  caller: CatImageCaller;
  actionId: string;
  unavailable?: { code: string; expiresAt: string };
}
const instructions = 'Current Cats image-tool availability (supersedes earlier snapshots): available. '
  + 'You can use the cats image_generate tool when an image would be useful to your owner. '
  + 'It queues one image with a caption for this conversation and its authorized Telegram binding. '
  + 'Image generation has no hours-of-day restriction. Companion rhythm only schedules proactive interactions; '
  + 'it does not limit this service or stop an accepted image job. '
  + 'For an owner image request, use cats image_generate. Provider-native image tools and imagegen skills '
  + 'do not create the Cats image job or its Telegram delivery. '
  + 'End this turn after queuing: generation starts after your turn releases its resources. '
  + 'A queued job is not proof of generation or Telegram delivery. Never claim it was sent until the job reports delivery.';

function unavailableInstructions(reason: NonNullable<CatImageTurnResolution['unavailable']>): string {
  return 'Current Cats image-tool availability (supersedes earlier snapshots): configured, but unavailable for this turn. '
    + `Reason: ${reason.code}. Permission expires at ${reason.expiresAt}. `
    + 'Image generation has no hours-of-day restriction; expiry and other authorization limits still apply. '
    + 'Explain this current restriction in the owner conversation language when asked for an image. '
    + 'Do not claim the platform integration is missing. Do not search for plugins or use provider-native image tools as a workaround. '
    + 'Do not promise an automatically scheduled image; a later request rechecks availability. '
    + 'No image was queued or sent by this availability check.';
}

/** Host-owned session credentials plus a short-lived, supervised turn scope. No owner API authority. */
export function createCatImageTools(options: {
  service: Pick<CatImageService, 'submit' | 'releaseTurn' | 'cancelTurn' | 'status'>;
  endpoint(): string | null;
  resolveTurn(sessionId: string, input: RuntimeSendMessageInput): Promise<CatImageTurnResolution | null>;
  now?(): number;
}) {
  const grants = new McpSessionGrantStore<{ sessionId: string }>();
  const sessions = new Map<string, Session>();
  const pendingTurns = new Set<{ sessionId: string; cancelled: boolean }>();
  const now = options.now ?? Date.now;
  let closed = false;
  const descriptor = (endpoint: string, token: string) => ({ name: 'cats', transport: 'http' as const,
    url: endpoint, auth: { kind: 'bearer_env' as const, token } });
  function revoke(sessionId: string) {
    for (const pending of pendingTurns) if (pending.sessionId === sessionId) pending.cancelled = true;
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.turn) { session.turn.active = false; session.turn.cancelled = true; }
    grants.revoke(session.token); sessions.delete(sessionId);
  }
  function assertActive(session: Session, turn: Turn) {
    if (closed || !turn.active || session.turn !== turn || turn.expiresAt <= now()) {
      throw new MediaImageError('image_turn_expired', 403);
    }
  }
  function wrapClient<Client extends RuntimeClient>(client: Client): Client {
    return new Proxy(client, {
      get(target, property) {
        if (property === 'sendMessage') return async (sessionId: string, content: string, input?: RuntimeSendMessageInput) => {
          const endpoint = options.endpoint();
          if (closed) throw new MediaImageError('image_service_unavailable', 503);
          if (!endpoint || !input) return target.sendMessage(sessionId, content, input);
          if (sessions.get(sessionId)?.turn?.active) throw new MediaImageError('image_source_busy', 429);
          const pending = { sessionId, cancelled: false }; pendingTurns.add(pending);
          let resolved: Awaited<ReturnType<typeof options.resolveTurn>>;
          try { resolved = await options.resolveTurn(sessionId, input); }
          catch { throw new MediaImageError('image_service_unavailable', 503); }
          finally { pendingTurns.delete(pending); }
          if (closed || pending.cancelled) throw new MediaImageError('image_turn_cancelled', 409);
          if (!resolved) {
            const tracked = sessions.has(sessionId); revoke(sessionId);
            return target.sendMessage(sessionId, content, tracked ? { ...input, mcpServers: input.mcpServers ?? [] } : input);
          }
          if (input.mcpServers?.some(server => server.name === 'cats')) throw new MediaImageError('image_tool_scope_conflict', 409);
          if (resolved.unavailable) {
            revoke(sessionId);
            // A restarted host has no in-memory grant, but Runtime may still hold
            // its old descriptor. Replace it explicitly while preserving other servers.
            return target.sendMessage(sessionId, content, { ...input, mcpServers: input.mcpServers ?? [],
              instructions: [input.instructions, unavailableInstructions(resolved.unavailable)].filter(Boolean).join('\n\n') });
          }
          let session = sessions.get(sessionId);
          if (!session) {
            if (sessions.size >= 1000) throw new MediaImageError('image_service_busy', 429);
            const issued = grants.issue({ sessionId }); grants.bind(issued.token, sessionId);
            session = { token: issued.token }; sessions.set(sessionId, session);
          }
          if (session.turn?.active) throw new MediaImageError('image_source_busy', 429);
          const turn: Turn = { ...resolved, expiresAt: now() + 15 * 60_000, active: true };
          session.turn = turn;
          let completed = false;
          try {
            const result = await target.sendMessage(sessionId, content, { ...input,
              mcpServers: [...(input.mcpServers ?? []), descriptor(endpoint, session.token)],
              instructions: [input.instructions, instructions].filter(Boolean).join('\n\n') });
            completed = true;
            return result;
          } finally {
            turn.active = false;
            if (turn.cancelled) await options.service.cancelTurn(sessionId);
            else if (completed) options.service.releaseTurn(sessionId);
          }
        };
        if (property === 'resumeSession' && target.resumeSession) return async (sessionId: string, input?: RuntimeSessionResumeInput) => {
          const session = sessions.get(sessionId); const endpoint = options.endpoint();
          if (!session || !endpoint || input?.mcpServers?.some(server => server.name === 'cats')) return target.resumeSession!(sessionId, input);
          return target.resumeSession!(sessionId, { ...input, mcpServers: [...(input?.mcpServers ?? []), descriptor(endpoint, session.token)] });
        };
        if (property === 'cancelSession' || property === 'closeSession' || property === 'deleteSession') return async (sessionId: string) => {
          const tracked = sessions.has(sessionId);
          const turnActive = sessions.get(sessionId)?.turn?.active === true;
          revoke(sessionId);
          // Sleep releases a finished chat worker, not its accepted asynchronous images.
          if (tracked && (property !== 'closeSession' || turnActive)) await options.service.cancelTurn(sessionId);
          return target[property](sessionId);
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  async function route(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== CAT_IMAGE_TOOLS_PATH) return false;
    await handleMcpHttpRequest(request, response, {
      maxBodyBytes: 16 * 1024,
      authorize(token, method) {
        const grant = grants.resolve(token);
        const session = grant?.runtimeSessionId ? sessions.get(grant.runtimeSessionId) : undefined;
        if (!grant || !session || session.token !== token || closed) return null;
        if (method === 'tools/call') {
          if (!session.turn) return null;
          try { assertActive(session, session.turn); } catch { return null; }
        }
        return session;
      },
      server: {
        name: 'cats', version: '1.0.0', instructions,
        listTools: () => [{ name: 'image_generate', description: 'Queue one controlled image and its caption for your owner. '
          + 'Generation and delivery happen after this turn. Retry only the identical prompt/caption.',
          inputSchema: { type: 'object', additionalProperties: false, required: ['prompt', 'caption'],
            properties: { prompt: { type: 'string', minLength: 1, maxLength: 2000 }, caption: { type: 'string', maxLength: 1024 } } } },
          { name: 'image_status', description: 'Read the original image job and its actual delivery status. This never generates or resends an image.',
            inputSchema: { type: 'object', additionalProperties: false, required: ['jobId'], properties: { jobId: { type: 'string', format: 'uuid' } } } }],
        async callTool(name, args, session) {
          try {
            const turn = session.turn;
            if (turn && name === 'image_status') {
              assertActive(session, turn);
              if (Object.keys(args).length !== 1 || typeof args.jobId !== 'string'
                || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(args.jobId)) throw new MediaImageError('invalid_image_request');
              const result = await options.service.status(turn.caller, args.jobId);
              return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
            }
            if (!turn || name !== 'image_generate' || Object.keys(args).length !== 2
              || typeof args.prompt !== 'string' || typeof args.caption !== 'string') throw new MediaImageError('invalid_image_request');
            assertActive(session, turn);
            // One immutable request identity per supervised action; a model cannot mint extra attempts.
            const digest = createHash('sha256').update(JSON.stringify([turn.caller.accountId,
              turn.caller.ownerActorId, turn.caller.catId, turn.actionId])).digest('hex');
            const requestId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
            const job = await options.service.submit(turn.caller, { requestId, prompt: args.prompt, caption: args.caption }, true,
              () => assertActive(session, turn));
            const result = { job: presentCatImage(job), delivery: 'pending', queued: true };
            return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
          } catch (error) {
            return { isError: true, content: [{ type: 'text', text: error instanceof MediaImageError ? error.code : 'image_service_unavailable' }] };
          }
        },
      },
    });
    return true;
  }
  return { wrapClient, route, isTurnActive: (id: string) => sessions.get(id)?.turn?.active === true
    || [...pendingTurns].some(turn => turn.sessionId === id && !turn.cancelled),
    revoke: () => { for (const turn of pendingTurns) turn.cancelled = true; for (const id of sessions.keys()) revoke(id); },
    close: () => { closed = true; for (const turn of pendingTurns) turn.cancelled = true; for (const id of sessions.keys()) revoke(id); } };
}
