import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import type {
  ProductProviderDescriptor,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import { ProviderModelFields } from './ProviderModelFields.js';

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
  fetchProviders: () => Promise<ProductProviderDescriptor[]>;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
}

export function CatCreationFields({
  name,
  onNameChange,
  provider,
  instance,
  model,
  modelSelection,
  onTargetChange,
  nameLabel,
  namePlaceholder,
  nameHint,
  autoFocusName,
  fetchProviders,
  fetchProviderModels,
  fetchAdvancedProviderModels,
}: CatCreationFieldsProps) {
  return (
    <>
      <label className="fieldLabel">
        <span>{nameLabel ?? 'Name'}</span>
        <input
          className="textInput"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={namePlaceholder}
          autoFocus={autoFocusName}
        />
        {nameHint ? <span className="fieldHint">{nameHint}</span> : null}
      </label>
      <ProviderModelFields
        provider={provider}
        instance={instance}
        model={model}
        modelSelection={modelSelection}
        onTargetChange={onTargetChange}
        fetchProviders={fetchProviders}
        fetchProviderModels={fetchProviderModels}
        fetchAdvancedProviderModels={fetchAdvancedProviderModels}
      />
    </>
  );
}
