import type {
  CatsInstalledAppRecord,
  PlatformInstalledAppDescriptor,
} from '../../shared/catsAppManifest.js';
import { resolveCatsAppStoragePathsFromChatState } from './paths.js';
import { FileCatsAppRegistry } from './registry.js';

function isLobbyLaunchEnabled(record: CatsInstalledAppRecord): boolean {
  return record.enabled && record.installState === 'enabled';
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
