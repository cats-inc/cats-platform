import React, { useEffect, useState } from 'react';

import {
  providerInstanceTarget,
  selectionTargetsCatalogBasis,
  type ProductProviderRegistryReadModel,
  type ProviderAdvancedModelCatalog,
  type ProviderCatalogBasis,
  type ProviderCatalogBasisOption,
  type ProviderCatalogCapture,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
  type ProviderModelSelection,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import {
  attachExecutionLabelToProviderTarget,
  catalogMatchesTarget,
  filterPersistentControlValues,
  formatCatalogEntryLabel,
  kimiInstanceLabel,
  resolveExecutionLabelForProviderTarget,
  resolveProviderModelFieldsViewState,
  sanitizePersistentTargetSelection,
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
  kimiInstanceLabel,
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
    basisId?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
}

export interface ProviderModelFieldsProps extends ProviderModelFieldsReads {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
  /** The surface around it chooses the provider, as first-run setup's tool list does. */
  hideProviderField?: boolean;
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
  hideProviderField = false,
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
  // Runtime SPEC-045 FR-7: the basis to show is the one a basis change or a new selection's
  // detected basis asked for, otherwise the saved selection's (absent = the first basis).
  const basisTargetKey = `${provider}::${resolvedInstance}`;
  const [basisRequest, setBasisRequest] = useState<BasisRequest | null>(null);
  const activeBasisRequest = basisRequest?.key === basisTargetKey ? basisRequest : null;
  const requestedBasisId = activeBasisRequest ? activeBasisRequest.basisId : (modelSelection?.basisId ?? null);
  const {
    catalogLoading,
    catalogResolved,
    catalogConfigurationRequired,
    effectiveCatalog,
    effectiveAdvancedCatalog,
    catalogBasisUnknown,
  } = useProviderCatalogState({
    provider,
    resolvedInstance,
    hasSelectedProvider: Boolean(selectedProvider),
    selectionRevision: providerRegistry.revision,
    basisId: requestedBasisId,
    fetchProviderModels,
    fetchAdvancedProviderModels,
  });
  // Every basis's catalog carries the same bases list. Keep the last one seen for this target so
  // the select stays in place while another basis loads (SPEC-013 picker continuity).
  const [knownBases, setKnownBases] = useState<{ key: string; bases: ProviderCatalogBasisOption[] } | null>(null);
  const bases = effectiveAdvancedCatalog.bases
    ?? ((catalogLoading || !catalogResolved) && knownBases?.key === basisTargetKey ? knownBases.bases : null);
  useEffect(() => {
    if (effectiveAdvancedCatalog.bases) setKnownBases({ key: basisTargetKey, bases: effectiveAdvancedCatalog.bases });
  }, [basisTargetKey, effectiveAdvancedCatalog.bases]);
  // The first basis is named by omission, also when it has an id.
  const canonicalBasis = (basisId: string | null | undefined): string | null =>
    !basisId || bases?.[0]?.id === basisId ? null : basisId;
  const detectedBasis = bases?.find((basis) => basis.detected) ?? null;
  const detectedBasisId = detectedBasis ? canonicalBasis(detectedBasis.id) : null;
  const shownBasisId = canonicalBasis(requestedBasisId);
  // A new selection starts on the detected basis: hold reconciliation until that list loads.
  const newSelection = !modelSelection && !model.trim();
  const awaitingDetectedBasis = newSelection && Boolean(detectedBasis) && !catalogLoading
    && detectedBasisId !== shownBasisId && !activeBasisRequest;
  const basisSwitching = Boolean(activeBasisRequest?.switching);
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
    deferReconciliation: awaitingDetectedBasis || basisSwitching,
  });

  useEffect(() => {
    if (awaitingDetectedBasis) setBasisRequest({ key: basisTargetKey, basisId: detectedBasisId, switching: false });
  }, [awaitingDetectedBasis, basisTargetKey, detectedBasisId]);

  // A basis change lands once that basis's list is loaded: the current entry and its controls
  // stay when the list has the entry, otherwise the list's own default is chosen.
  useEffect(() => {
    if (!activeBasisRequest?.switching) return;
    if (catalogBasisUnknown) { setBasisRequest(null); return; }
    if (catalogLoading || !catalogResolved
      || !selectionTargetsCatalogBasis(activeBasisRequest.basisId, effectiveAdvancedCatalog)) return;
    // A custom model string does not depend on the list, so it stays as typed.
    if (!modelSelection && model.trim()) {
      setBasisRequest({ ...activeBasisRequest, switching: false });
      return;
    }
    const basisId = activeBasisRequest.basisId ?? undefined;
    const keep = Boolean(modelSelection?.entryId
      && effectiveCatalog.models.some((entry) => entry.id === modelSelection.entryId));
    const { basisId: _previous, ...carried } = modelSelection ?? { entryMode: 'explicit' as const };
    const next = resolveCatalogTargetSelection({
      target: {
        provider,
        instance: resolvedInstance,
        model: keep ? modelSelection!.entryId! : '',
        modelSelection: keep ? { ...carried, ...(basisId ? { basisId } : {}) } : null,
      },
      catalog: effectiveCatalog,
      advancedCatalog: effectiveAdvancedCatalog,
      preserveCurrentModel: keep,
      preserveCurrentSelection: keep,
    });
    const sanitized = sanitizePersistentTargetSelection({
      target: next,
      controls: effectiveAdvancedCatalog.entries.find((entry) => entry.id === next.model)?.controls
        ?? effectiveAdvancedCatalog.controls,
    });
    markManualSelection();
    setBasisRequest({ ...activeBasisRequest, switching: false });
    onTargetChange(attachExecutionLabelToProviderTarget({ target: sanitized, effectiveCatalog, effectiveAdvancedCatalog }));
  }, [activeBasisRequest, catalogBasisUnknown, catalogLoading, catalogResolved, effectiveAdvancedCatalog,
    effectiveCatalog, markManualSelection, model, modelSelection, onTargetChange, provider, resolvedInstance]);

  // Once the saved selection names the requested basis, it is the source again.
  useEffect(() => {
    if (activeBasisRequest && !activeBasisRequest.switching && modelSelection
      && canonicalBasis(modelSelection.basisId) === canonicalBasis(activeBasisRequest.basisId)) {
      setBasisRequest(null);
    }
  }, [activeBasisRequest, bases, modelSelection]);

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
  // first row, until the user picks a replacement. A basis change in flight is not stale.
  const savedMismatch = basisSwitching ? null : unmappableSelection;
  const staleBasisId = savedMismatch?.kind === 'basis' ? savedMismatch.basisId : null;
  const staleEntryId = savedMismatch?.kind === 'entry' ? savedMismatch.entryId
    : savedMismatch?.kind === 'basis' ? modelSelection?.entryId ?? null : null;
  const stalePresetId = savedMismatch?.kind === 'preset' ? savedMismatch.presetId : null;
  const selectionNotice = savedMismatch
    ? describeUnmappableSavedSelection({
        mismatch: savedMismatch,
        catalog: effectiveCatalog,
        advancedCatalog: effectiveAdvancedCatalog,
      }, t)
    : unsupportedSelectionWarning;
  const basisMismatchHint = bases && detectedBasis && !staleBasisId && detectedBasisId !== shownBasisId
    ? t(messageKeys.sharedProviderModelFieldBasisMismatchHint) : null;

  return (
    <>
      {hideProviderField ? null : <label className="fieldLabel">
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
      </label>}
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
                {kimiInstanceLabel(selectedProvider?.id, option.id, t) ?? option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {bases ? (
        <label className="fieldLabel">
          <span>{t(messageKeys.sharedProviderModelFieldListBasisLabel)}</span>
          <select
            className="textInput"
            value={staleBasisId ? UNMAPPABLE_SELECTION_VALUE : shownBasisId ?? ''}
            onChange={(event) => setBasisRequest({
              key: basisTargetKey, basisId: event.target.value || null, switching: true,
            })}
          >
            {staleBasisId ? (
              <option value={UNMAPPABLE_SELECTION_VALUE} disabled>
                {t(messageKeys.sharedProviderModelAttentionNoLongerOffered, { value: staleBasisId })}
              </option>
            ) : null}
            {bases.map((basis, index) => (
              <option key={basis.id ?? FIRST_BASIS_KEY} value={index === 0 ? '' : basis.id}>
                {basis.label}
              </option>
            ))}
          </select>
          {basisMismatchHint ? <span className="fieldHint">{basisMismatchHint}</span> : null}
        </label>
      ) : null}
      <label className="fieldLabel">
        <div className="fieldLabelInline">
          <span>{t(messageKeys.sharedProviderModelFieldModelLabel)}</span>
          {effectiveAdvancedCatalog?.basis ? (
            <CatalogBasisInfo basis={effectiveAdvancedCatalog.basis} capture={effectiveAdvancedCatalog.capture} />
          ) : null}
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
          className={`fieldHint providerCatalogHint${savedMismatch ? ' providerSelectionAttention' : ''}`}
          role={savedMismatch ? 'status' : undefined}
        >
          {selectionNotice}
        </span>
      ) : null}
    </>
  );
}

