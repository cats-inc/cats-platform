import type {
  CatsInstalledAppRecord,
  CatsProductModuleContribution,
  PlatformInstalledAppDescriptor,
} from '../../shared/catsAppManifest.js';
import type { PlatformProductDescriptor } from '../../shared/platform-contract.js';
import { listPlatformProductDescriptors } from '../../shared/platformProducts.js';
import { resolveCatsAppStoragePathsFromChatState } from './paths.js';
import { FileCatsAppRegistry } from './registry.js';

function isLobbyLaunchEnabled(record: CatsInstalledAppRecord): boolean {
  return record.enabled && record.installState === 'enabled';
}

function isSystemProductModuleEnabled(record: CatsInstalledAppRecord): boolean {
  return record.enabled
    && record.installState === 'enabled'
    && record.manifest.category === 'product-module'
    && record.manifest.trustTier === 'system';
}

export function toPlatformInstalledAppDescriptor(
  record: CatsInstalledAppRecord,
): PlatformInstalledAppDescriptor {
  const contributions = record.manifest.contributions;
  return {
    id: record.id,
    displayName: record.manifest.displayName,
    publisher: record.manifest.publisher.name,
    version: record.manifest.version,
    category: record.manifest.category,
    trustTier: record.manifest.trustTier,
    permissions: structuredClone(record.manifest.permissions),
    installState: record.installState,
    enabled: record.enabled,
    lobbyEntries: isLobbyLaunchEnabled(record)
      ? structuredClone(contributions.lobbyApps ?? [])
      : [],
    settings: contributions.settings ? structuredClone(contributions.settings) : undefined,
  };
}

export function toPlatformProductDescriptorFromAppModule(
  contribution: CatsProductModuleContribution,
): PlatformProductDescriptor {
  return {
    id: contribution.productId,
    surface: null,
    routePrefix: contribution.routePrefix,
    productName: contribution.productName,
    subtitle: contribution.subtitle,
    group: contribution.group,
    installPolicy: contribution.installPolicy,
    installState: 'installed',
    maturity: contribution.maturity,
    setup: {
      selectable: false,
      disabledReason: 'Managed by a system app package.',
    },
    settings: contribution.settings
      ? structuredClone(contribution.settings)
      : undefined,
  };
}

export async function readPlatformInstalledAppDescriptors(
  chatStatePath: string,
): Promise<PlatformInstalledAppDescriptor[]> {
  const paths = resolveCatsAppStoragePathsFromChatState(chatStatePath);
  const registry = new FileCatsAppRegistry({ registryPath: paths.registryPath });
  const records = await registry.listInstalledApps();
  return records
    .map(toPlatformInstalledAppDescriptor)
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, undefined, {
        sensitivity: 'base',
      }) || left.id.localeCompare(right.id));
}

export async function readPlatformProductDescriptors(
  chatStatePath: string,
): Promise<PlatformProductDescriptor[]> {
  const paths = resolveCatsAppStoragePathsFromChatState(chatStatePath);
  const registry = new FileCatsAppRegistry({ registryPath: paths.registryPath });
  const records = await registry.listInstalledApps();
  const products = listPlatformProductDescriptors();
  const seenProductIds = new Set(products.map((product) => product.id));
  const seenRoutePrefixes = new Set(products.map((product) => product.routePrefix));
  const moduleProducts = records
    .filter(isSystemProductModuleEnabled)
    .flatMap((record) =>
      (record.manifest.contributions.products ?? [])
        .map(toPlatformProductDescriptorFromAppModule))
    .sort((left, right) =>
      left.productName.localeCompare(right.productName, undefined, {
        sensitivity: 'base',
      }) || left.id.localeCompare(right.id));

  for (const product of moduleProducts) {
    if (seenProductIds.has(product.id) || seenRoutePrefixes.has(product.routePrefix)) {
      continue;
    }
    products.push(product);
    seenProductIds.add(product.id);
    seenRoutePrefixes.add(product.routePrefix);
  }

  return products;
}
