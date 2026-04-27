import React, { useEffect, useMemo, useRef } from 'react';

import {
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import { peekRememberedExecutionLabel } from '../../shared/executionLabel.js';
import {
  resolveSelectedProviderInstance,
  type ProviderModelSelection,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import {
  PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  catalogMatchesTarget,
  filterPersistentControlValues,
  formatCatalogEntryLabel,
  resolveExecutionLabelForProviderTarget,
  resolveProviderModelFieldsViewState,
  shouldAutoRecheckProviderRegistry,
} from './providerModelFieldsSupport.js';
import { ProviderModelFieldControls } from './ProviderModelFieldControls.js';
import { ProviderRegistryRecovery } from './ProviderRegistryRecovery.js';
import { useProviderCatalogState } from './useProviderCatalogState.js';
import {
  CUSTOM_LEGACY_MODEL_VALUE,
  useProviderModelFieldActions,
} from './useProviderModelFieldActions.js';
import { useProviderRegistryAutoRecheck } from './useProviderRegistryAutoRecheck.js';
import { useProviderRegistryState } from './useProviderRegistryState.js';
import { useProviderTargetReconciliation } from './useProviderTargetReconciliation.js';

export {
  attachExecutionLabelToProviderTarget,
  CUSTOM_LEGACY_MODEL_VALUE,
  PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  catalogMatchesTarget,
  countRequestScopedControls,
  createStaticProviderRegistryReadModel,
  filterPersistentControlValues,
  formatCatalogEntryLabel,
  hasExplicitDefaultEnumOption,
  listPersistentControlOptions,
  resolveDisplayedEnumControlValue,
  resolveExecutionLabelForProviderTarget,
  resolveCatalogEntryStatusSuffix,
  resolveProviderModelFieldsViewState,
  resolveProviderRegistryHint,
  resolveProviderRegistryAutoRecheckDelayMs,
  resolveProviderRegistryPlaceholder,
  resolveProviderRegistrySetupHref,
  resolveProviderSupportBadge,
  resolveSelectedInstanceEventCapabilities,
  resolveUnsupportedPersistentControlWarning,
  sanitizePersistentTargetSelection,
  shouldAllowLegacyManualModelEntry,
  shouldAutoRecheckProviderRegistry,
  shouldDeferCatalogTargetReconciliation,
  shouldShowInstanceField,
  shouldTreatPersistedTargetAsLegacyModel,
  updatePersistentControlValues,
} from './providerModelFieldsSupport.js';

export interface ProviderRegistryRecoveryState {
  canRetry: boolean;
  retry: () => void;
  setupHref: string | null;
}

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
  /** When true, the inline Retry button under the Provider dropdown is hidden
   * so callers can surface it elsewhere (e.g. in the Brain subcard header). */
  hideInlineRetry?: boolean;
  /** Called when the registry recovery state (canRetry/setupHref) changes so
   * callers can render their own Retry affordance; receives null on unmount. */
  onRegistryRecoveryChange?: (state: ProviderRegistryRecoveryState | null) => void;
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
  hideInlineRetry = false,
  onRegistryRecoveryChange,
}: SharedProviderModelFieldsProps) {
  const {
    providers,
    providerRegistry,
    providersLoaded,
    lastAutoProviderRegistryRecheckAt,
    reloadProviderRegistry,
    forceReloadProviderRegistry,
  } = useProviderRegistryState({
    fetchProviderRegistry,
    onProviderRegistryChange,
  });

  const providerOptions = providers;
  const selectedProvider = providerOptions.find((option) => option.id === provider) ?? null;
  const resolvedInstance = selectedProvider
    ? resolveSelectedProviderInstance(selectedProvider, instance)
    : '';
  const {
    catalogLoading,
    effectiveCatalog,
    effectiveAdvancedCatalog,
  } = useProviderCatalogState({
    provider,
    resolvedInstance,
    hasSelectedProvider: Boolean(selectedProvider),
    fetchProviderModels,
    fetchAdvancedProviderModels,
  })
  const {
    persistedLegacyModelTarget,
    isLegacyModelTarget,
    clearManualSelection,
    markManualSelection,
    markLegacyManualSelection,
  } = useProviderTargetReconciliation({
    provider,
    instance,
    model,
    modelSelection,
    resolvedInstance,
    hasSelectedProvider: Boolean(selectedProvider),
    catalogLoading,
    effectiveCatalog,
    effectiveAdvancedCatalog,
    onTargetChange,
  });

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
    unsupportedSelectionWarning,
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

  useProviderRegistryAutoRecheck({
    providersLoaded,
    providerCount: providerOptions.length,
    registryState: providerRegistry.state,
    retryable: providerRegistry.recovery?.retryable !== false,
    providerRegistrySetupHref,
    lastAutoProviderRegistryRecheckAt,
    reloadProviderRegistry,
  });

  // Give consumers (e.g. the Brain subcard header) a stable way to reach
  // `forceReloadProviderRegistry` without re-running the effect every render:
  // forceReloadProviderRegistry is created fresh on each render of the state
  // hook, so we capture the latest version in a ref and expose a stable
  // wrapper.
  const forceReloadRef = useRef(forceReloadProviderRegistry);
  forceReloadRef.current = forceReloadProviderRegistry;
  const stableForceReload = useMemo(
    () => (): void => forceReloadRef.current(),
    [],
  );
  const onRegistryRecoveryChangeRef = useRef(onRegistryRecoveryChange);
  onRegistryRecoveryChangeRef.current = onRegistryRecoveryChange;
  useEffect(() => {
    onRegistryRecoveryChangeRef.current?.({
      canRetry: canRetryProviderRegistry,
      retry: stableForceReload,
      setupHref: providerRegistrySetupHref,
    });
  }, [canRetryProviderRegistry, providerRegistrySetupHref, stableForceReload]);
  useEffect(() => () => {
    onRegistryRecoveryChangeRef.current?.(null);
  }, []);

  const {
    onProviderChange,
    onInstanceChange,
    onModelEntryChange,
    onLegacyModelChange,
    onPresetChange,
    onControlChange,
  } = useProviderModelFieldActions({
    providerOptions,
    provider,
    resolvedInstance,
    model,
    persistedLegacyModelTarget,
    selectedCatalogEntryId,
    selectedPresetId,
    presetOptions,
    controlValues,
    effectiveControls: effectiveAdvancedCatalog.controls,
    effectiveCatalog,
    effectiveAdvancedCatalog,
    markManualSelection,
    markLegacyManualSelection,
    clearManualSelection,
    onTargetChange,
  });

  useEffect(() => {
    const trimmedModel = model.trim();
    if (!selectedProvider || !trimmedModel) {
      return;
    }

    const rememberedExecutionLabel = peekRememberedExecutionLabel({
      provider,
      instance: resolvedInstance,
      model: trimmedModel,
      modelSelection: modelSelection ?? null,
    });
    const resolvedExecutionLabel = resolveExecutionLabelForProviderTarget({
      provider,
      instance: resolvedInstance,
      model: trimmedModel,
      modelSelection: modelSelection ?? null,
      effectiveCatalog,
      effectiveAdvancedCatalog,
    });
    if (rememberedExecutionLabel === resolvedExecutionLabel) {
      return;
    }

    onTargetChange({
      provider,
      instance: resolvedInstance,
      model: trimmedModel,
      modelSelection: modelSelection ?? null,
      executionLabel: resolvedExecutionLabel,
    });
  }, [
    effectiveAdvancedCatalog,
    effectiveCatalog,
    model,
    modelSelection,
    onTargetChange,
    provider,
    resolvedInstance,
    selectedProvider,
  ]);

  return (
    <>
      <label className="fieldLabel">
        <span>Provider</span>
        <select
          className="textInput"
          value={selectedProvider?.id ?? ''}
          disabled={providerOptions.length === 0}
          onChange={(event) => onProviderChange(event.target.value)}
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
          <ProviderRegistryRecovery
            providerRegistryHint={providerRegistryHint}
            canRetryProviderRegistry={canRetryProviderRegistry}
            providerRegistrySetupHref={providerRegistrySetupHref}
            forceReloadProviderRegistry={forceReloadProviderRegistry}
            hideRetry={hideInlineRetry}
          />
        ) : null}
      </label>
      {showInstanceField ? (
        <label className="fieldLabel">
          <span>Provider instance</span>
          <select
            className="textInput"
            value={resolvedInstance}
            onChange={(event) => onInstanceChange(event.target.value)}
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
          {supportBadge ? (
            <span className={`providerSupportBadge providerSupportBadge${supportBadge.tone}`}>
              {supportBadge.label}
            </span>
          ) : null}
        </div>
        <select
          className="textInput"
          value={selectedEntryId}
          disabled={!isLegacyModelTarget && entryOptions.length === 0}
          onChange={(event) => onModelEntryChange(event.target.value)}
        >
          {!isLegacyModelTarget && entryOptions.length === 0 ? (
            <option value="" disabled>
              {modelPlaceholder}
            </option>
          ) : null}
          {entryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {formatCatalogEntryLabel(option)}
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
          <span>Legacy model ID</span>
          <input
            className="textInput"
            type="text"
            value={model}
            placeholder="e.g. claude-sonnet-4-6"
            onChange={(event) => onLegacyModelChange(event.target.value)}
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
            onChange={(event) => onPresetChange(event.target.value)}
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
      <ProviderModelFieldControls
        controlOptions={controlOptions}
        selectedCatalogEntryId={selectedCatalogEntryId}
        controlValues={controlValues}
        onControlChange={onControlChange}
      />
      {unsupportedSelectionWarning ? (
        <span className="fieldHint providerCatalogHint">
          {unsupportedSelectionWarning}
        </span>
      ) : null}
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
