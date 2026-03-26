import { useEffect, useRef, useState } from 'react';

import {
  createProviderAdvancedCatalogFromModelCatalog,
  createStaticProviderAdvancedModelCatalog,
  createStaticProviderModelCatalog,
  getProviderDisplayName,
  listProductProviders,
  type ProductProviderDescriptor,
  type ProductProviderInstanceDescriptor,
  type ProviderAdvancedCatalogControl,
  type ProviderAdvancedCatalogPreset,
  type ProviderAdvancedControlValue,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  cloneProviderModelSelection,
  createExplicitProviderModelSelection,
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
  fetchProviders: () => Promise<ProductProviderDescriptor[]>;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
}

function createFallbackProvider(provider: string): ProductProviderDescriptor {
  return {
    id: provider as ProductProviderDescriptor['id'],
    label: getProviderDisplayName(provider),
    defaultModel: null,
    defaultInstance: null,
    defaultBackend: null,
    instances: [],
    modelsPath: `/api/providers/${provider}/models`,
  };
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

function instanceKey(value: string | null | undefined): string {
  return value?.trim() || '';
}

export function shouldShowInstanceField(input: {
  resolvedInstance: string;
  instanceOptions: ProductProviderInstanceDescriptor[];
}): boolean {
  return input.instanceOptions.length > 1;
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
  fetchProviders,
  fetchProviderModels,
  fetchAdvancedProviderModels,
}: SharedProviderModelFieldsProps) {
  const [providers, setProviders] = useState<ProductProviderDescriptor[]>(() => listProductProviders());
  const [catalog, setCatalog] = useState<ProviderModelCatalog>(() =>
    createStaticProviderModelCatalog(provider),
  );
  const [advancedCatalog, setAdvancedCatalog] = useState<ProviderAdvancedModelCatalog>(() =>
    createStaticProviderAdvancedModelCatalog(provider),
  );
  const manualSelectionTargetKey = useRef<string | null>(null);
  const previousTargetKey = useRef<string>('');
  const onTargetChangeRef = useRef(onTargetChange);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    let cancelled = false;

    void fetchProviders()
      .then((nextProviders) => {
        if (!cancelled && nextProviders.length > 0) {
          setProviders(nextProviders);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [fetchProviders]);

  const providerOptions = providers.some((option) => option.id === provider)
    ? providers
    : [createFallbackProvider(provider), ...providers];
  const selectedProvider =
    providerOptions.find((option) => option.id === provider) ?? createFallbackProvider(provider);
  const resolvedInstance = resolveSelectedProviderInstance(selectedProvider, instance);
  const fallbackCatalog = createStaticProviderModelCatalog(provider, {
    instance: resolvedInstance || null,
  });
  const fallbackAdvancedCatalog = createProviderAdvancedCatalogFromModelCatalog(fallbackCatalog);
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
  const preserveExistingSelection = manualSelectionTargetKey.current === targetKey || Boolean(modelSelection);

  useEffect(() => {
    if (previousTargetKey.current !== targetKey) {
      previousTargetKey.current = targetKey;
      manualSelectionTargetKey.current = null;
    }
    if (resolvedInstance !== instance) {
      onTargetChangeRef.current({
        provider,
        instance: resolvedInstance,
        model,
        modelSelection,
      });
    }
  }, [instance, model, modelSelection, provider, resolvedInstance, targetKey]);

  useEffect(() => {
    let cancelled = false;
    const nextFallbackCatalog = createStaticProviderModelCatalog(provider, {
      instance: resolvedInstance || null,
    });

    setCatalog(nextFallbackCatalog);
    setAdvancedCatalog(createProviderAdvancedCatalogFromModelCatalog(nextFallbackCatalog));

    void Promise.allSettled([
      fetchProviderModels(provider, resolvedInstance || null),
      fetchAdvancedProviderModels(provider, resolvedInstance || null),
    ]).then(([modelsResult, advancedResult]) => {
      if (cancelled) {
        return;
      }

      const nextCatalog = modelsResult.status === 'fulfilled'
        ? modelsResult.value
        : nextFallbackCatalog;
      setCatalog(nextCatalog);

      if (advancedResult.status === 'fulfilled') {
        setAdvancedCatalog(advancedResult.value);
        return;
      }

      setAdvancedCatalog(createProviderAdvancedCatalogFromModelCatalog(nextCatalog));
    });

    return () => {
      cancelled = true;
    };
  }, [
    fetchAdvancedProviderModels,
    fetchProviderModels,
    provider,
    resolvedInstance,
  ]);

  useEffect(() => {
    if (effectiveCatalog.models.length === 0) {
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

    if (
      nextTarget.instance !== instance
      || nextTarget.model !== model
      || !sameProviderModelSelection(nextTarget.modelSelection, modelSelection)
    ) {
      onTargetChangeRef.current(nextTarget);
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
  ]);

  const instanceOptions = selectedProvider.instances.some((option) => option.id === resolvedInstance)
    ? selectedProvider.instances
    : resolvedInstance
      ? [{
          id: resolvedInstance,
          label: resolvedInstance,
          target: resolvedInstance,
          backend: null,
        }, ...selectedProvider.instances]
      : selectedProvider.instances;
  const showInstanceField = shouldShowInstanceField({
    resolvedInstance,
    instanceOptions,
  });
  const entryOptions = effectiveAdvancedCatalog.entries.length > 0
    ? effectiveAdvancedCatalog.entries
    : effectiveCatalog.models;
  const selectedEntryId = entryOptions.some((option) => option.id === model)
    ? model
    : entryOptions[0]?.id ?? '';
  const presetOptions = effectiveAdvancedCatalog.presets.filter((preset) =>
    presetAppliesToEntry(preset, selectedEntryId));
  const selectedPresetId = presetOptions.some((preset) => preset.id === modelSelection?.presetId)
    ? modelSelection?.presetId ?? ''
    : '';
  const controlOptions = effectiveAdvancedCatalog.controls.filter((control) =>
    controlAppliesToEntry(control, selectedEntryId));
  const controlValues = modelSelection?.controls ?? {};

  function emitSelection(next: {
    model?: string;
    instance?: string;
    presetId?: string | null;
    controls?: Record<string, ProviderAdvancedControlValue> | undefined;
  }): void {
    const nextModel = next.model ?? selectedEntryId;
    const nextControls = next.controls;
    const nextPresetId = next.presetId ?? null;
    manualSelectionTargetKey.current = targetKey;
    onTargetChange({
      provider,
      instance: next.instance ?? resolvedInstance,
      model: nextModel,
      modelSelection: buildSelectionForEntry(nextModel, nextPresetId, nextControls),
    });
  }

  return (
    <>
      <label className="fieldLabel">
        <span>Provider</span>
        <select
          className="textInput"
          value={provider}
          onChange={(event) => {
            const nextProvider = providerOptions.find((option) => option.id === event.target.value)
              ?? createFallbackProvider(event.target.value);
            const nextInstance = resolveSelectedProviderInstance(nextProvider, '');
            manualSelectionTargetKey.current = null;
            onTargetChange({
              provider: nextProvider.id,
              instance: nextInstance,
              model: '',
              modelSelection: null,
            });
          }}
        >
          {providerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {showInstanceField ? (
        <label className="fieldLabel">
          <span>Instance</span>
          <select
            className="textInput"
            value={resolvedInstance}
            onChange={(event) => {
              manualSelectionTargetKey.current = null;
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
      <label className="fieldLabel">
        <span>Model</span>
        <select
          className="textInput"
          value={selectedEntryId}
          onChange={(event) => {
            emitSelection({
              model: event.target.value,
              presetId: null,
              controls: undefined,
            });
          }}
        >
          {entryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.status ? ` (${option.status})` : ''}
            </option>
          ))}
        </select>
      </label>
      {presetOptions.length > 0 ? (
        <label className="fieldLabel">
          <span>Preset</span>
          <select
            className="textInput"
            value={selectedPresetId}
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
            <option value="">No preset</option>
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
                ?? 'Runtime preset for this model.'}
            </span>
          ) : null}
        </label>
      ) : null}
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
                  const nextControls = {
                    ...controlValues,
                    [control.key]: parseControlInputValue(control, event.target.value),
                  };
                  emitSelection({
                    presetId: selectedPresetId || null,
                    controls: nextControls,
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
                {control.values.map((option) => (
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
              placeholder={control.scope === 'request' ? 'Optional request override' : 'Optional'}
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
              <span className="fieldHint">
                {control.description}
                {control.scope === 'request' ? ' Runtime may treat this as request-scoped.' : ''}
              </span>
            ) : null}
          </label>
        );
      })}
      {effectiveAdvancedCatalog.warnings.length > 0 ? (
        <span className="fieldHint providerCatalogHint">
          {effectiveAdvancedCatalog.warnings[0]}
        </span>
      ) : null}
    </>
  );
}
