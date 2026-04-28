import type {
  CompanionBoxSummary,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSourceRecord,
} from '../companion/contracts.js';
import type { ChatCat } from '../api/contracts.js';

export type CompanionPresenceState = 'sleeping' | 'waking_up' | 'awake' | 'error';

export type CompanionWorkspaceTab =
  | 'overview'
  | 'resources'
  | 'creations'
  | 'memory'
  | 'settings'
  | 'inspector';

export function companionTabLabel(tab: CompanionWorkspaceTab): string {
  switch (tab) {
    case 'overview':
      return 'Overview';
    case 'resources':
      return 'Resources';
    case 'creations':
      return 'Creations';
    case 'memory':
      return 'Memory';
    case 'settings':
      return 'Settings';
    case 'inspector':
      return 'Inspector';
  }
}

/**
 * Label override for the PLAN-077 / SPEC-085 companion side-panel rename.
 * Used when `cats.chat.companionProfileIA` resolves true.
 *
 * Mapping:
 * - `overview` reads as `Status`
 * - `resources` reads as `Sources`
 * - `memory` keeps the same label
 * - `settings` reads as `Behavior` (the response/profile controls move here)
 * - `inspector` is the new contextual-detail section
 *
 * `creations` is intentionally absent — the new IA projects derived
 * records back into Posts / Photos / Videos / Music / Files / Activity on
 * the main surface, not into a side-panel section.
 */
export function companionProfileIaTabLabel(tab: CompanionWorkspaceTab): string {
  switch (tab) {
    case 'overview':
      return 'Status';
    case 'resources':
      return 'Sources';
    case 'creations':
      return 'Creations';
    case 'memory':
      return 'Memory';
    case 'settings':
      return 'Behavior';
    case 'inspector':
      return 'Inspector';
  }
}

export const LEGACY_COMPANION_SIDE_PANEL_SECTION_IDS: ReadonlyArray<CompanionWorkspaceTab> = [
  'overview',
  'resources',
  'creations',
  'memory',
  'settings',
];

export const PROFILE_IA_COMPANION_SIDE_PANEL_SECTION_IDS: ReadonlyArray<CompanionWorkspaceTab> = [
  'overview',
  'resources',
  'memory',
  'settings',
  'inspector',
];

export interface CompanionOverviewData {
  summary: CompanionBoxSummary | null;
  recentMemory: CompanionMemoryRecord[];
}

export interface CompanionResourcesData {
  sources: CompanionSourceRecord[];
}

export interface CompanionCreationsData {
  derived: CompanionDerivedRecord[];
}

export interface CompanionMemoryData {
  memory: CompanionMemoryRecord[];
}

export interface CompanionSettingsData {
  responseProfile: CompanionResponseProfile | null;
}

export interface CompanionWorkspaceState {
  catId: string;
  cat: ChatCat | null;
  activeTab: CompanionWorkspaceTab;
  presence: CompanionPresenceState;
  overview: CompanionOverviewData;
  resources: CompanionResourcesData;
  creations: CompanionCreationsData;
  memory: CompanionMemoryData;
  settings: CompanionSettingsData;
  loading: boolean;
  error: string | null;
}

export function createEmptyWorkspaceState(catId: string): CompanionWorkspaceState {
  return {
    catId,
    cat: null,
    activeTab: 'overview',
    presence: 'sleeping',
    overview: { summary: null, recentMemory: [] },
    resources: { sources: [] },
    creations: { derived: [] },
    memory: { memory: [] },
    settings: { responseProfile: null },
    loading: false,
    error: null,
  };
}
