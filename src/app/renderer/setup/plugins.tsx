import { CatCreationFields } from './CatCreationFields.js';
import type { SuiteProductDescriptor } from '../../../shared/suite-contract.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import type { ProductSetupPlugin } from './types.js';

export interface GuideCatSetupFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
  catName: string;
  runtimeReachable: boolean;
  onTargetChange: (target: {
    provider: string;
    instance: string;
    model: string;
    modelSelection?: ProviderModelSelection | null;
  }) => void;
  onCatNameChange: (name: string) => void;
}

export function GuideCatSetupFields({
  provider,
  instance,
  model,
  modelSelection,
  catName,
  runtimeReachable,
  onTargetChange,
  onCatNameChange,
}: GuideCatSetupFieldsProps) {
  return (
    <>
      <CatCreationFields
        name={catName}
        onNameChange={onCatNameChange}
        provider={provider}
        instance={instance}
        model={model}
        modelSelection={modelSelection}
        onTargetChange={onTargetChange}
        nameLabel="Guide Cat name"
        namePlaceholder="Guide Cat"
        nameHint="An optional helper Cat that can support you across Chat, Work, and Code."
        autoFocusName
        hideMakeBoss
        hideProductToggles
      />
      <div className="setupRuntimeStatus">
        <span
          className={
            runtimeReachable
              ? 'statusChip statusChipReady'
              : 'statusChip statusChipWarm'
          }
        >
          {runtimeReachable
            ? 'Cats Runtime connected'
            : 'Cats Runtime not detected'}
        </span>
      </div>
    </>
  );
}

export function validateGuideCatSetupStep(input: {
  model: string;
}): boolean {
  return Boolean(input.model.trim());
}

export function getSuiteSetupPlugins(products: readonly SuiteProductDescriptor[]): ProductSetupPlugin[] {
  return products.flatMap((product) => {
    if (!product.surface) {
      return [];
    }

    return [{
      surface: product.surface,
      label: product.productName,
      description: product.subtitle,
      enabled: product.setup.selectable,
      disabledReason: product.setup.disabledReason,
      installPolicy: product.installPolicy,
      installState: product.installState,
      maturity: product.maturity,
    }];
  });
}
