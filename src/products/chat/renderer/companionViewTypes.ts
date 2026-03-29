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
  | 'settings';

export const COMPANION_WORKSPACE_TABS: readonly CompanionWorkspaceTab[] = [
  'overview',
  'resources',
  'creations',
  'memory',
  'settings',
] as const;

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
  }
}

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
