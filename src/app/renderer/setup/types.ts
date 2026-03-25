import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import type { SuiteSurfaceId } from '../../../shared/suite-contract.js';

export interface ConditionalStepProps {
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

export interface ConditionalStepState {
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
  catName: string;
}

export interface ProductSetupPlugin {
  surface: SuiteSurfaceId;
  label: string;
  description: string;
  enabled: boolean;
  disabledReason?: string;
  hasConditionalStep: boolean;
  renderConditionalStep?: (props: ConditionalStepProps) => React.ReactNode;
  validateConditionalStep?: (state: ConditionalStepState) => boolean;
}
