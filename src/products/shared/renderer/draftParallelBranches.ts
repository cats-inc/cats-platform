import type { DraftRoomWorkflowShape } from '../../../shared/roomRouting.js';
import type { RuntimeSessionPolicy } from '../../../shared/runtimeSessionPolicy.js';
import type { DraftAttachmentRef } from './draftChatUtils.js';

export interface DraftParallelTargetBranchFields {
  cwd?: string | null;
  runtimeSessionPolicy?: RuntimeSessionPolicy | null;
  audienceKeys?: string[] | null;
  workflowShape?: DraftRoomWorkflowShape | null;
  attachmentsOverride?: DraftAttachmentRef[] | null;
}

export interface DraftParallelBranchState<TTarget extends object> {
  target: TTarget & DraftParallelTargetBranchFields;
}

function normalizeAudienceKeys(
  audienceKeys: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(audienceKeys) || audienceKeys.length === 0) {
    return [];
  }

  return audienceKeys.filter((key, index, source) =>
    typeof key === 'string' && key.trim().length > 0 && source.indexOf(key) === index);
}

function syncTargetBranchFields<TTarget extends object>(
  target: TTarget,
  audienceKeys: readonly string[],
  workflowShape: DraftRoomWorkflowShape,
): TTarget & DraftParallelTargetBranchFields {
  return {
    ...target,
    audienceKeys: [...audienceKeys],
    workflowShape,
  };
}

export function mergeDraftParallelTargetBranchFields<TTarget extends object>(
  target: TTarget,
  currentFields: DraftParallelTargetBranchFields,
): TTarget & DraftParallelTargetBranchFields {
  return {
    ...target,
    audienceKeys: normalizeAudienceKeys(currentFields.audienceKeys),
    workflowShape: currentFields.workflowShape ?? 'sequential',
    ...(currentFields.cwd === undefined ? {} : { cwd: currentFields.cwd }),
    ...(currentFields.runtimeSessionPolicy === undefined
      ? {}
      : { runtimeSessionPolicy: currentFields.runtimeSessionPolicy }),
    ...(currentFields.attachmentsOverride === undefined
      ? {}
      : { attachmentsOverride: currentFields.attachmentsOverride }),
  };
}

function normalizeDraftParallelBranch<TTarget extends object>(
  branch: DraftParallelBranchState<TTarget>,
): DraftParallelBranchState<TTarget> {
  const audienceKeys = normalizeAudienceKeys(branch.target.audienceKeys);
  const workflowShape = branch.target.workflowShape ?? 'sequential';
  return {
    target: syncTargetBranchFields(branch.target, audienceKeys, workflowShape),
  };
}

export function createDraftParallelBranches<TTarget extends object>(
  targets: readonly TTarget[],
  options: {
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  } = {},
): DraftParallelBranchState<TTarget>[] {
  const audienceKeys = normalizeAudienceKeys(options.seedAudienceKeys);
  const workflowShape = options.seedWorkflowShape ?? 'sequential';

  return targets.map((target) => createDraftParallelBranch(target, {
    audienceKeys,
    workflowShape,
  }));
}

export function createDraftParallelBranch<TTarget extends object>(
  target: TTarget,
  options: {
    audienceKeys?: readonly string[] | null;
    workflowShape?: DraftRoomWorkflowShape;
  } = {},
): DraftParallelBranchState<TTarget> {
  const audienceKeys = normalizeAudienceKeys(options.audienceKeys);
  const workflowShape = options.workflowShape ?? 'sequential';
  return {
    target: syncTargetBranchFields(target, audienceKeys, workflowShape),
  };
}

export function updateDraftParallelBranchAt<TTarget extends object>(
  branches: readonly DraftParallelBranchState<TTarget>[],
  index: number,
  updater: (branch: DraftParallelBranchState<TTarget>) => DraftParallelBranchState<TTarget>,
): DraftParallelBranchState<TTarget>[] {
  return branches.map((branch, currentIndex) =>
    currentIndex === index ? normalizeDraftParallelBranch(updater(branch)) : branch);
}
