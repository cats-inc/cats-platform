import { useCallback, useState } from 'react';

import type { AppShellPayload, ChatCat } from '../../../api/contracts.js';
import type { CompanionWorkspaceTab } from '../../companionViewTypes.js';
import { SidePanel } from '../../../../../design/components/SidePanel.js';
import { catInitials } from '../../chatUtils.js';
import { useCompanionPresence } from '../../hooks/useCompanionPresence.js';
import { useCompanionWorkspace } from '../../hooks/useCompanionWorkspace.js';
import { CompanionModeToggleChip } from './CompanionModeToggleChip.js';
import { CompanionNav } from './CompanionNav.js';
import { CompanionOverviewSection } from './CompanionOverviewSection.js';
import { CompanionResourcesSection } from './CompanionResourcesSection.js';
import { CompanionCreationsSection } from './CompanionCreationsSection.js';
import { CompanionMemorySection } from './CompanionMemorySection.js';
import { CompanionSettingsSection } from './CompanionSettingsSection.js';

export interface CompanionWorkspaceProps {
  payload: AppShellPayload;
  cat: ChatCat;
  onBackToChat: () => void;
  onWake: (catId: string) => void;
  onSleep: (catId: string) => void;
}

export function CompanionWorkspace({
  payload,
  cat,
  onBackToChat,
  onWake,
  onSleep,
}: CompanionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<CompanionWorkspaceTab>('overview');
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('profile');
  const presence = useCompanionPresence(cat.id, payload);
  const workspace = useCompanionWorkspace(cat.id, activeTab);

  const handleWake = useCallback(() => {
    onWake(cat.id);
  }, [cat.id, onWake]);

  const handleSleep = useCallback(() => {
    onSleep(cat.id);
  }, [cat.id, onSleep]);

  const initials = catInitials(cat.name);
  const avatarStyle = cat.avatarUrl
    ? {
        backgroundImage: `url(${cat.avatarUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : cat.avatarColor
      ? { background: cat.avatarColor }
      : undefined;

  function renderActiveSection() {
    switch (activeTab) {
      case 'overview':
        return (
          <CompanionOverviewSection
            summary={workspace.summary}
            recentMemory={workspace.memory}
            presence={presence}
            onWake={handleWake}
            onSleep={handleSleep}
            loading={workspace.loading}
          />
        );
      case 'resources':
        return (
          <CompanionResourcesSection
            sources={workspace.sources}
            loading={workspace.loading}
            onAddSource={workspace.addSource}
            onDeleteSource={workspace.removeSource}
          />
        );
      case 'creations':
        return (
          <CompanionCreationsSection
            derived={workspace.derived}
            loading={workspace.loading}
          />
        );
      case 'memory':
        return (
          <CompanionMemorySection
            memory={workspace.memory}
            loading={workspace.loading}
            onAddMemory={workspace.addMemory}
            onDeleteMemory={workspace.removeMemory}
          />
        );
      case 'settings':
        return (
          <CompanionSettingsSection
            catId={cat.id}
            responseProfile={workspace.responseProfile}
            payload={payload}
            loading={workspace.loading}
            onUpdateResponseProfile={workspace.editResponseProfile}
          />
        );
    }
  }

  const sidePanelSections = [
    {
      id: 'profile',
      title: 'Profile',
      children: (
        <div className="companionSidePanelProfile">
          <div className="companionSidePanelProfileRow">
            <span className="companionLabel">Name</span>
            <span>{cat.name}</span>
          </div>
          <div className="companionSidePanelProfileRow">
            <span className="companionLabel">Presence</span>
            <span className={`companionPresenceBadge ${presence.className}`}>
              <span className="companionPresenceDot" />
              {presence.label}
            </span>
          </div>
          {workspace.summary ? (
            <div className="companionSidePanelProfileRow">
              <span className="companionLabel">Box</span>
              <span>
                {workspace.summary.sourceCount} resources ·{' '}
                {workspace.summary.derivedCount} creations ·{' '}
                {workspace.summary.memoryCount} memories
              </span>
            </div>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <div
        className="viewShell viewShellChannel"
        data-conversation-mode="direct_lane"
        data-layout-mode="companion"
      >
        <header className="channelTopBar">
          <div className="channelTopBarStart">
            <div className="rosterAvatars rosterAvatarsExpanded">
              <div
                className="catAvatar"
                data-tooltip={cat.name}
                style={avatarStyle}
              >
                {cat.avatarUrl ? null : initials}
              </div>
            </div>
          </div>
          <div className="channelTopBarCenter">
            <span className="channelTopBarTitle channelTopBarTitleDirectLane">
              {cat.name}
            </span>
          </div>
          <div className="channelTopBarEnd">
            <span className={`companionPresenceBadge ${presence.className}`}>
              <span className="companionPresenceDot" />
              {presence.label}
            </span>
            <CompanionModeToggleChip
              companionMode={true}
              onToggle={onBackToChat}
            />
            <button
              className="sidePanelToggle"
              type="button"
              onClick={() => setSidePanelOpen((prev) => !prev)}
              aria-label="Toggle inspector panel"
              aria-pressed={sidePanelOpen}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 2v12" />
                <rect x="2" y="2" width="12" height="12" rx="2" />
              </svg>
            </button>
          </div>
        </header>
        <CompanionNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="companionContent">
          {workspace.error && (
            <div className="companionError">
              {workspace.error}
              <button
                type="button"
                className="companionActionButton"
                onClick={workspace.refreshTab}
              >
                Retry
              </button>
            </div>
          )}
          {renderActiveSection()}
        </div>
      </div>
      {sidePanelOpen ? (
        <SidePanel
          title="Companion"
          activeSection={sidePanelSection}
          onSectionToggle={setSidePanelSection}
          onClose={() => setSidePanelOpen(false)}
          position="side"
          className="chatPaneSidePanel chatPaneSidePanelBelowBar"
          sections={sidePanelSections}
        />
      ) : null}
    </>
  );
}
