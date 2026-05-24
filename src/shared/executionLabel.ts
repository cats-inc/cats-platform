import {
  getDefaultProviderBackend,
  getDefaultProviderInstance,
  getProviderDisplayName,
  getProviderInstances,
  getProviderModels,
  isKnownProvider,
  normalizeProductProviderModelId,
  resolveProductProviderId,
} from './providerCatalog.js';

type ExecutionControlValue = string | number | boolean;
type ExecutionControlMap = Record<string, ExecutionControlValue>;

const executionLabelMemory = new Map<string, string>();

interface ProviderBackendAlias {
  provider: string;
  backendSuffix: string | null;
}

function resolveProviderBackendAlias(provider: string): ProviderBackendAlias {
  const normalizedProvider = provider.trim().toLowerCase();
  if (normalizedProvider.endsWith('-cli')) {
    const baseProvider = normalizedProvider.slice(0, -'-cli'.length);
    if (isKnownProvider(baseProvider)) {
      return {
        provider: baseProvider,
        backendSuffix: '-CLI',
      };
    }
  }

  const resolvedProvider = resolveProductProviderId(normalizedProvider);
  return {
    provider: resolvedProvider ?? provider.trim(),
    backendSuffix: null,
  };
}

function stripExecutionLabelDecorations(
  label: string,
): string {
  return label
    .replace(/\s*\((?:default|recommended)\)\s*/giu, ' ')
    .trim();
}

function resolveBackendSuffixFromBackend(
  backend: string | null | undefined,
): string {
  const normalized = backend?.toLowerCase();
  if (normalized === 'cli') return '-CLI';
  if (normalized === 'agent') return '-AGENT';
  if (normalized === 'api') return '-API';
  if (normalized === 'local') return '-LOCAL';
  return '';
}

function resolveBackendSuffix(
  provider: string,
  instance: string | null | undefined,
): string {
  if (!instance) return '';
  const normalized = instance.toLowerCase();
  if (normalized.startsWith('cli/') || normalized === 'cli') return '-CLI';
  if (normalized.startsWith('agent/') || normalized === 'agent') return '-AGENT';
  if (normalized.startsWith('api/') || normalized === 'api') return '-API';
  if (normalized.startsWith('local/') || normalized === 'local') return '-LOCAL';
  if (normalized === 'default') {
    return resolveBackendSuffixFromBackend(getDefaultProviderBackend(provider));
  }

  const descriptor = getProviderInstances(provider).find((candidate) => candidate.id === instance);
  const backendSuffix = resolveBackendSuffixFromBackend(descriptor?.backend);
  if (backendSuffix) return backendSuffix;

  const target = descriptor?.target?.toLowerCase();
  if (target?.startsWith('cli/')) return '-CLI';
  if (target?.startsWith('agent/')) return '-AGENT';
  if (target?.startsWith('api/')) return '-API';
  if (target?.startsWith('local/')) return '-LOCAL';
  return '';
}

function resolveModelLabel(provider: string, model: string | null | undefined): string | null {
  if (!model) return null;
  const normalizedModel = normalizeProductProviderModelId(provider, model) ?? model;
  const catalogLabel = getProviderModels(provider).find((m) => m.value === normalizedModel)?.label;
  const fallbackLabel = provider === 'claude'
    && (normalizedModel === 'opus' || normalizedModel === 'sonnet' || normalizedModel === 'haiku')
    ? normalizedModel.charAt(0).toUpperCase() + normalizedModel.slice(1)
    : normalizedModel;
  return stripExecutionLabelDecorations(catalogLabel ?? fallbackLabel);
}

function normalizeExecutionModelLabel(
  label: string | null | undefined,
): string | null {
  const trimmed = label?.trim();
  if (!trimmed) {
    return null;
  }

  return stripExecutionLabelDecorations(trimmed);
}

function normalizeRememberedExecutionLabel(
  label: string | null | undefined,
): string | null {
  const trimmed = label?.trim();
  return trimmed ? stripExecutionLabelDecorations(trimmed) : null;
}

