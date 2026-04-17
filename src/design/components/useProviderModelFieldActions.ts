import { useCallback } from 'react';

import type {
  ProductProviderDescriptor,
  ProviderAdvancedCatalogControl,
  ProviderAdvancedControlValue,
} from '../../shared/providerCatalog.js';
import {
  resolveSelectedProviderInstance,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import {
  attachExecutionLabelToProviderTarget,
  buildSelectionForEntry,
  CUSTOM_LEGACY_MODEL_VALUE,
  filterPersistentControlValues,
  updatePersistentControlValues,
} from './providerModelFieldsSupport.js';

export { CUSTOM_LEGACY_MODEL_VALUE } from './providerModelFieldsSupport.js';

export function useProviderModelFieldActions(input: {
  providerOptions: ProductProviderDescriptor[];
  provider: string;
  resolvedInstance: string;
  model: string;
  persistedLegacyModelTarget: boolean;
  selectedCatalogEntryId: string;
  selectedPresetId: string;
  presetOptions: Array<{
    id: string;
    controlDefaults?: Record<string, ProviderAdvancedControlValue>;
  }>;
  controlValues: Record<string, ProviderAdvancedControlValue>;
  effectiveControls: ProviderAdvancedCatalogControl[];
  effectiveCatalog: import('../../shared/providerCatalog.js').ProviderModelCatalog;
  effectiveAdvancedCatalog: import('../../shared/providerCatalog.js').ProviderAdvancedModelCatalog;
  markManualSelection: () => void;
  markLegacyManualSelection: () => void;
  clearManualSelection: () => void;
  onTargetChange: (target: ProviderTargetSelection) => void;
}) {
  const {
    providerOptions,
    provider,
    resolvedInstance,
    model,
    persistedLegacyModelTarget,
    selectedCatalogEntryId,
    selectedPresetId,
    presetOptions,
    controlValues,
    effectiveControls,
    effectiveCatalog,
    effectiveAdvancedCatalog,
    markManualSelection,
    markLegacyManualSelection,
    clearManualSelection,
    onTargetChange,
  } = input;

  const emitSelection = useCallback((next: {
    model?: string;
    instance?: string;
    presetId?: string | null;
    controls?: Record<string, ProviderAdvancedControlValue> | undefined;
  }): void => {
    const nextModel = next.model ?? selectedCatalogEntryId;
    const nextControls = filterPersistentControlValues(
      effectiveControls,
      nextModel,
      next.controls,
    );
    const nextPresetId = next.presetId ?? null;
    const nextModelSelection = buildSelectionForEntry(nextModel, nextPresetId, nextControls);
    markManualSelection();
    onTargetChange(attachExecutionLabelToProviderTarget({
      target: {
        provider,
        instance: next.instance ?? resolvedInstance,
        model: nextModel,
        modelSelection: nextModelSelection,
      },
      effectiveCatalog,
      effectiveAdvancedCatalog,
    }));
  }, [
    effectiveAdvancedCatalog,
    effectiveCatalog,
    effectiveControls,
    markManualSelection,
    onTargetChange,
    provider,
    resolvedInstance,
    selectedCatalogEntryId,
  ]);

  const emitLegacyModel = useCallback((nextModel: string, nextInstance?: string): void => {
    markLegacyManualSelection();
    onTargetChange(attachExecutionLabelToProviderTarget({
      target: {
        provider,
        instance: nextInstance ?? resolvedInstance,
        model: nextModel,
        modelSelection: null,
      },
      effectiveCatalog,
      effectiveAdvancedCatalog,
    }));
  }, [
    effectiveAdvancedCatalog,
    effectiveCatalog,
    markLegacyManualSelection,
    onTargetChange,
    provider,
    resolvedInstance,
  ]);

  const onProviderChange = useCallback((nextProviderId: string): void => {
    const nextProvider = providerOptions.find((option) => option.id === nextProviderId) ?? null;
    if (!nextProvider) {
      return;
    }
    const nextInstance = resolveSelectedProviderInstance(nextProvider, '');
    clearManualSelection();
    onTargetChange({
      provider: nextProvider.id,
      instance: nextInstance,
      model: '',
      modelSelection: null,
    });
  }, [clearManualSelection, onTargetChange, providerOptions]);

  const onInstanceChange = useCallback((nextInstance: string): void => {
    clearManualSelection();
    onTargetChange({
      provider,
      instance: nextInstance,
      model: '',
      modelSelection: null,
    });
  }, [clearManualSelection, onTargetChange, provider]);

  const onModelEntryChange = useCallback((nextEntryId: string): void => {
    if (nextEntryId === CUSTOM_LEGACY_MODEL_VALUE) {
      emitLegacyModel(persistedLegacyModelTarget ? model : '');
      return;
    }
    emitSelection({
      model: nextEntryId,
      presetId: null,
      controls: undefined,
    });
  }, [emitLegacyModel, emitSelection, model, persistedLegacyModelTarget]);

  const onLegacyModelChange = useCallback((nextModel: string): void => {
    emitLegacyModel(nextModel);
  }, [emitLegacyModel]);

  const onPresetChange = useCallback((nextPresetId: string): void => {
    const preset = presetOptions.find((option) => option.id === nextPresetId) ?? null;
    emitSelection({
      presetId: preset?.id ?? null,
      controls: preset?.controlDefaults
        ? { ...preset.controlDefaults }
        : undefined,
    });
  }, [emitSelection, presetOptions]);

  const onControlChange = useCallback((
    control: ProviderAdvancedCatalogControl,
    rawValue: string,
  ): void => {
    emitSelection({
      presetId: selectedPresetId || null,
      controls: updatePersistentControlValues({
        control,
        currentValues: controlValues,
        rawValue,
      }),
    });
  }, [controlValues, emitSelection, selectedPresetId]);

  return {
    onProviderChange,
    onInstanceChange,
    onModelEntryChange,
    onLegacyModelChange,
    onPresetChange,
    onControlChange,
  };
}
