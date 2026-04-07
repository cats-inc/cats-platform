import { useState } from 'react';

import { CatCreationFields } from './CatCreationFields.js';
import type { ProductProviderRegistryReadModel } from '../../../shared/providerCatalog.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';

export interface GuideCatSetupFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
  catName: string;
  runtimeReachable: boolean;
  runtimeBaseUrl: string;
  onTargetChange: (target: {
    provider: string;
    instance: string;
    model: string;
    modelSelection?: ProviderModelSelection | null;
  }) => void;
  onCatNameChange: (name: string) => void;
}

export function GuideCatSetupFields({
  provider,
  instance,
  model,
  modelSelection,
  catName,
  runtimeReachable,
  runtimeBaseUrl,
  onTargetChange,
  onCatNameChange,
}: GuideCatSetupFieldsProps) {
  const [providerRegistry, setProviderRegistry] = useState<ProductProviderRegistryReadModel>({
    state: 'ready',
    providers: [],
  });
  const runtimeSetupHref = `${runtimeBaseUrl.replace(/\/$/, '')}/setup`;
  const runtimeStatusChip = providerRegistry.state === 'runtime_unreachable'
    ? { className: 'statusChip statusChipWarm', label: 'Provider registry unavailable' }
    : providerRegistry.state === 'no_usable_targets'
      ? { className: 'statusChip statusChipWarm', label: 'No usable providers found' }
      : runtimeReachable
        ? { className: 'statusChip statusChipReady', label: 'Cats Runtime connected' }
        : { className: 'statusChip statusChipWarm', label: 'Cats Runtime not detected' };

  return (
    <>
      <CatCreationFields
        name={catName}
        onNameChange={onCatNameChange}
        provider={provider}
        instance={instance}
        model={model}
        modelSelection={modelSelection}
        onTargetChange={onTargetChange}
        nameLabel="Guide Cat name"
        namePlaceholder="Guide Cat"
        nameHint="An optional helper Cat that can support you across Chat, Work, and Code."
        autoFocusName
        hideMakeBoss
        hideProductToggles
        onProviderRegistryChange={setProviderRegistry}
      />
      <div className="setupRuntimeStatus">
        <span className={runtimeStatusChip.className}>
          {runtimeStatusChip.label}
        </span>
        {providerRegistry.state === 'runtime_unreachable' ? (
          <>
            <span className="setupRuntimeNote">
              Cats can still open without a Guide Cat. Retry here, or open Cats Runtime setup if the
              provider registry keeps timing out.
            </span>
            <a className="secondaryButton setupInlineLink" href={runtimeSetupHref} target="_blank" rel="noreferrer">
              Open Cats Runtime setup
            </a>
          </>
        ) : null}
        {providerRegistry.state === 'no_usable_targets' ? (
          <>
            <span className="setupRuntimeNote">
              Cats Runtime is reachable, but it did not report any usable provider targets for a Guide Cat.
            </span>
            <a className="secondaryButton setupInlineLink" href={runtimeSetupHref} target="_blank" rel="noreferrer">
              Open Cats Runtime setup
            </a>
          </>
        ) : null}
      </div>
    </>
  );
}

export function validateGuideCatSetupStep(input: {
  model: string;
}): boolean {
  return Boolean(input.model.trim());
}

export function canContinueGuideCatSetupStep(input: {
  createGuideCat: boolean;
  model: string;
}): boolean {
  return !input.createGuideCat || validateGuideCatSetupStep({ model: input.model });
}
