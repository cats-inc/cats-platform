import {
  APP_SDK_VERSION,
  decodeAppPackage,
  supportsVersion,
  type AppPackageExpectation,
  type DecodedAppPackage,
} from '#cats-app-format';
import type { CatsAppManifestV1, CatsAppPermission } from '../shared/catsAppManifest.js';
import { parseCatsAppManifestV1 } from '../shared/catsAppValidation.js';

// The renderer host's grantable capabilities; other manifest permissions are rejected.
const RENDERER_APP_PERMISSIONS: ReadonlyArray<CatsAppPermission> = [
  'ui.route',
  'ui.lobby',
  'runtime.telemetry.read',
  'runtime.telemetry.refresh',
  'media.images',
  'storage.appData',
  'clipboard.write',
];
const RESERVED_APP_IDS = ['install', 'validate'];

export interface RendererPackageValidationOptions {
  /** Host Platform version that `compatibility.catsPlatform` must accept. */
  platformVersion: string;
  /** Host App SDK version that `compatibility.appSdk` must accept; defaults to this SDK. */
  appSdkVersion?: string;
  /** Expected identity and digest, as pinned by a lock or catalog entry. */
  pin?: AppPackageExpectation;
}

export interface ValidatedRendererPackage extends DecodedAppPackage {
  manifest: CatsAppManifestV1;
}

/**
 * The installer's complete acceptance check for a v1 renderer package. The host and the
 * public App SDK entry share this function, so an archive that passes App CI against a host
 * version is not rejected by that host's installer for format or manifest reasons.
 */
export function validateRendererAppPackage(
  bytes: Uint8Array,
  options: RendererPackageValidationOptions,
): ValidatedRendererPackage {
  const decoded = decodeAppPackage(bytes, options.pin);
  const result = parseCatsAppManifestV1(decoded.manifest);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(' '));
  const manifest = result.manifest;
  if (manifest.components) {
    if (manifest.trustTier === 'third-party') throw new Error('Executable Apps require explicit local-user or system trust.');
    if (!manifest.permissions.includes('storage.appData')) throw new Error('Component Apps require storage.appData.');
    const entries = [...manifest.components.frontends, ...manifest.components.services, ...manifest.components.workers]
      .map(component => component.entrypoint);
    if (manifest.components.data.migration) entries.push(manifest.components.data.migration);
    if (entries.some(entry => !decoded.files.some(file => file.path === entry))) throw new Error('An App component entrypoint is missing from the archive.');
    // Executable archives must be self contained and cannot shadow the host launcher's metadata.
    if (decoded.files.some(file => ['package.json', 'payload.catsapp'].includes(file.path.toLowerCase()))) {
      throw new Error('Reserved component package file.');
    }
  }
  if (manifest.category !== 'user-app' || RESERVED_APP_IDS.includes(manifest.id)) {
    throw new Error('Only utility user-app packages are supported.');
  }
  if (!supportsVersion(options.platformVersion, manifest.compatibility.catsPlatform)
    || !supportsVersion(options.appSdkVersion ?? APP_SDK_VERSION, manifest.compatibility.appSdk)) {
    throw new Error('Incompatible platform or App SDK version.');
  }
  if (manifest.permissions.some((permission) => !RENDERER_APP_PERMISSIONS.includes(permission))) {
    throw new Error('This package requests capabilities not supported by the renderer host.');
  }
  return { ...decoded, manifest };
}
