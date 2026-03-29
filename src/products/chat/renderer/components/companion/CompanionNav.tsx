import {
  COMPANION_WORKSPACE_TABS,
  companionTabLabel,
  type CompanionWorkspaceTab,
} from '../../companionViewTypes.js';

export interface CompanionNavProps {
  activeTab: CompanionWorkspaceTab;
  onTabChange: (tab: CompanionWorkspaceTab) => void;
}

export function CompanionNav({ activeTab, onTabChange }: CompanionNavProps) {
  return (
    <nav className="companionNav">
      {COMPANION_WORKSPACE_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          className={`companionNavTab ${tab === activeTab ? 'isActive' : ''}`}
          onClick={() => onTabChange(tab)}
        >
          {companionTabLabel(tab)}
        </button>
      ))}
    </nav>
  );
}
