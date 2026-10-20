// Preview App Market over the signed official catalog (SPEC-120 FR-02/FR-07/FR-09).
// It installs and updates through the existing local-user package installer. Apps that
// the Desktop bundle manages stay with the Desktop, because bundled reconciliation would
// otherwise replace a Market version at the next start (FR-08 is not implemented yet).
import { APP_SDK_VERSION, PLATFORM_VERSION, meetsMinimumVersion, supportsVersion } from '#cats-app-package';
import type { AppMarketAction, AppMarketSnapshot } from '../../shared/appMarket.js';
import type { CatsInstalledAppRecord } from '../../shared/catsAppManifest.js';
import type { AppCatalogClient, AppCatalogPayload, AppCatalogVersion } from './catalog.js';
import { AppCatalogError } from './catalogFetch.js';
import type { AppComponentHost } from './componentHost.js';
import { installRendererPackage, validateRendererPackage } from './packageInstaller.js';
import { resolveCatsAppStoragePathsFromChatState } from './paths.js';
import { FileCatsAppRegistry } from './registry.js';

function isCompatible(version: AppCatalogVersion): boolean {
  return meetsMinimumVersion(PLATFORM_VERSION, version.compatibility.catsPlatform)
    && supportsVersion(APP_SDK_VERSION, version.compatibility.appSdk);
}

function stableVersion(app: AppCatalogPayload['apps'][number]): AppCatalogVersion {
  return app.versions.find((entry) => entry.version === app.channels.stable)!;
}

function marketAction(version: AppCatalogVersion, records: readonly CatsInstalledAppRecord[]): AppMarketAction {
  if (records.some((record) => record.packageSource === 'desktop-bundle')) return 'managed-by-desktop';
  const installed = records.find((record) => record.installState !== 'uninstalled');
  if (installed && meetsMinimumVersion(installed.manifest.version, version.version)) return 'installed';
  if (!isCompatible(version)) return 'incompatible';
  return installed ? 'update' : 'install';
}

async function registryRecords(chatStatePath: string): Promise<CatsInstalledAppRecord[]> {
  const registry = new FileCatsAppRegistry({ registryPath: resolveCatsAppStoragePathsFromChatState(chatStatePath).registryPath });
  return (await registry.readState()).apps;
}

export async function readAppMarket(options: { chatStatePath: string; client: AppCatalogClient; refresh?: boolean }): Promise<AppMarketSnapshot> {
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
        installedWithdrawnReason: installedEntry?.withdrawn?.reason ?? null,
        action: marketAction(version, appRecords),
      };
    }),
    ...(loaded.error ? { error: loaded.error } : {}),
  };
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// Install or update one App to its stable catalog version. The client never supplies a
// URL or digest: both come from the verified catalog, and the downloaded manifest must
// match the catalog entry the user reviewed.
export async function installFromAppMarket(options: {
  chatStatePath: string;
  client: AppCatalogClient;
  appId: string;
  componentHost?: AppComponentHost;
  now?: () => Date;
}): Promise<CatsInstalledAppRecord> {
  const loaded = await options.client.load({ chatStatePath: options.chatStatePath });
  if (!loaded.catalog) throw loaded.error ? new AppCatalogError(loaded.error.code, loaded.error.message) : new AppCatalogError('catalog_unavailable', 'The App catalog is unavailable.');
  if (loaded.status === 'expired') throw new AppCatalogError('catalog_expired', 'The App catalog has expired; refresh it before installing.');
  const app = loaded.catalog.apps.find((candidate) => candidate.id === options.appId);
  if (!app) throw new AppCatalogError('app_not_in_catalog', `${options.appId} is not in the App catalog.`);
  const version = stableVersion(app);
  const records = (await registryRecords(options.chatStatePath)).filter((record) => record.id === app.id);
  const action = marketAction(version, records);
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
  const previous = records.find((record) => record.installState !== 'uninstalled');
  const installed = await installRendererPackage({
    chatStatePath: options.chatStatePath, bytes, pin, source: 'local-package',
    enable: previous ? previous.enabled : true, componentHost: options.componentHost,
  });
  await options.client.recordInstall(options.chatStatePath, app.id, {
    version: version.version, sha256: version.artifact.sha256, revision: loaded.catalog.revision,
    keyId: loaded.keyId ?? '', installedAt: (options.now ?? (() => new Date()))().toISOString(),
  });
  return installed;
}
