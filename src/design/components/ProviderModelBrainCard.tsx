import React, { useState } from 'react';

import type {
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import {
  ProviderModelFields,
  type ProviderRegistryRecoveryState,
} from './ProviderModelFields.js';
import {
  SettingsSectionHeader,
  SettingsSubSection,
} from './settings/index.js';

interface ProviderModelBrainCardProps {
  title?: string;
  className?: string;
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
  fetchProviderRegistry: (
    options?: { force?: boolean },
  ) => Promise<ProductProviderRegistryReadModel>;
  fetchProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}

export function ProviderModelBrainCard({
  title = 'Brain',
  className = 'catsSubCard',
  ...fieldsProps
}: ProviderModelBrainCardProps) {
  const [recovery, setRecovery] = useState<ProviderRegistryRecoveryState | null>(null);

  const status = recovery?.canRetry ? (
    <button
      type="button"
      className="secondaryButton"
      onClick={() => recovery.retry()}
    >
      Retry
    </button>
  ) : null;

  return (
    <SettingsSubSection
      className={className}
      header={<SettingsSectionHeader title={title} nested status={status} />}
    >
      <ProviderModelFields
        {...fieldsProps}
        hideInlineRetry
        onRegistryRecoveryChange={setRecovery}
      />
    </SettingsSubSection>
  );
}
