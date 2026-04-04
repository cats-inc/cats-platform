import type {
  SuiteProductDescriptor,
  SuiteSurfaceId,
} from '../../../shared/suite-contract.js';

export interface ProductSetupPlugin {
  surface: SuiteSurfaceId;
  label: string;
  description: string;
  enabled: boolean;
  disabledReason?: string;
  installPolicy: SuiteProductDescriptor['installPolicy'];
  installState: SuiteProductDescriptor['installState'];
  maturity: SuiteProductDescriptor['maturity'];
}
