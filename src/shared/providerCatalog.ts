import type { ProviderModelSelection } from './providerSelection.js';

export interface ProviderModelOption {
  value: string;
  label: string;
  default?: boolean;
}

export interface ProviderCatalogEntry {
  id: string;
  label: string;
  default?: boolean;
  status?: string;
  notes?: string[];
}

export interface ProductProviderInstanceDescriptor {
  id: string;
  label: string;
  target: string | null;
  backend: string | null;
  default?: boolean;
  eventCapabilities?: ProductProviderEventCapabilities | null;
}

export type ProductProviderEventCapabilitySupport = 'none' | 'derived' | 'native' | 'unknown';
export type ProductProviderTextStreamingMode =
  | 'none'
  | 'final'
  | 'chunk'
  | 'line'
  | 'token'
  | 'unknown';
export type ProductProviderRecommendedPresentation =
  | 'final_message'
  | 'event_tape'
  | 'content_blocks'
  | 'unknown';

export interface ProductProviderEventTextCapability {
  mode: ProductProviderTextStreamingMode;
  stepwise: boolean;
}

export interface ProductProviderNormalizedStreamCapabilities {
  text: ProductProviderEventTextCapability;
  toolUse: ProductProviderEventCapabilitySupport;
  toolResult: ProductProviderEventCapabilitySupport;
  progress: ProductProviderEventCapabilitySupport;
  reasoning: ProductProviderEventCapabilitySupport;
}

export interface ProductProviderTranscriptCapabilities {
  contentBlocks: ProductProviderEventCapabilitySupport;
}

export interface ProductProviderPresentationCapabilities {
  recommended: ProductProviderRecommendedPresentation;
}

export interface ProductProviderEventCapabilityValidation {
  artifactId: string;
  capturedAt: string;
  transport: string;
  runtimeMode?: string;
  executionStatus: 'completed' | 'failed';
  observed: {
    incrementalText: boolean;
    toolUse: boolean;
    toolResult: boolean;
    progress: boolean;
    finalResult: boolean;
  };
}

