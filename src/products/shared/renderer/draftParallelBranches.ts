import type { DraftRoomWorkflowShape } from '../../../shared/roomRouting.js';

export interface DraftParallelBranchState<TTarget> {
  target: TTarget;
  audienceKeys: string[];
  workflowShape: DraftRoomWorkflowShape;
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

export function createDraftParallelBranches<TTarget>(
  targets: readonly TTarget[],
  options: {
    seedAudienceKeys?: readonly string[] | null;
    seedWorkflowShape?: DraftRoomWorkflowShape;
  } = {},
): DraftParallelBranchState<TTarget>[] {
  const audienceKeys = normalizeAudienceKeys(options.seedAudienceKeys);
  const workflowShape = options.seedWorkflowShape ?? 'sequential';

  return targets.map((target) => ({
    target,
    audienceKeys: [...audienceKeys],
    workflowShape,
  }));
}

export function updateDraftParallelBranchAt<TTarget>(
  branches: readonly DraftParallelBranchState<TTarget>[],
  index: number,
  updater: (branch: DraftParallelBranchState<TTarget>) => DraftParallelBranchState<TTarget>,
): DraftParallelBranchState<TTarget>[] {
  return branches.map((branch, currentIndex) =>
    currentIndex === index ? updater(branch) : branch);
}

