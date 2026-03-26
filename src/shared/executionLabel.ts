import { getProviderDisplayName, getProviderModels } from './providerCatalog.js';

function resolveBackendSuffix(instance: string | null | undefined): string {
  if (!instance) return '';
  const lower = instance.toLowerCase();
  if (lower.startsWith('cli/') || lower === 'cli') return '-CLI';
  if (lower.startsWith('agent/') || lower === 'agent') return '-Agent';
  if (lower.startsWith('api/') || lower === 'api') return '-API';
  return '';
}

function resolveModelLabel(provider: string, model: string | null | undefined): string | null {
  if (!model) return null;
  const catalogLabel = getProviderModels(provider).find((m) => m.value === model)?.label;
  return (catalogLabel ?? model).replace(/\s*\(default\)\s*/iu, '');
}

export function buildExecutionLabel(
  provider: string,
  instance: string | null | undefined,
  model: string | null | undefined,
): string {
  const providerName = getProviderDisplayName(provider);
  const suffix = resolveBackendSuffix(instance);
  const modelLabel = resolveModelLabel(provider, model);
  return providerName + suffix + (modelLabel ? ` \u00b7 ${modelLabel}` : '');
}
