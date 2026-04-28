import { useCallback, useEffect, useState, type ReactNode } from 'react';

import type { AppShellPayload, ChatCat } from '../../../api/contracts.js';
import {
  COMPANION_SIDE_PANEL_SECTION_IDS,
  companionTabLabel,
  type CompanionWorkspaceTab,
} from '../../companionViewTypes.js';
import { SidePanel } from '../../../../../design/components/SidePanel.js';
import { DraftHeader } from '../../../../shared/renderer/components/DraftHeader.js';
import { catInitials } from '../../chatUtils.js';
import {
  promoteCompanionProfilePost as promoteCompanionProfilePostApi,
  setCompanionProfilePostStatus as setCompanionProfilePostStatusApi,
} from '../../api/companion.js';
import { useCompanionPresence } from '../../hooks/useCompanionPresence.js';
import { useCompanionProfile } from '../../hooks/useCompanionProfile.js';
import { useCompanionWorkspace } from '../../hooks/useCompanionWorkspace.js';
import { CompanionFeed } from './CompanionFeed.js';
import { CompanionModeToggleChip } from './CompanionModeToggleChip.js';
import { CompanionOverviewSection } from './CompanionOverviewSection.js';
import {
  CompanionPromoteDialog,
  type CompanionPromoteDialogMediaCandidate,
  type CompanionPromoteDialogSubmit,
} from './CompanionPromoteDialog.js';
import { CompanionResourcesSection } from './CompanionResourcesSection.js';
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

  const profile = useCompanionProfile({
    catId: cat.id,
    enabled: true,
  });

  const [promoteState, setPromoteState] = useState<
    | null
    | {
        sourceId: string;
        defaultTitle: string;
        defaultBody: string;
        defaultTags: string[];
        mediaCandidates: CompanionPromoteDialogMediaCandidate[];
      }
  >(null);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const handlePromoteSourceToPost = useCallback(
    async (source: { id: string; title: string | null; originalFileName: string | null; mimeType: string | null }) => {
      const fallbackTitle =
        source.title?.trim()
        || source.originalFileName?.replace(/\.[^/.]+$/u, '')
        || 'Untitled post';
      // Default-check the source itself when its mimeType suggests media so
      // the dialog matches SPEC-085 §"default-checked from the selection's
      // natural media set." Files / source_only items show no candidate.
      const isMedia = typeof source.mimeType === 'string'
        && /^(image|video|audio)\//iu.test(source.mimeType);
      const mediaCandidates: CompanionPromoteDialogMediaCandidate[] = isMedia
        ? [
            {
              ref: { kind: 'source', id: source.id },
              label: source.title || source.originalFileName || source.id,
              defaultChecked: true,
            },
          ]
        : [];
      setPromoteState({
        sourceId: source.id,
        defaultTitle: fallbackTitle,
        defaultBody: '',
        defaultTags: [],
        mediaCandidates,
      });
      setPromoteError(null);
    },
    [],
  );

  const handlePromoteSubmit = useCallback(
    async (input: CompanionPromoteDialogSubmit) => {
      if (!promoteState) return;
      setPromoteBusy(true);
      setPromoteError(null);
      try {
        await promoteCompanionProfilePostApi(cat.id, {
          origin: { type: 'source', id: promoteState.sourceId },
          title: input.title,
          body: input.body || undefined,
          tags: input.tags,
          mediaRefs: input.mediaRefs,
        });
        profile.refresh();
        workspace.refreshTab();
        setPromoteState(null);
      } catch (cause) {
        setPromoteError(cause instanceof Error ? cause.message : 'Promote failed.');
      } finally {
        setPromoteBusy(false);
      }
    },
    [cat.id, promoteState, profile, workspace],
  );

  const handlePromoteClose = useCallback(() => {
    if (promoteBusy) return;
    setPromoteState(null);
    setPromoteError(null);
  }, [promoteBusy]);

  const handleRemovePost = useCallback(
    async (derivedId: string) => {
      await setCompanionProfilePostStatusApi(cat.id, derivedId, 'removed');
      profile.refresh();
    },
    [cat.id, profile],
  );

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

  const sectionContentById: Record<CompanionWorkspaceTab, ReactNode> = {
    overview: wrapSection(
      <CompanionOverviewSection
        summary={workspace.summary}
        recentMemory={workspace.memory}
        presence={presence}
        onWake={handleWake}
        onSleep={handleSleep}
        loading={workspace.loading}
      />,
    ),
    resources: wrapSection(
      <CompanionResourcesSection
        sources={workspace.sources}
        loading={workspace.loading}
        onAddSource={workspace.addSource}
        onDeleteSource={workspace.removeSource}
        onPromoteSourceToPost={handlePromoteSourceToPost}
      />,
    ),
    memory: wrapSection(
      <CompanionMemorySection
        memory={workspace.memory}
        loading={workspace.loading}
        onAddMemory={workspace.addMemory}
        onDeleteMemory={workspace.removeMemory}
      />,
    ),
    settings: wrapSection(
      <CompanionSettingsSection
        catId={cat.id}
        responseProfile={workspace.responseProfile}
        payload={payload}
        loading={workspace.loading}
        onUpdateResponseProfile={workspace.editResponseProfile}
      />,
    ),
    inspector: wrapSection(
      <div className="companionEmptyState">
        <p>No selection.</p>
        <p className="companionEmptyStateHint">
          PLAN-077 Phase 2 will surface contextual details for the
          currently-selected source / file / post here.
        </p>
      </div>,
    ),
  };

  const sidePanelSections = COMPANION_SIDE_PANEL_SECTION_IDS.map((id) => ({
    id,
    title: companionTabLabel(id),
    children: sectionContentById[id],
  }));

  useEffect(() => {
    if (activeTab !== null && !COMPANION_SIDE_PANEL_SECTION_IDS.includes(activeTab)) {
      setActiveTab(COMPANION_SIDE_PANEL_SECTION_IDS[0] ?? null);
    }
  }, [activeTab]);

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
                  disabled
                  title="Companion subscriptions are not available yet."
                  aria-disabled
                >
                  Subscribe
                </button>
                <button
                  type="button"
                  className="companionHeaderAction"
                  disabled
                  title="Select a post, photo, video, music track, or file before sharing."
                  aria-disabled
                >
                  Share
                </button>
              </>
            )}
          />
          <CompanionFeed
            cat={cat}
            profile={profile.profile}
            onRemovePost={handleRemovePost}
          />
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
      {promoteState ? (
        <CompanionPromoteDialog
          open
          defaultTitle={promoteState.defaultTitle}
          defaultBody={promoteState.defaultBody}
          defaultTags={promoteState.defaultTags}
          mediaCandidates={promoteState.mediaCandidates}
          busy={promoteBusy}
          errorMessage={promoteError}
          onClose={handlePromoteClose}
          onSubmit={handlePromoteSubmit}
        />
      ) : null}
    </>
  );
}
