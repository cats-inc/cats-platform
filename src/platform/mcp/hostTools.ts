import type { IncomingMessage, ServerResponse } from 'node:http';

import { isProductScope, productScopeIncludes, type ProductScope } from '../../shared/productScope.js';
import type { RuntimeSessionInvocationContext } from '../runtime/client.js';
import {
  handleMcpHttpRequest,
  mcpTextResult,
  type McpServerDefinition,
  type McpToolCallResult,
  type McpToolDefinition,
} from './jsonRpcServer.js';
import { McpSessionGrantStore, type McpSessionGrant } from './sessionGrants.js';
import { HOST_SESSION_MCP_SERVER_NAME } from './sessionMcpServerContributions.js';

/**
 * The host's `cats` session server (ADR-126, SPEC-142 FR-1 to FR-5). One server goes to a
 * conversation's sessions; the products register tool providers with it, and each grant lists
 * the tools of the providers its level includes.
 */

/** Unchanged from when only Code used it: the public ingress already refuses this path. */
export const HOST_TOOLS_MCP_PATH = '/api/code/agent-tools/mcp';
export const HOST_TOOLS_SERVER_NAME = HOST_SESSION_MCP_SERVER_NAME;
export const HOST_TOOLS_SERVER_VERSION = '1.0.0';
export const HOST_TOOLS_CONTEXT_METADATA_KEY = 'hostTools' as const;

/** What a session grant is bound to: everything a tool call may act on. */
export interface HostToolGrantBinding {
  /** Chat channel id; also the `code_conversation` canvas surface id. */
  channelId: string;
  /** Core conversation id (`conversation-channel-<channelId>`). */
  conversationId: string;
  workspacePath: string | null;
  /** The Cat actor the grant was issued for. */
  actorId: string | null;
  /** Whether the session may run shell commands, which dev previews require (SPEC-123 CAP-08). */
  shellExecution: boolean;
  /** The conversation's level when the grant was issued. It never falls (SPEC-141 D2). */
  level: ProductScope;
  /** The participant whose session holds the grant, when the dispatch named one. */
  participantId: string | null;
  /**
   * Whether the session's current turn is the owner's own (Desktop, web or mobile), the only
   * turns that may propose a write (SPEC-142; PLAN-135 Phase 1's turn gate). Updated on every
   * send. A transport turn, a heartbeat and a turn the enricher did not mark are not.
   */
  proposalsAllowed?: boolean;
}

/** PLAN-135: a tool that proposes or writes refuses unless the current turn is the owner's own. */
export function hostToolTurnMayPropose(grant: HostToolGrant): boolean {
  return grant.binding.proposalsAllowed === true;
}

export type HostToolGrant = McpSessionGrant<HostToolGrantBinding>;

/** A product's tools on the host server, listed for grants at `level` and wider. */
export interface HostToolProvider {
  id: string;
  level: ProductScope;
  tools: readonly McpToolDefinition[];
  /** Joins the server's `instructions` and the turn policy for the grants that list it. */
  instructions?: string;
  callTool(name: string, args: Record<string, unknown>, grant: HostToolGrant): Promise<McpToolCallResult>;
  clearForReset?(): void;
}

/** The enricher's marker on an invocation. It carries no secret. */
export interface HostToolsInvocationMarker {
  channelId: string;
  workspacePath: string | null;
  /**
   * The channel's shell posture, used when a session's create input is not available (after
   * a Platform restart). A whitelist here counts as no shell, because the channel does not
   * carry the allowed tools.
   */
  shellExecution: boolean;
  level: ProductScope;
  participantId: string | null;
  /** The turn is the owner's own, not a transport's (see `HostToolGrantBinding`). */
  proposalsAllowed?: boolean;
}

