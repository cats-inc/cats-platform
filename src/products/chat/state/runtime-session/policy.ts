import type { ChatChannelState } from '../../api/contracts.js';
import type { RuntimeSessionCreateInput } from '../../../../runtime/client.js';

import { resolveChannelSpawnCwd } from '../workspace.js';

export interface ResolvedChannelRuntimeSessionPolicy {
  spawnCwd: string | null;
  workspaceKind: NonNullable<RuntimeSessionCreateInput['workspaceKind']>;
  workspaceAccess: NonNullable<RuntimeSessionCreateInput['workspaceAccess']>;
  permissionMode: NonNullable<RuntimeSessionCreateInput['permissionMode']>;
}

export function resolveChannelRuntimeSessionPolicy(
  channel: Pick<
    ChatChannelState,
    | 'repoPath'
    | 'chatCwd'
    | 'runtimeWorkspaceKind'
    | 'runtimeWorkspaceAccess'
    | 'runtimePermissionMode'
  >,
): ResolvedChannelRuntimeSessionPolicy {
  const spawnCwd = resolveChannelSpawnCwd(channel.repoPath, channel.chatCwd);
  const workspaceKind = spawnCwd
    ? channel.runtimeWorkspaceKind === 'worktree'
      ? 'worktree'
      : 'source'
    : 'sandbox';
  const workspaceAccess = channel.runtimeWorkspaceAccess === 'read_only'
    ? 'read_only'
    : 'read_write';
  const permissionMode = workspaceAccess === 'read_only'
    ? 'default'
    : channel.runtimePermissionMode === 'whitelist'
      ? 'whitelist'
      : 'skip';

  return {
    spawnCwd,
    workspaceKind,
    workspaceAccess,
    permissionMode,
  };
}
