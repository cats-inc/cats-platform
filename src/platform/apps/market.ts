// Preview App Market over the signed official catalog (SPEC-120 FR-02/FR-07/FR-09).
// It installs and updates through the existing local-user package installer. Apps that
// the Desktop bundle manages stay with the Desktop, because bundled reconciliation would
// otherwise replace a Market version at the next start (FR-08 is not implemented yet).
import { readFile } from 'node:fs/promises';
import { APP_SDK_VERSION, PLATFORM_VERSION, meetsMinimumVersion, parseAppLock, supportsVersion } from '#cats-app-package';
import type { AppMarketAction, AppMarketInstalledSource, AppMarketSnapshot } from '../../shared/appMarket.js';
import type { CatsInstalledAppRecord } from '../../shared/catsAppManifest.js';
import type { AppCatalogClient, AppCatalogPayload, AppCatalogProvenance, AppCatalogVersion } from './catalog.js';
import { AppCatalogError } from './catalogFetch.js';
import type { AppComponentHost } from './componentHost.js';
import { installRendererPackage, validateRendererPackage } from './packageInstaller.js';
import { resolveCatsAppStoragePathsFromChatState } from './paths.js';
import { FileCatsAppRegistry } from './registry.js';

// App IDs selected by this Desktop's bundle lock. Registry history alone is not enough:
// a purged bundled App has no record left, yet the next start would reinstall it over
// a Market copy.
export async function readBundledAppIds(lockPath: string | undefined): Promise<ReadonlySet<string>> {
  if (!lockPath) return new Set();
  try {
    return new Set(parseAppLock(JSON.parse(await readFile(lockPath, 'utf8'))).apps.map((app) => app.id));
  } catch {
    return new Set();
  }
}

function isCompatible(version: AppCatalogVersion): boolean {
  return meetsMinimumVersion(PLATFORM_VERSION, version.compatibility.catsPlatform)
    && supportsVersion(APP_SDK_VERSION, version.compatibility.appSdk);
}

function stableVersion(app: AppCatalogPayload['apps'][number]): AppCatalogVersion {
  return app.versions.find((entry) => entry.version === app.channels.stable)!;
}

function marketAction(
  version: AppCatalogVersion,
  records: readonly CatsInstalledAppRecord[],
  bundled: boolean,
): AppMarketAction {
  if (bundled || records.some((record) => record.packageSource === 'desktop-bundle')) return 'managed-by-desktop';
  const installed = records.find((record) => record.installState !== 'uninstalled');
  if (installed && meetsMinimumVersion(installed.manifest.version, version.version)) return 'installed';
  if (!isCompatible(version)) return 'incompatible';
  return installed ? 'update' : 'install';
}

// A copy counts as a Market install only when its digest matches what this host recorded.
function installedSource(installed: CatsInstalledAppRecord | undefined, provenance: AppCatalogProvenance | undefined): AppMarketInstalledSource | null {
  if (!installed) return null;
  return provenance && installed.packageSha256 === provenance.sha256 ? 'market' : 'other';
}

async function registryRecords(chatStatePath: string): Promise<CatsInstalledAppRecord[]> {
  const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
  return (await registry.readState()).apps;
}