// Holds a removed saved entry or preset in its select without matching any listed choice.
const UNMAPPABLE_SELECTION_VALUE = '__cats_unmappable_selection__';
const FIRST_BASIS_KEY = '__cats_first_basis__';

/** A basis the picker asked for: a user's change (`switching`) or a new selection's detected basis. */
interface BasisRequest {
  key: string;
  basisId: string | null;
  switching: boolean;
}

// Read-only note on what the model list was captured against. It is a focusable span, not a
// button: a button inside this <label> would become the label's control instead of the select.
// Clicking it must not activate the label, so the tooltip portal can show the text on tap.
function CatalogBasisInfo({ basis, capture }: { basis: ProviderCatalogBasis; capture?: ProviderCatalogCapture }) {
  const { t } = useI18n();
  const version = capture?.cliVersion;
  const date = capture?.lastUpdated;
  const hint = [
    ...(basis.channel ? [t(messageKeys.sharedProviderModelFieldBasisChannelHint, { channel: basis.channel.label })] : []),
    ...(basis.region ? [t(messageKeys.sharedProviderModelFieldBasisRegionHint, { region: basis.region.label })] : []),
    ...(basis.plan ? [t(messageKeys.sharedProviderModelFieldBasisPlanHint, { plan: basis.plan.label })] : []),
    ...(version && date ? [t(messageKeys.sharedProviderModelFieldBasisCaptureHint, { version, date })]
      : version ? [t(messageKeys.sharedProviderModelFieldBasisCaptureVersionHint, { version })]
        : date ? [t(messageKeys.sharedProviderModelFieldBasisCaptureDateHint, { date })] : []),
  ].join(' ');
  const summary = [basis.channel?.label, basis.region?.label, basis.plan?.label].filter(Boolean).join(' · ');
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

export function ProviderPickerLoading({ label }: { label: string }) {
  return (
    <span className="providerPickerLoading" role="status" aria-label={label}>
      <span className="providerPickerSpinner" aria-hidden="true" />
    </span>
  );
}
