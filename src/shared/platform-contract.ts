import type {
  AssistantPresetRecord,
  ExecutionTargetSummary,
  GuideCatRecord,
} from '../core/types.js';
import type { GuideCatAssistSurfaceReadModel } from './guideCatAssist.js';
import type { RuntimeStatusSummary } from '../platform/runtime/client.js';
import type { PlatformInstalledAppDescriptor } from './catsAppManifest.js';
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

export type PlatformMobilePairingBindReachability =
  | 'loopback'
  | 'lan'
  | 'all_interfaces'
  | 'other_interface';

export type PlatformMobilePairingNoLanCandidateReason =
  | 'feature_disabled'
  | 'loopback_bound'
  | 'no_lan_candidate'
  | 'bind_host_not_lan_candidate';

export interface PlatformMobilePairingReadiness {
  enabled: boolean;
  bindHost: string;
  bindPort: number;
  bindReachability: PlatformMobilePairingBindReachability;
  canReachFromLan: boolean;
  selectedLanIp: string | null;
  selectedLanUrl: string | null;
  diagnosticManifestUrl: string | null;
  noLanCandidateReason: PlatformMobilePairingNoLanCandidateReason | null;
  bindOverrideEnv: string | null;
  pairingUrlStatus: 'phase1_pending' | 'ready';
  pairingUrl: string | null;
}

export interface PlatformDesktopPreferences {
  startAtLogin: boolean;
  openWindowOnStartup: boolean;
  systemTrayEnabled: boolean;
  mobilePairing: PlatformMobilePairingReadiness;
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

/**
 * Cross-cutting membership status for both Clowder and Cattery
 * memberships, per ADR-100 §Decision and SPEC-103 §FR 11-13. Cattery
 * membership rejects `temp` at the validator boundary (FR-12); the
 * shared union is kept for the Clowder side and for filter/transition
 * helpers that operate generically over both entity types.
 */
export type MembershipStatus = 'formal' | 'temp' | 'external';

/**
 * A clowder summary as it appears in the Lobby sidebar / list. Phase
 * 6 of PLAN-091 ships the full ClowderRecord (with members, cat list,
 * createdAt/By, etc.); the sidebar only needs identification + a
 * couple of counts to size the row.
 */
export interface PlatformLobbyClowderSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** When non-null, this Clowder is part of the named Cattery's formal org chart. */
  parentCatteryId: string | null;
  catCount: number;
  memberCount: number;
}

/**
 * A cattery summary as it appears in the Lobby sidebar / list. Same
 * scope-shrinking comment as PlatformLobbyClowderSummary applies.
 */
export interface PlatformLobbyCatterySummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  /** Count of Clowders with `parentCatteryId === this.id`. */
  clowderCount: number;
  /** Aggregate Cats reachable through formal Clowders + direct members, deduped. */
  catCount: number;
}

export interface PlatformLobbyPreferences {
  animationMode: PlatformLobbyAnimationMode;
}

export type PlatformUiLanguage = 'en' | 'zh-TW';
export type PlatformUiLanguagePreference = 'auto' | PlatformUiLanguage;
export type AssistantResponseLanguage =
  | 'unspecified'
  | 'en'
  | 'zh-TW'
  | 'zh-CN'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'pt-BR'
  | 'it'
  | 'nl'
  | 'pl'
  | 'tr'
  | 'id'
  | 'vi'
  | 'th'
  | 'hi'
  | 'ar';

export interface PlatformLanguagePreferences {
  assistantResponseLanguage: AssistantResponseLanguage;
  uiLanguagePreference: PlatformUiLanguagePreference;
}

export interface PlatformLobbyState extends PlatformLobbyPreferences {
  cats: PlatformLobbyCatSummary[];
  /**
   * PLAN-091 phase 6 widens the Lobby payload to carry Clowder /
   * Cattery summaries alongside Cats. Until the storage layer ships,
   * the server emits empty arrays; the renderer treats absence and
   * `[]` identically (defensive default in `LobbySidebar`).
   */
  clowders?: PlatformLobbyClowderSummary[];
  catteries?: PlatformLobbyCatterySummary[];
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

export interface PlatformHostEnvelope extends PlatformOwnerContext {
  app: PlatformAppDescriptor;
  products: PlatformProductDescriptor[];
  installedApps: PlatformInstalledAppDescriptor[];
  desktop: PlatformDesktopPreferences;
  language?: PlatformLanguagePreferences;
  lobby: PlatformLobbyState;
  guideCatAssist?: PlatformGuideCatAssistState;
  runtime: RuntimeStatusSummary;
  runtimeSetup: RuntimeSetupSummary;
  metadata: PlatformResponseMetadata;
  bootstrapAttemptId: string | null;
  /**
   * SPEC-086 platform-host product data scope id. UUIDv4 generated once
   * per durable Cats product data root and persisted next to it. The
   * companion `cats://companion/v1/<scopeId>/...` reference resolver
   * uses this to reject references whose scope does not match the
   * current data root (mismatches resolve as `inaccessible`, not as
   * malformed references).
   */
  scopeId: string;
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
