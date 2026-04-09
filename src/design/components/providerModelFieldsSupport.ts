import {
  createProviderAdvancedCatalogFromModelCatalog,
  type ProductProviderEventCapabilities,
  type ProductProviderInstanceDescriptor,
  type ProductProviderRegistryReadModel,
  type ProductProviderRegistryState,
  type ProviderAdvancedCatalogControl,
  type ProviderAdvancedCatalogPreset,
  type ProviderAdvancedControlValue,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  cloneProviderModelResolution,
  cloneProviderModelSelection,
  createExplicitProviderModelSelection,
  isLegacyProviderModelTarget,
  type ProviderModelSelection,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';

export const PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS = 3000;

export function createEmptyProviderModelCatalog(
  provider: string,
  instance?: string | null,
  warning?: string | null,
): ProviderModelCatalog {
  return {
    provider,
    backend: null,
    instance: instance?.trim() || null,
    defaultModel: null,
    source: 'config',
    cache: null,
    models: [],
    warnings: warning ? [warning] : [],
  };
}

export function createEmptyProviderAdvancedModelCatalog(
  provider: string,
  instance?: string | null,
  warning?: string | null,
): ProviderAdvancedModelCatalog {
  return {
    provider,
    backend: null,
    instance: instance?.trim() || null,
    defaultModel: null,
    source: 'config',
    cache: null,
    entries: [],
    presets: [],
    controls: [],
    defaultSelection: null,
    support: {
      tier: 'entry_only',
      notes: [],
    },
    warnings: warning ? [warning] : [],
  };
}

export function createDefaultProviderRegistryReadModel(): ProductProviderRegistryReadModel {
  return {
    state: 'ready',
    providers: [],
  };
}

export function sanitizeProviderRegistryReadModel(
  value: ProductProviderRegistryReadModel,
): ProductProviderRegistryReadModel {
  return {
    state: value.state,
    providers: Array.isArray(value.providers) ? value.providers : [],
    recovery: value.recovery,
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
  };
}

export function resolveProviderRegistryPlaceholder(input: {
  providersLoaded: boolean;
  registryState: ProductProviderRegistryState;
}): string {
  if (!input.providersLoaded) {
    return 'Loading available providers...';
  }

  return input.registryState === 'runtime_unreachable'
    ? 'Could not load runtime-backed providers'
    : 'No runtime-backed providers available';
}

export function resolveProviderRegistryHint(input: {
  providersLoaded: boolean;
  registry: ProductProviderRegistryReadModel;
}): string {
  if (!input.providersLoaded) {
    return 'Checking cats-runtime for usable provider targets.';
  }

  if (input.registry.state === 'runtime_unreachable') {
    return input.registry.warnings?.[0]
      ?? 'Could not load currently usable provider targets from cats-runtime.';
  }

  return 'cats-runtime is connected, but it did not report any currently usable provider targets.';
}

export function resolveProviderRegistrySetupHref(
  registry: ProductProviderRegistryReadModel,
): string | null {
  const href = registry.recovery?.openRuntimeSetupPath?.trim();
  return href ? href : null;
}

export function shouldAutoRecheckProviderRegistry(input: {
  providersLoaded: boolean;
  providerCount: number;
  registryState: ProductProviderRegistryState;
  retryable: boolean;
  hasSetupHref: boolean;
  documentVisible: boolean;
  lastAutoRecheckAt: number;
  now: number;
}): boolean {
  if (!input.providersLoaded) {
    return false;
  }

  if (input.providerCount > 0 || input.registryState === 'ready') {
    return false;
  }

  if (!input.retryable || !input.documentVisible) {
    return false;
  }

  if (input.registryState !== 'runtime_unreachable' && !input.hasSetupHref) {
    return false;
  }

  return input.now - input.lastAutoRecheckAt >= PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS;
}

function presetAppliesToEntry(
  preset: ProviderAdvancedCatalogPreset,
  entryId: string,
): boolean {
  return !preset.applicableEntryIds
    || preset.applicableEntryIds.length === 0
    || preset.applicableEntryIds.includes(entryId);
}

function controlAppliesToEntry(
  control: ProviderAdvancedCatalogControl,
  entryId: string,
): boolean {
  return !control.applicableEntryIds
    || control.applicableEntryIds.length === 0
    || control.applicableEntryIds.includes(entryId);
}

function controlValueOptionAppliesToEntry(
  option: NonNullable<ProviderAdvancedCatalogControl['values']>[number],
  entryId: string,
): boolean {
  return !option.applicableEntryIds
    || option.applicableEntryIds.length === 0
    || option.applicableEntryIds.includes(entryId);
}

export function listApplicableControlValueOptions(
  control: ProviderAdvancedCatalogControl,
  entryId: string,
): NonNullable<ProviderAdvancedCatalogControl['values']> {
  return (control.values ?? []).filter((option) => controlValueOptionAppliesToEntry(option, entryId));
}

export function hasExplicitDefaultEnumOption(
  control: ProviderAdvancedCatalogControl,
  entryId: string,
): boolean {
  return listApplicableControlValueOptions(control, entryId)
    .some((option) => typeof option.label === 'string' && /\(default\)/iu.test(option.label));
}

export function resolveDisplayedEnumControlValue(
  control: ProviderAdvancedCatalogControl,
  entryId: string,
  value: ProviderAdvancedControlValue | undefined,
): string {
  const serialized = serializeControlInputValue(value);
  if (serialized) {
    return serialized;
  }

  const explicitDefault = listApplicableControlValueOptions(control, entryId)
    .find((option) => typeof option.label === 'string' && /\(default\)/iu.test(option.label));
  return explicitDefault ? String(explicitDefault.value) : '';
}

export function parseControlInputValue(
  control: ProviderAdvancedCatalogControl,
  rawValue: string,
): ProviderAdvancedControlValue {
  if (control.kind === 'number') {
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  if (control.kind === 'boolean') {
    return rawValue === 'true';
  }

  return rawValue;
}

export function serializeControlInputValue(
  value: ProviderAdvancedControlValue | undefined,
): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' ? value : '';
}

export function buildSelectionForEntry(
  model: string,
  presetId: string | null,
  controls: Record<string, ProviderAdvancedControlValue> | undefined,
): ProviderModelSelection | null {
  return createExplicitProviderModelSelection(model, {
    presetId,
    controls,
  });
}

export const CUSTOM_LEGACY_MODEL_VALUE = '__custom_legacy_model__';

export function resolveProviderSupportBadge(
  supportTier: ProviderAdvancedModelCatalog['support']['tier'] | null | undefined,
): {
  label: string;
  tone: 'advanced' | 'catalog' | 'readOnly';
} {
  if (supportTier === 'full') {
    return { label: 'Advanced', tone: 'advanced' };
  }
  if (supportTier === 'read_only') {
    return { label: 'Read-only', tone: 'readOnly' };
  }
  return { label: 'Catalog', tone: 'catalog' };
}

export function listPersistentControlOptions(
  controls: ProviderAdvancedCatalogControl[],
  entryId: string,
): ProviderAdvancedCatalogControl[] {
  return controls
    .filter((control) =>
      control.scope !== 'request'
      && controlAppliesToEntry(control, entryId))
    .map((control) => ({
      ...control,
      ...(control.kind === 'enum' && control.values
        ? { values: listApplicableControlValueOptions(control, entryId) }
        : {}),
    }));
}

export function countRequestScopedControls(
  controls: ProviderAdvancedCatalogControl[],
  entryId: string,
): number {
  return controls.filter((control) =>
    control.scope === 'request'
    && controlAppliesToEntry(control, entryId)).length;
}

export function filterPersistentControlValues(
  controls: ProviderAdvancedCatalogControl[],
  entryId: string,
  values: Record<string, ProviderAdvancedControlValue> | undefined,
): Record<string, ProviderAdvancedControlValue> | undefined {
  if (!values) {
    return undefined;
  }

  const allowedControls = listPersistentControlOptions(controls, entryId);
  const allowedControlMap = new Map(allowedControls.map((control) => [control.key, control]));
  const entries = Object.entries(values).filter(([key, value]) => {
    const control = allowedControlMap.get(key);
    if (!control) {
      return false;
    }
    if (control.kind !== 'enum' || typeof value !== 'string' || !control.values?.length) {
      return true;
    }
    return listApplicableControlValueOptions(control, entryId)
      .some((option) => option.value === value);
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function shouldTreatPersistedTargetAsLegacyModel(input: {
  catalog: ProviderModelCatalog;
  model: string | null | undefined;
  modelSelection?: ProviderModelSelection | null;
}): boolean {
  if (input.catalog.source === 'static') {
    return false;
  }

  return isLegacyProviderModelTarget(input);
}

export function sanitizePersistentTargetSelection(input: {
  target: ProviderTargetSelection;
  controls: ProviderAdvancedCatalogControl[];
}): ProviderTargetSelection {
  const clonedSelection = cloneProviderModelSelection(input.target.modelSelection);
  if (!clonedSelection) {
    return input.target;
  }

  const sanitizedControls = filterPersistentControlValues(
    input.controls,
    clonedSelection.entryId ?? input.target.model,
    clonedSelection.controls,
  );
  if (sanitizedControls) {
    clonedSelection.controls = sanitizedControls;
  } else {
    delete clonedSelection.controls;
  }

  return {
    ...input.target,
    modelSelection: clonedSelection,
    modelResolution: cloneProviderModelResolution(input.target.modelResolution),
  };
}

export function shouldDeferCatalogTargetReconciliation(input: {
  catalogSource: ProviderModelCatalog['source'];
  advancedCatalogSource: ProviderAdvancedModelCatalog['source'];
  model: string;
  modelSelection?: ProviderModelSelection | null;
}): boolean {
  return (
    input.catalogSource === 'static'
    && input.advancedCatalogSource === 'static'
    && (Boolean(input.model) || Boolean(input.modelSelection))
  );
}

export function shouldAllowLegacyManualModelEntry(input: {
  entryCount: number;
  isLegacyModelTarget: boolean;
}): boolean {
  return input.entryCount > 0 || input.isLegacyModelTarget;
}

function instanceKey(value: string | null | undefined): string {
  return value?.trim() || '';
}

export function shouldShowInstanceField(input: {
  resolvedInstance: string;
  instanceOptions: ProductProviderInstanceDescriptor[];
}): boolean {
  return input.instanceOptions.length > 1;
}

export function resolveSelectedInstanceEventCapabilities(input: {
  resolvedInstance: string;
  instanceOptions: ProductProviderInstanceDescriptor[];
}): ProductProviderEventCapabilities | null {
  return input.instanceOptions.find((option) => option.id === input.resolvedInstance)?.eventCapabilities ?? null;
}

export function catalogMatchesTarget(input: {
  catalogProvider: string;
  catalogInstance: string | null | undefined;
  provider: string;
  instance: string;
}): boolean {
  return input.catalogProvider === input.provider
    && instanceKey(input.catalogInstance) === instanceKey(input.instance);
}

export function resolveAdvancedCatalogFallback(input: {
  provider: string;
  instance: string | null;
  catalog: ProviderModelCatalog;
  advancedCatalogResult:
    | { status: 'fulfilled'; value: ProviderAdvancedModelCatalog }
    | { status: 'rejected'; reason: unknown };
  modelsResult:
    | { status: 'fulfilled'; value: ProviderModelCatalog }
    | { status: 'rejected'; reason: unknown };
}): ProviderAdvancedModelCatalog {
  const { provider, instance, catalog, advancedCatalogResult, modelsResult } = input;
  if (advancedCatalogResult.status === 'fulfilled') {
    return advancedCatalogResult.value;
  }
  if (modelsResult.status === 'fulfilled') {
    const advancedFallbackCatalog = createProviderAdvancedCatalogFromModelCatalog(catalog);
    return {
      ...advancedFallbackCatalog,
      warnings: [
        ...advancedFallbackCatalog.warnings,
        advancedCatalogResult.reason instanceof Error
          ? advancedCatalogResult.reason.message
          : 'Runtime advanced model catalog unavailable.',
      ],
    };
  }
  return createEmptyProviderAdvancedModelCatalog(
    provider,
    instance,
    advancedCatalogResult.reason instanceof Error
      ? advancedCatalogResult.reason.message
      : 'Runtime advanced model catalog unavailable.',
  );
}

export function listPresetOptionsForEntry(
  advancedCatalog: ProviderAdvancedModelCatalog,
  selectedCatalogEntryId: string,
  isLegacyModelTarget: boolean,
): ProviderAdvancedCatalogPreset[] {
  if (isLegacyModelTarget) {
    return [];
  }
  return advancedCatalog.presets.filter((preset) =>
    presetAppliesToEntry(preset, selectedCatalogEntryId));
}
