import type { SessionExecutionPolicy } from './providerInteractions.js';
export class ProviderPolicyFormatError extends Error {}

/** Unknown policies must not silently become a broader legacy session. */
export function parseProviderExecutionPolicy(value: unknown): SessionExecutionPolicy | undefined {
  if (value === undefined || value === null) return undefined;
  const fail = (): never => { throw new ProviderPolicyFormatError('Invalid provider execution policy; existing settings were preserved.'); };
  const record = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  const p = record(value);
  const access = (v: unknown) => typeof v === 'string' && ['read-only', 'workspace-write', 'full-access'].includes(v);
  if (!p || p.version !== 1) return fail();
  if (p.mode === 'provider') {
    const c = record(p.constraints);
    if (Object.keys(p).some(k => !['version', 'mode', 'constraints'].includes(k)) || !c
      || Object.keys(c).some(k => !['maxAccess', 'network'].includes(k)) || !access(c.maxAccess) || typeof c.network !== 'boolean') return fail();
  } else if (p.mode !== 'explicit' || Object.keys(p).some(k => !['version', 'mode', 'access', 'network', 'approval'].includes(k))
    || !access(p.access) || typeof p.network !== 'boolean' || typeof p.approval !== 'string'
    || !['never', 'untrusted', 'on-request'].includes(p.approval)
    || p.access === 'read-only' && p.network || p.access === 'full-access' && !p.network) return fail();
  return structuredClone(p) as SessionExecutionPolicy;
}

export function assertProviderPolicyBoundary(policy: SessionExecutionPolicy | undefined, boundary: {
  workspaceAccess?: string | null; permissionMode?: string | null; allowedTools?: string[];
}): void {
  if (!policy) return;
  const access = policy.mode === 'provider' ? policy.constraints.maxAccess : policy.access;
  if (boundary.permissionMode === 'whitelist' || boundary.allowedTools?.length
    || boundary.workspaceAccess === 'read_only' && access !== 'read-only') {
    throw new ProviderPolicyFormatError('Provider policy cannot exceed a read-only workspace or replace a tool allowlist.');
  }
}
