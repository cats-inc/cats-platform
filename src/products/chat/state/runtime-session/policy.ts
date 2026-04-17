import type { ChatChannelState } from '../../api/contracts.js';
import type { RuntimeSessionCreateInput } from '../../../../runtime/client.js';
import { completeRuntimeSessionPolicy } from '../../../../shared/runtimeSessionPolicy.js';

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
  // Session-start trusts the persisted runtime policy. repoPath only decides
  // where the runtime should spawn, not which workspace policy to infer.
  const storedPolicy = completeRuntimeSessionPolicy({
    workspaceKind: channel.runtimeWorkspaceKind ?? undefined,
    workspaceAccess: channel.runtimeWorkspaceAccess ?? undefined,
    permissionMode: channel.runtimePermissionMode ?? undefined,
  });

  return {
    spawnCwd,
    workspaceKind: storedPolicy.workspaceKind,
    workspaceAccess: storedPolicy.workspaceAccess,
    permissionMode: storedPolicy.permissionMode,
  };
}