export interface ProductProviderEventCapabilities {
  normalizedStream: ProductProviderNormalizedStreamCapabilities;
  transcript: ProductProviderTranscriptCapabilities;
  presentation: ProductProviderPresentationCapabilities;
  notes: string[];
  validation?: ProductProviderEventCapabilityValidation;
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

export type ProviderAdvancedCatalogSupportTier = 'full' | 'entry_only' | 'read_only';
export type ProviderAdvancedControlValue = string | number | boolean;
export type ProviderAdvancedControlKind = 'enum' | 'boolean' | 'number' | 'string';
export type ProviderAdvancedControlScope = 'session_default' | 'request' | 'both';

export interface ProviderAdvancedCatalogEntryLimits {
  contextWindowTokens?: number;
  maxOutputTokens?: number;
}

export interface ProviderAdvancedCatalogEntry extends ProviderCatalogEntry {
  capabilityTags?: string[];
  limits?: ProviderAdvancedCatalogEntryLimits;
  notes?: string[];
}

export interface ProviderAdvancedCatalogPreset {
  id: string;
  label: string;
  description?: string;
  availability?: 'supported' | 'unavailable' | 'available' | 'preview' | 'deprecated';
  applicableEntryIds?: string[];
  preferredEntryId?: string;
  controlDefaults?: Record<string, ProviderAdvancedControlValue>;
  warnings?: string[];
}

export interface ProviderAdvancedCatalogControl {
  key: string;
  label: string;
  description?: string;
  kind: ProviderAdvancedControlKind;
  scope: ProviderAdvancedControlScope;
  values?: Array<{
    value: ProviderAdvancedControlValue;
    label: string;
    description?: string;
    applicableEntryIds?: string[];
  }>;
  minimum?: number;
  maximum?: number;
  step?: number;
  applicableEntryIds?: string[];
  semanticTags?: string[];
}

export interface ProviderAdvancedCatalogSupport {
  tier: ProviderAdvancedCatalogSupportTier;
  notes: string[];
}

export interface ProviderAdvancedModelCatalog {
  provider: string;
  backend: string | null;
  instance: string | null;
  defaultModel: string | null;
  source: ProviderCatalogSource;
  cache: ProviderCatalogCacheMetadata | null;
  entries: ProviderAdvancedCatalogEntry[];
  presets: ProviderAdvancedCatalogPreset[];
  controls: ProviderAdvancedCatalogControl[];
  defaultSelection: ProviderModelSelection | null;
  support: ProviderAdvancedCatalogSupport;
  warnings: string[];
}

export const PRODUCT_PROVIDER_ORDER = [
  'claude',
  'codex',
  'gemini',
  'cursor',
  'copilot',
  'opencode',
  'kilo',
  'goose',
  'pi',
  'auggie',
  'junie',
  'kiro',
  'ollama',
  'openclaw',
] as const;

export type ProductProviderId = (typeof PRODUCT_PROVIDER_ORDER)[number];

export const PAL_PROVIDER_ORDER = PRODUCT_PROVIDER_ORDER;
export type CatProviderId = ProductProviderId;

export const PRODUCT_PROVIDER_MODELS: Record<ProductProviderId, ProviderModelOption[]> = {
  openclaw: [
    { value: 'openclaw-coder', label: 'openclaw-coder (default)', default: true },
  ],
  claude: [
    { value: 'opus', label: 'Opus 4.6 with 1M context', default: true },
    { value: 'sonnet', label: 'Sonnet 4.6' },
    { value: 'haiku', label: 'Haiku 4.5' },
  ],
  codex: [
    { value: 'gpt-5.4', label: 'gpt-5.4', default: true },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
    { value: 'gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark' },
    { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
    { value: 'gpt-5.2', label: 'gpt-5.2' },
    { value: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max' },
    { value: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' },
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
  kilo: [
    { value: 'kilo/openai/gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'kilo/openai/gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'kilo/anthropic/claude-opus-4.6', label: 'claude-opus-4.6' },
    { value: 'kilo/anthropic/claude-sonnet-4.6', label: 'claude-sonnet-4.6' },
    { value: 'kilo/google/gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview' },
    { value: 'kilo/z-ai/glm-5', label: 'glm-5' },
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

const PRODUCT_PROVIDER_INSTANCES: Record<ProductProviderId, ProductProviderInstanceDescriptor[]> = {
  claude: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
    { id: 'sdk', label: 'agent/sdk', target: 'agent/sdk', backend: 'agent' },
    { id: 'sonnet', label: 'api/sonnet', target: 'api/sonnet', backend: 'api' },
  ],
  codex: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
    { id: 'main', label: 'api/main', target: 'api/main', backend: 'api' },
  ],
  gemini: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
    { id: 'flash', label: 'api/flash', target: 'api/flash', backend: 'api' },
  ],
  cursor: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  copilot: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  opencode: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  kilo: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  goose: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  pi: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  auggie: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  junie: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  kiro: [
    { id: 'ubuntu', label: 'cli/ubuntu', target: 'cli/ubuntu', backend: 'cli', default: true },
  ],
  ollama: [
    { id: 'local', label: 'local/local', target: 'local/local', backend: 'local', default: true },
  ],
  openclaw: [
    { id: 'gateway', label: 'agent/gateway', target: 'agent/gateway', backend: 'agent', default: true },
  ],
};

export interface ProductProviderDescriptor {
  id: ProductProviderId;
  label: string;
  defaultModel: string | null;
  defaultInstance: string | null;
  defaultBackend: string | null;
  instances: ProductProviderInstanceDescriptor[];
  modelsPath: string;
}

export type ProductProviderRegistryState = 'ready' | 'no_usable_targets' | 'runtime_unreachable';

export interface ProductProviderRegistryRecovery {
  retryable?: boolean;
  openRuntimeSetupPath?: string;
}

export interface ProductProviderRegistryReadModel {
  state: ProductProviderRegistryState;
  providers: ProductProviderDescriptor[];
  recovery?: ProductProviderRegistryRecovery;
  warnings?: string[];
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

function readCapabilitySupport(
  value: unknown,
): ProductProviderEventCapabilitySupport {
  return value === 'none' || value === 'derived' || value === 'native' || value === 'unknown'
    ? value
    : 'unknown';
}

function readTextStreamingMode(
  value: unknown,
): ProductProviderTextStreamingMode {
  return value === 'none'
    || value === 'final'
    || value === 'chunk'
    || value === 'line'
    || value === 'token'
    || value === 'unknown'
    ? value
    : 'unknown';
}

function readRecommendedPresentation(
  value: unknown,
): ProductProviderRecommendedPresentation {
  return value === 'final_message'
    || value === 'event_tape'
    || value === 'content_blocks'
    || value === 'unknown'
    ? value
    : 'unknown';
}

export function normalizeProductProviderEventCapabilities(
  value: unknown,
): ProductProviderEventCapabilities | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const normalizedStreamRecord = asRecord(record.normalizedStream);
  const textRecord = asRecord(normalizedStreamRecord?.text);
  const transcriptRecord = asRecord(record.transcript);
  const presentationRecord = asRecord(record.presentation);
  const validationRecord = asRecord(record.validation);
  const observedRecord = asRecord(validationRecord?.observed);

  return {
    normalizedStream: {
      text: {
        mode: readTextStreamingMode(textRecord?.mode),
        stepwise: textRecord?.stepwise === true,
      },
      toolUse: readCapabilitySupport(normalizedStreamRecord?.toolUse),
      toolResult: readCapabilitySupport(normalizedStreamRecord?.toolResult),
      progress: readCapabilitySupport(normalizedStreamRecord?.progress),
      reasoning: readCapabilitySupport(normalizedStreamRecord?.reasoning),
    },
    transcript: {
      contentBlocks: readCapabilitySupport(transcriptRecord?.contentBlocks),
    },
    presentation: {
      recommended: readRecommendedPresentation(presentationRecord?.recommended),
    },
    notes: readStringArray(record.notes),
    ...(validationRecord
      ? {
          validation: {
            artifactId: typeof validationRecord.artifactId === 'string'
              ? validationRecord.artifactId
              : '',
            capturedAt: typeof validationRecord.capturedAt === 'string'
              ? validationRecord.capturedAt
              : '',
            transport: typeof validationRecord.transport === 'string'
              ? validationRecord.transport
              : '',
            ...(typeof validationRecord.runtimeMode === 'string'
              ? { runtimeMode: validationRecord.runtimeMode }
              : {}),
            executionStatus: validationRecord.executionStatus === 'failed' ? 'failed' : 'completed',
            observed: {
              incrementalText: observedRecord?.incrementalText === true,
              toolUse: observedRecord?.toolUse === true,
              toolResult: observedRecord?.toolResult === true,
              progress: observedRecord?.progress === true,
              finalResult: observedRecord?.finalResult === true,
            },
          },
        }
      : {}),
  };
}

function isControlValue(value: unknown): value is ProviderAdvancedControlValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readSelectionControls(
  value: unknown,
): Record<string, ProviderAdvancedControlValue> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record).filter(([, item]) => isControlValue(item));
  return entries.length > 0
    ? Object.fromEntries(entries) as Record<string, ProviderAdvancedControlValue>
    : undefined;
}

function readPresetAvailability(
  value: unknown,
): ProviderAdvancedCatalogPreset['availability'] | undefined {
  return value === 'supported'
    || value === 'unavailable'
    || value === 'available'
    || value === 'preview'
    || value === 'deprecated'
    ? value
    : undefined;
}

function readControlKind(value: unknown): ProviderAdvancedControlKind {
  return value === 'boolean' || value === 'enum' || value === 'number' || value === 'string'
    ? value
    : 'string';
}

function readControlScope(value: unknown): ProviderAdvancedControlScope {
  return value === 'session_default' || value === 'request' || value === 'both'
    ? value
    : 'session_default';
}

function readSelectionEntryMode(
  value: unknown,
): ProviderModelSelection['entryMode'] {
  return value === 'auto' || value === 'explicit' ? value : 'explicit';
}

function normalizeAdvancedControlValues(
  values: unknown,
): ProviderAdvancedCatalogControl['values'] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const normalized = values.flatMap((value) => {
    if (isControlValue(value)) {
      return [{
        value,
        label: String(value),
      }];
    }

    const record = asRecord(value);
    if (!record || !isControlValue(record.value)) {
      return [];
    }

    return [{
      value: record.value,
      label: readNullableString(record.label) ?? String(record.value),
      ...(readNullableString(record.description)
        ? { description: readNullableString(record.description)! }
        : {}),
      ...(readStringArray(record.applicableEntryIds).length > 0
        ? { applicableEntryIds: readStringArray(record.applicableEntryIds) }
        : {}),
    }];
  });

  return normalized.length > 0 ? normalized : undefined;
}

export function isKnownProvider(provider: string): provider is ProductProviderId {
  return (PRODUCT_PROVIDER_ORDER as readonly string[]).includes(provider);
}

export function getProviderDisplayName(provider: string): string {
  if (provider === 'openclaw') {
    return 'OpenClaw';
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function getProviderModels(provider: string): ProviderModelOption[] {
  return PRODUCT_PROVIDER_MODELS[provider as ProductProviderId] ?? [];
}

export function normalizeProductProviderModelId(
  provider: string,
  modelId: string | null | undefined,
): string | null {
  const normalized = modelId?.trim();
  if (!normalized) {
    return null;
  }

  if (provider === 'claude') {
    const lower = normalized.toLowerCase();
    if (lower === 'claude-opus-4-6' || lower === 'claude-opus-4.6' || lower === 'opus') {
      return 'opus';
    }
    if (lower === 'claude-sonnet-4-6' || lower === 'claude-sonnet-4.6' || lower === 'sonnet') {
      return 'sonnet';
    }
    if (lower === 'claude-haiku-4-5' || lower === 'claude-haiku-4.5' || lower === 'haiku') {
      return 'haiku';
    }
  }

  return normalized;
}

export function getDefaultModel(provider: string): string {
  return getProviderModels(provider)[0]?.value ?? '';
}

export function getProviderInstances(
  provider: string,
): ProductProviderInstanceDescriptor[] {
  return PRODUCT_PROVIDER_INSTANCES[provider as ProductProviderId] ?? [];
}

export function getDefaultProviderInstance(provider: string): string | null {
  const instances = getProviderInstances(provider);
  return instances.find((instance) => instance.default)?.id ?? instances[0]?.id ?? null;
}

export function getDefaultProviderBackend(provider: string): string | null {
  const instances = getProviderInstances(provider);
  return instances.find((instance) => instance.default)?.backend ?? instances[0]?.backend ?? null;
}

export function listProductProviders(): ProductProviderDescriptor[] {
  return PRODUCT_PROVIDER_ORDER.map((provider) => ({
    id: provider,
    label: getProviderDisplayName(provider),
    defaultModel: getDefaultModel(provider) || null,
    defaultInstance: getDefaultProviderInstance(provider),
    defaultBackend: getDefaultProviderBackend(provider),
    instances: getProviderInstances(provider),
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

export function createStaticProviderAdvancedModelCatalog(
  provider: string,
  options: {
    instance?: string | null;
    warnings?: string[];
  } = {},
): ProviderAdvancedModelCatalog {
  const baseCatalog = createStaticProviderModelCatalog(provider, options);
  const defaultModel = resolveProviderCatalogDefaultModel(baseCatalog) || null;
  return {
    provider: baseCatalog.provider,
    backend: baseCatalog.backend,
    instance: baseCatalog.instance,
    defaultModel,
    source: baseCatalog.source,
    cache: baseCatalog.cache,
    entries: baseCatalog.models.map((model) => ({
      ...model,
    })),
    presets: [],
    controls: [],
    defaultSelection: defaultModel
      ? {
          entryId: defaultModel,
          entryMode: 'explicit',
        }
      : null,
    support: {
      tier: 'entry_only',
      notes: [],
    },
    warnings: [...baseCatalog.warnings],
  };
}

export function createProviderAdvancedCatalogFromModelCatalog(
  catalog: ProviderModelCatalog,
): ProviderAdvancedModelCatalog {
  const defaultModel = resolveProviderCatalogDefaultModel(catalog) || null;
  return {
    provider: catalog.provider,
    backend: catalog.backend,
    instance: catalog.instance,
    defaultModel,
    source: catalog.source,
    cache: catalog.cache,
    entries: catalog.models.map((model) => ({
      ...model,
    })),
    presets: [],
    controls: [],
    defaultSelection: defaultModel
      ? {
          entryId: defaultModel,
          entryMode: 'explicit',
        }
      : null,
    support: {
      tier: 'entry_only',
      notes: [],
    },
    warnings: [...catalog.warnings],
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
        status: readNullableString(model.status) ?? undefined,
      }))
      .filter((model) => model.id.length > 0),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}

export function normalizeProviderAdvancedModelCatalog(
  payload: unknown,
  fallbackProvider: string,
): ProviderAdvancedModelCatalog {
  const record = asRecord(payload) ?? {};
  const source = record.source;
  const sourceValue: ProviderCatalogSource =
    source === 'dynamic' || source === 'config' || source === 'static'
      ? source
      : 'static';
  const cacheRecord = asRecord(record.cache);
  const rawEntries = Array.isArray(record.entries) ? record.entries : [];
  const rawPresets = Array.isArray(record.presets) ? record.presets : [];
  const rawControls = Array.isArray(record.controls) ? record.controls : [];
  const supportRecord = asRecord(record.support);
  const defaultSelectionRecord = asRecord(record.defaultSelection);

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
    entries: rawEntries
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => ({
        id: readNullableString(entry.id) ?? '',
        label: readNullableString(entry.label) ?? readNullableString(entry.id) ?? '',
        default: Boolean(entry.default),
        ...(readNullableString(entry.status) ? { status: readNullableString(entry.status)! } : {}),
        ...(readStringArray(entry.capabilityTags).length > 0
          ? { capabilityTags: readStringArray(entry.capabilityTags) }
          : {}),
        ...(asRecord(entry.limits)
          ? {
              limits: {
                ...(typeof asRecord(entry.limits)?.contextWindowTokens === 'number'
                  ? { contextWindowTokens: Number(asRecord(entry.limits)?.contextWindowTokens) }
                  : typeof asRecord(entry.limits)?.contextWindow === 'number'
                    ? { contextWindowTokens: Number(asRecord(entry.limits)?.contextWindow) }
                  : {}),
                ...(typeof asRecord(entry.limits)?.maxOutputTokens === 'number'
                  ? { maxOutputTokens: Number(asRecord(entry.limits)?.maxOutputTokens) }
                  : {}),
              },
            }
          : {}),
        ...(readStringArray(entry.notes).length > 0
          ? { notes: readStringArray(entry.notes) }
          : {}),
      }))
      .filter((entry) => entry.id.length > 0),
    presets: rawPresets
      .map((preset) => asRecord(preset))
      .filter((preset): preset is Record<string, unknown> => preset !== null)
      .map((preset) => ({
        id: readNullableString(preset.id) ?? '',
        label: readNullableString(preset.label) ?? readNullableString(preset.id) ?? '',
        ...(readNullableString(preset.description) ? { description: readNullableString(preset.description)! } : {}),
        ...(readPresetAvailability(preset.availability)
          ? { availability: readPresetAvailability(preset.availability) }
          : {}),
        ...(readStringArray(preset.applicableEntryIds).length > 0
          ? { applicableEntryIds: readStringArray(preset.applicableEntryIds) }
          : {}),
        ...(readNullableString(preset.preferredEntryId)
          ? { preferredEntryId: readNullableString(preset.preferredEntryId)! }
          : {}),
        ...(readSelectionControls(preset.controlDefaults)
          ? { controlDefaults: readSelectionControls(preset.controlDefaults)! }
          : {}),
        ...(readStringArray(preset.warnings).length > 0
          ? { warnings: readStringArray(preset.warnings) }
          : {}),
      }))
      .filter((preset) => preset.id.length > 0),
    controls: rawControls
      .map((control) => asRecord(control))
      .filter((control): control is Record<string, unknown> => control !== null)
      .map((control) => ({
        key: readNullableString(control.key) ?? '',
        label: readNullableString(control.label) ?? readNullableString(control.key) ?? '',
        ...(readNullableString(control.description)
          ? { description: readNullableString(control.description)! }
          : {}),
        kind: readControlKind(control.kind),
        scope: readControlScope(control.scope),
        ...(normalizeAdvancedControlValues(control.values)
          ? {
              values: normalizeAdvancedControlValues(control.values),
            }
          : {}),
        ...(typeof control.minimum === 'number' ? { minimum: control.minimum } : {}),
        ...(typeof control.maximum === 'number' ? { maximum: control.maximum } : {}),
        ...(typeof control.step === 'number' ? { step: control.step } : {}),
        ...(readStringArray(control.applicableEntryIds).length > 0
          ? { applicableEntryIds: readStringArray(control.applicableEntryIds) }
          : {}),
        ...(readStringArray(control.semanticTags).length > 0
          ? { semanticTags: readStringArray(control.semanticTags) }
          : {}),
      }))
      .filter((control) => control.key.length > 0),
    defaultSelection: defaultSelectionRecord
      ? {
          ...(readNullableString(defaultSelectionRecord.entryId)
            ? { entryId: readNullableString(defaultSelectionRecord.entryId)! }
            : {}),
          entryMode: readSelectionEntryMode(defaultSelectionRecord.entryMode),
          ...(readNullableString(defaultSelectionRecord.presetId)
            ? { presetId: readNullableString(defaultSelectionRecord.presetId)! }
            : {}),
          ...(readSelectionControls(defaultSelectionRecord.controls)
            ? { controls: readSelectionControls(defaultSelectionRecord.controls)! }
            : {}),
        }
      : null,
    support: {
      tier:
        supportRecord?.tier === 'full'
        || supportRecord?.tier === 'entry_only'
        || supportRecord?.tier === 'read_only'
          ? supportRecord.tier
          : 'entry_only',
      notes: readStringArray(supportRecord?.notes),
    },
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}
