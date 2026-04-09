import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../../../shared/providerSelection.js';
import { ProviderModelFields as SharedProviderModelFields } from '../../../../design/components/ProviderModelFields.js';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviderRegistry,
} from '../api/index.js';

export interface ProviderModelFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
}

export function ProviderModelFields({
  provider,
  instance,
  model,
  modelSelection,
  onTargetChange,
}: ProviderModelFieldsProps) {
  return (
    <SharedProviderModelFields
      provider={provider}
      instance={instance}
      model={model}
      modelSelection={modelSelection}
      onTargetChange={onTargetChange}
      fetchProviderRegistry={fetchProviderRegistry}
      fetchProviderModels={fetchProviderModels}
      fetchAdvancedProviderModels={fetchAdvancedProviderModels}
    />
  );
}
