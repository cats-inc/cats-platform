import type {
  RuntimeClient,
  RuntimeSendMessageInput,
  RuntimeSessionCreateInput,
  RuntimeSessionResumeInput,
} from '../runtime/client.js';
import type { McpSessionGrantStore } from './sessionGrants.js';
import type {
  RuntimeSessionMcpDeliveryReport,
  RuntimeSessionMcpServer,
} from '../../runtime/sessionMcpServers.js';
import { compareProductScopes, type ProductScope } from '../../shared/productScope.js';
import {
  HOST_TOOLS_SERVER_NAME,
  readHostToolsInvocationMarker,
  type HostToolGrantBinding,
  type HostToolServer,
  type HostToolsInvocationMarker,
} from './hostTools.js';
import { hasShellExecutionPermission } from './shellPermission.js';
import { buildChatConversationId } from '../../shared/chatCoreIds.js';
import {
  composeSessionMcpServers,
  type SessionMcpServerContribution,
  type SessionMcpServerContributor,
} from './sessionMcpServerContributions.js';

/**
 * Attaches the host's `cats` server to a conversation's sessions (ADR-126; SPEC-142 FR-1 to
 * FR-5).
 *
 * This wrapper sits inside the supervision boundary, so the secret-bearing `mcpServers`
 * descriptor never reaches supervision evidence or Core records. Grants are issued before
 * create, because the CLI connects while spawning, bound to the runtime session id, and revoked
 * on close or delete. A grant lists the tools of its level. A level with no tools gets no server.
 * The turn policy is added only while Runtime reports the server as delivered for that session.
 */

interface TrackedSession {
  token: string;
  channelId: string;
  workspacePath: string | null;
  level: ProductScope;
  participantId: string | null;
  report: RuntimeSessionMcpDeliveryReport | undefined;
  /** The grant was issued on a send and Runtime could not say the session's folder. */
  folderUnknown?: boolean;
  /** Sends of this session now awaiting Runtime; the turn gate opens only for a lone one. */
  inFlight?: number;
  /**
   * Grants this session held at a narrower level (FR-3). A worker started with one may still be
   * running a turn, so each stays valid until Runtime reports the current set delivered.
   */
  retired: string[];
}

export interface HostToolsClientWrapperOptions {
  grants: McpSessionGrantStore<HostToolGrantBinding>;
  server: Pick<HostToolServer, 'hasTools' | 'instructions' | 'listTools'>;
  /** The loopback MCP URL, or null while Platform cannot offer it. */
  endpoint(): string | null;
  /** A conversation gained a session with the `cats` server. */
  onSessionStarted?(channelId: string): void;
  /** A conversation's session was closed or deleted and its grants revoked. */
  onSessionEnded?(channelId: string, reason: 'closed' | 'deleted'): void;
  /**
   * Further MCP servers for the same descriptor, such as a user-granted App endpoint or a
   * plugin server (ADR-126, PLAN-116 F5). They are composed with `cats`; a contributor that
   * fails or names a server wrongly is left out.
   */
  contributors?: readonly SessionMcpServerContributor[];
  onContributionError?(contributorId: string, error: unknown): void;
}

export interface HostToolsClientWrapper {
  wrapClient<Client extends RuntimeClient>(client: Client): Client;
}

