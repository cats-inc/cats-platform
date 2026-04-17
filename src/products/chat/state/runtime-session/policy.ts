import type { ChatChannelState } from '../../api/contracts.js';
import {
  completeRuntimeSessionPolicy,
  type RuntimeSessionPolicy,
} from '../../../../shared/runtimeSessionPolicy.js';

import { resolveChannelSpawnCwd } from '../workspace.js';

export type ResolvedChannelRuntimeSessionPolicy = RuntimeSessionPolicy & {
  spawnCwd: string | null;
};

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

  return { spawnCwd, ...storedPolicy };
}
