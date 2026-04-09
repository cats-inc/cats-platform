import type { AssistantPresetRecord, GuideCatRecord } from '../core/types.js';
import type { RuntimeStatusSummary } from '../platform/runtime/client.js';
import type { ProviderModelSelection } from './providerSelection.js';
import type { RuntimeSetupSummary } from './runtimeSetup.js';

export type PlatformSurfaceId = 'chat' | 'work' | 'code';
export type PlatformProductId = PlatformSurfaceId | (string & {});
export type PlatformProductGroupId = 'home' | 'office';
export type PlatformProductInstallPolicy = 'required' | 'optional';
export type PlatformProductInstallState = 'installed' | 'available' | 'installing' | 'attention';
export type PlatformProductMaturity = 'active' | 'preview';
export type PlatformLobbyAnimationMode = 'off' | 'reduced' | 'full';
export type GuideCatSidecarMode = 'auto' | 'drawer' | 'bubble';

export interface PlatformAppDescriptor {
  name: 'cats-platform';
  stage: 'phase-2-shell';
  runtimeBoundary: 'cats-runtime';
}

export interface PlatformProductSetupDescriptor {
  selectable: boolean;
  disabledReason?: string;
}

export interface PlatformProductSettingsDescriptor {
  id: string;
  label: string;
  path: `/${string}`;
}

export interface PlatformProductDescriptor {
  id: PlatformProductId;
  surface: PlatformSurfaceId | null;
  routePrefix: `/${string}`;
  productName: string;
  subtitle: string;
  group: PlatformProductGroupId;
  installPolicy: PlatformProductInstallPolicy;
  installState: PlatformProductInstallState;
  maturity: PlatformProductMaturity;
  setup: PlatformProductSetupDescriptor;
  settings?: PlatformProductSettingsDescriptor[];
}

export interface PlatformResponseMetadata {
  generatedAt: string;
  host: string;
  port: number;
}

export interface PlatformDesktopPreferences {
  startAtLogin: boolean;
  openWindowOnStartup: boolean;
}

export interface PlatformLobbyCatSummary {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss: boolean;
}

export interface PlatformLobbyPreferences {
  animationMode: PlatformLobbyAnimationMode;
}

export interface PlatformLobbyState extends PlatformLobbyPreferences {
  cats: PlatformLobbyCatSummary[];
}

export interface PlatformOwnerContext {
  setupCompleteAt: string | null;
  ownerDisplayName: string;
  ownerAvatarColor: string | null;
  ownerAvatarUrl: string | null;
  lastProductSurface: PlatformSurfaceId | null;
  guideCat: GuideCatRecord | null;
  guideCatSidecarSeen?: boolean;
  guideCatSidecarMode?: GuideCatSidecarMode;
  assistantPresets?: AssistantPresetRecord[];
}

export interface PlatformHostEnvelope extends PlatformOwnerContext {
  app: PlatformAppDescriptor;
  products: PlatformProductDescriptor[];
  desktop: PlatformDesktopPreferences;
  lobby: PlatformLobbyState;
  runtime: RuntimeStatusSummary;
  runtimeSetup: RuntimeSetupSummary;
  metadata: PlatformResponseMetadata;
  bootstrapAttemptId: string | null;
}

export interface PlatformSetupCompleteInput {
  attemptId?: string | null;
  ownerDisplayName: string;
  createGuideCat?: boolean;
  guideCatName?: string;
  guideCatProvider?: string;
  guideCatInstance?: string;
  guideCatModel?: string;
  guideCatModelSelection?: ProviderModelSelection | null;
}
