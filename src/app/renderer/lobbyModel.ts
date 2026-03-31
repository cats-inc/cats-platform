import type {
  SuiteProductDescriptor,
  SuiteProductGroupId,
  SuiteSurfaceId,
} from '../../shared/suite-contract.js';

export interface SuiteLobbyProductEntry {
  surface: SuiteSurfaceId;
  productName: string;
  subtitle: string;
  routePrefix: `/${string}`;
  installPolicy: SuiteProductDescriptor['installPolicy'];
  installState: SuiteProductDescriptor['installState'];
  maturity: SuiteProductDescriptor['maturity'];
  lastUsed: boolean;
}

export interface SuiteLobbySection {
  id: SuiteProductGroupId;
  label: string;
  description: string;
  entries: SuiteLobbyProductEntry[];
}

const SUITE_LOBBY_SECTION_META: Record<
  SuiteProductGroupId,
  Pick<SuiteLobbySection, 'label' | 'description'>
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

const SUITE_LOBBY_SECTION_ORDER: readonly SuiteProductGroupId[] = ['home', 'office'];

export function buildSuiteLobbySections(options: {
  products: readonly SuiteProductDescriptor[];
  lastUsedSurface: SuiteSurfaceId | null;
}): SuiteLobbySection[] {
  const sections = new Map<SuiteProductGroupId, SuiteLobbySection>();

  for (const descriptor of options.products) {
    if (!descriptor.surface) {
      continue;
    }

    const sectionId = descriptor.group;
    const existing = sections.get(sectionId) ?? {
      id: sectionId,
      label: SUITE_LOBBY_SECTION_META[sectionId].label,
      description: SUITE_LOBBY_SECTION_META[sectionId].description,
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

  return SUITE_LOBBY_SECTION_ORDER
    .map((sectionId) => sections.get(sectionId))
    .filter((section): section is SuiteLobbySection => Boolean(section));
}
