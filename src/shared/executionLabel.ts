import {
  getDefaultProviderBackend,
  getDefaultProviderInstance,
  getProviderDisplayName,
  getProviderInstances,
  getProviderModels,
  normalizeProductProviderModelId,
} from './providerCatalog.js';

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
  return (catalogLabel ?? fallbackLabel)
    .replace(/\s*\((?:default|recommended)\)\s*/giu, ' ')
    .trim();
}

const KNOWN_CONTROL_VALUE_LABELS: Record<string, string> = {
  max: 'Max',
  xhigh: 'Extra High',
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
      return match?.label ?? formatFallbackControlValue(value);
    })
    .filter((label) => label.length > 0);
}

export function buildExecutionLabel(
  provider: string,
  instance: string | null | undefined,
  model: string | null | undefined,
  providerLabel?: string | null,
  controlLabels?: readonly string[] | null,
): string {
  const providerName = providerLabel?.trim() || getProviderDisplayName(provider);
  const effectiveInstance = instance?.trim() || getDefaultProviderInstance(provider);
  const suffix = resolveBackendSuffix(provider, effectiveInstance);
  const modelLabel = resolveModelLabel(provider, model);
  const controlsSuffix = controlLabels && controlLabels.length > 0
    ? ` \u00b7 ${controlLabels.join(' \u00b7 ')}`
    : '';
  return providerName + suffix + (modelLabel ? ` \u00b7 ${modelLabel}` : '') + controlsSuffix;
}

export function buildCatExecutionLabel(cat: {
  defaultExecutionTarget: { provider: string; instance?: string | null; model?: string | null };
  defaultModelSelection?: { controls?: Record<string, string | number | boolean> | null } | null;
}): string {
  const target = cat.defaultExecutionTarget;
  const controlLabels = resolveControlDisplayLabels(cat.defaultModelSelection?.controls);
  return buildExecutionLabel(target.provider, target.instance ?? null, target.model ?? null, null, controlLabels);
}

export function buildCatTooltip(
  catName: string,
  executionLabel: string | null | undefined,
): string {
  return executionLabel ? `${catName} \u00b7 ${executionLabel}` : catName;
}
