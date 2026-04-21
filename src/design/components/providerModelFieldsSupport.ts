import {
  createProviderAdvancedCatalogFromModelCatalog,
  type ProductProviderEventCapabilities,
  type ProductProviderInstanceDescriptor,
  type ProductProviderRegistryReadModel,
  type ProductProviderRegistryState,
  type ProviderCatalogEntry,
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
  resolveSelectedProviderInstance,
  type ProviderTargetSelection,
  type ProviderModelSelection,
} from '../../shared/providerSelection.js';
import { formatProviderEventCapabilitiesSummary } from '../../shared/providerEventCapabilities.js';
import {
  buildExecutionLabel,
  rememberExecutionLabel,
  resolveControlDisplayLabels,
} from '../../shared/executionLabel.js';

export const PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS = 30_000;

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
  return resolveProviderRegistryAutoRecheckDelayMs(input) === 0;
}

export function resolveProviderRegistryAutoRecheckDelayMs(input: {
  providersLoaded: boolean;
  providerCount: number;
  registryState: ProductProviderRegistryState;
  retryable: boolean;
  hasSetupHref: boolean;
  documentVisible: boolean;
  lastAutoRecheckAt: number;
  now: number;
}): number | null {
  if (!input.providersLoaded) {
    return null;
  }

  if (input.providerCount > 0 || input.registryState === 'ready') {
    return null;
  }

  if (!input.retryable || !input.documentVisible) {
    return null;
  }

  if (input.registryState !== 'runtime_unreachable' && !input.hasSetupHref) {
    return null;
  }

  const elapsedMs = input.now - input.lastAutoRecheckAt;
  return Math.max(0, PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS - elapsedMs);
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

function buildControlValueOptionKey(
  value: ProviderAdvancedControlValue,
): string {
  return `${typeof value}:${String(value)}`;
}

export function listApplicableControlValueOptions(
  control: ProviderAdvancedCatalogControl,
  entryId: string,
): NonNullable<ProviderAdvancedCatalogControl['values']> {
  const orderedKeys: string[] = [];
  const applicableOptionsByKey = new Map<
    string,
    NonNullable<ProviderAdvancedCatalogControl['values']>[number]
  >();
  const merged: NonNullable<ProviderAdvancedCatalogControl['values']> = [];

  for (const option of control.values ?? []) {
    const optionKey = buildControlValueOptionKey(option.value);
    if (!orderedKeys.includes(optionKey)) {
      orderedKeys.push(optionKey);
    }

    if (!controlValueOptionAppliesToEntry(option, entryId)) {
      continue;
    }

    applicableOptionsByKey.set(optionKey, option);
  }

  for (const optionKey of orderedKeys) {
    const applicableOption = applicableOptionsByKey.get(optionKey);
    if (applicableOption) {
      merged.push(applicableOption);
    }
  }

  return merged;
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

export function resolveCatalogEntryStatusSuffix(
  status: string | null | undefined,
): string {
  const trimmed = status?.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === 'available' || normalized === 'supported') {
    return '';
  }

  if (
    normalized === 'preview'
    || normalized === 'deprecated'
    || normalized === 'unavailable'
  ) {
    return ` (${normalized})`;
  }

  return ` (${trimmed})`;
}

export function formatCatalogEntryLabel(
  entry: Pick<ProviderCatalogEntry, 'label' | 'status'>,
): string {
  return `${entry.label}${resolveCatalogEntryStatusSuffix(entry.status)}`;
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

function resolveExecutionLabelControlValues(input: {
  entryId: string;
  modelSelection?: ProviderModelSelection | null;
  effectiveAdvancedCatalog: ProviderAdvancedModelCatalog;
}): Record<string, ProviderAdvancedControlValue> | undefined {
  const { entryId, modelSelection, effectiveAdvancedCatalog } = input;
  if (!entryId) {
    return undefined;
  }

  const persistentControls = listPersistentControlOptions(
    effectiveAdvancedCatalog.controls,
    entryId,
  );
  if (persistentControls.length === 0) {
    return undefined;
  }

  const resolvedValues: Record<string, ProviderAdvancedControlValue> = {};
  const defaultSelectionControls =
    effectiveAdvancedCatalog.defaultSelection?.entryId === entryId
      ? effectiveAdvancedCatalog.defaultSelection.controls
      : undefined;

  for (const control of persistentControls) {
    const explicitValue = modelSelection?.controls?.[control.key];
    if (explicitValue !== undefined) {
      resolvedValues[control.key] = explicitValue;
      continue;
    }

    const defaultSelectionValue = defaultSelectionControls?.[control.key];
    if (defaultSelectionValue !== undefined) {
      resolvedValues[control.key] = defaultSelectionValue;
    }
  }

  return Object.keys(resolvedValues).length > 0 ? resolvedValues : undefined;
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

export function resolveExecutionLabelForProviderTarget(input: {
  provider: string;
  instance: string | null | undefined;
  model: string | null | undefined;
  modelSelection?: ProviderModelSelection | null;
  effectiveCatalog: ProviderModelCatalog;
  effectiveAdvancedCatalog: ProviderAdvancedModelCatalog;
}): string {
  const entryId = input.model?.trim() || '';
  const entryOptions = input.effectiveAdvancedCatalog.entries.length > 0
    ? input.effectiveAdvancedCatalog.entries
    : input.effectiveCatalog.models;
  const modelLabel = entryOptions.find((option) => option.id === entryId)?.label ?? null;
  const controlCatalog = entryId
    ? listPersistentControlOptions(input.effectiveAdvancedCatalog.controls, entryId)
    : [];
  const controlValues = resolveExecutionLabelControlValues({
    entryId,
    modelSelection: input.modelSelection ?? null,
    effectiveAdvancedCatalog: input.effectiveAdvancedCatalog,
  });
  const controlLabels = resolveControlDisplayLabels(
    controlValues,
    controlCatalog,
  );

  const executionLabel = buildExecutionLabel(
    input.provider,
    input.instance,
    input.model,
    null,
    controlLabels,
    modelLabel,
  );
  rememberExecutionLabel({
    provider: input.provider,
    instance: input.instance,
    model: input.model,
    modelSelection: input.modelSelection ?? null,
    executionLabel,
  });
  return executionLabel;
}

export function attachExecutionLabelToProviderTarget(input: {
  target: ProviderTargetSelection;
  effectiveCatalog: ProviderModelCatalog;
  effectiveAdvancedCatalog: ProviderAdvancedModelCatalog;
}): ProviderTargetSelection {
  const model = input.target.model?.trim() ?? '';
  if (!model) {
    return {
      ...input.target,
      executionLabel: null,
    };
  }

  return {
    ...input.target,
    executionLabel: resolveExecutionLabelForProviderTarget({
      provider: input.target.provider,
      instance: input.target.instance,
      model,
      modelSelection: input.target.modelSelection ?? null,
      effectiveCatalog: input.effectiveCatalog,
      effectiveAdvancedCatalog: input.effectiveAdvancedCatalog,
    }),
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

export function updatePersistentControlValues(input: {
  control: ProviderAdvancedCatalogControl;
  currentValues: Record<string, ProviderAdvancedControlValue>;
  rawValue: string;
}): Record<string, ProviderAdvancedControlValue> | undefined {
  const { control, currentValues, rawValue } = input;
  if (rawValue) {
    return {
      ...currentValues,
      [control.key]: parseControlInputValue(control, rawValue),
    };
  }

  const nextEntries = Object.entries(currentValues)
    .filter(([key]) => key !== control.key);
  return nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined;
}

export function resolveProviderModelFieldsViewState(input: {
  selectedProvider: ProductProviderRegistryReadModel['providers'][number] | null;
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  catalogLoading: boolean;
  providersLoaded: boolean;
  providerRegistry: ProductProviderRegistryReadModel;
  effectiveCatalog: ProviderModelCatalog;
  effectiveAdvancedCatalog: ProviderAdvancedModelCatalog;
  isLegacyModelTarget: boolean;
}): {
  resolvedInstance: string;
  instanceOptions: ProductProviderInstanceDescriptor[];
  showInstanceField: boolean;
  selectedInstanceCapabilitySummary: string | null;
  entryOptions: ProviderAdvancedModelCatalog['entries'] | ProviderModelCatalog['models'];
  selectedCatalogEntryId: string;
  selectedEntryId: string;
  presetOptions: ProviderAdvancedCatalogPreset[];
  selectedPresetId: string;
  controlOptions: ProviderAdvancedCatalogControl[];
  requestScopedControlCount: number;
  controlValues: Record<string, ProviderAdvancedControlValue>;
  supportBadge: {
    label: string;
    tone: 'advanced' | 'catalog' | 'readOnly';
  };
  selectedEntryNotes: string[];
  primaryCatalogWarning: string | null;
  providerPlaceholder: string;
  modelPlaceholder: string;
  providerRegistryHint: string;
  providerRegistrySetupHref: string | null;
  canRetryProviderRegistry: boolean;
  allowLegacyManualModelEntry: boolean;
} {
  const {
    selectedProvider,
    provider,
    instance,
    model,
    modelSelection,
    catalogLoading,
    providersLoaded,
    providerRegistry,
    effectiveCatalog,
    effectiveAdvancedCatalog,
    isLegacyModelTarget,
  } = input;
  const resolvedInstance = selectedProvider
    ? resolveSelectedProviderInstance(selectedProvider, instance)
    : '';
  const entryOptions = effectiveAdvancedCatalog.entries.length > 0
    ? effectiveAdvancedCatalog.entries
    : effectiveCatalog.models;
  const allowLegacyManualModelEntry = shouldAllowLegacyManualModelEntry({
    entryCount: entryOptions.length,
    isLegacyModelTarget,
  });
  const instanceOptions: ProductProviderInstanceDescriptor[] = selectedProvider
    ? (
        selectedProvider.instances.some((option) => option.id === resolvedInstance)
          ? selectedProvider.instances
          : resolvedInstance
            ? [{
                id: resolvedInstance,
                label: resolvedInstance,
                target: resolvedInstance,
                backend: null,
              }, ...selectedProvider.instances]
            : selectedProvider.instances
      )
    : [];
  const showInstanceField = shouldShowInstanceField({
    resolvedInstance,
    instanceOptions,
  });
  const selectedInstanceCapabilities = resolveSelectedInstanceEventCapabilities({
    resolvedInstance,
    instanceOptions,
  });
  const selectedInstanceCapabilitySummary = formatProviderEventCapabilitiesSummary(
    selectedInstanceCapabilities,
  );
  const selectedCatalogEntryId = entryOptions.some((option) => option.id === model)
    ? model
    : entryOptions[0]?.id ?? '';
  const selectedEntryId = isLegacyModelTarget ? CUSTOM_LEGACY_MODEL_VALUE : (
    selectedCatalogEntryId || ''
  );
  const presetOptions = listPresetOptionsForEntry(
    effectiveAdvancedCatalog,
    selectedCatalogEntryId,
    isLegacyModelTarget,
  );
  const selectedPresetId = !isLegacyModelTarget
    && presetOptions.some((preset) => preset.id === modelSelection?.presetId)
    ? modelSelection?.presetId ?? ''
    : '';
  const controlOptions = !isLegacyModelTarget
    ? listPersistentControlOptions(effectiveAdvancedCatalog.controls, selectedCatalogEntryId)
    : [];
  const requestScopedControlCount = !isLegacyModelTarget
    ? countRequestScopedControls(effectiveAdvancedCatalog.controls, selectedCatalogEntryId)
    : 0;
  const controlValues = modelSelection?.controls ?? {};
  const supportBadge = resolveProviderSupportBadge(effectiveAdvancedCatalog.support.tier);
  const selectedEntryNotes = !isLegacyModelTarget
    ? entryOptions.find((option) => option.id === selectedCatalogEntryId)?.notes ?? []
    : [];
  const primaryCatalogWarning = effectiveAdvancedCatalog.warnings[0]
    ?? effectiveCatalog.warnings[0]
    ?? null;
  const providerPlaceholder = resolveProviderRegistryPlaceholder({
    providersLoaded,
    registryState: providerRegistry.state,
  });
  const modelPlaceholder = !selectedProvider
    ? (providersLoaded
        ? providerRegistry.state === 'runtime_unreachable'
          ? 'Retry loading providers first'
          : 'Select an available provider first'
        : 'Waiting for available providers...')
    : catalogLoading
      ? 'Loading available models...'
      : allowLegacyManualModelEntry
        ? 'Select a model'
        : 'No runtime-backed models available';
  const providerRegistryHint = resolveProviderRegistryHint({
    providersLoaded,
    registry: providerRegistry,
  });
  const providerRegistrySetupHref = resolveProviderRegistrySetupHref(providerRegistry);
  const canRetryProviderRegistry = providersLoaded
    && providerRegistry.providers.length === 0
    && providerRegistry.recovery?.retryable !== false;

  return {
    resolvedInstance,
    instanceOptions,
    showInstanceField,
    selectedInstanceCapabilitySummary,
    entryOptions,
    selectedCatalogEntryId,
    selectedEntryId,
    presetOptions,
    selectedPresetId,
    controlOptions,
    requestScopedControlCount,
    controlValues,
    supportBadge,
    selectedEntryNotes,
    primaryCatalogWarning,
    providerPlaceholder,
    modelPlaceholder,
    providerRegistryHint,
    providerRegistrySetupHref,
    canRetryProviderRegistry,
    allowLegacyManualModelEntry,
  };
}
