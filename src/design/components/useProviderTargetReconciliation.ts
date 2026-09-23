import { useEffect, useRef, useState } from 'react';

import type {
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import { isProductProviderDefaultModelPlaceholder } from '../../shared/providerCatalog.js';
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
  catalogResolved: boolean;
  effectiveCatalog: ProviderModelCatalog;
  effectiveAdvancedCatalog: ProviderAdvancedModelCatalog;
  onTargetChange: (target: ProviderTargetSelection) => void;
}) {
  const [legacyManualTargetKey, setLegacyManualTargetKey] = useState<string | null>(null);
  const manualSelectionTargetKey = useRef<string | null>(null);
  const previousTargetKey = useRef('');
  const publishedTarget = useRef<string | null>(null);
  const onTargetChangeRef = useRef(input.onTargetChange);

  useEffect(() => {
    onTargetChangeRef.current = input.onTargetChange;
  }, [input.onTargetChange]);

  const targetKey = `${input.provider}::${input.resolvedInstance}`;
  const persistedLegacyModelTarget =
    input.catalogResolved
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
    || Boolean(input.model.trim())
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
    if (input.catalogLoading || input.effectiveCatalog.models.length === 0 || hasBlankLegacyDraft) {
      return;
    }

    const providerDefaultPlaceholder = isProductProviderDefaultModelPlaceholder(
      input.provider,
      input.model,
    );
    const deferStaticCatalogReconciliation = shouldDeferCatalogTargetReconciliation({
      catalogSource: input.effectiveCatalog.source,
      advancedCatalogSource: input.effectiveAdvancedCatalog.source,
      model: input.model,
      modelSelection: input.modelSelection,
    }) && (input.catalogLoading || !providerDefaultPlaceholder);
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
      controls: input.effectiveAdvancedCatalog.entries.find(entry => entry.id === nextTarget.model)?.controls ?? input.effectiveAdvancedCatalog.controls,
    });

    const targetChanged =
      sanitizedTarget.instance !== input.instance
      || sanitizedTarget.model !== input.model
      || !sameProviderModelSelection(sanitizedTarget.modelSelection, input.modelSelection);
    const knownEntry = input.effectiveCatalog.models.some(entry => entry.id === sanitizedTarget.model);
    if (!targetChanged && !knownEntry) {
      return;
    }
    // Publish the reconciled selection and its label together. A separate label
    // effect using the original props could otherwise overwrite this revision
    // or restore controls that reconciliation just removed.
    const labeledTarget = attachExecutionLabelToProviderTarget({
      target: sanitizedTarget,
      effectiveCatalog: input.effectiveCatalog,
      effectiveAdvancedCatalog: input.effectiveAdvancedCatalog,
    });
    const publicationKey = JSON.stringify([labeledTarget,
      input.effectiveCatalog.catalogRevision, input.effectiveCatalog.catalogActivationId]);
    if (targetChanged || publishedTarget.current !== publicationKey) {
      publishedTarget.current = publicationKey;
      onTargetChangeRef.current(labeledTarget);
    }
  }, [
    input.catalogLoading,
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
