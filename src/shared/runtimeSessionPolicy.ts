export const RUNTIME_WORKSPACE_KINDS = ['source', 'sandbox', 'worktree'] as const;
export const RUNTIME_WORKSPACE_ACCESS_VALUES = ['read_write', 'read_only'] as const;
export const RUNTIME_PERMISSION_MODES = ['skip', 'default', 'whitelist'] as const;

export type RuntimeWorkspaceKind = typeof RUNTIME_WORKSPACE_KINDS[number];
export type RuntimeWorkspaceAccess = typeof RUNTIME_WORKSPACE_ACCESS_VALUES[number];
export type RuntimePermissionMode = typeof RUNTIME_PERMISSION_MODES[number];

export interface RuntimeSessionPolicy {
  workspaceKind: RuntimeWorkspaceKind;
  workspaceAccess: RuntimeWorkspaceAccess;
  permissionMode: RuntimePermissionMode;
}

export type DraftWorkspaceMode = 'current' | 'worktree';
export type DraftPermissionMode = 'full' | 'read_only';

export const DEFAULT_DRAFT_WORKSPACE_MODE: DraftWorkspaceMode = 'current';
export const DEFAULT_DRAFT_PERMISSION_MODE: DraftPermissionMode = 'full';

function hasRepoPath(repoPath: string | null | undefined): boolean {
  return typeof repoPath === 'string' && repoPath.trim().length > 0;
}

function mergeDefinedPolicyFields<T extends object>(
  defaults: T,
  policy?: Partial<T> | null,
): T {
  if (!policy) {
    return defaults;
  }

  const merged: T = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const nextValue = policy[key];
    if (nextValue !== undefined) {
      Object.assign(merged, { [key]: nextValue });
    }
  }
  return merged;
}

export function createDefaultRuntimeSessionPolicy(): RuntimeSessionPolicy {
  return {
    workspaceKind: 'sandbox',
    workspaceAccess: 'read_write',
    permissionMode: 'skip',
  };
}

// Stored/runtime-facing policies should only be completed from explicit fields plus
// global defaults. Repo-backed "source" inference belongs to create-time only.
export function completeRuntimeSessionPolicy(
  policy?: Partial<RuntimeSessionPolicy> | null,
): RuntimeSessionPolicy {
  const resolvedPolicy = mergeDefinedPolicyFields(
    createDefaultRuntimeSessionPolicy(),
    policy,
  );

  if (resolvedPolicy.workspaceAccess === 'read_only') {
    // The runtime currently treats read-only sessions as the default permission gate.
    return {
      ...resolvedPolicy,
      permissionMode: 'default',
    };
  }

  return resolvedPolicy;
}

// Create-time may lift a cwd-backed draft into the "source" workspace mode before
// the completed policy is persisted. Later session-start paths should trust that
// stored policy instead of re-deriving from repoPath.
export function resolveCreateRuntimeSessionPolicy(options: {
  repoPath?: string | null;
  policy?: Partial<RuntimeSessionPolicy> | null;
}): RuntimeSessionPolicy {
  const createDefaults = mergeDefinedPolicyFields(
    createDefaultRuntimeSessionPolicy(),
    {
      // "source" means "cwd-backed workspace" and does not imply git is available.
      workspaceKind: hasRepoPath(options.repoPath) ? 'source' : undefined,
    },
  );

  return completeRuntimeSessionPolicy(
    mergeDefinedPolicyFields(createDefaults, options.policy),
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
    // Read-only currently maps to the runtime's default permission gate.
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
