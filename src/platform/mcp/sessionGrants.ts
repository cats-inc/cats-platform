import { createHash, randomBytes } from 'node:crypto';

/**
 * Bearer grants for Platform-hosted MCP servers delivered to one runtime
 * session (ADR-126 decision 3). A grant is `issued` before the session exists,
 * because provider CLIs connect while spawning, and becomes `bound` once the
 * runtime session id is known. Tokens are held only as hashes.
 */

export type McpSessionGrantState = 'issued' | 'bound';

export interface McpSessionGrant<Binding> {
  grantId: string;
  state: McpSessionGrantState;
  runtimeSessionId: string | null;
  binding: Binding;
  issuedAt: string;
}

export class McpSessionGrantStore<Binding> {
  private readonly grants = new Map<string, McpSessionGrant<Binding>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Issue a grant and return its bearer token; only the hash is kept. */
  issue(binding: Binding): { token: string; grant: McpSessionGrant<Binding> } {
    const token = randomBytes(32).toString('base64url');
    const grant: McpSessionGrant<Binding> = {
      grantId: hashToken(token).slice(0, 16),
      state: 'issued',
      runtimeSessionId: null,
      binding,
      issuedAt: this.now().toISOString(),
    };
    this.grants.set(hashToken(token), grant);
    return { token, grant };
  }

  resolve(token: string): McpSessionGrant<Binding> | null {
    return this.grants.get(hashToken(token)) ?? null;
  }

  /**
   * Attach the runtime session id reported by the create response, optionally
   * refining the binding with what Runtime resolved (for example its cwd).
   */
  bind(
    token: string,
    runtimeSessionId: string,
    bindingPatch: Partial<Binding> = {},
  ): McpSessionGrant<Binding> | null {
    const grant = this.resolve(token);
    if (!grant) return null;
    grant.state = 'bound';
    grant.runtimeSessionId = runtimeSessionId;
    grant.binding = { ...grant.binding, ...bindingPatch };
    return grant;
  }

  findBySession(runtimeSessionId: string): McpSessionGrant<Binding> | null {
    for (const grant of this.grants.values()) {
      if (grant.runtimeSessionId === runtimeSessionId) return grant;
    }
    return null;
  }

  some(predicate: (grant: McpSessionGrant<Binding>) => boolean): boolean {
    for (const grant of this.grants.values()) {
      if (predicate(grant)) return true;
    }
    return false;
  }

  revoke(token: string): void {
    this.grants.delete(hashToken(token));
  }

  revokeWhere(predicate: (grant: McpSessionGrant<Binding>) => boolean): number {
    let revoked = 0;
    for (const [key, grant] of this.grants) {
      if (predicate(grant)) {
        this.grants.delete(key);
        revoked += 1;
      }
    }
    return revoked;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
