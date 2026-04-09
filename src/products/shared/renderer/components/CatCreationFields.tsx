import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../../../shared/providerSelection.js';
import { CatCreationFields as SharedCatCreationFields } from '../../../../design/components/CatCreationFields.js';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviderRegistry,
} from '../api/index.js';

export interface CatCreationFieldsProps {
  name: string;
  onNameChange: (name: string) => void;
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
  nameLabel?: string;
  namePlaceholder?: string;
  nameHint?: string;
  autoFocusName?: boolean;
  makeBoss?: boolean;
  onMakeBossChange?: (value: boolean) => void;
  hideMakeBoss?: boolean;
  products?: string[];
  onProductsChange?: (products: string[]) => void;
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  hideProductToggles?: boolean;
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
