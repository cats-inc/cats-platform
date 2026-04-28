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
  | 'memory'
  | 'settings'
  | 'inspector';

/**
 * SPEC-085 / PLAN-077 companion side-panel labels.
 *
 * Mapping (kept stable so cross-cutting code can index by id while the
 * surface labels evolve):
 * - `overview`  → `Status`
 * - `resources` → `Sources`
 * - `memory`    → `Memory`
 * - `settings`  → `Behavior` (response/profile controls live here)
 * - `inspector` → `Inspector`
 */
export function companionTabLabel(tab: CompanionWorkspaceTab): string {
  switch (tab) {
    case 'overview':
      return 'Status';
    case 'resources':
      return 'Sources';
    case 'memory':
      return 'Memory';
    case 'settings':
      return 'Behavior';
    case 'inspector':
      return 'Inspector';
  }
}

export const COMPANION_SIDE_PANEL_SECTION_IDS: ReadonlyArray<CompanionWorkspaceTab> = [
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
    memory: { memory: [] },
    settings: { responseProfile: null },
    loading: false,
    error: null,
  };
}
