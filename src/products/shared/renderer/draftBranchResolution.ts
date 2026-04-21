import type { RuntimeSessionPolicy } from '../../../shared/runtimeSessionPolicy.js';
import type { DraftRoomWorkflowShape } from '../../../shared/roomRouting.js';
import type { DraftParallelTarget } from './draftChatUtils.js';

export interface DraftLeadContext {
  composerDraft: string;
  draftCwd: string | null;
  draftRuntimeSessionPolicy: RuntimeSessionPolicy | null;
  draftAudienceKeys: string[] | null;
  draftWorkflowShape: DraftRoomWorkflowShape;
  draftFiles: File[];
}

export interface ResolvedBranch {
  target: DraftParallelTarget;
  effectivePrompt: string;
  effectiveCwd: string | null;
  effectiveSessionPolicy: RuntimeSessionPolicy | null;
  effectiveAudienceKeys: string[];
  effectiveWorkflowShape: DraftRoomWorkflowShape;
  effectiveAttachments: File[];
  isDetached: {
    cwd: boolean;
    sessionPolicy: boolean;
    audienceKeys: boolean;
    workflowShape: boolean;
  };
}

function normalizeAudienceKeys(keys: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(keys) || keys.length === 0) {
    return [];
  }
  return keys.filter((key, index, source) =>
    typeof key === 'string' && key.trim().length > 0 && source.indexOf(key) === index);
}

export function resolveBranchCwd(
  target: DraftParallelTarget,
  lead: DraftLeadContext,
): string | null {
  return target.cwd ?? lead.draftCwd;
}

export function resolveBranchSessionPolicy(
  target: DraftParallelTarget,
  lead: DraftLeadContext,
): RuntimeSessionPolicy | null {
  return target.runtimeSessionPolicy ?? lead.draftRuntimeSessionPolicy;
}

export function resolveBranchAudienceKeys(
  target: DraftParallelTarget,
  lead: DraftLeadContext,
): string[] {
  return normalizeAudienceKeys(target.audienceKeys ?? lead.draftAudienceKeys);
}

export function resolveBranchWorkflowShape(
  target: DraftParallelTarget,
  lead: DraftLeadContext,
): DraftRoomWorkflowShape {
  return target.workflowShape ?? lead.draftWorkflowShape;
}

export function resolveBranchAttachments(
  _target: DraftParallelTarget,
  lead: DraftLeadContext,
): File[] {
  return lead.draftFiles;
}

export function resolveBranch(
  target: DraftParallelTarget,
  lead: DraftLeadContext,
): ResolvedBranch {
  return {
    target,
    effectivePrompt: lead.composerDraft,
    effectiveCwd: resolveBranchCwd(target, lead),
    effectiveSessionPolicy: resolveBranchSessionPolicy(target, lead),
    effectiveAudienceKeys: resolveBranchAudienceKeys(target, lead),
    effectiveWorkflowShape: resolveBranchWorkflowShape(target, lead),
    effectiveAttachments: resolveBranchAttachments(target, lead),
    isDetached: {
      cwd: target.cwd != null,
      sessionPolicy: target.runtimeSessionPolicy != null,
      audienceKeys: target.audienceKeys != null,
      workflowShape: target.workflowShape != null,
    },
  };
}
