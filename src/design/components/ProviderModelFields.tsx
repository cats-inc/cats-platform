import React from 'react';

import {
  providerInstanceTarget,
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedModelCatalog,
  type ProviderCatalogBasis,
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
import {
  fetchAdvancedProviderModels as defaultFetchAdvancedProviderModels,
  fetchProviderModels as defaultFetchProviderModels,
  fetchProviderRegistry as defaultFetchProviderRegistry,
} from '../../app/renderer/providerPickerReads.js';
import { describeUnmappableSavedSelection } from '../../app/renderer/savedSelectionAttention.js';
import { messageKeys } from '../../shared/i18n/index.js';

export {
  attachExecutionLabelToProviderTarget,
  CUSTOM_LEGACY_MODEL_VALUE,
  LAST_SAVED_PROVIDER_TARGETS_WARNING,
  PRODUCT_PROVIDER_CATALOG_CHECKING_WARNING,
  PROVIDER_LOAD_FAILED_WARNING,
  PROVIDER_REFRESH_FAILED_WARNING,
  catalogMatchesTarget,
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
  resolveSelectedCatalogEntryId,
  resolveUnsupportedPersistentControlWarning,
  sanitizePersistentTargetSelection,
  shouldAllowLegacyManualModelEntry,
  shouldDeferCatalogTargetReconciliation,
  shouldShowInstanceField,
  shouldTreatPersistedTargetAsLegacyModel,
  translateProviderRegistryWarning,
  updatePersistentControlValues,
} from './providerModelFieldsSupport.js';

/** Reads default to the shared client caches; tests inject their own. */
export interface ProviderModelFieldsReads {
  fetchProviderRegistry?: (options?: { force?: boolean }) => Promise<ProductProviderRegistryReadModel>;
  fetchProviderModels?: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels?: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
}

export interface ProviderModelFieldsProps extends ProviderModelFieldsReads {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}

export function ProviderModelFields({
  provider,
  instance,
  model,
  modelSelection,
  onTargetChange,
  fetchProviderRegistry = defaultFetchProviderRegistry,
  fetchProviderModels = defaultFetchProviderModels,
  fetchAdvancedProviderModels = defaultFetchAdvancedProviderModels,
  onProviderRegistryChange,
}: ProviderModelFieldsProps) {
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
    unmappableSelection,
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
    selectedCatalogEntryId,
    selectedEntryId,
    presetOptions,
    selectedPresetId,
    controlOptions,
    unsupportedSelectionWarning,
    controlValues,
    supportBadge,
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

  // Show a saved choice the catalog no longer offers as itself, never as the
  // first row, until the user picks a replacement.
  const staleEntryId = unmappableSelection?.kind === 'entry' ? unmappableSelection.entryId : null;
  const stalePresetId = unmappableSelection?.kind === 'preset' ? unmappableSelection.presetId : null;
  const selectionNotice = unmappableSelection
    ? describeUnmappableSavedSelection({
        mismatch: unmappableSelection,
        catalog: effectiveCatalog,
        advancedCatalog: effectiveAdvancedCatalog,
      }, t)
    : unsupportedSelectionWarning;

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
      <label className="fieldLabel">
        <div className="fieldLabelInline">
          <span>{t(messageKeys.sharedProviderModelFieldModelLabel)}</span>
          {effectiveAdvancedCatalog?.basis ? <CatalogBasisInfo basis={effectiveAdvancedCatalog.basis} /> : null}
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
          value={staleEntryId ? UNMAPPABLE_SELECTION_VALUE : selectedEntryId}
          disabled={!isLegacyModelTarget && entryOptions.length === 0}
          onChange={(event) => onModelEntryChange(event.target.value)}
        >
          {staleEntryId ? (
            <option value={UNMAPPABLE_SELECTION_VALUE} disabled>
              {t(messageKeys.sharedProviderModelAttentionNoLongerOffered, { value: staleEntryId })}
            </option>
          ) : null}
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
        </label>
      ) : staleEntryId ? null : (
        <label className="fieldLabel">
          <span>{t(messageKeys.sharedProviderModelFieldModeLabel)}</span>
          <select
            className="textInput"
            value={stalePresetId ? UNMAPPABLE_SELECTION_VALUE : selectedPresetId}
            disabled={presetOptions.length === 0 && !stalePresetId}
            onChange={(event) => onPresetChange(event.target.value)}
          >
            {stalePresetId ? (
              <option value={UNMAPPABLE_SELECTION_VALUE} disabled>
                {t(messageKeys.sharedProviderModelAttentionNoLongerOffered, { value: stalePresetId })}
              </option>
            ) : null}
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
        </label>
      )}
      {staleEntryId ? null : (
        <ProviderModelFieldControls
          controlOptions={controlOptions}
          selectedCatalogEntryId={selectedCatalogEntryId}
          controlValues={controlValues}
          onControlChange={onControlChange}
        />
      )}
      {selectionNotice ? (
        <span
          className={`fieldHint providerCatalogHint${unmappableSelection ? ' providerSelectionAttention' : ''}`}
          role={unmappableSelection ? 'status' : undefined}
        >
          {selectionNotice}
        </span>
      ) : null}
    </>
  );
}

// Holds a removed saved entry or preset in its select without matching any listed choice.
const UNMAPPABLE_SELECTION_VALUE = '__cats_unmappable_selection__';

// Read-only note on what the model list was captured against. It is a focusable span, not a
// button: a button inside this <label> would become the label's control instead of the select.
// Clicking it must not activate the label, so the tooltip portal can show the text on tap.
function CatalogBasisInfo({ basis }: { basis: ProviderCatalogBasis }) {
  const { t } = useI18n();
  const hint = [
    ...(basis.channel ? [t(messageKeys.sharedProviderModelFieldBasisChannelHint, { channel: basis.channel.label })] : []),
    ...(basis.plan ? [t(messageKeys.sharedProviderModelFieldBasisPlanHint, { plan: basis.plan.label })] : []),
  ].join(' ');
  const summary = [basis.channel?.label, basis.plan?.label].filter(Boolean).join(' · ');
  return (
    <span
      className="catalogBasisInfo"
      role="img"
      tabIndex={0}
      aria-label={t(messageKeys.sharedProviderModelFieldBasisLabel, { basis: summary, hint })}
      data-tooltip={hint}
      data-tooltip-focus="true"
      onClick={(event) => event.preventDefault()}
    >
      i
    </span>
  );
}

function ProviderPickerLoading({ label }: { label: string }) {
  return (
    <span className="providerPickerLoading" role="status" aria-label={label}>
      <span className="providerPickerSpinner" aria-hidden="true" />
    </span>
  );
}
