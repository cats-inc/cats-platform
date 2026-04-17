export const RUNTIME_WORKSPACE_KINDS = ['source', 'sandbox', 'worktree'] as const;
export const RUNTIME_WORKSPACE_ACCESS_VALUES = ['read_write', 'read_only'] as const;
export const RUNTIME_PERMISSION_MODES = ['skip', 'default', 'whitelist'] as const;

export type RuntimeWorkspaceKind = typeof RUNTIME_WORKSPACE_KINDS[number];
export type RuntimeWorkspaceAccess = typeof RUNTIME_WORKSPACE_ACCESS_VALUES[number];
export type RuntimePermissionMode = typeof RUNTIME_PERMISSION_MODES[number];

// RuntimeSessionPolicy is a discriminated union over workspaceAccess. Read-only
// sessions must run with the default permission gate; read-write sessions are
// skip-permission by default but may opt into a whitelist. Constructing any
// other combination at the type level is forbidden — use applyReadOnlyInvariant
// to coerce loose input into a valid variant.
export type RuntimeSessionPolicy =
  | {
      workspaceKind: RuntimeWorkspaceKind;
      workspaceAccess: 'read_write';
      permissionMode: 'skip' | 'whitelist';
    }
  | {
      workspaceKind: RuntimeWorkspaceKind;
      workspaceAccess: 'read_only';
      permissionMode: 'default';
    };

// Loose input shape accepted by boundary helpers (HTTP payloads, persisted
// snapshots, renderer state). Any combination of fields is allowed; the helpers
// normalise it into a valid RuntimeSessionPolicy via applyReadOnlyInvariant.
export interface RuntimeSessionPolicyInput {
  workspaceKind?: RuntimeWorkspaceKind;
  workspaceAccess?: RuntimeWorkspaceAccess;
  permissionMode?: RuntimePermissionMode;
}

export type DraftWorkspaceMode = 'current' | 'worktree';
export type DraftPermissionMode = 'full' | 'read_only';

export const DEFAULT_DRAFT_WORKSPACE_MODE: DraftWorkspaceMode = 'current';
export const DEFAULT_DRAFT_PERMISSION_MODE: DraftPermissionMode = 'full';

interface RuntimeSessionPolicyFields {
  workspaceKind: RuntimeWorkspaceKind;
  workspaceAccess: RuntimeWorkspaceAccess;
  permissionMode: RuntimePermissionMode;
}

function hasRepoPath(repoPath: string | null | undefined): boolean {
  return typeof repoPath === 'string' && repoPath.trim().length > 0;
}

function mergeDefinedPolicyFields<T extends object>(
  defaults: T,
  policy?: Partial<T> | null,
): T {
  if (!policy) {
    return { ...defaults };
  }

  const merged: T = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const nextValue = policy[key];
    if (nextValue !== undefined) {
      merged[key] = nextValue as T[typeof key];
    }
  }
  return merged;
}

function createDefaultPolicyFields(): RuntimeSessionPolicyFields {
  return {
    workspaceKind: 'sandbox',
    workspaceAccess: 'read_write',
    permissionMode: 'skip',
  };
}

// Single source of truth for the read-only invariant. Both create-time and
// session-start paths end with this normaliser so stored / runtime-facing
// policies can only ever be one of the two valid discriminated variants.
function applyReadOnlyInvariant(raw: RuntimeSessionPolicyFields): RuntimeSessionPolicy {
  if (raw.workspaceAccess === 'read_only') {
    // Runtime currently treats read-only sessions as the default permission gate.
    return {
      workspaceKind: raw.workspaceKind,
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    };
  }
  // read_write cannot carry 'default' (that belongs to read_only); coerce any
  // stale value back to 'skip', only preserving an explicit 'whitelist' opt-in.
  return {
    workspaceKind: raw.workspaceKind,
    workspaceAccess: 'read_write',
    permissionMode: raw.permissionMode === 'whitelist' ? 'whitelist' : 'skip',
  };
}

export function createDefaultRuntimeSessionPolicy(): RuntimeSessionPolicy {
  return applyReadOnlyInvariant(createDefaultPolicyFields());
}

// Stored/runtime-facing policies are completed from explicit fields plus global
// defaults only. Repo-backed "source" inference belongs to create-time; trusted
// at session-start.
export function completeRuntimeSessionPolicy(
  policy?: RuntimeSessionPolicyInput | null,
): RuntimeSessionPolicy {
  return applyReadOnlyInvariant(
    mergeDefinedPolicyFields(createDefaultPolicyFields(), policy),
  );
}

// Create-time may lift a cwd-backed draft into the "source" workspace mode
// before the completed policy is persisted. Later session-start paths should
// trust that stored policy instead of re-deriving from repoPath.
export function resolveCreateRuntimeSessionPolicy(options: {
  repoPath?: string | null;
  policy?: RuntimeSessionPolicyInput | null;
}): RuntimeSessionPolicy {
  const withRepoHint = mergeDefinedPolicyFields(createDefaultPolicyFields(), {
    // "source" means "cwd-backed workspace" and does not imply git is available.
    workspaceKind: hasRepoPath(options.repoPath) ? 'source' : undefined,
  });
  return applyReadOnlyInvariant(
    mergeDefinedPolicyFields(withRepoHint, options.policy),
  );
}

export function isRuntimeWorkspaceKind(value: unknown): value is RuntimeWorkspaceKind {
  return typeof value === 'string' && RUNTIME_WORKSPACE_KINDS.includes(value as RuntimeWorkspaceKind);
}

export function isRuntimeWorkspaceAccess(value: unknown): value is RuntimeWorkspaceAccess {
  return typeof value === 'string'
    && RUNTIME_WORKSPACE_ACCESS_VALUES.includes(value as RuntimeWorkspaceAccess);
}

export function isRuntimePermissionMode(value: unknown): value is RuntimePermissionMode {
  return typeof value === 'string'
    && RUNTIME_PERMISSION_MODES.includes(value as RuntimePermissionMode);
}

export function resolveDraftWorkspaceModeFromRuntimeKind(
  workspaceKind: RuntimeWorkspaceKind | null | undefined,
): DraftWorkspaceMode {
  return workspaceKind === 'worktree' ? 'worktree' : 'current';
}

export function resolveRuntimeWorkspaceKindFromDraft(options: {
  hasCwd: boolean;
  isRepo: boolean;
  workspaceMode: DraftWorkspaceMode;
}): RuntimeWorkspaceKind {
  if (!options.hasCwd) {
    return 'sandbox';
  }
  if (options.isRepo && options.workspaceMode === 'worktree') {
    return 'worktree';
  }
  return 'source';
}

export function resolveDraftPermissionModeFromRuntimeAccess(
  workspaceAccess: RuntimeWorkspaceAccess | null | undefined,
): DraftPermissionMode {
  return workspaceAccess === 'read_only' ? 'read_only' : 'full';
}

export function resolveRuntimePermissionPolicyFromDraft(
  permissionMode: DraftPermissionMode,
): Pick<RuntimeSessionPolicy, 'workspaceAccess' | 'permissionMode'> {
  if (permissionMode === 'read_only') {
    return {
      workspaceAccess: 'read_only',
      permissionMode: 'default',
    };
  }

  return {
    workspaceAccess: 'read_write',
    permissionMode: 'skip',
  };
}
