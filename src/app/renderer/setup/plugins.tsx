import type { ReactNode } from 'react';

import { CatCreationFields } from './CatCreationFields.js';
import type { SuiteProductDescriptor, SuiteSurfaceId } from '../../../shared/suite-contract.js';
import type { ConditionalStepProps, ProductSetupPlugin } from './types.js';

function ChatBossCatStep({
  provider,
  instance,
  model,
  modelSelection,
  catName,
  runtimeReachable,
  onTargetChange,
  onCatNameChange,
}: ConditionalStepProps) {
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
        nameLabel="Boss Cat name"
        namePlaceholder="Boss Cat"
        nameHint="Your personal AI agent that manages tasks and coordinates other cats."
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

interface SetupPluginExtras {
  hasConditionalStep: boolean;
  renderConditionalStep?: (props: ConditionalStepProps) => ReactNode;
  validateConditionalStep?: ProductSetupPlugin['validateConditionalStep'];
}

const SETUP_PLUGIN_EXTRAS: Partial<Record<SuiteSurfaceId, SetupPluginExtras>> = {
  chat: {
    hasConditionalStep: true,
    renderConditionalStep: (props) => <ChatBossCatStep {...props} />,
    validateConditionalStep: (state) => Boolean(state.model.trim()),
  },
};

export function getSuiteSetupPlugins(products: readonly SuiteProductDescriptor[]): ProductSetupPlugin[] {
  return products.flatMap((product) => {
    if (!product.surface) {
      return [];
    }

    const extras = SETUP_PLUGIN_EXTRAS[product.surface] ?? {
      hasConditionalStep: false,
    };

    return [{
      surface: product.surface,
      label: product.productName,
      description: product.subtitle,
      enabled: product.setup.selectable,
      disabledReason: product.setup.disabledReason,
      hasConditionalStep: extras.hasConditionalStep,
      renderConditionalStep: extras.renderConditionalStep,
      validateConditionalStep: extras.validateConditionalStep,
    }];
  });
}
