import type {
  RuntimeClient,
  RuntimeSendMessageInput,
  RuntimeSessionCreateInput,
  RuntimeSessionResumeInput,
} from '../../../platform/runtime/client.js';
import type { McpSessionGrantStore } from '../../../platform/mcp/sessionGrants.js';
import type {
  RuntimeSessionMcpDeliveryReport,
  RuntimeSessionMcpServer,
} from '../../../runtime/sessionMcpServers.js';
import { CODE_AGENT_TOOLS_SERVER_NAME, type CodeAgentToolGrantBinding } from './contracts.js';
import { readCodeAgentToolsInvocationMarker, type CodeAgentToolsInvocationMarker } from './enricher.js';
import { CODE_AGENT_PREVIEW_POLICY } from './policy.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';

/**
 * Attaches the `cats` MCP server to Code conversation sessions (ADR-126).
 *
 * This wrapper sits inside the supervision boundary, so the secret-bearing
 * `mcpServers` descriptor never reaches supervision evidence or Core records.
 * Grants are issued before create, because the CLI connects while spawning,
 * bound to the runtime session id, and revoked on close or delete. The
 * preview policy is added to a turn only while Runtime reports the server as
 * delivered for that session.
 */

interface TrackedSession {
  token: string;
  report: RuntimeSessionMcpDeliveryReport | undefined;
}

export interface CodeAgentToolsClientWrapperOptions {
  grants: McpSessionGrantStore<CodeAgentToolGrantBinding>;
  /** The loopback MCP URL, or null while Platform cannot offer it. */
  endpoint(): string | null;
}

export interface CodeAgentToolsClientWrapper {
  wrapClient<Client extends RuntimeClient>(client: Client): Client;
}

export function createCodeAgentToolsClientWrapper(
  options: CodeAgentToolsClientWrapperOptions,
): CodeAgentToolsClientWrapper {
  const sessions = new Map<string, TrackedSession>();

  function descriptor(endpoint: string, token: string): RuntimeSessionMcpServer[] {
    return [{
      name: CODE_AGENT_TOOLS_SERVER_NAME,
      transport: 'http',
      url: endpoint,
      auth: { kind: 'bearer_env', token },
    }];
  }

  function issue(marker: CodeAgentToolsInvocationMarker): string {
    return options.grants.issue({
      channelId: marker.channelId,
      conversationId: buildChatConversationId(marker.channelId),
      workspacePath: marker.workspacePath,
      actorId: null,
    }).token;
  }

  function forget(sessionId: string): void {
    const tracked = sessions.get(sessionId);
    if (!tracked) return;
    options.grants.revoke(tracked.token);
    sessions.delete(sessionId);
  }

  function withPolicy(instructions: string | null | undefined): string {
    return [instructions?.trim(), CODE_AGENT_PREVIEW_POLICY].filter(Boolean).join('\n\n');
  }

  return {
    wrapClient<Client extends RuntimeClient>(client: Client): Client {
      return new Proxy(client, {
        get(target, property) {
          if (property === 'createSession') {
            return async (input: RuntimeSessionCreateInput) => {
              const marker = readCodeAgentToolsInvocationMarker(input.context);
              const endpoint = options.endpoint();
              if (!marker || !endpoint) return target.createSession(input);
              const token = issue(marker);
              try {
                const session = await target.createSession({ ...input, mcpServers: descriptor(endpoint, token) });
                options.grants.bind(token, session.id);
                sessions.set(session.id, { token, report: session.mcpServers });
                return session;
              } catch (error) {
                options.grants.revoke(token);
                throw error;
              }
            };
          }
          if (property === 'sendMessage') {
            return async (sessionId: string, content: string, input?: RuntimeSendMessageInput) => {
              const endpoint = options.endpoint();
              let tracked = sessions.get(sessionId);
              if (!tracked && endpoint) {
                // Platform restarted: grants are memory-only, so issue a new one.
                // Runtime sees a changed set and restarts the worker through resume.
                const marker = readCodeAgentToolsInvocationMarker(input?.context);
                if (marker) {
                  const token = issue(marker);
                  options.grants.bind(token, sessionId);
                  tracked = { token, report: undefined };
                  sessions.set(sessionId, tracked);
                }
              }
              if (!tracked || !endpoint) return target.sendMessage(sessionId, content, input);
              const result = await target.sendMessage(sessionId, content, {
                ...input,
                mcpServers: descriptor(endpoint, tracked.token),
                instructions: tracked.report?.status === 'delivered'
                  ? withPolicy(input?.instructions)
                  : input?.instructions,
              });
              if (result.mcpServers) tracked.report = result.mcpServers;
              return result;
            };
          }
          if (property === 'resumeSession' && typeof target.resumeSession === 'function') {
            return async (sessionId: string, input?: RuntimeSessionResumeInput) => {
              const endpoint = options.endpoint();
              const tracked = sessions.get(sessionId);
              if (!tracked || !endpoint) return target.resumeSession!(sessionId, input);
              const session = await target.resumeSession!(sessionId, {
                ...input,
                mcpServers: descriptor(endpoint, tracked.token),
              });
              if (session.mcpServers) tracked.report = session.mcpServers;
              return session;
            };
          }
          if (property === 'closeSession' || property === 'deleteSession') {
            return async (sessionId: string) => {
              forget(sessionId);
              return target[property](sessionId);
            };
          }
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
}
