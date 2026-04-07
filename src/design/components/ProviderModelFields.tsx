import { useEffect, useRef, useState } from 'react';

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
import { formatProviderEventCapabilitiesSummary } from '../../shared/providerEventCapabilities.js';
import {
  cloneProviderModelResolution,
  cloneProviderModelSelection,
  createExplicitProviderModelSelection,
  isLegacyProviderModelTarget,
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
  sameProviderModelSelection,
  type ProviderModelSelection,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';

interface SharedProviderModelFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
  fetchProviderRegistry: () => Promise<ProductProviderRegistryReadModel>;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}

function createEmptyProviderModelCatalog(
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

function createEmptyProviderAdvancedModelCatalog(
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

function createDefaultProviderRegistryReadModel(): ProductProviderRegistryReadModel {
  return {
    state: 'ready',
    providers: [],
  };
}

function sanitizeProviderRegistryReadModel(
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

function listApplicableControlValueOptions(
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

function parseControlInputValue(
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

function serializeControlInputValue(
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

function buildSelectionForEntry(
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

export function ProviderModelFields({
  provider,
  instance,
  model,
  modelSelection,
  onTargetChange,
  fetchProviderRegistry,
  fetchProviderModels,
  fetchAdvancedProviderModels,
  onProviderRegistryChange,
}: SharedProviderModelFieldsProps) {
  const [providers, setProviders] = useState<ProductProviderRegistryReadModel['providers']>([]);
  const [providerRegistry, setProviderRegistry] = useState<ProductProviderRegistryReadModel>(() =>
    createDefaultProviderRegistryReadModel(),
  );
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [providerRegistryReloadToken, setProviderRegistryReloadToken] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(Boolean(provider));
  const [catalog, setCatalog] = useState<ProviderModelCatalog>(() =>
    createEmptyProviderModelCatalog(provider),
  );
  const [advancedCatalog, setAdvancedCatalog] = useState<ProviderAdvancedModelCatalog>(() =>
    createEmptyProviderAdvancedModelCatalog(provider),
  );
  const [legacyManualTargetKey, setLegacyManualTargetKey] = useState<string | null>(null);
  const manualSelectionTargetKey = useRef<string | null>(null);
  const previousTargetKey = useRef<string>('');
  const onTargetChangeRef = useRef(onTargetChange);
  const onProviderRegistryChangeRef = useRef(onProviderRegistryChange);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    onProviderRegistryChangeRef.current = onProviderRegistryChange;
  }, [onProviderRegistryChange]);

  useEffect(() => {
    let cancelled = false;

    void fetchProviderRegistry()
      .then((nextRegistryResult) => {
        if (!cancelled) {
          const nextRegistry = sanitizeProviderRegistryReadModel(nextRegistryResult);
          setProviders(nextRegistry.providers);
          setProviderRegistry(nextRegistry);
          setProvidersLoaded(true);
          onProviderRegistryChangeRef.current?.(nextRegistry);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const nextRegistry: ProductProviderRegistryReadModel = {
            state: 'runtime_unreachable',
            providers: [],
            recovery: {
              retryable: true,
            },
            warnings: [error instanceof Error ? error.message : 'Failed to load providers.'],
          };
          setProviders([]);
          setProviderRegistry(nextRegistry);
          setProvidersLoaded(true);
          onProviderRegistryChangeRef.current?.(nextRegistry);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchProviderRegistry, providerRegistryReloadToken]);

  const providerOptions = providers;
  const selectedProvider = providerOptions.find((option) => option.id === provider) ?? null;
  const resolvedInstance = selectedProvider
    ? resolveSelectedProviderInstance(selectedProvider, instance)
    : '';
  const fallbackCatalog = createEmptyProviderModelCatalog(provider, resolvedInstance || null);
  const fallbackAdvancedCatalog = createEmptyProviderAdvancedModelCatalog(
    provider,
    resolvedInstance || null,
  );
  const effectiveCatalog = catalogMatchesTarget({
    catalogProvider: catalog.provider,
    catalogInstance: catalog.instance,
    provider,
    instance: resolvedInstance,
  })
    ? catalog
    : fallbackCatalog;
  const effectiveAdvancedCatalog = catalogMatchesTarget({
    catalogProvider: advancedCatalog.provider,
    catalogInstance: advancedCatalog.instance,
    provider,
    instance: resolvedInstance,
  })
    ? advancedCatalog
    : fallbackAdvancedCatalog;
  const targetKey = `${provider}::${resolvedInstance}`;
  const persistedLegacyModelTarget = !catalogLoading && shouldTreatPersistedTargetAsLegacyModel({
    catalog: effectiveCatalog,
    model,
    modelSelection,
  });
  const entryOptions = effectiveAdvancedCatalog.entries.length > 0
    ? effectiveAdvancedCatalog.entries
    : effectiveCatalog.models;
  const isLegacyModelTarget =
    legacyManualTargetKey === targetKey
    || persistedLegacyModelTarget;
  const allowLegacyManualModelEntry = shouldAllowLegacyManualModelEntry({
    entryCount: entryOptions.length,
    isLegacyModelTarget,
  });
  const hasBlankLegacyDraft =
    legacyManualTargetKey === targetKey
    && (model?.trim() || '').length === 0
    && !modelSelection;
  const preserveExistingSelection = manualSelectionTargetKey.current === targetKey
    || Boolean(modelSelection)
    || isLegacyModelTarget;

  useEffect(() => {
    if (!selectedProvider) {
      return;
    }
    if (previousTargetKey.current !== targetKey) {
      previousTargetKey.current = targetKey;
      manualSelectionTargetKey.current = null;
      setLegacyManualTargetKey(null);
    }
    if (resolvedInstance && resolvedInstance !== instance) {
      onTargetChangeRef.current({
        provider,
        instance: resolvedInstance,
        model,
        modelSelection,
      });
    }
  }, [instance, model, modelSelection, provider, resolvedInstance, selectedProvider, targetKey]);

  useEffect(() => {
    let cancelled = false;
    const nextFallbackCatalog = createEmptyProviderModelCatalog(provider, resolvedInstance || null);
    const nextFallbackAdvancedCatalog = createEmptyProviderAdvancedModelCatalog(
      provider,
      resolvedInstance || null,
    );

    setCatalog(nextFallbackCatalog);
    setAdvancedCatalog(nextFallbackAdvancedCatalog);
    setCatalogLoading(Boolean(selectedProvider && provider));

    if (!selectedProvider || !provider) {
      return () => {
        cancelled = true;
      };
    }

    void Promise.allSettled([
      fetchProviderModels(provider, resolvedInstance || null),
      fetchAdvancedProviderModels(provider, resolvedInstance || null),
    ]).then(([modelsResult, advancedResult]) => {
      if (cancelled) {
        return;
      }

      const nextCatalog = modelsResult.status === 'fulfilled'
        ? modelsResult.value
        : createEmptyProviderModelCatalog(
            provider,
            resolvedInstance || null,
            modelsResult.reason instanceof Error
              ? modelsResult.reason.message
              : 'Runtime model catalog unavailable.',
          );
      setCatalog(nextCatalog);

      if (advancedResult.status === 'fulfilled') {
        setAdvancedCatalog(advancedResult.value);
      } else if (modelsResult.status === 'fulfilled') {
        const advancedFallbackCatalog = createProviderAdvancedCatalogFromModelCatalog(nextCatalog);
        setAdvancedCatalog({
          ...advancedFallbackCatalog,
          warnings: [
            ...advancedFallbackCatalog.warnings,
            advancedResult.reason instanceof Error
              ? advancedResult.reason.message
              : 'Runtime advanced model catalog unavailable.',
          ],
        });
      } else {
        setAdvancedCatalog(createEmptyProviderAdvancedModelCatalog(
          provider,
          resolvedInstance || null,
          advancedResult.reason instanceof Error
            ? advancedResult.reason.message
            : 'Runtime advanced model catalog unavailable.',
        ));
      }

      setCatalogLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    fetchAdvancedProviderModels,
    fetchProviderModels,
    provider,
    resolvedInstance,
    selectedProvider,
  ]);

  useEffect(() => {
    if (effectiveCatalog.models.length === 0 || hasBlankLegacyDraft) {
      return;
    }

    const deferStaticCatalogReconciliation = shouldDeferCatalogTargetReconciliation({
      catalogSource: effectiveCatalog.source,
      advancedCatalogSource: effectiveAdvancedCatalog.source,
      model,
      modelSelection,
    });
    if (deferStaticCatalogReconciliation) {
      return;
    }

    const nextTarget = resolveCatalogTargetSelection({
      target: {
        provider,
        instance: resolvedInstance,
        model,
        modelSelection,
      },
      catalog: effectiveCatalog,
      advancedCatalog: effectiveAdvancedCatalog,
      preserveCurrentModel: preserveExistingSelection,
      preserveCurrentSelection: preserveExistingSelection,
    });
    const sanitizedTarget = sanitizePersistentTargetSelection({
      target: nextTarget,
      controls: effectiveAdvancedCatalog.controls,
    });

    if (
      sanitizedTarget.instance !== instance
      || sanitizedTarget.model !== model
      || !sameProviderModelSelection(sanitizedTarget.modelSelection, modelSelection)
    ) {
      onTargetChangeRef.current(sanitizedTarget);
    }
  }, [
    effectiveAdvancedCatalog,
    effectiveCatalog,
    instance,
    model,
    modelSelection,
    provider,
    resolvedInstance,
    preserveExistingSelection,
    targetKey,
    hasBlankLegacyDraft,
  ]);

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
  const presetOptions = !isLegacyModelTarget
    ? effectiveAdvancedCatalog.presets.filter((preset) =>
      presetAppliesToEntry(preset, selectedCatalogEntryId))
    : [];
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
  const canRetryProviderRegistry = providersLoaded
    && providerOptions.length === 0
    && providerRegistry.recovery?.retryable !== false;

  function emitSelection(next: {
    model?: string;
    instance?: string;
    presetId?: string | null;
    controls?: Record<string, ProviderAdvancedControlValue> | undefined;
  }): void {
    const nextModel = next.model ?? selectedCatalogEntryId;
    const nextControls = filterPersistentControlValues(
      effectiveAdvancedCatalog.controls,
      nextModel,
      next.controls,
    );
    const nextPresetId = next.presetId ?? null;
    manualSelectionTargetKey.current = targetKey;
    setLegacyManualTargetKey(null);
    onTargetChange({
      provider,
      instance: next.instance ?? resolvedInstance,
      model: nextModel,
      modelSelection: buildSelectionForEntry(nextModel, nextPresetId, nextControls),
    });
  }

  function emitLegacyModel(nextModel: string, nextInstance?: string): void {
    manualSelectionTargetKey.current = targetKey;
    setLegacyManualTargetKey(targetKey);
    onTargetChange({
      provider,
      instance: nextInstance ?? resolvedInstance,
      model: nextModel,
      modelSelection: null,
    });
  }

  return (
    <>
      <label className="fieldLabel">
        <span>AI Service</span>
        <select
          className="textInput"
          value={selectedProvider?.id ?? ''}
          disabled={providerOptions.length === 0}
          onChange={(event) => {
            const nextProvider = providerOptions.find((option) => option.id === event.target.value)
              ?? null;
            if (!nextProvider) {
              return;
            }
            const nextInstance = resolveSelectedProviderInstance(nextProvider, '');
            manualSelectionTargetKey.current = null;
            setLegacyManualTargetKey(null);
            onTargetChange({
              provider: nextProvider.id,
              instance: nextInstance,
              model: '',
              modelSelection: null,
            });
          }}
        >
          {providerOptions.length === 0 ? (
            <option value="">{providerPlaceholder}</option>
          ) : (
            <>
              {!selectedProvider ? (
                <option value="" disabled>
                  Select an available provider
                </option>
              ) : null}
              {providerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </>
          )}
        </select>
        {providerOptions.length === 0 ? (
          <>
            <span className="fieldHint">
              {providerRegistryHint}
            </span>
            {canRetryProviderRegistry ? (
              <div className="providerCatalogRecoveryActions">
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => {
                    setProvidersLoaded(false);
                    setProviderRegistryReloadToken((current) => current + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </label>
      {showInstanceField ? (
        <label className="fieldLabel">
          <span>Connection</span>
          <select
            className="textInput"
            value={resolvedInstance}
            onChange={(event) => {
              manualSelectionTargetKey.current = null;
              setLegacyManualTargetKey(null);
              onTargetChange({
                provider,
                instance: event.target.value,
                model: '',
                modelSelection: null,
              });
            }}
          >
            {instanceOptions.map((option: ProductProviderInstanceDescriptor) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selectedInstanceCapabilitySummary ? (
        <span className="fieldHint providerCatalogHint">
          {selectedInstanceCapabilitySummary}
        </span>
      ) : null}
      <label className="fieldLabel">
        <div className="fieldLabelInline">
          <span>Model</span>
          <span className={`providerSupportBadge providerSupportBadge${supportBadge.tone}`}>
            {supportBadge.label}
          </span>
        </div>
        <select
          className="textInput"
          value={selectedEntryId}
          disabled={!isLegacyModelTarget && entryOptions.length === 0}
          onChange={(event) => {
            if (event.target.value === CUSTOM_LEGACY_MODEL_VALUE) {
              emitLegacyModel(persistedLegacyModelTarget ? model : '');
              return;
            }
            emitSelection({
              model: event.target.value,
              presetId: null,
              controls: undefined,
            });
          }}
        >
          {!isLegacyModelTarget ? (
            <option value="" disabled={entryOptions.length > 0}>
              {modelPlaceholder}
            </option>
          ) : null}
          {entryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.status ? ` (${option.status})` : ''}
            </option>
          ))}
          {allowLegacyManualModelEntry ? (
            <option value={CUSTOM_LEGACY_MODEL_VALUE}>Custom legacy model...</option>
          ) : null}
        </select>
        {selectedEntryNotes.length > 0 ? (
          <span className="fieldHint">
            {selectedEntryNotes[0]}
          </span>
        ) : primaryCatalogWarning ? (
          <span className="fieldHint">
            {primaryCatalogWarning}
          </span>
        ) : null}
      </label>
      {isLegacyModelTarget ? (
        <label className="fieldLabel">
          <span>Legacy Model ID</span>
          <input
            className="textInput"
            type="text"
            value={model}
            placeholder="e.g. claude-sonnet-4-6"
            onChange={(event) => {
              emitLegacyModel(event.target.value);
            }}
          />
          <span className="fieldHint">
            Manual model id passthrough. Runtime resolves this as the legacy `model` field, not a structured entry/preset selection.
          </span>
        </label>
      ) : (
        <label className="fieldLabel">
          <span>Mode</span>
          <select
            className="textInput"
            value={selectedPresetId}
            disabled={presetOptions.length === 0}
            onChange={(event) => {
              const preset = presetOptions.find((option) => option.id === event.target.value) ?? null;
              emitSelection({
                presetId: preset?.id ?? null,
                controls: preset?.controlDefaults
                  ? { ...preset.controlDefaults }
                  : undefined,
              });
            }}
          >
            <option value="">{presetOptions.length > 0 ? 'Standard' : 'Standard only'}</option>
            {presetOptions.map((preset) => (
              <option
                key={preset.id}
                value={preset.id}
                disabled={preset.availability === 'unavailable'}
              >
                {preset.label}
                {preset.availability === 'preview' ? ' (preview)' : ''}
                {preset.availability === 'unavailable' ? ' (unavailable)' : ''}
              </option>
            ))}
          </select>
          {selectedPresetId ? (
            <span className="fieldHint">
              {presetOptions.find((preset) => preset.id === selectedPresetId)?.description
                ?? 'Extra tuning for this model.'}
            </span>
          ) : presetOptions.length === 0 ? (
            <span className="fieldHint">
              This provider target exposes only the base catalog entry for persisted chat/session settings.
            </span>
          ) : null}
        </label>
      )}
      {controlOptions.map((control) => {
        const value = controlValues[control.key];
        if (control.kind === 'boolean') {
          return (
            <label className="fieldLabel providerControlField" key={control.key}>
              <span>{control.label}</span>
              <select
                className="textInput"
                value={serializeControlInputValue(value)}
                onChange={(event) => {
                  const nextControls = event.target.value
                    ? {
                        ...controlValues,
                        [control.key]: parseControlInputValue(control, event.target.value),
                      }
                    : Object.fromEntries(
                        Object.entries(controlValues).filter(([key]) => key !== control.key),
                      );
                  emitSelection({
                    presetId: selectedPresetId || null,
                    controls: Object.keys(nextControls).length > 0 ? nextControls : undefined,
                  });
                }}
              >
                <option value="">Default</option>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
              {control.description ? (
                <span className="fieldHint">{control.description}</span>
              ) : null}
            </label>
          );
        }

        if (control.kind === 'enum' && control.values && control.values.length > 0) {
          const controlValueOptions = listApplicableControlValueOptions(
            control,
            selectedCatalogEntryId,
          );
          const showSyntheticDefaultOption = !hasExplicitDefaultEnumOption(
            control,
            selectedCatalogEntryId,
          );
          const displayedValue = resolveDisplayedEnumControlValue(
            control,
            selectedCatalogEntryId,
            value,
          );
          return (
            <label className="fieldLabel providerControlField" key={control.key}>
              <span>{control.label}</span>
              <select
                className="textInput"
                value={displayedValue}
                onChange={(event) => {
                  const nextControls = event.target.value
                    ? {
                        ...controlValues,
                        [control.key]: parseControlInputValue(control, event.target.value),
                      }
                    : Object.fromEntries(
                        Object.entries(controlValues).filter(([key]) => key !== control.key),
                      );
                  emitSelection({
                    presetId: selectedPresetId || null,
                    controls: Object.keys(nextControls).length > 0 ? nextControls : undefined,
                  });
                }}
              >
                {showSyntheticDefaultOption ? <option value="">Default</option> : null}
                {controlValueOptions.map((option) => (
                  <option key={`${control.key}-${String(option.value)}`} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
              {control.description ? (
                <span className="fieldHint">{control.description}</span>
              ) : null}
            </label>
          );
        }

        return (
          <label className="fieldLabel providerControlField" key={control.key}>
            <span>{control.label}</span>
            <input
              className="textInput"
              type={control.kind === 'number' ? 'number' : 'text'}
              value={serializeControlInputValue(value)}
              min={control.kind === 'number' ? control.minimum : undefined}
              max={control.kind === 'number' ? control.maximum : undefined}
              step={control.kind === 'number' ? control.step ?? 1 : undefined}
              placeholder="Optional"
              onChange={(event) => {
                const nextRaw = event.target.value;
                const nextControls = nextRaw
                  ? {
                      ...controlValues,
                      [control.key]: parseControlInputValue(control, nextRaw),
                    }
                  : Object.fromEntries(
                      Object.entries(controlValues).filter(([key]) => key !== control.key),
                    );
                emitSelection({
                  presetId: selectedPresetId || null,
                  controls: Object.keys(nextControls).length > 0 ? nextControls : undefined,
                });
              }}
            />
            {control.description ? (
              <span className="fieldHint">{control.description}</span>
            ) : null}
          </label>
        );
      })}
      {requestScopedControlCount > 0 ? (
        <span className="fieldHint providerCatalogHint">
          Request-only runtime overrides are hidden here because this selector persists chat/session defaults.
        </span>
      ) : null}
      {effectiveAdvancedCatalog.warnings.length > 0 ? (
        <span className="fieldHint providerCatalogHint">
          {effectiveAdvancedCatalog.warnings[0]}
        </span>
      ) : null}
    </>
  );
}
