import { useEffect, useRef, useState } from 'react';

import {
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedControlValue,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
  sameProviderModelSelection,
  type ProviderModelSelection,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import {
  CUSTOM_LEGACY_MODEL_VALUE,
  PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  buildSelectionForEntry,
  catalogMatchesTarget,
  createDefaultProviderRegistryReadModel,
  createEmptyProviderAdvancedModelCatalog,
  createEmptyProviderModelCatalog,
  filterPersistentControlValues,
  hasExplicitDefaultEnumOption,
  listApplicableControlValueOptions,
  resolveProviderModelFieldsViewState,
  resolveAdvancedCatalogFallback,
  resolveDisplayedEnumControlValue,
  sanitizePersistentTargetSelection,
  sanitizeProviderRegistryReadModel,
  serializeControlInputValue,
  shouldAutoRecheckProviderRegistry,
  shouldDeferCatalogTargetReconciliation,
  shouldTreatPersistedTargetAsLegacyModel,
  updatePersistentControlValues,
} from './providerModelFieldsSupport.js';

export {
  CUSTOM_LEGACY_MODEL_VALUE,
  PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  catalogMatchesTarget,
  countRequestScopedControls,
  filterPersistentControlValues,
  hasExplicitDefaultEnumOption,
  listPersistentControlOptions,
  resolveDisplayedEnumControlValue,
  resolveProviderModelFieldsViewState,
  resolveProviderRegistryHint,
  resolveProviderRegistryPlaceholder,
  resolveProviderRegistrySetupHref,
  resolveProviderSupportBadge,
  resolveSelectedInstanceEventCapabilities,
  sanitizePersistentTargetSelection,
  shouldAllowLegacyManualModelEntry,
  shouldAutoRecheckProviderRegistry,
  shouldDeferCatalogTargetReconciliation,
  shouldShowInstanceField,
  shouldTreatPersistedTargetAsLegacyModel,
  updatePersistentControlValues,
} from './providerModelFieldsSupport.js';

interface SharedProviderModelFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
  fetchProviderRegistry: (options?: { force?: boolean }) => Promise<ProductProviderRegistryReadModel>;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
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
  const [lastAutoProviderRegistryRecheckAt, setLastAutoProviderRegistryRecheckAt] = useState(0);
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
  const providerRegistryRequestIdRef = useRef(0);

  useEffect(() => {
    onTargetChangeRef.current = onTargetChange;
  }, [onTargetChange]);

  useEffect(() => {
    onProviderRegistryChangeRef.current = onProviderRegistryChange;
  }, [onProviderRegistryChange]);

  function commitProviderRegistry(
    requestId: number,
    nextRegistryResult: ProductProviderRegistryReadModel,
  ): void {
    if (requestId !== providerRegistryRequestIdRef.current) {
      return;
    }
    const nextRegistry = sanitizeProviderRegistryReadModel(nextRegistryResult);
    setProviders(nextRegistry.providers);
    setProviderRegistry(nextRegistry);
    setProvidersLoaded(true);
    onProviderRegistryChangeRef.current?.(nextRegistry);
  }

  function commitProviderRegistryError(
    requestId: number,
    error: unknown,
  ): void {
    if (requestId !== providerRegistryRequestIdRef.current) {
      return;
    }
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

  useEffect(() => {
    let cancelled = false;
    const requestId = ++providerRegistryRequestIdRef.current;

    void fetchProviderRegistry()
      .then((nextRegistryResult) => {
        if (!cancelled) {
          commitProviderRegistry(requestId, nextRegistryResult);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          commitProviderRegistryError(requestId, error);
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
  const isLegacyModelTarget =
    legacyManualTargetKey === targetKey
    || persistedLegacyModelTarget;
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

      setAdvancedCatalog(resolveAdvancedCatalogFallback({
        provider,
        instance: resolvedInstance || null,
        catalog: nextCatalog,
        advancedCatalogResult: advancedResult,
        modelsResult,
      }));

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

  const {
    entryOptions,
    instanceOptions,
    showInstanceField,
    selectedInstanceCapabilitySummary,
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
  } = resolveProviderModelFieldsViewState({
    selectedProvider,
    provider,
    instance,
    model,
    modelSelection,
    catalogLoading,
    providersLoaded,
    providerRegistry: {
      ...providerRegistry,
      providers: providerOptions,
    },
    effectiveCatalog,
    effectiveAdvancedCatalog,
    isLegacyModelTarget,
  });

  function reloadProviderRegistry(options?: { markAutoRecheckAt?: number }): void {
    if (options?.markAutoRecheckAt !== undefined) {
      setLastAutoProviderRegistryRecheckAt(options.markAutoRecheckAt);
    }
    setProvidersLoaded(false);
    setProviderRegistryReloadToken((current) => current + 1);
  }

  function forceReloadProviderRegistry(options?: { markAutoRecheckAt?: number }): void {
    if (options?.markAutoRecheckAt !== undefined) {
      setLastAutoProviderRegistryRecheckAt(options.markAutoRecheckAt);
    }
    setProvidersLoaded(false);
    const requestId = ++providerRegistryRequestIdRef.current;
    void fetchProviderRegistry({ force: true })
      .then((nextRegistryResult) => {
        commitProviderRegistry(requestId, nextRegistryResult);
      })
      .catch((error) => {
        commitProviderRegistryError(requestId, error);
      });
  }

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    function maybeAutoRecheck(): void {
      const now = Date.now();
      const shouldRecheck = shouldAutoRecheckProviderRegistry({
        providersLoaded,
        providerCount: providerOptions.length,
        registryState: providerRegistry.state,
        retryable: providerRegistry.recovery?.retryable !== false,
        hasSetupHref: Boolean(providerRegistrySetupHref),
        documentVisible: document.visibilityState !== 'hidden',
        lastAutoRecheckAt: lastAutoProviderRegistryRecheckAt,
        now,
      });
      if (!shouldRecheck) {
        return;
      }
      reloadProviderRegistry({ markAutoRecheckAt: now });
    }

    window.addEventListener('focus', maybeAutoRecheck);
    document.addEventListener('visibilitychange', maybeAutoRecheck);
    return () => {
      window.removeEventListener('focus', maybeAutoRecheck);
      document.removeEventListener('visibilitychange', maybeAutoRecheck);
    };
  }, [
    lastAutoProviderRegistryRecheckAt,
    providerOptions.length,
    providerRegistry.recovery?.retryable,
    providerRegistry.state,
    providerRegistrySetupHref,
    providersLoaded,
  ]);

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
                  onClick={() => forceReloadProviderRegistry()}
                >
                  Retry
                </button>
                {providerRegistrySetupHref ? (
                  <a
                    className="secondaryButton"
                    href={providerRegistrySetupHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Cats Runtime setup
                  </a>
                ) : null}
              </div>
            ) : providerRegistrySetupHref ? (
              <div className="providerCatalogRecoveryActions">
                <a
                  className="secondaryButton"
                  href={providerRegistrySetupHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Cats Runtime setup
                </a>
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
            {instanceOptions.map((option) => (
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
                  emitSelection({
                    presetId: selectedPresetId || null,
                    controls: updatePersistentControlValues({
                      control,
                      currentValues: controlValues,
                      rawValue: event.target.value,
                    }),
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
                  emitSelection({
                    presetId: selectedPresetId || null,
                    controls: updatePersistentControlValues({
                      control,
                      currentValues: controlValues,
                      rawValue: event.target.value,
                    }),
                  });
                }}
              >
                {showSyntheticDefaultOption ? <option value="">Default</option> : null}
                  {controlValueOptions.map((option, index) => (
                    <option
                      key={`${control.key}-${String(option.value)}-${index}`}
                      value={String(option.value)}
                    >
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
                emitSelection({
                  presetId: selectedPresetId || null,
                  controls: updatePersistentControlValues({
                    control,
                    currentValues: controlValues,
                    rawValue: event.target.value,
                  }),
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
