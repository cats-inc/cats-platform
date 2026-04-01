import {
  getDefaultProviderInstance,
  getProviderDisplayName,
  getProviderInstances,
  getProviderModels,
  normalizeProductProviderModelId,
} from './providerCatalog.js';

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

  const descriptor = getProviderInstances(provider).find((candidate) => candidate.id === instance);
  const backend = descriptor?.backend?.toLowerCase();
  if (backend === 'cli') return '-CLI';
  if (backend === 'agent') return '-AGENT';
  if (backend === 'api') return '-API';
  if (backend === 'local') return '-LOCAL';

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
    && (normalizedModel === 'default' || normalizedModel === 'sonnet' || normalizedModel === 'haiku')
    ? normalizedModel.charAt(0).toUpperCase() + normalizedModel.slice(1)
    : normalizedModel;
  return (catalogLabel ?? fallbackLabel)
    .replace(/\s*\((?:default|recommended)\)\s*/giu, ' ')
    .trim();
}

export function buildExecutionLabel(
  provider: string,
  instance: string | null | undefined,
  model: string | null | undefined,
  providerLabel?: string | null,
): string {
  const providerName = providerLabel?.trim() || getProviderDisplayName(provider);
  const effectiveInstance = instance?.trim() || getDefaultProviderInstance(provider);
  const suffix = resolveBackendSuffix(provider, effectiveInstance);
  const modelLabel = resolveModelLabel(provider, model);
  return providerName + suffix + (modelLabel ? ` \u00b7 ${modelLabel}` : '');
}