function serializeExecutionControlValue(
  value: ExecutionControlValue,
): string {
  return JSON.stringify([typeof value, value]);
}

function serializeExecutionControls(
  controls: ExecutionControlMap | null | undefined,
): string {
  if (!controls) {
    return '';
  }

  const normalizedEntries = Object.entries(controls)
    .filter(([, value]) => value !== '' && value !== false)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => [key, serializeExecutionControlValue(value)] as const);
  return normalizedEntries.length > 0 ? JSON.stringify(normalizedEntries) : '';
}

function buildExecutionLabelMemoryKey(input: {
  provider: string;
  instance: string | null | undefined;
  model: string | null | undefined;
  controls?: ExecutionControlMap | null;
}): string {
  const normalizedProvider =
    resolveProductProviderId(input.provider) ?? input.provider.trim().toLowerCase();
  const normalizedInstance = (
    input.instance?.trim()
    || getDefaultProviderInstance(input.provider)
    || ''
  ).toLowerCase();
  const normalizedModel = (
    normalizeProductProviderModelId(input.provider, input.model)
    ?? input.model?.trim()
    ?? ''
  ).toLowerCase();
  return JSON.stringify([
    normalizedProvider,
    normalizedInstance,
    normalizedModel,
    serializeExecutionControls(input.controls),
  ]);
}

export function clearRememberedExecutionLabels(): void {
  executionLabelMemory.clear();
}

export function peekRememberedExecutionLabel(input: {
  provider: string;
  instance: string | null | undefined;
  model: string | null | undefined;
  modelSelection?: { controls?: ExecutionControlMap | null } | null;
}): string | null {
  return readRememberedExecutionLabel(input);
}

export function rememberExecutionLabel(input: {
  provider: string;
  instance: string | null | undefined;
  model: string | null | undefined;
  modelSelection?: { controls?: ExecutionControlMap | null } | null;
  executionLabel: string | null | undefined;
}): string | null {
  const resolvedExecutionLabel = normalizeRememberedExecutionLabel(input.executionLabel);
  if (!resolvedExecutionLabel) {
    return null;
  }

  executionLabelMemory.set(
    buildExecutionLabelMemoryKey({
      provider: input.provider,
      instance: input.instance,
      model: input.model,
      controls: input.modelSelection?.controls ?? null,
    }),
    resolvedExecutionLabel,
  );
  return resolvedExecutionLabel;
}

function readRememberedExecutionLabel(input: {
  provider: string;
  instance: string | null | undefined;
  model: string | null | undefined;
  modelSelection?: { controls?: ExecutionControlMap | null } | null;
}): string | null {
  return executionLabelMemory.get(
    buildExecutionLabelMemoryKey({
      provider: input.provider,
      instance: input.instance,
      model: input.model,
      controls: input.modelSelection?.controls ?? null,
    }),
  ) ?? null;
}

