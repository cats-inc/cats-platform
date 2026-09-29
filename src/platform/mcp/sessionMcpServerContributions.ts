import type { RuntimeSessionMcpServer } from '../../runtime/sessionMcpServers.js';

/**
 * ADR-126 "Configuring Cat sessions" (PLAN-116 F5): every MCP server a Cat
 * session should reach is an entry in the one Runtime `mcpServers` descriptor.
 * The host `cats` server, a user-granted App endpoint and a plugin-contributed
 * server all arrive through `SessionMcpServerContributor`s composed here; there
 * is no second session-configuration mechanism. Each CLI connects to its
 * servers directly, so App and plugin traffic never passes through Runtime or
 * Platform's host-internal MCP module.
 */

export type SessionMcpServerOrigin =
  | { kind: 'host' }
  | { kind: 'app'; appId: string }
  | { kind: 'plugin'; pluginId: string };

/** What a contributor may know about the Cat session it configures. */
export interface SessionMcpServerContext {
  channelId: string;
  conversationId: string;
  workspacePath: string | null;
}

export interface SessionMcpServerContribution {
  origin: SessionMcpServerOrigin;
  server: RuntimeSessionMcpServer;
}

export interface SessionMcpServerContributor {
  id: string;
  contribute(context: SessionMcpServerContext): SessionMcpServerContribution[];
}

/** Runtime SPEC-035 server names. */
const SERVER_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
export const HOST_SESSION_MCP_SERVER_NAME = 'cats';

/**
 * The namespaced server name for an origin: `cats` for the host, `app-<slug>`
 * for an App and `plugin-<slug>` for a plugin, whose IDs contain `/`. A slug
 * that does not fit Runtime's 32-character limit keeps a short hash suffix so
 * two long IDs never collide.
 */
export function sessionMcpServerName(origin: SessionMcpServerOrigin): string {
  if (origin.kind === 'host') return HOST_SESSION_MCP_SERVER_NAME;
  const prefix = origin.kind === 'app' ? 'app-' : 'plugin-';
  const id = origin.kind === 'app' ? origin.appId : origin.pluginId;
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '') || 'x';
  const name = `${prefix}${slug}`;
  if (name.length <= 32) return name;
  return `${name.slice(0, 32 - 7).replace(/-+$/u, '')}-${shortHash(id)}`;
}

export class SessionMcpServerCompositionError extends Error {
  constructor(readonly code: 'name_invalid' | 'name_mismatch' | 'name_duplicate', message: string) {
    super(message);
    this.name = 'SessionMcpServerCompositionError';
  }
}

/**
 * Compose contributions into one descriptor. Each entry's name must be the
 * namespaced name of its origin (so an App cannot claim `cats` or another App's
 * name) and appear once.
 */
export function composeSessionMcpServers(
  contributions: readonly SessionMcpServerContribution[],
): RuntimeSessionMcpServer[] {
  const seen = new Set<string>();
  return contributions.map(({ origin, server }) => {
    if (!SERVER_NAME_PATTERN.test(server.name)) {
      throw new SessionMcpServerCompositionError('name_invalid', `Invalid session MCP server name: ${server.name}`);
    }
    const expected = sessionMcpServerName(origin);
    if (server.name !== expected) {
      throw new SessionMcpServerCompositionError(
        'name_mismatch',
        `Session MCP server ${server.name} must be named ${expected} for its origin.`,
      );
    }
    if (seen.has(server.name)) {
      throw new SessionMcpServerCompositionError('name_duplicate', `Duplicate session MCP server: ${server.name}`);
    }
    seen.add(server.name);
    return server;
  });
}

function shortHash(value: string): string {
  // FNV-1a, enough to keep two long IDs apart within one descriptor.
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(6, '0').slice(-6);
}
