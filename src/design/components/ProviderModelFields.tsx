import React from 'react';

import {
  providerInstanceTarget,
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
  catalogMatchesTarget,
  filterPersistentControlValues,
  formatCatalogEntryLabel,
  resolveExecutionLabelForProviderTarget,
  resolveProviderModelFieldsViewState,
} from './providerModelFieldsSupport.js';
import { ProviderModelFieldControls } from './ProviderModelFieldControls.js';
import { useProviderCatalogState } from './useProviderCatalogState.js';
import {
  CUSTOM_LEGACY_MODEL_VALUE,
  useProviderModelFieldActions,
} from './useProviderModelFieldActions.js';
import { useProviderRegistryState } from './useProviderRegistryState.js';
import { useProviderTargetReconciliation } from './useProviderTargetReconciliation.js';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../shared/i18n/index.js';

export {
  attachExecutionLabelToProviderTarget,
  CUSTOM_LEGACY_MODEL_VALUE,
  LAST_SAVED_PROVIDER_TARGETS_WARNING,
  PRODUCT_PROVIDER_CATALOG_CHECKING_WARNING,
  PROVIDER_LOAD_FAILED_WARNING,
  PROVIDER_REFRESH_FAILED_WARNING,
  catalogMatchesTarget,
  countRequestScopedControls,
  filterPersistentControlValues,
  formatCatalogEntryLabel,
  hasExplicitDefaultEnumOption,
  listPersistentControlOptions,
  resolveDisplayedEnumControlValue,
  resolveExecutionLabelForProviderTarget,
  resolveCatalogEntryStatusSuffix,
  resolveProviderModelFieldsViewState,
  resolveProviderRegistryHint,
  resolveProviderRegistryPlaceholder,
  resolveProviderRegistrySetupHref,
  resolveProviderSupportBadge,
  resolveSelectedInstanceEventCapabilities,
  resolveUnsupportedPersistentControlWarning,
  sanitizePersistentTargetSelection,
  shouldAllowLegacyManualModelEntry,
  shouldDeferCatalogTargetReconciliation,
  shouldShowInstanceField,
  shouldTreatPersistedTargetAsLegacyModel,
  translateProviderRegistryWarning,
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
  const { t } = useI18n();

  const {
    providers,
    providerRegistry,
    providersLoaded,
    providersLoading,
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
    catalogResolved,
    catalogConfigurationRequired,
    effectiveCatalog,
    effectiveAdvancedCatalog,
  } = useProviderCatalogState({
    provider,
    resolvedInstance,
    hasSelectedProvider: Boolean(selectedProvider),
    selectionRevision: providerRegistry.revision,
    fetchProviderModels,
    fetchAdvancedProviderModels,
  });
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
    catalogResolved,
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
    providerPlaceholder,
    modelPlaceholder,
    allowLegacyManualModelEntry,
  } = resolveProviderModelFieldsViewState({
    selectedProvider,
    provider,
    instance,
    model,
    modelSelection,
    catalogLoading,
    catalogConfigurationRequired,
    providersLoaded,
    providerRegistry: {
      ...providerRegistry,
      providers: providerOptions,
    },
    effectiveCatalog,
    effectiveAdvancedCatalog,
    isLegacyModelTarget,
    translate: t,
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
    effectiveControls: effectiveAdvancedCatalog.entries.find(entry => entry.id === selectedCatalogEntryId)?.controls ?? effectiveAdvancedCatalog.controls,
    effectiveCatalog,
    effectiveAdvancedCatalog,
    markManualSelection,
    markLegacyManualSelection,
    clearManualSelection,
    onTargetChange,
  });

  return (
    <>
      <label className="fieldLabel">
        <span className="fieldLabelInline">
          <span>{t(messageKeys.sharedProviderModelFieldProviderLabel)}</span>
          {providersLoading ? (
            <ProviderPickerLoading label={t(messageKeys.sharedProviderModelFieldLoadingProviders)} />
          ) : null}
        </span>
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
                  {t(messageKeys.sharedProviderModelFieldSelectProviderHint)}
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
      </label>
      {showInstanceField ? (
        <label className="fieldLabel">
          <span>{t(messageKeys.sharedProviderModelFieldProviderInstanceLabel)}</span>
          <select
            className="textInput"
            value={resolvedInstance}
            onChange={(event) => onInstanceChange(event.target.value)}
          >
            {instanceOptions.map((option) => (
              <option key={providerInstanceTarget(option)} value={providerInstanceTarget(option)}>
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
          <span>{t(messageKeys.sharedProviderModelFieldModelLabel)}</span>
          {catalogLoading ? (
            <ProviderPickerLoading label={t(messageKeys.sharedProviderModelFieldLoadingModels)} />
          ) : null}
          {supportBadge ? (
            <span className={`providerSupportBadge providerSupportBadge${supportBadge.tone}`}>
              {t(supportBadge.labelKey)}
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
            <option value={CUSTOM_LEGACY_MODEL_VALUE}>
              {t(messageKeys.sharedProviderModelFieldCustomLegacyModelLabel)}
            </option>
          ) : null}
        </select>
        {catalogConfigurationRequired && entryOptions.length > 0 ? (
          <span className="fieldHint" role="status">
            {t(messageKeys.sharedProviderModelFieldCatalogConfigurationRequired)}
          </span>
        ) : null}
        {selectedEntryNotes.length > 0 ? (
          <span className="fieldHint">
            {selectedEntryNotes[0]}
          </span>
        ) : null}
      </label>
      {isLegacyModelTarget ? (
        <label className="fieldLabel">
          <span>{t(messageKeys.sharedProviderModelFieldLegacyModelIdLabel)}</span>
          <input
            className="textInput"
            type="text"
            value={model}
            placeholder={t(messageKeys.sharedProviderModelFieldLegacyModelIdPlaceholder)}
            onChange={(event) => onLegacyModelChange(event.target.value)}
          />
          <span className="fieldHint">
            {t(messageKeys.sharedProviderModelFieldLegacyModelIdHint)}
          </span>
        </label>
      ) : (
        <label className="fieldLabel">
          <span>{t(messageKeys.sharedProviderModelFieldModeLabel)}</span>
          <select
            className="textInput"
            value={selectedPresetId}
            disabled={presetOptions.length === 0}
            onChange={(event) => onPresetChange(event.target.value)}
          >
            <option value="">
              {presetOptions.length > 0
                ? t(messageKeys.sharedProviderModelFieldModeStandardLabel)
                : t(messageKeys.sharedProviderModelFieldModeStandardOnlyLabel)}
            </option>
            {presetOptions.map((preset) => (
              <option
                key={preset.id}
                value={preset.id}
                disabled={preset.availability === 'unavailable'}
              >
                {preset.label}
                {preset.availability === 'preview'
                  ? t(messageKeys.sharedProviderModelFieldPresetPreviewSuffix)
                  : ''}
                {preset.availability === 'unavailable'
                  ? t(messageKeys.sharedProviderModelFieldPresetUnavailableSuffix)
                  : ''}
              </option>
            ))}
          </select>
          {selectedPresetId ? (
            <span className="fieldHint">
              {presetOptions.find((preset) => preset.id === selectedPresetId)?.description
                ?? t(messageKeys.sharedProviderModelFieldPresetTuningDescriptionFallback)}
            </span>
          ) : presetOptions.length === 0 ? (
            <span className="fieldHint">
              {t(messageKeys.sharedProviderModelFieldModeOnlyBaseHint)}
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
          {t(messageKeys.sharedProviderModelFieldRequestScopedWarning)}
        </span>
      ) : null}
    </>
  );
}

function ProviderPickerLoading({ label }: { label: string }) {
  return (
    <span className="providerPickerLoading" role="status" aria-label={label}>
      <span className="providerPickerSpinner" aria-hidden="true" />
    </span>
  );
}