const KNOWN_CONTROL_VALUE_LABELS: Record<string, string> = {
  max: 'Max',
  xhigh: 'xHigh',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

function formatFallbackControlValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') return String(value);
  return KNOWN_CONTROL_VALUE_LABELS[value]
    ?? value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveControlDisplayLabels(
  controls: Record<string, string | number | boolean> | null | undefined,
  catalogControls?: ReadonlyArray<{ key: string; values?: ReadonlyArray<{ value: string | number | boolean; label: string }> }> | null,
): string[] {
  if (!controls) return [];
  const catalogMap = new Map(
    (catalogControls ?? []).map((c) => [c.key, c]),
  );
  return Object.entries(controls)
    .filter(([, value]) => value !== '' && value !== false)
    .map(([key, value]) => {
      const catalog = catalogMap.get(key);
      const match = catalog?.values?.find((v) => v.value === value);
      return stripExecutionLabelDecorations(match?.label ?? formatFallbackControlValue(value));
    })
    .filter((label) => label.length > 0);
}

export function buildExecutionLabel(
  provider: string,
  instance: string | null | undefined,
  model: string | null | undefined,
  providerLabel?: string | null,
  controlLabels?: readonly string[] | null,
  modelLabelOverride?: string | null,
): string {
  const providerAlias = resolveProviderBackendAlias(provider);
  const providerName = providerLabel?.trim() || getProviderDisplayName(providerAlias.provider);
  const effectiveInstance = instance?.trim() || getDefaultProviderInstance(providerAlias.provider);
  const suffix = providerAlias.backendSuffix
    ?? resolveBackendSuffix(providerAlias.provider, effectiveInstance);
  const modelLabel = normalizeExecutionModelLabel(modelLabelOverride)
    ?? resolveModelLabel(providerAlias.provider, model);
  const controlsSuffix = controlLabels && controlLabels.length > 0
    ? ` \u00b7 ${controlLabels.join(' \u00b7 ')}`
    : '';
  return providerName + suffix + (modelLabel ? ` \u00b7 ${modelLabel}` : '') + controlsSuffix;
}

export function resolveExecutionTargetLabel(input: {
  provider: string;
  instance: string | null | undefined;
  model: string | null | undefined;
  modelSelection?: { controls?: ExecutionControlMap | null } | null;
  executionLabel?: string | null;
  providerLabel?: string | null;
  controlLabels?: readonly string[] | null;
  catalogControls?: ReadonlyArray<{
    key: string;
    values?: ReadonlyArray<{ value: ExecutionControlValue; label: string }>;
  }> | null;
  modelLabelOverride?: string | null;
}): string {
  const explicitExecutionLabel = rememberExecutionLabel({
    provider: input.provider,
    instance: input.instance,
    model: input.model,
    modelSelection: input.modelSelection ?? null,
    executionLabel: input.executionLabel ?? null,
  });
  if (explicitExecutionLabel) {
    return explicitExecutionLabel;
  }

  const rememberedExecutionLabel = readRememberedExecutionLabel({
    provider: input.provider,
    instance: input.instance,
    model: input.model,
    modelSelection: input.modelSelection ?? null,
  });
  if (rememberedExecutionLabel) {
    return rememberedExecutionLabel;
  }

  const controlLabels = input.controlLabels
    ?? resolveControlDisplayLabels(input.modelSelection?.controls, input.catalogControls);
  return buildExecutionLabel(
    input.provider,
    input.instance,
    input.model,
    input.providerLabel,
    controlLabels,
    input.modelLabelOverride,
  );
}

export function buildCatExecutionLabel(cat: {
  defaultExecutionTarget: { provider: string; instance?: string | null; model?: string | null };
  defaultModelSelection?: { controls?: ExecutionControlMap | null } | null;
  executionLabel?: string | null;
}): string {
  const target = cat.defaultExecutionTarget;
  return resolveExecutionTargetLabel({
    provider: target.provider,
    instance: target.instance ?? null,
    model: target.model ?? null,
    modelSelection: cat.defaultModelSelection ?? null,
    executionLabel: cat.executionLabel ?? null,
  });
}

export function buildParticipantExecutionLabel(participant: {
  execution?: {
    target: { provider: string; instance?: string | null; model?: string | null };
    modelSelection?: { controls?: ExecutionControlMap | null } | null;
  } | null;
  executionLabel?: string | null;
}): string | null {
  const target = participant.execution?.target;
  if (!target?.provider) {
    return normalizeRememberedExecutionLabel(participant.executionLabel);
  }

  return resolveExecutionTargetLabel({
    provider: target.provider,
    instance: target.instance ?? null,
    model: target.model ?? null,
    modelSelection: participant.execution?.modelSelection ?? null,
    executionLabel: participant.executionLabel ?? null,
  });
}

export function buildCatTooltip(
  catName: string,
  executionLabel: string | null | undefined,
): string {
  return executionLabel ? `${catName} \u00b7 ${executionLabel}` : catName;
}
