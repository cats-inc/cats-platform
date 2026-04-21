import { resolveExecutionTargetLabel } from '../../../../shared/executionLabel.js';
import {
  getProviderDisplayName,
  getProviderModels,
  normalizeProductProviderModelId,
} from '../../../../shared/providerCatalog.js';
import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../../../shared/providerSelection.js';

export interface ExecutionTargetValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
  executionLabel?: string | null;
}

export interface ExecutionTargetSummary {
  label: string;
  providerLabel: string;
  instanceLabel: string | null;
  modelLabel: string;
}

function stripExecutionTargetModelDecorations(label: string): string {
  return label
    .replace(/\s*\((?:default|recommended)\)\s*/giu, ' ')
    .trim();
}

function resolveExecutionTargetModelLabel(value: ExecutionTargetValue): string {
  const model = value.model?.trim();
  if (!model) {
    return 'default';
  }

  const normalizedModel = normalizeProductProviderModelId(value.provider, model) ?? model;
  const catalogLabel = getProviderModels(value.provider)
    .find((option) => option.value === normalizedModel)?.label;
  return stripExecutionTargetModelDecorations(catalogLabel ?? normalizedModel);
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

export function buildExecutionTargetSummary(
  value: ExecutionTargetValue,
  catalogControls?: ReadonlyArray<{
    key: string;
    values?: ReadonlyArray<{ value: string | number | boolean; label: string }>;
  }> | null,
): ExecutionTargetSummary {
  return {
    label: buildExecutionTargetLabel(value, null, catalogControls),
    providerLabel: getProviderDisplayName(value.provider),
    instanceLabel: value.instance?.trim() || null,
    modelLabel: resolveExecutionTargetModelLabel(value),
  };
}

export function createExecutionTargetValueFromProviderSelection(
  target: ProviderTargetSelection,
): ExecutionTargetValue {
  return {
    provider: target.provider,
    model: target.model || null,
    instance: target.instance || null,
    modelSelection: target.modelSelection ?? null,
    executionLabel: target.executionLabel ?? null,
  };
}
