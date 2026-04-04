import type {
  PlatformProductDescriptor,
  PlatformProductGroupId,
  PlatformSurfaceId,
} from '../../shared/platform-contract.js';

export interface PlatformLobbyProductEntry {
  surface: PlatformSurfaceId;
  productName: string;
  subtitle: string;
  routePrefix: `/${string}`;
  installPolicy: PlatformProductDescriptor['installPolicy'];
  installState: PlatformProductDescriptor['installState'];
  maturity: PlatformProductDescriptor['maturity'];
  lastUsed: boolean;
}

export interface PlatformLobbySection {
  id: PlatformProductGroupId;
  label: string;
  description: string;
  entries: PlatformLobbyProductEntry[];
}

const PLATFORM_LOBBY_SECTION_META: Record<
  PlatformProductGroupId,
  Pick<PlatformLobbySection, 'label' | 'description'>
> = {
  home: {
    label: 'Home',
    description: 'Companions, conversations, and your day-to-day Cats entry.',
  },
  office: {
    label: 'Office',
    description: 'Workflows, projects, repos, and operator-facing tools.',
  },
};

const PLATFORM_LOBBY_SECTION_ORDER: readonly PlatformProductGroupId[] = ['home', 'office'];

export function buildPlatformLobbySections(options: {
  products: readonly PlatformProductDescriptor[];
  lastUsedSurface: PlatformSurfaceId | null;
}): PlatformLobbySection[] {
  const sections = new Map<PlatformProductGroupId, PlatformLobbySection>();

  for (const descriptor of options.products) {
    if (!descriptor.surface) {
      continue;
    }

    const sectionId = descriptor.group;
    const existing = sections.get(sectionId) ?? {
      id: sectionId,
      label: PLATFORM_LOBBY_SECTION_META[sectionId].label,
      description: PLATFORM_LOBBY_SECTION_META[sectionId].description,
      entries: [],
    };

    existing.entries.push({
      surface: descriptor.surface,
      productName: descriptor.productName,
      subtitle: descriptor.subtitle,
      routePrefix: descriptor.routePrefix,
      installPolicy: descriptor.installPolicy,
      installState: descriptor.installState,
      maturity: descriptor.maturity,
      lastUsed: descriptor.surface === options.lastUsedSurface,
    });
    sections.set(sectionId, existing);
  }

  return PLATFORM_LOBBY_SECTION_ORDER
    .map((sectionId) => sections.get(sectionId))
    .filter((section): section is PlatformLobbySection => Boolean(section));
}
