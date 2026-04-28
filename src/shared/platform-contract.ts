import type {
  AssistantPresetRecord,
  ExecutionTargetSummary,
  GuideCatRecord,
} from '../core/types.js';
import type { GuideCatAssistSurfaceReadModel } from './guideCatAssist.js';
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

export type GuideCatPlacement = 'floating' | 'docked';

export interface GuideCatFloatingAnchor {
  x: number;
  y: number;
}

export const GUIDE_CAT_FLOATING_ANCHOR_DEFAULT: GuideCatFloatingAnchor = {
  x: 0.03,
  y: 0.5,
};

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
  systemTrayEnabled: boolean;
}

export interface PlatformLobbyCatSummary {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss: boolean;
  defaultExecutionTarget: ExecutionTargetSummary | null;
  defaultModelSelection?: ProviderModelSelection | null;
  executionLabel: string | null;
}

export interface PlatformLobbyPreferences {
  animationMode: PlatformLobbyAnimationMode;
}

export interface PlatformLobbyState extends PlatformLobbyPreferences {
  cats: PlatformLobbyCatSummary[];
  guideCatAssist?: GuideCatAssistSurfaceReadModel | null;
}

export interface PlatformGuideCatAssistState {
  codeNewDraft?: GuideCatAssistSurfaceReadModel | null;
}

export interface PlatformOwnerContext {
  setupCompleteAt: string | null;
  ownerDisplayName: string;
  ownerAvatarColor: string | null;
  ownerAvatarUrl: string | null;
  lastProductSurface: PlatformSurfaceId | null;
  guideCat: GuideCatRecord | null;
  assistantPresets?: AssistantPresetRecord[];
}

export const PLATFORM_BUILD_CHANNEL_VALUES = ['development', 'production'] as const;

export type PlatformBuildChannel = typeof PLATFORM_BUILD_CHANNEL_VALUES[number];

/**
 * Read-only feature-flag map carried on the platform host envelope. Renderers
 * consume this through the app-shell payload to gate UI behavior at runtime.
 *
 * Values are coerced by the host-owned read path (see PLAN-077 Phase 1) — a
 * `production` build observes `false` for any flag whose registry entry has
 * `productionUnlockState === 'locked'`, regardless of what is persisted on
 * disk. Renderers therefore always read the post-coercion value here.
 */
export type PlatformFeatureFlags = Readonly<Record<string, boolean>>;

export const EMPTY_PLATFORM_FEATURE_FLAGS: PlatformFeatureFlags = Object.freeze({});

export interface PlatformHostEnvelope extends PlatformOwnerContext {
  app: PlatformAppDescriptor;
  products: PlatformProductDescriptor[];
  desktop: PlatformDesktopPreferences;
  lobby: PlatformLobbyState;
  guideCatAssist?: PlatformGuideCatAssistState;
  runtime: RuntimeStatusSummary;
  runtimeSetup: RuntimeSetupSummary;
  metadata: PlatformResponseMetadata;
  bootstrapAttemptId: string | null;
  /**
   * Build channel baked at build time, not derived from runtime input. The
   * Phase 1 release-flag mechanism in PLAN-077 relies on this being a
   * compile-time constant the host has already resolved, so renderer or
   * persisted flag state cannot defeat the production guard.
   */
  buildChannel: PlatformBuildChannel;
  /**
   * Host-owned feature flag map. Defaults to {} until Slice 4 wires
   * persistence; Slice 5+ gates the companion-profile IA on
   * `featureFlags['cats.chat.companionProfileIA']`.
   */
  featureFlags: PlatformFeatureFlags;
}

export interface PlatformSetupCompleteInput {
  attemptId?: string | null;
  ownerDisplayName: string;
  createGuideCat?: boolean;
  guideCatProvider?: string;
  guideCatInstance?: string;
  guideCatModel?: string;
  guideCatModelSelection?: ProviderModelSelection | null;
}
