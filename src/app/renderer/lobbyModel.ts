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
  'Meow. Ready when you are.',
  'Your cat hasn\u2019t napped yet.',
  'Cats on the keyboard.',
  'Tail up, let\u2019s go.',
  'Purring in standby.',
  'Claws sharpened. What\u2019s the task?',
  'This cat doesn\u2019t sleep on the job.',
];

export function pickLobbyGreeting(): string {
  return LOBBY_GREETING_LINES[Math.floor(Math.random() * LOBBY_GREETING_LINES.length)];
}
