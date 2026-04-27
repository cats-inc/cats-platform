import { useCallback, useState, type ReactNode } from 'react';

import type { AppShellPayload, ChatCat } from '../../../api/contracts.js';
import {
  companionTabLabel,
  type CompanionWorkspaceTab,
} from '../../companionViewTypes.js';
import { SidePanel } from '../../../../../design/components/SidePanel.js';
import { DraftHeader } from '../../../../shared/renderer/components/DraftHeader.js';
import { catInitials } from '../../chatUtils.js';
import { useCompanionPresence } from '../../hooks/useCompanionPresence.js';
import { useCompanionWorkspace } from '../../hooks/useCompanionWorkspace.js';
import { CompanionFeed } from './CompanionFeed.js';
import { CompanionModeToggleChip } from './CompanionModeToggleChip.js';
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
  onCatAvatarSave?: (catId: string, dataUrl: string) => void;
}

export function CompanionWorkspace({
  payload,
  cat,
  onBackToChat,
  onWake,
  onSleep,
  onCatAvatarSave,
}: CompanionWorkspaceProps) {
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CompanionWorkspaceTab | null>('overview');
  const presence = useCompanionPresence(cat.id, payload);
  const workspace = useCompanionWorkspace(cat.id, activeTab ?? 'overview');

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

  function wrapSection(node: ReactNode): ReactNode {
    return (
      <>
        {workspace.error ? (
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
        ) : null}
        {node}
      </>
    );
  }

  const sidePanelSections = [
    {
      id: 'overview' satisfies CompanionWorkspaceTab,
      title: companionTabLabel('overview'),
      children: wrapSection(
        <CompanionOverviewSection
          summary={workspace.summary}
          recentMemory={workspace.memory}
          presence={presence}
          onWake={handleWake}
          onSleep={handleSleep}
          loading={workspace.loading}
        />,
      ),
    },
    {
      id: 'resources' satisfies CompanionWorkspaceTab,
      title: companionTabLabel('resources'),
      children: wrapSection(
        <CompanionResourcesSection
          sources={workspace.sources}
          loading={workspace.loading}
          onAddSource={workspace.addSource}
          onDeleteSource={workspace.removeSource}
        />,
      ),
    },
    {
      id: 'creations' satisfies CompanionWorkspaceTab,
      title: companionTabLabel('creations'),
      children: wrapSection(
        <CompanionCreationsSection
          derived={workspace.derived}
          loading={workspace.loading}
        />,
      ),
    },
    {
      id: 'memory' satisfies CompanionWorkspaceTab,
      title: companionTabLabel('memory'),
      children: wrapSection(
        <CompanionMemorySection
          memory={workspace.memory}
          loading={workspace.loading}
          onAddMemory={workspace.addMemory}
          onDeleteMemory={workspace.removeMemory}
        />,
      ),
    },
    {
      id: 'settings' satisfies CompanionWorkspaceTab,
      title: companionTabLabel('settings'),
      children: wrapSection(
        <CompanionSettingsSection
          catId={cat.id}
          responseProfile={workspace.responseProfile}
          payload={payload}
          loading={workspace.loading}
          onUpdateResponseProfile={workspace.editResponseProfile}
        />,
      ),
    },
  ];

  function onSidePanelSectionToggle(id: string): void {
    setActiveTab((prev) => (prev === id ? null : (id as CompanionWorkspaceTab)));
  }

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
        <div className="companionContent">
          <DraftHeader
            variant="profile"
            title={cat.name}
            avatarName={cat.name}
            avatarUrl={cat.avatarUrl}
            avatarColor={cat.avatarColor}
            coverStorageKey={cat.id}
            onAvatarSave={
              onCatAvatarSave
                ? (dataUrl) => onCatAvatarSave(cat.id, dataUrl)
                : undefined
            }
            alwaysEditable
            actions={(
              <>
                <button
                  type="button"
                  className="companionHeaderAction companionHeaderActionPrimary"
                >
                  Subscribe
                </button>
                <button
                  type="button"
                  className="companionHeaderAction"
                >
                  Share
                </button>
              </>
            )}
          />
          <CompanionFeed cat={cat} />
        </div>
      </div>
      {sidePanelOpen ? (
        <SidePanel
          title="Companion"
          activeSection={activeTab}
          onSectionToggle={onSidePanelSectionToggle}
          onClose={() => setSidePanelOpen(false)}
          position="side"
          className="chatPaneSidePanel chatPaneSidePanelBelowBar"
          sections={sidePanelSections}
        />
      ) : null}
    </>
  );
}
