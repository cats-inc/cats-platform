export interface ProviderModelOption {
  value: string;
  label: string;
  default?: boolean;
}

export interface ProviderCatalogEntry {
  id: string;
  label: string;
  default?: boolean;
}

export interface ProductProviderInstanceDescriptor {
  id: string;
  label: string;
  target: string | null;
  backend: string | null;
  default?: boolean;
}

export interface ProviderCatalogCacheMetadata {
  servedFromCache: boolean;
  cachedAt: string | null;
  ttlSec: number | null;
}

export type ProviderCatalogSource = 'dynamic' | 'config' | 'static';

export interface ProviderModelCatalog {
  provider: string;
  backend: string | null;
  instance: string | null;
  defaultModel: string | null;
  source: ProviderCatalogSource;
  cache: ProviderCatalogCacheMetadata | null;
  models: ProviderCatalogEntry[];
  warnings: string[];
}

export const PRODUCT_PROVIDER_ORDER = [
  'claude',
  'codex',
  'gemini',
  'cursor',
  'copilot',
  'opencode',
  'goose',
  'pi',
  'auggie',
  'junie',
  'kiro',
  'ollama',
] as const;

export type ProductProviderId = (typeof PRODUCT_PROVIDER_ORDER)[number];

export const PAL_PROVIDER_ORDER = PRODUCT_PROVIDER_ORDER;
export type PalProviderId = ProductProviderId;

export const PRODUCT_PROVIDER_MODELS: Record<ProductProviderId, ProviderModelOption[]> = {
  claude: [
    { value: 'claude-opus-4-6', label: 'opus 4.6 (default)', default: true },
    { value: 'claude-sonnet-4-6', label: 'sonnet 4.6' },
    { value: 'claude-haiku-4-5', label: 'haiku 4.5' },
  ],
  codex: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
    { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
  ],
  gemini: [
    { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview (default)', default: true },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  ],
  copilot: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
    { value: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
  ],
  opencode: [
    { value: 'opencode-go/glm-5', label: 'glm-5 (default)', default: true },
    { value: 'opencode-go/kimi-k2.5', label: 'kimi k2.5' },
    { value: 'opencode-go/minimax-m2.5', label: 'minimax m2.5' },
  ],
  auggie: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'claude opus 4.6', label: 'claude opus 4.6' },
    { value: 'sonnet 4.6', label: 'sonnet 4.6' },
  ],
  pi: [
    { value: 'openai-codex/gpt-5.4', label: 'openai-codex gpt-5.4 (default)', default: true },
  ],
  junie: [
    { value: 'gpt', label: 'gpt (default)', default: true },
    { value: 'gpt-codex', label: 'gpt-codex' },
    { value: 'sonnet', label: 'sonnet' },
  ],
  cursor: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'claude-opus-4-6', label: 'claude 4.6 opus' },
    { value: 'gemini-3.1-pro', label: 'gemini 3.1 pro' },
  ],
  kiro: [
    { value: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5 (default)', default: true },
    { value: 'deepseek-3.2', label: 'deepseek-3.2' },
    { value: 'minimax-m2.1', label: 'minimax-m2.1' },
  ],
  goose: [
    { value: 'openai/gpt-5-codex', label: 'openai/gpt-5-codex (default)', default: true },
    { value: 'openai/gpt-5', label: 'openai/gpt-5' },
  ],
  ollama: [
    { value: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b (default)', default: true },
  ],
};

export const PAL_PROVIDER_MODELS = PRODUCT_PROVIDER_MODELS;

export interface ProductProviderDescriptor {
  id: ProductProviderId;
  label: string;
  defaultModel: string | null;
  defaultInstance: string | null;
  defaultBackend: string | null;
  instances: ProductProviderInstanceDescriptor[];
  modelsPath: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function isKnownProvider(provider: string): provider is ProductProviderId {
  return (PRODUCT_PROVIDER_ORDER as readonly string[]).includes(provider);
}

export function getProviderDisplayName(provider: string): string {
  if (provider === 'ollama') return 'Ollama';
  const name = provider.charAt(0).toUpperCase() + provider.slice(1);
  return `${name}-CLI`;
}

export function getProviderModels(provider: string): ProviderModelOption[] {
  return PRODUCT_PROVIDER_MODELS[provider as ProductProviderId] ?? [];
}

export function getDefaultModel(provider: string): string {
  return getProviderModels(provider)[0]?.value ?? '';
}

export function listProductProviders(): ProductProviderDescriptor[] {
  return PRODUCT_PROVIDER_ORDER.map((provider) => ({
    id: provider,
    label: getProviderDisplayName(provider),
    defaultModel: getDefaultModel(provider) || null,
    defaultInstance: null,
    defaultBackend: null,
    instances: [],
    modelsPath: `/api/providers/${provider}/models`,
  }));
}

export function resolveProviderCatalogDefaultModel(catalog: ProviderModelCatalog): string {
  return (
    catalog.defaultModel
    || catalog.models.find((model) => model.default)?.id
    || catalog.models[0]?.id
    || ''
  );
}

export function createStaticProviderModelCatalog(
  provider: string,
  options: {
    instance?: string | null;
    warnings?: string[];
  } = {},
): ProviderModelCatalog {
  return {
    provider,
    backend: null,
    instance: options.instance ?? null,
    defaultModel: getDefaultModel(provider) || null,
    source: 'static',
    cache: null,
    models: getProviderModels(provider).map((model) => ({
      id: model.value,
      label: model.label,
      default: model.default,
    })),
    warnings: options.warnings ?? [],
  };
}

export function normalizeProviderModelCatalog(
  payload: unknown,
  fallbackProvider: string,
): ProviderModelCatalog {
  const record = asRecord(payload) ?? {};
  const source = record.source;
  const sourceValue: ProviderCatalogSource =
    source === 'dynamic' || source === 'config' || source === 'static'
      ? source
      : 'static';
  const cacheRecord = asRecord(record.cache);
  const rawModels = Array.isArray(record.models) ? record.models : [];

  return {
    provider: readNullableString(record.provider) ?? fallbackProvider,
    backend: readNullableString(record.backend),
    instance: readNullableString(record.instance),
    defaultModel: readNullableString(record.defaultModel),
    source: sourceValue,
    cache: cacheRecord
      ? {
        servedFromCache: Boolean(cacheRecord.servedFromCache),
        cachedAt: readNullableString(cacheRecord.cachedAt),
        ttlSec: typeof cacheRecord.ttlSec === 'number' ? cacheRecord.ttlSec : null,
      }
      : null,
    models: rawModels
      .map((model) => asRecord(model))
      .filter((model): model is Record<string, unknown> => model !== null)
      .map((model) => ({
        id: readNullableString(model.id) ?? '',
        label: readNullableString(model.label) ?? readNullableString(model.id) ?? '',
        default: Boolean(model.default),
      }))
      .filter((model) => model.id.length > 0),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}
