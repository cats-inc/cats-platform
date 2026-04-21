import { useEffect, type ReactNode } from 'react';

import {
  PermissionModeChip,
  type PermissionMode,
} from '../components/PermissionModeChip.js';
import {
  DEFAULT_WORKSPACE_MODE,
  WorkspaceModeChip,
  type WorkspaceMode,
} from '../components/WorkspaceModeChip.js';
import { isComposerBusyForDraft } from '../../../../shared/composer.js';
import {
  completeRuntimeSessionPolicy,
  createDefaultRuntimeSessionPolicy,
  resolveCreateRuntimeSessionPolicy,
  resolveDraftPermissionModeFromRuntimeAccess,
  resolveDraftWorkspaceModeFromRuntimeKind,
  resolveRuntimePermissionPolicyFromDraft,
  resolveRuntimeWorkspaceKindFromDraft,
  type RuntimeSessionPolicy,
  type RuntimeSessionPolicyInput,
} from '../../../../shared/runtimeSessionPolicy.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import { useRepoProbe } from './useRepoProbe.js';

export interface UseDraftSessionChipsInput {
  draftCwd: string | null;
  busy: WorkspaceBusyState;
  draftRuntimeSessionPolicy?: RuntimeSessionPolicy | null;
  onDraftRuntimeSessionPolicyChange?: (policy: RuntimeSessionPolicy) => void;
}

export interface DraftSessionChips {
  permissionChip: ReactNode;
  whereExtras: ReactNode;
}

export function useDraftSessionChips(input: UseDraftSessionChipsInput): DraftSessionChips {
  const { draftCwd, busy, draftRuntimeSessionPolicy, onDraftRuntimeSessionPolicyChange } = input;
  const { isRepo, repoRoot, branch } = useRepoProbe(draftCwd);
  const defaultSessionPolicy = createDefaultRuntimeSessionPolicy();
  const currentSessionPolicy = resolveCreateRuntimeSessionPolicy({
    repoPath: draftCwd,
    policy: draftRuntimeSessionPolicy ?? defaultSessionPolicy,
  });
  const workspaceMode: WorkspaceMode = draftCwd
    ? resolveDraftWorkspaceModeFromRuntimeKind(currentSessionPolicy.workspaceKind)
    : DEFAULT_WORKSPACE_MODE;
  const permissionMode: PermissionMode = resolveDraftPermissionModeFromRuntimeAccess(
    currentSessionPolicy.workspaceAccess,
  );
  const isSubmittingFirstTurn = isComposerBusyForDraft(busy);
  const branchLabel = branch ?? 'detached';
  const repoReady = Boolean(isRepo && repoRoot);
  const resolvedRuntimeWorkspaceKind = resolveRuntimeWorkspaceKindFromDraft({
    hasCwd: Boolean(draftCwd),
    isRepo: repoReady,
    workspaceMode,
  });

  useEffect(() => {
    if (!onDraftRuntimeSessionPolicyChange) {
      return;
    }
    if (currentSessionPolicy.workspaceKind === resolvedRuntimeWorkspaceKind) {
      return;
    }
    onDraftRuntimeSessionPolicyChange(
      completeRuntimeSessionPolicy({
        workspaceKind: resolvedRuntimeWorkspaceKind,
        workspaceAccess: currentSessionPolicy.workspaceAccess,
        permissionMode: currentSessionPolicy.permissionMode,
      }),
    );
  }, [
    currentSessionPolicy.permissionMode,
    currentSessionPolicy.workspaceAccess,
    currentSessionPolicy.workspaceKind,
    onDraftRuntimeSessionPolicyChange,
    resolvedRuntimeWorkspaceKind,
  ]);

  function updateSessionPolicy(patch: RuntimeSessionPolicyInput): void {
    if (!onDraftRuntimeSessionPolicyChange) {
      return;
    }
    onDraftRuntimeSessionPolicyChange(
      completeRuntimeSessionPolicy({
        workspaceKind: currentSessionPolicy.workspaceKind,
        workspaceAccess: currentSessionPolicy.workspaceAccess,
        permissionMode: currentSessionPolicy.permissionMode,
        ...patch,
      }),
    );
  }

  const permissionChip = draftCwd ? (
    <PermissionModeChip
      value={permissionMode}
      onChange={(nextMode) => {
        updateSessionPolicy(resolveRuntimePermissionPolicyFromDraft(nextMode));
      }}
      disabled={isSubmittingFirstTurn}
    />
  ) : null;

  const whereExtras = draftCwd && repoReady ? (
    <>
      <span className="composerBranchChip">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="4" r="1.6" />
          <circle cx="12" cy="4" r="1.6" />
          <circle cx="4" cy="12" r="1.6" />
          <path d="M4 5.6v4.8" />
          <path d="M12 5.6v2.4a2 2 0 0 1-2 2H6" />
        </svg>
        <span>{branchLabel}</span>
      </span>
      <WorkspaceModeChip
        value={workspaceMode}
        onChange={(nextMode) => {
          updateSessionPolicy({
            workspaceKind: resolveRuntimeWorkspaceKindFromDraft({
              hasCwd: Boolean(draftCwd),
              isRepo: Boolean(repoReady),
              workspaceMode: nextMode,
            }),
          });
        }}
        disabled={isSubmittingFirstTurn}
      />
    </>
  ) : null;

  return { permissionChip, whereExtras };
}