export async function readAppMarket(options: {
  chatStatePath: string;
  client: AppCatalogClient;
  refresh?: boolean;
  bundledAppIds?: ReadonlySet<string>;
}): Promise<AppMarketSnapshot> {
  const loaded = await options.client.load({ chatStatePath: options.chatStatePath, refresh: options.refresh });
  const records = await registryRecords(options.chatStatePath);
  const catalog = loaded.catalog;
  return {
    status: loaded.status,
    revision: catalog?.revision ?? null,
    issuedAt: catalog?.issuedAt ?? null,
    expiresAt: catalog?.expiresAt ?? null,
    fetchedAt: loaded.fetchedAt,
    apps: (catalog?.apps ?? []).map((app) => {
      const version = stableVersion(app);
      const appRecords = records.filter((record) => record.id === app.id);
      const installed = appRecords.find((record) => record.installState !== 'uninstalled');
      const installedEntry = installed ? app.versions.find((entry) => entry.version === installed.manifest.version) : undefined;
      return {
        id: app.id,
        displayName: app.displayName,
        description: app.description,
        icon: app.icon,
        version: version.version,
        notes: version.notes,
        permissions: version.permissions,
        publisher: version.publisher,
        compatibility: version.compatibility,
        installedVersion: installed?.manifest.version ?? null,
        installedSource: installedSource(installed, loaded.installs[app.id]),
        installedWithdrawnReason: installedEntry?.withdrawn?.reason ?? null,
        action: marketAction(version, appRecords, options.bundledAppIds?.has(app.id) ?? false),
      };
    }),
    ...(loaded.error ? { error: loaded.error } : {}),
  };
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// Install or update one App to the stable catalog version the user reviewed. The client
// never supplies a URL or digest: both come from the verified catalog. If the catalog has
// moved to another version or permission set since the page loaded, nothing is installed.
export async function installFromAppMarket(options: {
  chatStatePath: string;
  client: AppCatalogClient;
  appId: string;
  /** The version and permissions shown to the user. */
  reviewed: { version: string; permissions: readonly string[] };
  bundledAppIds?: ReadonlySet<string>;
  componentHost?: AppComponentHost;
  now?: () => Date;
}): Promise<CatsInstalledAppRecord> {
  const loaded = await options.client.load({ chatStatePath: options.chatStatePath });
  if (!loaded.catalog) throw loaded.error ? new AppCatalogError(loaded.error.code, loaded.error.message) : new AppCatalogError('catalog_unavailable', 'The App catalog is unavailable.');
  if (loaded.status === 'expired') throw new AppCatalogError('catalog_expired', 'The App catalog has expired; refresh it before installing.');
  const app = loaded.catalog.apps.find((candidate) => candidate.id === options.appId);
  if (!app) throw new AppCatalogError('app_not_in_catalog', `${options.appId} is not in the App catalog.`);
  const version = stableVersion(app);
  if (version.version !== options.reviewed.version || !sameList(version.permissions, options.reviewed.permissions)) {
    throw new AppCatalogError('catalog_changed', `${app.displayName} changed in the catalog; review it again before installing.`);
  }
  const records = (await registryRecords(options.chatStatePath)).filter((record) => record.id === app.id);
  const action = marketAction(version, records, options.bundledAppIds?.has(app.id) ?? false);
  if (action === 'managed-by-desktop') throw new AppCatalogError('app_managed_by_desktop', `${app.displayName} is provided and updated by Cats Desktop.`);
  if (action === 'installed') throw new AppCatalogError('app_already_installed', `${app.displayName} ${version.version} or newer is already installed.`);
  if (action === 'incompatible') throw new AppCatalogError('app_incompatible', `${app.displayName} ${version.version} needs a newer Cats Desktop.`);

  const bytes = await options.client.downloadArtifact(version);
  const pin = { id: app.id, version: version.version, sha256: version.artifact.sha256 };
  const { manifest } = validateRendererPackage(bytes, pin);
  if (!sameList(manifest.permissions, version.permissions)
    || manifest.compatibility.catsPlatform !== version.compatibility.catsPlatform
    || manifest.compatibility.appSdk !== version.compatibility.appSdk
    || manifest.publisher.name !== version.publisher.name) {
    throw new AppCatalogError('catalog_mismatch', `The downloaded ${app.displayName} package does not match its catalog entry.`);
  }
  // A new install starts enabled; an update keeps the enabled state current at install time.
  const installed = await installRendererPackage({
    chatStatePath: options.chatStatePath, bytes, pin, source: 'local-package',
    enable: true, preserveEnabled: true, componentHost: options.componentHost,
  });
  try {
    await options.client.recordInstall(options.chatStatePath, app.id, {
      version: version.version, sha256: version.artifact.sha256, revision: loaded.catalog.revision,
      keyId: loaded.keyId ?? '', installedAt: (options.now ?? (() => new Date()))().toISOString(),
    });
  } catch {
    // The App is installed; provenance only changes later Market wording.
  }
  return installed;
}
