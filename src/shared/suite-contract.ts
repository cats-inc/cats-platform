import type { RuntimeStatusSummary } from '../platform/runtime/client.js';
import type { ProviderModelSelection } from './providerSelection.js';
import type { RuntimeSetupSummary } from './runtimeSetup.js';

export type SuiteSurfaceId = 'chat' | 'work' | 'code';

export interface SuiteAppDescriptor {
  name: 'cats';
  stage: 'phase-2-shell';
  runtimeBoundary: 'cats-runtime';
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
  runtime: RuntimeStatusSummary;
  runtimeSetup: RuntimeSetupSummary;
  metadata: SuiteResponseMetadata;
  bootstrapAttemptId: string | null;
}

export interface SuiteSetupCompleteInput {
  attemptId?: string | null;
  ownerDisplayName: string;
  selectedProduct: SuiteSurfaceId;
  createBossCat: boolean;
  bossCatName?: string;
  bossCatProvider?: string;
  bossCatInstance?: string;
  bossCatModel?: string;
  bossCatModelSelection?: ProviderModelSelection | null;
}
