import { resolveExecutionTargetLabel } from '../../../../shared/executionLabel.js';
import type { ProviderModelSelection } from '../../../../shared/providerSelection.js';

export interface ExecutionTargetValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
  executionLabel?: string | null;
}

export function buildExecutionTargetLabel(
  value: ExecutionTargetValue,
  catName?: string | null,
  catalogControls?: ReadonlyArray<{
    key: string;
    values?: ReadonlyArray<{ value: string | number | boolean; label: string }>;
  }> | null,
): string {
  const base = resolveExecutionTargetLabel({
    provider: value.provider,
    instance: value.instance,
    model: value.model,
    modelSelection: value.modelSelection ?? null,
    executionLabel: value.executionLabel ?? null,
    catalogControls,
  });
  return catName ? `${catName} \u00b7 ${base}` : base;
}