export function readHostToolsInvocationMarker(
  context: Pick<RuntimeSessionInvocationContext, 'metadata'> | undefined,
): HostToolsInvocationMarker | null {
  const value = context?.metadata?.[HOST_TOOLS_CONTEXT_METADATA_KEY];
  if (!value || typeof value !== 'object') return null;
  const { channelId, workspacePath, shellExecution, level, participantId, proposalsAllowed } = value as Record<string, unknown>;
  if (typeof channelId !== 'string' || !channelId || !isProductScope(level)) return null;
  return {
    channelId,
    workspacePath: typeof workspacePath === 'string' ? workspacePath : null,
    shellExecution: shellExecution === true,
    level,
    participantId: typeof participantId === 'string' && participantId ? participantId : null,
    proposalsAllowed: proposalsAllowed === true,
  };
}

export class HostToolRegistrationError extends Error {}

export interface HostToolServer {
  grants: McpSessionGrantStore<HostToolGrantBinding>;
  register(provider: HostToolProvider): void;
  /** Whether a grant at this level would list any tool. Without one, no server is attached. */
  hasTools(level: ProductScope): boolean;
  /** The policy for a turn at this level: the instructions of the providers it lists. */
  instructions(level: ProductScope): string | undefined;
  listTools(level: ProductScope): McpToolDefinition[];
  clearForReset(): void;
  /** Serve the MCP endpoint; returns false for any other path. */
  route(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

export function createHostToolServer(options: {
  grants?: McpSessionGrantStore<HostToolGrantBinding>;
  now?: () => Date;
} = {}): HostToolServer {
  const grants = options.grants ?? new McpSessionGrantStore<HostToolGrantBinding>(options.now);
  const providers: HostToolProvider[] = [];

  function providersFor(level: ProductScope): HostToolProvider[] {
    return providers.filter((provider) => productScopeIncludes(level, provider.level));
  }

  function instructions(level: ProductScope): string | undefined {
    return providersFor(level).map((provider) => provider.instructions?.trim()).filter(Boolean).join('\n\n')
      || undefined;
  }

  function listTools(level: ProductScope): McpToolDefinition[] {
    return providersFor(level).flatMap((provider) => [...provider.tools]);
  }

  const server: McpServerDefinition<HostToolGrant> = {
    name: HOST_TOOLS_SERVER_NAME,
    version: HOST_TOOLS_SERVER_VERSION,
    // FR-5: the instructions name only the tools this grant lists.
    instructions: (grant) => instructions(grant.binding.level),
    // FR-2: the grant's level decides what is listed, and a call to anything else is refused
    // before it reaches a provider.
    listTools: (grant) => listTools(grant.binding.level),
    async callTool(name, args, grant) {
      const provider = providersFor(grant.binding.level).find((entry) => entry.tools.some((tool) => tool.name === name));
      if (!provider) return mcpTextResult({ error: { code: 'unknown_tool', message: `Unknown tool: ${name}` } }, true);
      return provider.callTool(name, args, grant);
    },
  };

  return {
    grants,
    register(provider) {
      if (providers.some((entry) => entry.id === provider.id)) {
        throw new HostToolRegistrationError(`Host tool provider already registered: ${provider.id}`);
      }
      const names = new Set(providers.flatMap((entry) => entry.tools.map((tool) => tool.name)));
      const clash = provider.tools.find((tool) => names.has(tool.name));
      if (clash) throw new HostToolRegistrationError(`Host tool already registered: ${clash.name}`);
      providers.push(provider);
    },
    hasTools: (level) => listTools(level).length > 0,
    instructions,
    listTools,
    clearForReset() {
      // The providers forget their leases first, so revoking every grant stops nothing twice.
      for (const provider of providers) provider.clearForReset?.();
      grants.revokeWhere(() => true);
    },
    async route(request, response) {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (pathname !== HOST_TOOLS_MCP_PATH) return false;
      await handleMcpHttpRequest(request, response, {
        server,
        authorize(token, method) {
          const grant = grants.resolve(token);
          if (!grant) return null;
          // CLIs connect while spawning, before the session id is known; acting on the
          // conversation needs the bound session.
          if (method === 'tools/call' && grant.state !== 'bound') return null;
          return grant;
        },
      });
      return true;
    },
  };
}
