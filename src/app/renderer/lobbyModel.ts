import type {
  PlatformProductDescriptor,
  PlatformSurfaceId,
} from '../../shared/platform-contract.js';

export interface PlatformLobbyProductEntry {
  surface: PlatformSurfaceId;
  productName: string;
  subtitle: string;
  routePrefix: `/${string}`;
  lastUsed: boolean;
}

export function buildPlatformLobbyEntries(options: {
  products: readonly PlatformProductDescriptor[];
  lastUsedSurface: PlatformSurfaceId | null;
}): PlatformLobbyProductEntry[] {
  return options.products
    .filter((d) => d.surface !== null)
    .map((d) => ({
      surface: d.surface!,
      productName: d.productName,
      subtitle: d.subtitle,
      routePrefix: d.routePrefix,
      lastUsed: d.surface === options.lastUsedSurface,
    }));
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
