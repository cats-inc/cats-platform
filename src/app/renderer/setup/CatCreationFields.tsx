import type {
  ProductProviderRegistryReadModel,
} from '../../../shared/providerCatalog.js';
import type { ProviderModelSelection, ProviderTargetSelection } from '../../../shared/providerSelection';
import { CatCreationFields as SharedCatCreationFields } from '../../../design/components/CatCreationFields';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviderRegistry,
} from './api';

export interface CatCreationFieldsProps {
  name: string;
  onNameChange: (name: string) => void;
  nameReadOnly?: boolean;
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
  nameLabel?: string;
  namePlaceholder?: string;
  nameHint?: string;
  autoFocusName?: boolean;
  hideMakeBoss?: boolean;
  hideProductToggles?: boolean;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}

export function CatCreationFields(props: CatCreationFieldsProps) {
  return (
    <SharedCatCreationFields
      {...props}
      fetchProviderRegistry={fetchProviderRegistry}
      fetchProviderModels={fetchProviderModels}
      fetchAdvancedProviderModels={fetchAdvancedProviderModels}
    />
  );
}
