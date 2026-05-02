import type {
  CatsAppInstallState,
  CatsAppTrustTier,
  PlatformInstalledAppDescriptor,
} from '../../shared/catsAppManifest.js';
import type {
  PlatformProductDescriptor,
  PlatformSurfaceId,
} from '../../shared/platform-contract.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../shared/i18n/index.js';
import {
  resolvePlatformProductDisplayName,
  resolvePlatformProductSubtitle,
} from './platformProductCopy.js';

type LobbyModelTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultLobbyModelTranslator = createTranslator('en');

export interface PlatformLobbyProductEntry {
  productId: PlatformProductDescriptor['id'];
  surface: PlatformSurfaceId | null;
  productName: string;
  subtitle: string;
  routePrefix: `/${string}`;
  lastUsed: boolean;
  available: boolean;
}

export interface PlatformLobbyAppEntry {
  appId: string;
  entryId: string;
  title: string;
  subtitle: string | null;
  routePath: `/apps/${string}`;
  publisher: string;
  installState: CatsAppInstallState;
  trustTier: CatsAppTrustTier;
}

export function buildPlatformLobbyEntries(
  options: {
    products: readonly PlatformProductDescriptor[];
    lastUsedSurface: PlatformSurfaceId | null;
  },
  t: LobbyModelTranslator = defaultLobbyModelTranslator,
): PlatformLobbyProductEntry[] {
  return options.products
    .map((d) => ({
      productId: d.id,
      surface: d.surface,
      productName: resolvePlatformProductDisplayName(d, t),
      subtitle: resolvePlatformProductSubtitle(d, t),
      routePrefix: d.routePrefix,
      lastUsed: d.surface !== null && d.surface === options.lastUsedSurface,
      available: d.installState === 'available',
    }));
}

export function buildPlatformLobbyAppEntries(options: {
  installedApps: readonly PlatformInstalledAppDescriptor[];
}): PlatformLobbyAppEntry[] {
  return options.installedApps.flatMap((app) => {
    if (!app.enabled || app.installState !== 'enabled') {
      return [];
    }
    return app.lobbyEntries.map((entry) => ({
      appId: app.id,
      entryId: entry.id,
      title: entry.title,
      subtitle: entry.subtitle ?? null,
      routePath: entry.routePath,
      publisher: app.publisher,
      installState: app.installState,
      trustTier: app.trustTier,
    }));
  });
}

const LOBBY_GREETING_LINE_KEYS = [
  messageKeys.lobbyGreetingChooseSurface,
  messageKeys.lobbyGreetingHomeReady,
  messageKeys.lobbyGreetingPickProduct,
  messageKeys.lobbyGreetingEverythingStaged,
  messageKeys.lobbyGreetingOpenSurface,
  messageKeys.lobbyGreetingAwake,
  messageKeys.lobbyGreetingContinue,
];

function normalizeGreetingPool(pool: ReadonlyArray<string> | null | undefined): string[] {
  return (pool ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function pickLobbyGreeting(
  pool?: ReadonlyArray<string> | null,
  random: () => number = Math.random,
  t: LobbyModelTranslator = defaultLobbyModelTranslator,
): string {
  const normalizedPool = normalizeGreetingPool(pool);
  const fallbackPool = LOBBY_GREETING_LINE_KEYS.map((key) => t(key));
  const activePool = normalizedPool.length > 0 ? normalizedPool : fallbackPool;
  return activePool[Math.floor(random() * activePool.length)];
}
