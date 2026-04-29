import type {
  CatsAppInstallState,
  CatsAppTrustTier,
  PlatformInstalledAppDescriptor,
} from '../../shared/catsAppManifest.js';
import type {
  PlatformProductDescriptor,
  PlatformSurfaceId,
} from '../../shared/platform-contract.js';

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

export function buildPlatformLobbyEntries(options: {
  products: readonly PlatformProductDescriptor[];
  lastUsedSurface: PlatformSurfaceId | null;
}): PlatformLobbyProductEntry[] {
  return options.products
    .map((d) => ({
      productId: d.id,
      surface: d.surface,
      productName: d.productName,
      subtitle: d.subtitle,
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

const LOBBY_GREETING_LINES = [
  'Choose a surface and get moving.',
  'Home base is ready.',
  'Chat, Work, or Code. Your call.',
  'Everything is staged. Pick a lane.',
  'Open the surface that fits the task.',
  'Cats Inc is awake.',
  'Continue where the work makes sense.',
];

function normalizeGreetingPool(pool: ReadonlyArray<string> | null | undefined): string[] {
  return (pool ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function pickLobbyGreeting(
  pool: ReadonlyArray<string> = LOBBY_GREETING_LINES,
  random: () => number = Math.random,
): string {
  const normalizedPool = normalizeGreetingPool(pool);
  const fallbackPool = normalizeGreetingPool(LOBBY_GREETING_LINES);
  const activePool = normalizedPool.length > 0 ? normalizedPool : fallbackPool;
  return activePool[Math.floor(random() * activePool.length)];
}
