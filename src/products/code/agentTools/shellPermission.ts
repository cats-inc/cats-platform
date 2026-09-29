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
}

const SHELL_TOOL = /^(bash|shell|powershell|local_shell|exec_command|run_shell_command|terminal)(\(|$)/iu;

export function hasShellExecutionPermission(posture: CodeSessionPermissionPosture): boolean {
  if (posture.workspaceAccess === 'read_only') return false;
  if (posture.permissionMode === 'default') return false;
  if (posture.permissionMode === 'whitelist') {
    return (posture.allowedTools ?? []).some((tool) => SHELL_TOOL.test(tool.trim()));
  }
  // `skip`, or unset: the Runtime client sends `skip` for read-write sessions.
  return true;
}
