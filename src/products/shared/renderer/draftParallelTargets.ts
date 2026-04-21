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

function normalizeDraftParallelTarget<TTarget extends object>(
  target: TTarget & DraftParallelTargetBranchFields,
): TTarget & DraftParallelTargetBranchFields {
  const audienceKeys = normalizeAudienceKeys(target.audienceKeys);
  const workflowShape = target.workflowShape ?? 'sequential';
  return syncTargetBranchFields(target, audienceKeys, workflowShape);
}

export function createDraftParallelTargets<TTarget extends object>(
  targets: readonly TTarget[],
  options: {
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  } = {},
): Array<TTarget & DraftParallelTargetBranchFields> {
  const audienceKeys = normalizeAudienceKeys(options.seedAudienceKeys);
  const workflowShape = options.seedWorkflowShape ?? 'sequential';

  return targets.map((target) => createDraftParallelTarget(target, {
    audienceKeys,
    workflowShape,
  }));
}

export function createDraftParallelTarget<TTarget extends object>(
  target: TTarget,
  options: {
    audienceKeys?: readonly string[] | null;
    workflowShape?: DraftRoomWorkflowShape;
  } = {},
): TTarget & DraftParallelTargetBranchFields {
  const audienceKeys = normalizeAudienceKeys(options.audienceKeys);
  const workflowShape = options.workflowShape ?? 'sequential';
  return syncTargetBranchFields(target, audienceKeys, workflowShape);
}

export function updateDraftParallelTargetAt<TTarget extends object>(
  targets: readonly (TTarget & DraftParallelTargetBranchFields)[],
  index: number,
  updater: (
    target: TTarget & DraftParallelTargetBranchFields,
  ) => TTarget & DraftParallelTargetBranchFields,
): Array<TTarget & DraftParallelTargetBranchFields> {
  return targets.map((target, currentIndex) =>
    currentIndex === index ? normalizeDraftParallelTarget(updater(target)) : target);
}

export function setDraftParallelTargetCwd<TTarget extends object>(
  targets: readonly (TTarget & DraftParallelTargetBranchFields)[],
  index: number,
  cwd: string | null,
): Array<TTarget & DraftParallelTargetBranchFields> {
  return updateDraftParallelTargetAt(targets, index, (target) => ({
    ...target,
    cwd,
  }));
}

export function setDraftParallelTargetRuntimeSessionPolicy<TTarget extends object>(
  targets: readonly (TTarget & DraftParallelTargetBranchFields)[],
  index: number,
  runtimeSessionPolicy: RuntimeSessionPolicy | null,
): Array<TTarget & DraftParallelTargetBranchFields> {
  return updateDraftParallelTargetAt(targets, index, (target) => ({
    ...target,
    runtimeSessionPolicy,
  }));
}
