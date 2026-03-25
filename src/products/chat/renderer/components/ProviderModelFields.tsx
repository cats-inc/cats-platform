import type { ProviderModelSelection, ProviderTargetSelection } from '../../../../shared/providerSelection';
import { ProviderModelFields as SharedProviderModelFields } from '../../../../design/components/ProviderModelFields';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviders,
} from '../api';

interface ProviderModelFieldsProps {
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
      fetchProviders={fetchProviders}
      fetchProviderModels={fetchProviderModels}
      fetchAdvancedProviderModels={fetchAdvancedProviderModels}
    />
  );
}
