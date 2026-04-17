import { useEffect } from 'react';

import {
  completeRuntimeSessionPolicy,
  type RuntimeSessionPolicy,
  type RuntimeWorkspaceKind,
} from '../../../../shared/runtimeSessionPolicy.js';

/**
 * +New code only exposes cwd-backed workspace modes once a folder is selected.
 * This hook keeps the stored runtime policy's `workspaceKind` aligned with the
 * kind derived from the current cwd + workspaceMode selection, so downstream
 * create/runtime layers can trust the persisted value instead of re-deriving
 * from repoPath.
 */
export function useSyncRuntimeWorkspaceKindWithCwd(options: {
  currentSessionPolicy: RuntimeSessionPolicy;
  resolvedRuntimeWorkspaceKind: RuntimeWorkspaceKind;
  onChange: ((policy: RuntimeSessionPolicy) => void) | undefined;
}): void {
  const { currentSessionPolicy, resolvedRuntimeWorkspaceKind, onChange } = options;

  useEffect(() => {
    if (!onChange) {
      return;
    }
    if (currentSessionPolicy.workspaceKind === resolvedRuntimeWorkspaceKind) {
      return;
    }
    onChange(completeRuntimeSessionPolicy({
      workspaceKind: resolvedRuntimeWorkspaceKind,
      workspaceAccess: currentSessionPolicy.workspaceAccess,
      permissionMode: currentSessionPolicy.permissionMode,
    }));
  }, [
    currentSessionPolicy.permissionMode,
    currentSessionPolicy.workspaceAccess,
    currentSessionPolicy.workspaceKind,
    onChange,
    resolvedRuntimeWorkspaceKind,
  ]);
}
