import type { SessionExecutionPolicy } from '../../../shared/providerInteractions.js';

/**
 * SPEC-123 CAP-08: a Cat may start a dev preview only when its session can
 * already run shell commands, because a dev server runs the same workspace
 * code with the same privileges.
 */

export interface CodeSessionPermissionPosture {
  workspaceAccess?: string | null;
  permissionMode?: string | null;
  /** Provider tools a `whitelist` session may use. */
  allowedTools?: readonly string[] | null;
  /**
   * A provider execution policy. When present it replaces the permission mode: the Runtime
   * client sends no permission mode with it.
   */
  executionPolicy?: SessionExecutionPolicy | null;
}

const SHELL_TOOL = /^(bash|shell|powershell|local_shell|exec_command|run_shell_command|terminal)(\(|$)/iu;

export function hasShellExecutionPermission(posture: CodeSessionPermissionPosture): boolean {
  if (posture.workspaceAccess === 'read_only') return false;
  const policy = posture.executionPolicy;
  if (policy) {
    // A dev preview runs the workspace's commands in Platform's own process, outside the
    // provider's sandbox and approvals. So only a policy under which the Cat itself runs
    // commands unattended, with write access and network, allows one. A `provider` policy
    // leaves approvals to the provider, so Platform cannot know they are off.
    return policy.mode === 'explicit'
      && policy.access !== 'read-only'
      && policy.network
      && policy.approval === 'never';
  }
  if (posture.permissionMode === 'default') return false;
  if (posture.permissionMode === 'whitelist') {
    return (posture.allowedTools ?? []).some((tool) => SHELL_TOOL.test(tool.trim()));
  }
  // `skip`, or unset: the Runtime client sends `skip` for read-write sessions.
  return true;
}
