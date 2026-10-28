import type { RuntimeWorkspaceAccess } from '../../../../shared/runtimeSessionPolicy.js';
import { resolveDraftPermissionModeFromRuntimeAccess } from '../../../../shared/runtimeSessionPolicy.js';
import type { SessionExecutionPolicy } from '../../../../shared/providerInteractions.js';
import {
  DEFAULT_PERMISSION_MODE,
  PermissionModeChip,
} from './PermissionModeChip.js';

interface Props {
  channel: {
    repoPath?: string | null;
    chatCwd?: string | null;
    runtimeWorkspaceAccess?: RuntimeWorkspaceAccess | null;
    runtimeExecutionPolicy?: SessionExecutionPolicy | null;
  };
}

export function ActiveSessionPermissionChip({ channel }: Props) {
  const cwd = channel.repoPath ?? channel.chatCwd ?? null;
  if (!cwd) {
    return null;
  }

  const permissionMode = channel.runtimeWorkspaceAccess
    ? resolveDraftPermissionModeFromRuntimeAccess(channel.runtimeWorkspaceAccess)
    : DEFAULT_PERMISSION_MODE;

  return <PermissionModeChip value={permissionMode} executionPolicy={channel.runtimeExecutionPolicy} onChange={() => {}} disabled />;
}
