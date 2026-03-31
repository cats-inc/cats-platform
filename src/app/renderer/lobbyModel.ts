import type {
  SuiteProductDescriptor,
  SuiteProductGroupId,
  SuiteProductInstallPolicy,
  SuiteProductInstallState,
  SuiteProductMaturity,
  SuiteSurfaceId,
} from '../../shared/suite-contract.js';

export type SuiteLobbySectionId = SuiteProductGroupId;
export type SuiteLobbyInstallPolicy = SuiteProductInstallPolicy;
export type SuiteLobbyInstallState = SuiteProductInstallState;
export type SuiteLobbyMaturity = SuiteProductMaturity;

export interface SuiteLobbyProductEntry {
  surface: SuiteSurfaceId;
  productName: string;
  subtitle: string;
  routePrefix: `/${string}`;
  installPolicy: SuiteLobbyInstallPolicy;
  installState: SuiteLobbyInstallState;
  maturity: SuiteLobbyMaturity;
  lastUsed: boolean;
}

export interface SuiteLobbySection {
  id: SuiteLobbySectionId;
  label: string;
  description: string;
  entries: SuiteLobbyProductEntry[];
}

const SUITE_LOBBY_SECTION_META: Record<
  SuiteLobbySectionId,
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

export function buildSuiteLobbySections(options: {
  products: readonly SuiteProductDescriptor[];
  lastUsedSurface: SuiteSurfaceId | null;
}): SuiteLobbySection[] {
  const sections = new Map<SuiteLobbySectionId, SuiteLobbySection>();

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

  return ['home', 'office']
    .map((sectionId) => sections.get(sectionId as SuiteLobbySectionId))
    .filter((section): section is SuiteLobbySection => Boolean(section));
}
