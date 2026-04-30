import type {
  RuntimeWorkspaceAccess,
  RuntimeWorkspaceKind,
} from '../../../../shared/runtimeSessionPolicy.js';
import {
  DEFAULT_PERMISSION_MODE,
  PermissionModeChip,
} from '../../../shared/renderer/components/PermissionModeChip.js';
import {
  DEFAULT_WORKSPACE_MODE,
  WorkspaceModeChip,
} from '../../../shared/renderer/components/WorkspaceModeChip.js';
import {
  resolveDraftPermissionModeFromRuntimeAccess,
  resolveDraftWorkspaceModeFromRuntimeKind,
} from '../../../../shared/runtimeSessionPolicy.js';
import { useCodeRepoProbe } from '../hooks/useCodeRepoProbe.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

interface Props {
  channel: {
    repoPath?: string | null;
    chatCwd?: string | null;
    runtimeWorkspaceAccess?: RuntimeWorkspaceAccess | null;
    runtimeWorkspaceKind?: RuntimeWorkspaceKind | null;
  };
  placement?: 'where' | 'permission';
}

export function ActiveCodeComposerChips({ channel, placement = 'permission' }: Props) {
  const cwd = channel.repoPath ?? channel.chatCwd ?? null;
  const probe = useCodeRepoProbe(cwd);
  const { t } = useI18n();

  if (!cwd) {
    return null;
  }

  if (placement === 'permission') {
    const permissionMode = channel.runtimeWorkspaceAccess
      ? resolveDraftPermissionModeFromRuntimeAccess(channel.runtimeWorkspaceAccess)
      : DEFAULT_PERMISSION_MODE;
    const noop = () => {};
    return <PermissionModeChip value={permissionMode} onChange={noop} disabled />;
  }

  const repoReady = Boolean(probe.isRepo && probe.repoRoot);
  if (!repoReady) {
    return null;
  }
  const branchLabel = probe.branch ?? t(messageKeys.codeActiveComposerDetachedBranch);
  const workspaceMode = channel.runtimeWorkspaceKind
    ? resolveDraftWorkspaceModeFromRuntimeKind(channel.runtimeWorkspaceKind)
    : DEFAULT_WORKSPACE_MODE;
  const noop = () => {};
  return (
    <>
      <span className="composerBranchChip">
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="4" cy="4" r="1.6" />
          <circle cx="12" cy="4" r="1.6" />
          <circle cx="4" cy="12" r="1.6" />
          <path d="M4 5.6v4.8" />
          <path d="M12 5.6v2.4a2 2 0 0 1-2 2H6" />
        </svg>
        <span>{branchLabel}</span>
      </span>
      <WorkspaceModeChip value={workspaceMode} onChange={noop} disabled />
    </>
  );
}
