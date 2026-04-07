import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../shared/providerSelection.js';
import type {
  ProductProviderDescriptor,
  ProductProviderRegistryReadModel,
  ProviderAdvancedModelCatalog,
  ProviderModelCatalog,
} from '../../shared/providerCatalog.js';
import { buildProductSurfaceToggleStates } from './productSurfaceToggles.js';
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
  enabledSurfaces?: string[];
  hideProductToggles?: boolean;
  fetchProviders: () => Promise<ProductProviderDescriptor[] | ProductProviderRegistryReadModel>;
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
  enabledSurfaces,
  hideProductToggles,
  fetchProviders,
  fetchProviderModels,
  fetchAdvancedProviderModels,
  onProviderRegistryChange,
}: CatCreationFieldsProps) {
  const normalizedProducts = products ?? [];
  const selectableSurfaces = availableSurfaces ?? [];
  const toggleStates = buildProductSurfaceToggleStates({
    surfaces: selectableSurfaces,
    selected: normalizedProducts,
    enabledSurfaces,
    requiredSurfaces: (makeBoss ?? false) ? ['chat'] : [],
  });

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
      {!hideProductToggles && selectableSurfaces.length > 1 && onProductsChange ? (
        <div className="fieldLabel">
          <span>Available in</span>
          <div className="productToggles">
            {toggleStates.map(({ surface, active, disabled, unavailable }) => {
              return (
                <button
                  key={surface}
                  type="button"
                  className={active ? 'productToggle productToggleActive' : 'productToggle'}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) {
                      return;
                    }
                    const next = active
                      ? normalizedProducts.filter((s) => s !== surface)
                      : [...normalizedProducts, surface];
                    onProductsChange(next);
                  }}
                  data-tooltip={unavailable ? `${surface} is not enabled yet` : undefined}
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
        onProviderRegistryChange={onProviderRegistryChange}
      />
    </>
  );
}
