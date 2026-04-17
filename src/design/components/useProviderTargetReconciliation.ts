import { useEffect, useRef, useState } from 'react';

import type {
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import {
  resolveCatalogTargetSelection,
  sameProviderModelSelection,
  type ProviderModelSelection,
  type ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import {
  attachExecutionLabelToProviderTarget,
  sanitizePersistentTargetSelection,
  shouldDeferCatalogTargetReconciliation,
  shouldTreatPersistedTargetAsLegacyModel,
} from './providerModelFieldsSupport.js';

export function useProviderTargetReconciliation(input: {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  resolvedInstance: string;
  hasSelectedProvider: boolean;
  catalogLoading: boolean;
  effectiveCatalog: ProviderModelCatalog;
  effectiveAdvancedCatalog: ProviderAdvancedModelCatalog;
  onTargetChange: (target: ProviderTargetSelection) => void;
}) {
  const [legacyManualTargetKey, setLegacyManualTargetKey] = useState<string | null>(null);
  const manualSelectionTargetKey = useRef<string | null>(null);
  const previousTargetKey = useRef('');
  const onTargetChangeRef = useRef(input.onTargetChange);

  useEffect(() => {
    onTargetChangeRef.current = input.onTargetChange;
  }, [input.onTargetChange]);

  const targetKey = `${input.provider}::${input.resolvedInstance}`;
  const persistedLegacyModelTarget =
    !input.catalogLoading
    && shouldTreatPersistedTargetAsLegacyModel({
      catalog: input.effectiveCatalog,
      model: input.model,
      modelSelection: input.modelSelection,
    });
  const isLegacyModelTarget =
    legacyManualTargetKey === targetKey
    || persistedLegacyModelTarget;
  const hasBlankLegacyDraft =
    legacyManualTargetKey === targetKey
    && (input.model?.trim() || '').length === 0
    && !input.modelSelection;
  const preserveExistingSelection =
    manualSelectionTargetKey.current === targetKey
    || Boolean(input.modelSelection)
    || isLegacyModelTarget;

  useEffect(() => {
    if (!input.hasSelectedProvider) {
      return;
    }
    if (previousTargetKey.current !== targetKey) {
      previousTargetKey.current = targetKey;
      manualSelectionTargetKey.current = null;
      setLegacyManualTargetKey(null);
    }
    if (input.resolvedInstance && input.resolvedInstance !== input.instance) {
      onTargetChangeRef.current(attachExecutionLabelToProviderTarget({
        target: {
          provider: input.provider,
          instance: input.resolvedInstance,
          model: input.model,
          modelSelection: input.modelSelection,
        },
        effectiveCatalog: input.effectiveCatalog,
        effectiveAdvancedCatalog: input.effectiveAdvancedCatalog,
      }));
    }
  }, [
    input.effectiveAdvancedCatalog,
    input.effectiveCatalog,
    input.hasSelectedProvider,
    input.instance,
    input.model,
    input.modelSelection,
    input.provider,
    input.resolvedInstance,
    targetKey,
  ]);

  useEffect(() => {
    if (input.effectiveCatalog.models.length === 0 || hasBlankLegacyDraft) {
      return;
    }

    const deferStaticCatalogReconciliation = shouldDeferCatalogTargetReconciliation({
      catalogSource: input.effectiveCatalog.source,
      advancedCatalogSource: input.effectiveAdvancedCatalog.source,
      model: input.model,
      modelSelection: input.modelSelection,
    });
    if (deferStaticCatalogReconciliation) {
      return;
    }

    const nextTarget = resolveCatalogTargetSelection({
      target: {
        provider: input.provider,
        instance: input.resolvedInstance,
        model: input.model,
        modelSelection: input.modelSelection,
      },
      catalog: input.effectiveCatalog,
      advancedCatalog: input.effectiveAdvancedCatalog,
      preserveCurrentModel: preserveExistingSelection,
      preserveCurrentSelection: preserveExistingSelection,
    });
    const sanitizedTarget = sanitizePersistentTargetSelection({
      target: nextTarget,
      controls: input.effectiveAdvancedCatalog.controls,
    });

    if (
      sanitizedTarget.instance !== input.instance
      || sanitizedTarget.model !== input.model
      || !sameProviderModelSelection(sanitizedTarget.modelSelection, input.modelSelection)
    ) {
      onTargetChangeRef.current(attachExecutionLabelToProviderTarget({
        target: sanitizedTarget,
        effectiveCatalog: input.effectiveCatalog,
        effectiveAdvancedCatalog: input.effectiveAdvancedCatalog,
      }));
    }
  }, [
    input.effectiveAdvancedCatalog,
    input.effectiveCatalog,
    input.instance,
    input.model,
    input.modelSelection,
    input.provider,
    input.resolvedInstance,
    preserveExistingSelection,
    targetKey,
    hasBlankLegacyDraft,
  ]);

  function clearManualSelection(): void {
    manualSelectionTargetKey.current = null;
    setLegacyManualTargetKey(null);
  }

  function markManualSelection(): void {
    manualSelectionTargetKey.current = targetKey;
    setLegacyManualTargetKey(null);
  }

  function markLegacyManualSelection(): void {
    manualSelectionTargetKey.current = targetKey;
    setLegacyManualTargetKey(targetKey);
  }

  return {
    persistedLegacyModelTarget,
    isLegacyModelTarget,
    clearManualSelection,
    markManualSelection,
    markLegacyManualSelection,
  };
}
