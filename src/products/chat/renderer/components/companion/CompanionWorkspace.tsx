import { useCallback, useState } from 'react';

import type { AppShellPayload, ChatCat } from '../../../api/contracts.js';
import type { CompanionWorkspaceTab } from '../../companionViewTypes.js';
import { useCompanionPresence } from '../../hooks/useCompanionPresence.js';
import { useCompanionWorkspace } from '../../hooks/useCompanionWorkspace.js';
import { CompanionTopBar } from './CompanionTopBar.js';
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
  const presence = useCompanionPresence(cat.id, payload);
  const workspace = useCompanionWorkspace(cat.id, activeTab);

  const handleWake = useCallback(() => {
    onWake(cat.id);
  }, [cat.id, onWake]);

  const handleSleep = useCallback(() => {
    onSleep(cat.id);
  }, [cat.id, onSleep]);

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

  return (
    <div className="companionShell">
      <CompanionTopBar
        cat={cat}
        presence={presence}
        onBackToChat={onBackToChat}
      />
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
  );
}
