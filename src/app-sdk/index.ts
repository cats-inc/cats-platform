// Public App SDK contract, exported as `@cats-inc/cats-platform/app-sdk` (ADR-123).
// Keep this list deliberate: tests pin the exported names and the modules this entry loads.
// Host-only helpers (Platform version, lock resolution, the injected bridge) stay private.
export { APP_SDK_VERSION, MAX_PACKAGE_BYTES, decodeAppPackage, supportsVersion } from '#cats-app-format';
export type {
  AppPackageExpectation,
  CatsAppBrowserSdkV1,
  CatsImageJob,
  DecodedAppPackage,
  UsageGuardrailV1,
  UsageQuotaRefreshV1,
  UsageSnapshotV1,
  UsageTargetV1,
  UsageTotalsV1,
} from '#cats-app-format';
export { encodeAppPackage } from '#cats-app-encode';
export type { CatsAppPackageFile, CatsAppPackageInput } from '#cats-app-encode';
export { validateRendererAppPackage } from './packageValidation.js';
export type { RendererPackageValidationOptions, ValidatedRendererPackage } from './packageValidation.js';
export { parseCatsAppManifestV1 } from '../shared/catsAppValidation.js';
export type {
  CatsAppManifestParseResult,
  CatsAppManifestValidationIssue,
  CatsAppManifestValidationOptions,
} from '../shared/catsAppValidation.js';
export {
  CATS_APP_CATEGORIES,
  CATS_APP_MANIFEST_SCHEMA_VERSION,
  CATS_APP_PERMISSIONS,
  CATS_APP_TRUST_TIERS,
} from '../shared/catsAppManifest.js';
export type {
  CatsAgentToolContribution,
  CatsAppCategory,
  CatsAppCompatibility,
  CatsAppContributions,
  CatsAppEntrypoints,
  CatsAppManifestV1,
  CatsAppPermission,
  CatsAppPublisher,
  CatsAppSettingsContribution,
  CatsAppTrustTier,
  CatsConnectorAuthDeclaration,
  CatsConnectorContribution,
  CatsJobContribution,
  CatsLobbyAppContribution,
  CatsProductModuleContribution,
  CatsScopedApiRouteContribution,
} from '../shared/catsAppManifest.js';
