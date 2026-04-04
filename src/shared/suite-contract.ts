import type { RuntimeStatusSummary } from '../platform/runtime/client.js';
import type { ProviderModelSelection } from './providerSelection.js';
import type { RuntimeSetupSummary } from './runtimeSetup.js';

export type SuiteSurfaceId = 'chat' | 'work' | 'code';
export type SuiteProductId = SuiteSurfaceId | (string & {});
export type SuiteProductGroupId = 'home' | 'office';
export type SuiteProductInstallPolicy = 'required' | 'optional';
export type SuiteProductInstallState = 'installed' | 'available' | 'installing' | 'attention';
export type SuiteProductMaturity = 'active' | 'preview';

export interface SuiteAppDescriptor {
  name: 'cats';
  stage: 'phase-2-shell';
  runtimeBoundary: 'cats-runtime';
}

export interface SuiteProductSetupDescriptor {
  selectable: boolean;
  disabledReason?: string;
}

export interface SuiteProductSettingsDescriptor {
  id: string;
  label: string;
  path: `/${string}`;
}

export interface SuiteProductDescriptor {
  id: SuiteProductId;
  surface: SuiteSurfaceId | null;
  routePrefix: `/${string}`;
  productName: string;
  subtitle: string;
  group: SuiteProductGroupId;
  installPolicy: SuiteProductInstallPolicy;
  installState: SuiteProductInstallState;
  maturity: SuiteProductMaturity;
  setup: SuiteProductSetupDescriptor;
  settings?: SuiteProductSettingsDescriptor[];
}

export interface SuiteResponseMetadata {
  generatedAt: string;
  host: string;
  port: number;
}

export interface SuiteOwnerContext {
  setupCompleteAt: string | null;
  ownerDisplayName: string;
  ownerAvatarColor: string | null;
  ownerAvatarUrl: string | null;
  lastProductSurface: SuiteSurfaceId | null;
}

export interface SuiteHostEnvelope extends SuiteOwnerContext {
  app: SuiteAppDescriptor;
  products: SuiteProductDescriptor[];
  runtime: RuntimeStatusSummary;
  runtimeSetup: RuntimeSetupSummary;
  metadata: SuiteResponseMetadata;
  bootstrapAttemptId: string | null;
}

export interface SuiteSetupCompleteInput {
  attemptId?: string | null;
  ownerDisplayName: string;
  selectedProduct: SuiteSurfaceId;
  createGuideCat?: boolean;
  guideCatName?: string;
  guideCatProvider?: string;
  guideCatInstance?: string;
  guideCatModel?: string;
  guideCatModelSelection?: ProviderModelSelection | null;
}