export function createHostToolsClientWrapper(options: HostToolsClientWrapperOptions): HostToolsClientWrapper {
  const sessions = new Map<string, TrackedSession>();

  function descriptor(
    endpoint: string,
    token: string,
    session: { channelId: string; workspacePath: string | null },
  ): RuntimeSessionMcpServer[] {
    const contributions: SessionMcpServerContribution[] = [{
      origin: { kind: 'host' },
      server: { name: HOST_TOOLS_SERVER_NAME, transport: 'http', url: endpoint, auth: { kind: 'bearer_env', token } },
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

  function issue(marker: HostToolsInvocationMarker, shellExecution = marker.shellExecution): string {
    return options.grants.issue({
      channelId: marker.channelId,
      conversationId: buildChatConversationId(marker.channelId),
      workspacePath: marker.workspacePath,
      actorId: null,
      shellExecution,
      level: marker.level,
      participantId: marker.participantId,
    }).token;
  }

  function attaches(marker: HostToolsInvocationMarker | null): marker is HostToolsInvocationMarker {
    return marker !== null && options.server.hasTools(marker.level);
  }

  function forget(sessionId: string, reason: 'closed' | 'deleted'): void {
    const tracked = sessions.get(sessionId);
    if (!tracked) return;
    for (const token of [tracked.token, ...tracked.retired]) options.grants.revoke(token);
    sessions.delete(sessionId);
    options.onSessionEnded?.(tracked.channelId, reason);
  }

  /** FR-5: the policy of the level this session's current grant lists. */
  function withPolicy(instructions: string | null | undefined, level: ProductScope): string | undefined {
    return [instructions?.trim(), options.server.instructions(level)].filter(Boolean).join('\n\n') || undefined;
  }

  /**
   * The host's servers join the ones the call already carries, such as the desktop control
   * server, and replace only entries with their own names (FR-4). The result is in name order:
   * Runtime recycles a worker when its set's fingerprint changes, and the fingerprint follows
   * the order, so create, send and resume must send the same set the same way.
   */
  function withServers(
    incoming: readonly RuntimeSessionMcpServer[] | undefined,
    own: RuntimeSessionMcpServer[],
  ): RuntimeSessionMcpServer[] {
    const names = new Set(own.map((server) => server.name));
    return [...(incoming ?? []).filter((server) => !names.has(server.name)), ...own]
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  }

  /**
   * The folder a running session works in (SPEC-141 FR-25), which a worktree or sandbox makes
   * different from the conversation's folder. Unknown when Runtime cannot say, and the tools
   * then refuse to act on a folder.
   */
  async function sessionWorkspacePath(target: RuntimeClient, sessionId: string): Promise<string | null> {
    try {
      const { session } = await target.observeSession(sessionId);
      const workspace = session.workspace as Record<string, unknown> | undefined;
      const runtimeCwd = workspace?.runtimeCwd;
      if (typeof runtimeCwd === 'string' && runtimeCwd) return runtimeCwd;
      return typeof session.cwd === 'string' && session.cwd ? session.cwd : null;
    } catch {
      return null;
    }
  }

  /**
   * FR-3: the conversation reached a wider level since this session's grant was issued. When that
   * level lists other tools, its next send carries a new grant, so Runtime recycles the worker and
   * the agent lists its tools again. When it lists the same ones (a level whose providers add no
   * tool), the grant takes the new level and nothing recycles. Code to Work lists Work's tools,
   * so it recycles.
   */
  function raiseGrant(sessionId: string, tracked: TrackedSession, marker: HostToolsInvocationMarker): void {
    const current = options.grants.resolve(tracked.token);
    const participantId = marker.participantId ?? tracked.participantId;
    // The same tools at the wider level: the worker keeps its grant, now at that level. Only a
    // changed tool list is worth recycling the worker for.
    const sameTools = toolNames(marker.level) === toolNames(tracked.level);
    if (sameTools && current) {
      options.grants.bind(tracked.token, sessionId, { level: marker.level, participantId });
      tracked.level = marker.level;
      tracked.participantId = participantId;
      return;
    }
    // Without the current grant (only after a data reset), fail closed on the shell posture.
    const token = issue({ ...marker, participantId }, current?.binding.shellExecution ?? false);
    options.grants.bind(token, sessionId, { workspacePath: current?.binding.workspacePath ?? null });
    tracked.retired.push(tracked.token);
    tracked.token = token;
    tracked.level = marker.level;
    tracked.participantId = participantId;
    tracked.report = undefined;
  }

  function toolNames(level: ProductScope): string {
    return options.server.listTools(level).map((tool) => tool.name).sort().join(' ');
  }

  /** The turn gate on every grant the session's worker may hold, the retired ones included. */
  function setTurnGate(sessionId: string, tracked: TrackedSession, open: boolean): void {
    for (const token of [tracked.token, ...tracked.retired]) {
      options.grants.bind(token, sessionId, { proposalsAllowed: open });
    }
  }

  function settleReport(tracked: TrackedSession, report: RuntimeSessionMcpDeliveryReport | undefined): void {
    if (!report) return;
    tracked.report = report;
    // The worker runs the current set, so nothing still holds a narrower grant.
    if (report.status === 'delivered' && tracked.retired.length > 0) {
      for (const token of tracked.retired.splice(0)) options.grants.revoke(token);
    }
  }

  return {
    wrapClient<Client extends RuntimeClient>(client: Client): Client {
      return new Proxy(client, {
        get(target, property) {
          if (property === 'createSession') {
            return async (input: RuntimeSessionCreateInput) => {
              const marker = readHostToolsInvocationMarker(input.context);
              const endpoint = options.endpoint();
              if (!attaches(marker) || !endpoint) return target.createSession(input);
              // The create input carries the effective posture, including a
              // whitelist's allowed tools.
              const token = issue(marker, hasShellExecutionPermission(input));
              try {
                const session = await target.createSession({ ...input,
                  mcpServers: withServers(input.mcpServers, descriptor(endpoint, token, marker)) });
                // Runtime's resolved cwd is the workspace the Cat writes to
                // (a worktree or sandbox can differ from the channel's repo path).
                options.grants.bind(token, session.id, {
                  workspacePath: session.cwd ?? input.cwd ?? marker.workspacePath,
                });
                sessions.set(session.id, {
                  token,
                  channelId: marker.channelId,
                  workspacePath: marker.workspacePath,
                  level: marker.level,
                  participantId: marker.participantId,
                  report: session.mcpServers,
                  retired: [],
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
              const marker = readHostToolsInvocationMarker(input?.context);
              let tracked = sessions.get(sessionId);
              if (!tracked && endpoint && attaches(marker)) {
                // Platform restarted (grants are memory-only), or the session started before
                // its conversation's level had any tool. Issue a grant; Runtime sees a changed
                // set and restarts the worker through resume. The grant is bound to the folder
                // the session works in, not the conversation's (SPEC-141 FR-25).
                const workspacePath = await sessionWorkspacePath(target, sessionId);
                // Another send for this session may have issued its grant while Runtime was
                // asked for the folder. Issue at most one grant per session.
                tracked = sessions.get(sessionId);
                if (!tracked) {
                  const token = issue(marker);
                  options.grants.bind(token, sessionId, { workspacePath });
                  tracked = { token, channelId: marker.channelId, workspacePath: marker.workspacePath,
                    level: marker.level, participantId: marker.participantId,
                    report: undefined, folderUnknown: workspacePath === null, retired: [] };
                  sessions.set(sessionId, tracked);
                  options.onSessionStarted?.(marker.channelId);
                }
              } else if (tracked?.folderUnknown && endpoint) {
                // Runtime could not say where the session works when its grant was issued. Ask
                // again, so one failed read does not leave the tools without a folder.
                const workspacePath = await sessionWorkspacePath(target, sessionId);
                if (workspacePath && sessions.get(sessionId) === tracked) {
                  options.grants.bind(tracked.token, sessionId, { workspacePath });
                  tracked.folderUnknown = false;
                }
              }
              if (!tracked || !endpoint) return target.sendMessage(sessionId, content, input);
              // Levels only rise (SPEC-141 D2), so only a wider one is acted on.
              if (marker && marker.channelId === tracked.channelId
                && compareProductScopes(marker.level, tracked.level) > 0 && options.server.hasTools(marker.level)) {
                raiseGrant(sessionId, tracked, marker);
              }
              // The turn gate holds for this send only: an owner's own turn of this conversation
              // may propose while it runs. A send while another is in flight, a heartbeat or any
              // other unmarked send leaves it off, and it is off again when the send ends.
              const owner = marker?.channelId === tracked.channelId && marker.proposalsAllowed === true;
              const current = tracked;
              current.inFlight = (current.inFlight ?? 0) + 1;
              setTurnGate(sessionId, current, owner && current.inFlight === 1);
              try {
                const result = await target.sendMessage(sessionId, content, {
                  ...input,
                  mcpServers: withServers(input?.mcpServers, descriptor(endpoint, current.token, current)),
                  instructions: current.report?.status === 'delivered'
                    ? withPolicy(input?.instructions, current.level)
                    : input?.instructions,
                });
                settleReport(current, result.mcpServers);
                return result;
              } finally {
                current.inFlight -= 1;
                setTurnGate(sessionId, current, false);
              }
            };
          }
          if (property === 'resumeSession' && typeof target.resumeSession === 'function') {
            return async (sessionId: string, input?: RuntimeSessionResumeInput) => {
              const endpoint = options.endpoint();
              const tracked = sessions.get(sessionId);
              if (!tracked || !endpoint) return target.resumeSession!(sessionId, input);
              const session = await target.resumeSession!(sessionId, {
                ...input,
                mcpServers: withServers(input?.mcpServers, descriptor(endpoint, tracked.token, tracked)),
              });
              settleReport(tracked, session.mcpServers);
              if (session.cwd) {
                options.grants.bind(tracked.token, sessionId, { workspacePath: session.cwd });
                tracked.folderUnknown = false;
              }
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
