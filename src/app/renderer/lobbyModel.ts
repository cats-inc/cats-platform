import { listSuiteSurfaceDescriptors } from '../../core/suiteSurface.js';
import type { SuiteSurfaceId } from '../../shared/suite-contract.js';
import { isEnabledSuiteSurface } from '../../shared/suiteSurfaces.js';

export type SuiteLobbySectionId = 'home' | 'office';

export interface SuiteLobbyProductEntry {
  surface: SuiteSurfaceId;
  productName: string;
  subtitle: string;
  routePrefix: `/${string}`;
  enabled: boolean;
  preview: boolean;
  lastUsed: boolean;
}

export interface SuiteLobbySection {
  id: SuiteLobbySectionId;
  label: string;
  description: string;
  entries: SuiteLobbyProductEntry[];
}

function resolveLobbySection(surface: SuiteSurfaceId): SuiteLobbySectionId {
  return surface === 'chat' ? 'home' : 'office';
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
  lastUsedSurface: SuiteSurfaceId | null;
}): SuiteLobbySection[] {
  const sections = new Map<SuiteLobbySectionId, SuiteLobbySection>();

  for (const descriptor of listSuiteSurfaceDescriptors()) {
    const sectionId = resolveLobbySection(descriptor.id);
    const existing = sections.get(sectionId) ?? {
      id: sectionId,
      label: SUITE_LOBBY_SECTION_META[sectionId].label,
      description: SUITE_LOBBY_SECTION_META[sectionId].description,
      entries: [],
    };

    const enabled = isEnabledSuiteSurface(descriptor.id);
    existing.entries.push({
      surface: descriptor.id,
      productName: descriptor.productName,
      subtitle: descriptor.subtitle,
      routePrefix: descriptor.routePrefix,
      enabled,
      preview: !enabled,
      lastUsed: descriptor.id === options.lastUsedSurface,
    });
    sections.set(sectionId, existing);
  }

  return ['home', 'office']
    .map((sectionId) => sections.get(sectionId as SuiteLobbySectionId))
    .filter((section): section is SuiteLobbySection => Boolean(section));
}
