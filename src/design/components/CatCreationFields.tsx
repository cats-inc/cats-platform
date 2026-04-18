import React from 'react';

import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import type {
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import { ProviderModelFields } from './ProviderModelFields.js';

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
  makeBoss?: boolean;
  onMakeBossChange?: (value: boolean) => void;
  hideMakeBoss?: boolean;
  products?: string[];
  onProductsChange?: (products: string[]) => void;
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  hideProductToggles?: boolean;
  fetchProviderRegistry: () => Promise<ProductProviderRegistryReadModel>;
  fetchProviderModels: (provider: string, instance?: string | null) => Promise<ProviderModelCatalog>;
  fetchAdvancedProviderModels: (
    provider: string,
    instance?: string | null,
  ) => Promise<ProviderAdvancedModelCatalog>;
  onProviderRegistryChange?: (registry: ProductProviderRegistryReadModel) => void;
}

export function CatCreationFields({
  name,
  onNameChange,
  nameReadOnly,
  provider,
  instance,
  model,
  modelSelection,
  onTargetChange,
  nameLabel,
  namePlaceholder,
  nameHint,
  autoFocusName,
  makeBoss,
  onMakeBossChange,
  hideMakeBoss,
  fetchProviderRegistry,
  fetchProviderModels,
  fetchAdvancedProviderModels,
  onProviderRegistryChange,
}: CatCreationFieldsProps) {

  return (
    <>
      <label className="fieldLabel">
        <span>{nameLabel ?? 'Name'}</span>
        <input
          className="textInput"
          value={name}
          onChange={nameReadOnly ? undefined : (e) => onNameChange(e.target.value)}
          placeholder={namePlaceholder}
          autoFocus={autoFocusName && !nameReadOnly}
          readOnly={nameReadOnly}
          aria-readonly={nameReadOnly ? 'true' : undefined}
        />
        {nameHint ? <span className="fieldHint">{nameHint}</span> : null}
      </label>
      {!hideMakeBoss && onMakeBossChange ? (
        <label className="fieldLabel fieldLabelInline">
          <input
            type="checkbox"
            checked={makeBoss ?? false}
            onChange={(e) => onMakeBossChange(e.target.checked)}
          />
          <span>Set as Boss Cat</span>
        </label>
      ) : null}
      <ProviderModelFields
        provider={provider}
        instance={instance}
        model={model}
        modelSelection={modelSelection}
        onTargetChange={onTargetChange}
        fetchProviderRegistry={fetchProviderRegistry}
        fetchProviderModels={fetchProviderModels}
        fetchAdvancedProviderModels={fetchAdvancedProviderModels}
        onProviderRegistryChange={onProviderRegistryChange}
      />
    </>
  );
}
