export type RuntimeWorkspaceKind = 'source' | 'sandbox' | 'worktree';
export type RuntimeWorkspaceAccess = 'read_write' | 'read_only';
export type RuntimePermissionMode = 'skip' | 'default' | 'whitelist';

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

export function createDefaultRuntimeSessionPolicy(): RuntimeSessionPolicy {
  return {
    workspaceKind: 'sandbox',
    workspaceAccess: 'read_write',
    permissionMode: 'skip',
  };
}

export function completeRuntimeSessionPolicy(
  policy?: Partial<RuntimeSessionPolicy> | null,
): RuntimeSessionPolicy {
  const resolvedPolicy = {
    ...createDefaultRuntimeSessionPolicy(),
    ...(policy ?? {}),
  };

  if (resolvedPolicy.workspaceAccess === 'read_only') {
    // The runtime currently treats read-only sessions as the default permission gate.
    return {
      ...resolvedPolicy,
      permissionMode: 'default',
    };
  }

  return resolvedPolicy;
}

export function resolveCreateRuntimeSessionPolicy(options: {
  repoPath?: string | null;
  policy?: Partial<RuntimeSessionPolicy> | null;
}): RuntimeSessionPolicy {
  return completeRuntimeSessionPolicy({
    // "source" means "cwd-backed workspace" and does not imply git is available.
    workspaceKind: hasRepoPath(options.repoPath) ? 'source' : undefined,
    ...(options.policy ?? {}),
  });
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
