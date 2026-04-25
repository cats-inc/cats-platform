import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import {
  cloneProviderModelSelection,
  createExplicitProviderModelSelection,
} from '../../../shared/providerSelection.js';

export interface PendingExecutionTargetState {
  pendingProvider: string | null;
  pendingModel: string | null;
  pendingInstance: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
}

export interface PendingExecutionTargetPatch {
  pendingProvider?: string | null;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
}

export interface ResolvedPendingExecutionTarget {
  provider: string | null;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

function normalizePendingTargetValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function hasPendingExecutionTargetPatch(patch: PendingExecutionTargetPatch): boolean {
  return patch.pendingProvider !== undefined
    || patch.pendingModel !== undefined
    || patch.pendingInstance !== undefined
    || patch.pendingModelSelection !== undefined;
}

export function resolveNextPendingExecutionTarget(
  current: PendingExecutionTargetState,
  patch: PendingExecutionTargetPatch,
): ResolvedPendingExecutionTarget {
  const provider = patch.pendingProvider === undefined
    ? current.pendingProvider
    : normalizePendingTargetValue(patch.pendingProvider);
  const model = patch.pendingModel === undefined
    ? current.pendingModel
    : normalizePendingTargetValue(patch.pendingModel);
  const instance = patch.pendingInstance === undefined
    ? current.pendingInstance
    : normalizePendingTargetValue(patch.pendingInstance);
  const modelSelection = patch.pendingModelSelection !== undefined
    ? cloneProviderModelSelection(patch.pendingModelSelection)
      ?? createExplicitProviderModelSelection(model)
    : patch.pendingModel !== undefined
      ? createExplicitProviderModelSelection(model)
      : cloneProviderModelSelection(current.pendingModelSelection);

  return {
    provider,
    model,
    instance,
    modelSelection,
  };
}
