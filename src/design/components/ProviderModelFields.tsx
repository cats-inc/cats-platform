import {
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedModelCatalog,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  resolveSelectedProviderInstance,
  type ProviderModelSelection,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import {
  PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS,
  catalogMatchesTarget,
  filterPersistentControlValues,
  hasExplicitDefaultEnumOption,
  listApplicableControlValueOptions,
  resolveProviderModelFieldsViewState,
  resolveDisplayedEnumControlValue,
  serializeControlInputValue,
  shouldAutoRecheckProviderRegistry,
} from './providerModelFieldsSupport.js';
import { useProviderCatalogState } from './useProviderCatalogState.js';
import {
  CUSTOM_LEGACY_MODEL_VALUE,
  useProviderModelFieldActions,
} from './useProviderModelFieldActions.js';
import { useProviderRegistryAutoRecheck } from './useProviderRegistryAutoRecheck.js';
import { useProviderRegistryState } from './useProviderRegistryState.js';
import { useProviderTargetReconciliation } from './useProviderTargetReconciliation.js';

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
    markManualSelection,
    markLegacyManualSelection,
    clearManualSelection,
    onTargetChange,
  });

  return (
    <>
      <label className="fieldLabel">
        <span>AI Service</span>
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
          <span className={`providerSupportBadge providerSupportBadge${supportBadge.tone}`}>
            {supportBadge.label}
          </span>
        </div>
        <select
          className="textInput"
          value={selectedEntryId}
          disabled={!isLegacyModelTarget && entryOptions.length === 0}
          onChange={(event) => onModelEntryChange(event.target.value)}
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
      {controlOptions.map((control) => {
        const value = controlValues[control.key];
        if (control.kind === 'boolean') {
          return (
            <label className="fieldLabel providerControlField" key={control.key}>
              <span>{control.label}</span>
              <select
                className="textInput"
                value={serializeControlInputValue(value)}
                onChange={(event) => onControlChange(control, event.target.value)}
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
                onChange={(event) => onControlChange(control, event.target.value)}
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
              onChange={(event) => onControlChange(control, event.target.value)}
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
