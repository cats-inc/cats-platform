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
  makeBoss?: boolean;
  onMakeBossChange?: (value: boolean) => void;
  hideMakeBoss?: boolean;
  products?: string[];
  onProductsChange?: (products: string[]) => void;
  availableSurfaces?: string[];
  hideProductToggles?: boolean;
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
  makeBoss,
  onMakeBossChange,
  hideMakeBoss,
  products,
  onProductsChange,
  availableSurfaces,
  hideProductToggles,
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
      {!hideProductToggles && availableSurfaces && availableSurfaces.length > 0 && onProductsChange ? (
        <div className="fieldLabel">
          <span>Available in</span>
          <div className="productToggles">
            {availableSurfaces.map((surface) => {
              const active = products?.includes(surface) ?? false;
              return (
                <button
                  key={surface}
                  type="button"
                  className={active ? 'productToggle productToggleActive' : 'productToggle'}
                  onClick={() => {
                    const next = active
                      ? (products ?? []).filter((s) => s !== surface)
                      : [...(products ?? []), surface];
                    onProductsChange(next);
                  }}
                >
                  {surface}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
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
