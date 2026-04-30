import { useState } from 'react';

import { CatCreationFields } from './CatCreationFields.js';
import type { ProductProviderRegistryReadModel } from '../../../shared/providerCatalog.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { PLATFORM_RUNTIME_SETUP_PATH } from '../../../shared/runtimeIngressPaths.js';
import { useI18n } from '../i18n/index.js';
import { resolveProviderRegistrySetupHref } from '../../../design/components/ProviderModelFields.js';
import {
  resolveClientGuideCatName,
} from '../../../shared/guideCatIdentity.js';

export interface GuideCatSetupFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
  runtimeReachable: boolean;
  onTargetChange: (target: {
    provider: string;
    instance: string;
    model: string;
    modelSelection?: ProviderModelSelection | null;
  }) => void;
}

export function GuideCatSetupFields({
  provider,
  instance,
  model,
  modelSelection,
  runtimeReachable,
  onTargetChange,
}: GuideCatSetupFieldsProps) {
  const guideCatName = resolveClientGuideCatName();
  const { t } = useI18n();
  const [providerRegistry, setProviderRegistry] = useState<ProductProviderRegistryReadModel>({
    state: 'ready',
    providers: [],
  });
  const runtimeSetupHref = resolveProviderRegistrySetupHref(providerRegistry)
    ?? PLATFORM_RUNTIME_SETUP_PATH;
  const runtimeStatusChip = providerRegistry.state === 'runtime_unreachable'
    ? {
      className: 'statusChip statusChipWarm',
      label: t(messageKeys.setupGuideCatRuntimeUnavailable),
    }
    : providerRegistry.state === 'no_usable_targets'
      ? {
        className: 'statusChip statusChipWarm',
        label: t(messageKeys.setupGuideCatNoUsableTargets),
      }
      : runtimeReachable
        ? { className: 'statusChip statusChipReady', label: t(messageKeys.setupGuideCatRuntimeConnected) }
        : { className: 'statusChip statusChipWarm', label: t(messageKeys.setupGuideCatRuntimeNotDetected) };

  return (
    <>
      <CatCreationFields
        name={guideCatName}
        onNameChange={() => {}}
        nameReadOnly
        provider={provider}
        instance={instance}
        model={model}
        modelSelection={modelSelection}
        onTargetChange={onTargetChange}
        nameLabel={t(messageKeys.setupGuideCatNameLabel)}
        namePlaceholder={guideCatName}
        nameHint={t(messageKeys.setupGuideCatNameHint)}
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
              {t(messageKeys.setupGuideCatUnavailableNote)}
            </span>
            <a className="secondaryButton setupInlineLink" href={runtimeSetupHref} target="_blank" rel="noreferrer">
              {t(messageKeys.setupGuideCatOpenRuntimeSetup)}
            </a>
          </>
        ) : null}
        {providerRegistry.state === 'no_usable_targets' ? (
          <>
            <span className="setupRuntimeNote">
              {t(messageKeys.setupGuideCatNoUsableTargetsNote)}
            </span>
            <a className="secondaryButton setupInlineLink" href={runtimeSetupHref} target="_blank" rel="noreferrer">
              {t(messageKeys.setupGuideCatOpenRuntimeSetup)}
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
