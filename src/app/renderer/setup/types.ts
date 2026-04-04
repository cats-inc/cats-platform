import type {
  PlatformProductDescriptor,
  PlatformSurfaceId,
} from '../../../shared/platform-contract.js';

export interface ProductSetupPlugin {
  surface: PlatformSurfaceId;
  label: string;
  description: string;
  enabled: boolean;
  disabledReason?: string;
  installPolicy: PlatformProductDescriptor['installPolicy'];
  installState: PlatformProductDescriptor['installState'];
  maturity: PlatformProductDescriptor['maturity'];
}
