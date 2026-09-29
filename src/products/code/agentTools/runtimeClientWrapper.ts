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
import { hasShellExecutionPermission } from './shellPermission.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import {
  composeSessionMcpServers,
  type SessionMcpServerContribution,
  type SessionMcpServerContributor,
} from '../../../platform/mcp/sessionMcpServerContributions.js';

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
  channelId: string;
  workspacePath: string | null;
  report: RuntimeSessionMcpDeliveryReport | undefined;
}

export interface CodeAgentToolsClientWrapperOptions {
  grants: McpSessionGrantStore<CodeAgentToolGrantBinding>;
  /** The loopback MCP URL, or null while Platform cannot offer it. */
  endpoint(): string | null;
  /** A Code conversation gained a session with the `cats` server. */
  onSessionStarted?(channelId: string): void;
  /** A Code conversation's session was closed or deleted and its grant revoked. */
  onSessionEnded?(channelId: string, reason: 'closed' | 'deleted'): void;
  /**
   * Further MCP servers for the same descriptor, such as a user-granted App
   * endpoint or a plugin server (ADR-126, PLAN-116 F5). They are composed with
   * `cats`; a contributor that fails or names a server wrongly is left out.
   */
  contributors?: readonly SessionMcpServerContributor[];
  onContributionError?(contributorId: string, error: unknown): void;
}

export interface CodeAgentToolsClientWrapper {
  wrapClient<Client extends RuntimeClient>(client: Client): Client;
}

export function createCodeAgentToolsClientWrapper(
  options: CodeAgentToolsClientWrapperOptions,
): CodeAgentToolsClientWrapper {
  const sessions = new Map<string, TrackedSession>();

  function descriptor(
    endpoint: string,
    token: string,
    session: { channelId: string; workspacePath: string | null },
  ): RuntimeSessionMcpServer[] {
    const contributions: SessionMcpServerContribution[] = [{
      origin: { kind: 'host' },
      server: { name: CODE_AGENT_TOOLS_SERVER_NAME, transport: 'http', url: endpoint, auth: { kind: 'bearer_env', token } },
    }];
    const context = {
      channelId: session.channelId,
      conversationId: buildChatConversationId(session.channelId),
      workspacePath: session.workspacePath,
    };
    for (const contributor of options.contributors ?? []) {
      try {
        const offered = contributor.contribute(context);
        // Validate each contributor on its own, so one bad entry drops only its contributor.
        composeSessionMcpServers([...contributions, ...offered]);
        contributions.push(...offered);
      } catch (error) {
        options.onContributionError?.(contributor.id, error);
      }
    }
    return composeSessionMcpServers(contributions);
  }

  function issue(marker: CodeAgentToolsInvocationMarker, shellExecution = marker.shellExecution): string {
    return options.grants.issue({
      channelId: marker.channelId,
      conversationId: buildChatConversationId(marker.channelId),
      workspacePath: marker.workspacePath,
      actorId: null,
      shellExecution,
    }).token;
  }

  function forget(sessionId: string, reason: 'closed' | 'deleted'): void {
    const tracked = sessions.get(sessionId);
    if (!tracked) return;
    options.grants.revoke(tracked.token);
    sessions.delete(sessionId);
    options.onSessionEnded?.(tracked.channelId, reason);
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
              // The create input carries the effective posture, including a
              // whitelist's allowed tools.
              const token = issue(marker, hasShellExecutionPermission(input));
              try {
                const session = await target.createSession({ ...input, mcpServers: descriptor(endpoint, token, marker) });
                // Runtime's resolved cwd is the workspace the Cat writes to
                // (a worktree or sandbox can differ from the channel's repo path).
                options.grants.bind(token, session.id, {
                  workspacePath: session.cwd ?? input.cwd ?? marker.workspacePath,
                });
                sessions.set(session.id, {
                  token,
                  channelId: marker.channelId,
                  workspacePath: marker.workspacePath,
                  report: session.mcpServers,
                });
                options.onSessionStarted?.(marker.channelId);
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
                  tracked = { token, channelId: marker.channelId, workspacePath: marker.workspacePath, report: undefined };
                  sessions.set(sessionId, tracked);
                  options.onSessionStarted?.(marker.channelId);
                }
              }
              if (!tracked || !endpoint) return target.sendMessage(sessionId, content, input);
              const result = await target.sendMessage(sessionId, content, {
                ...input,
                mcpServers: descriptor(endpoint, tracked.token, tracked),
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
                mcpServers: descriptor(endpoint, tracked.token, tracked),
              });
              if (session.mcpServers) tracked.report = session.mcpServers;
              if (session.cwd) options.grants.bind(tracked.token, sessionId, { workspacePath: session.cwd });
              return session;
            };
          }
          if (property === 'closeSession' || property === 'deleteSession') {
            return async (sessionId: string) => {
              forget(sessionId, property === 'deleteSession' ? 'deleted' : 'closed');
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
