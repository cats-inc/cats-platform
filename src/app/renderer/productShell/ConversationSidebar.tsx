import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import type {
  ParticipantSessionStatus,
  RoomRoutingMode,
} from '../../../shared/roomRouting.js';
import type { RuntimeSetupStatus } from '../../../shared/runtimeSetup.js';
import type { WorkspaceBusyState } from '../../../shared/workspaceBusy.js';
import { messageKeys, type MessageKey } from '../../../shared/i18n/messageKeys.js';
import { GuideCatDockSlot } from '../../../design/components/GuideCatDockSlot.js';
import { ConversationSidebarFooter } from './ConversationSidebarFooter.js';
import {
  ConversationSidebarMyCatsSection,
  type ConversationSidebarMyCatsPlaceholder,
} from './ConversationSidebarMyCats.js';
import { ConversationSidebarNavigation } from './ConversationSidebarNavigation.js';
import {
  ConversationSidebarPinnedItemRow,
  type ConversationSidebarPinnedItem,
} from './ConversationSidebarPinned.js';
import { buildConversationSidebarViewModel } from './conversationSidebarViewModel.js';
import { ConversationSidebarRecentsSection } from './ConversationSidebarRecents.js';
import { useI18n } from '../i18n/index.js';

export interface ConversationSidebarCat {
  id: string;
  name: string;
  status: string;
  avatarColor: string | null;
  avatarUrl: string | null;
}

export interface ConversationSidebarChannel {
  id: string;
  title: string;
  originSurface?: PlatformSurfaceId | null;
  defaultRecipientCatId?: string | null;
  defaultRecipientLeaseStatus?: ParticipantSessionStatus | null;
  channelKind?: 'boss_thread' | 'direct_lane' | 'multi_cat_room' | null;
  roomMode?: RoomRoutingMode | null;
}

export interface ConversationSidebarBotBinding {
  platform: string;
  status: string;
  catId: string | null;
}

export interface ConversationSidebarPayload<
  TCat extends ConversationSidebarCat = ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel = ConversationSidebarChannel,
> {
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  runtime: {
    baseUrl: string;
    reachable?: boolean;
    status?: string | null;
  };
  runtimeSetup?: {
    status?: RuntimeSetupStatus | null;
  } | null;
  chat: {
    bossCatId: string | null;
    cats: TCat[];
    channels: TChannel[];
    botBindings?: ConversationSidebarBotBinding[];
  };
}

export interface ConversationSidebarLegacyRuntimeFields {
  runtimeBaseUrl?: string | null;
  runtimeReachable?: boolean;
}

export interface ConversationSidebarAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}

export interface ConversationSidebarActionGroup {
  key: string;
  ariaLabel: string;
  items: readonly ConversationSidebarAction[];
  pinnedItems?: readonly ConversationSidebarPinnedItem[];
}

export interface ConversationSidebarRecentChannelEntry<
  TChannel extends ConversationSidebarChannel,
> {
  key?: string;
  channel: TChannel;
  titleOverride?: string;
  disableRename?: boolean;
}

export interface ConversationSidebarRecentGroupEntry<
  TChannel extends ConversationSidebarChannel,
> {
  kind: 'group';
  key: string;
  title: string;
  originSurface?: PlatformSurfaceId | null;
  channels: readonly ConversationSidebarRecentChannelEntry<TChannel>[];
  overflowKey?: string;
  isSelected?: boolean;
  onSelect: () => void;
  onRename?: (title: string) => void;
  onUngroup?: () => void;
  onDelete?: () => void;
  renameBusyKey?: string;
  ungroupBusyKey?: string;
  deleteBusyKey?: string;
}

export type ConversationSidebarRecentEntry<
  TChannel extends ConversationSidebarChannel,
> =
  | ({
      kind: 'channel';
    } & ConversationSidebarRecentChannelEntry<TChannel>)
  | ConversationSidebarRecentGroupEntry<TChannel>;

export interface ConversationSidebarHelpers<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TDot extends string = string,
> {
  catInitials: (name: string) => string;
  presentChannelTitle: (title: string) => string;
  isVisibleCat: (cat: TCat) => boolean;
  sortCatsForDisplay: (
    cats: TCat[],
    options: { bossCatIds?: string | string[] | null },
  ) => TCat[];
  isDirectLaneSummary: (channel: TChannel) => boolean;
  findDirectLaneForCat: (channels: TChannel[], catId: string) => TChannel | null;
  resolveMyCatStatusDot: (leaseStatus: TChannel['defaultRecipientLeaseStatus']) => TDot;
  statusDotClassName: (dot: TDot) => string;
  statusDotLabel: (dot: TDot) => MessageKey | null;
}

export interface ConversationSidebarProps<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TPayload extends ConversationSidebarPayload<TCat, TChannel>,
  TDot extends string = string,
> {
  payload: TPayload;
  sidebarOpen: boolean;
  accountMenuOpen: boolean;
  overflowMenuOpenId: string | null;
  busy: WorkspaceBusyState;
  surface: string;
  shellSurface?: PlatformSurfaceId;
  routeChannelId: string | null;
  accountMenuRef: RefObject<HTMLDivElement>;
  primaryActions: readonly ConversationSidebarAction[];
  extraActionGroups?: readonly ConversationSidebarActionGroup[];
  recentEntries?: readonly ConversationSidebarRecentEntry<TChannel>[];
  recentEmptyStateLabel?: string;
  myCatsSectionLabel?: string;
  forceShowMyCatsSection?: boolean;
  myCatsSectionCats?: readonly TCat[];
  myCatsEmptyStatePlaceholder?: ConversationSidebarMyCatsPlaceholder;
  helpers: ConversationSidebarHelpers<TCat, TChannel, TDot>;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenChatsOverview: () => void;
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onRenameChannel: (channelId: string, title: string) => void;
  onArchiveCat: (catId: string) => void;
  onAccountMenuToggle: () => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onNavigateSettings: () => void;
  onNavigateRuntime: () => void;
  onSwitchProduct: (surface: PlatformSurfaceId) => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
}

export function ConversationSidebar<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TPayload extends ConversationSidebarPayload<TCat, TChannel>,
  TDot extends string = string,
>({
  payload,
  sidebarOpen,
  accountMenuOpen,
  overflowMenuOpenId,
  busy,
  surface,
  shellSurface,
  routeChannelId,
  accountMenuRef,
  primaryActions,
  extraActionGroups = [],
  recentEntries,
  recentEmptyStateLabel,
  myCatsSectionLabel,
  forceShowMyCatsSection = false,
  myCatsSectionCats,
  myCatsEmptyStatePlaceholder,
  helpers,
  onToggleSidebar,
  onCollapsedSidebarClick,
  onOpenChatsOverview,
  onSelect,
  onDeleteChannel,
  onRenameChannel,
  onArchiveCat,
  onAccountMenuToggle,
  onOverflowMenuToggle,
  onNavigateSettings,
  onNavigateRuntime,
  onSwitchProduct,
  activeMyCatId,
  onDirectChatCat,
}: ConversationSidebarProps<TCat, TChannel, TPayload, TDot>) {
  const { t } = useI18n();
  const currentPath = globalThis.location?.pathname ?? '/';
  const {
    activeSurface,
    showMyCats,
    visibleCats,
    resolvedRuntime,
    telegramBoundCatIds,
    resolvedRecentEntries,
    runtimeFooterStatus,
    runtimeFooterLabel,
  } = buildConversationSidebarViewModel({
    payload,
    helpers,
    recentEntries,
    shellSurface,
    currentPath,
    t,
  });
  const resolvedMyCatsSectionLabel = myCatsSectionLabel
    ?? t(messageKeys.conversationSidebarDirectMessagesLabel);
  const resolvedMyCatsSectionCats = myCatsSectionCats ?? visibleCats;
  const showMyCatsSection =
    forceShowMyCatsSection
    || resolvedMyCatsSectionCats.length > 0
    || myCatsEmptyStatePlaceholder != null;

  return (
    <aside
      className={sidebarOpen ? 'sidebar' : 'sidebar sidebarCollapsed'}
      data-shell-surface={shellSurface ?? activeSurface}
      onClick={(event) => onCollapsedSidebarClick(event)}
    >
      <div className="sidebarInner">
        <ConversationSidebarNavigation
          activeSurface={activeSurface}
          sidebarOpen={sidebarOpen}
          primaryActions={primaryActions}
          onToggleSidebar={onToggleSidebar}
          onSwitchProduct={onSwitchProduct}
        />

        <div className="sidebarScrollable">
          <nav
            className="navGroup navGroupChat"
            aria-label={t(messageKeys.conversationSidebarChatsLabel)}
          >
            <button
              className={surface === 'chats' ? 'navItem navItemActive' : 'navItem'}
              onClick={onOpenChatsOverview}
              type="button"
            >
              <span className="navGlyph navGlyphSquare" aria-hidden="true" />
              <span className="navLabel">{t(messageKeys.conversationSidebarChatsLabel)}</span>
            </button>
          </nav>

          {extraActionGroups.map((group) => (
            <nav key={group.key} className="navGroup" aria-label={group.ariaLabel}>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={item.active ? 'navItem navItemActive' : 'navItem'}
                  onClick={item.onClick}
                  type="button"
                >
                  <span className="navGlyph" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="navLabel">{item.label}</span>
                </button>
              ))}
              {group.pinnedItems && group.pinnedItems.length > 0 ? (
                <div className="navGroupPinnedList">
                  {group.pinnedItems.map((item) => {
                    const overflowKey = `pinned:${group.key}:${item.id}`;
                    const overflowOpen = overflowMenuOpenId === overflowKey;
                    return (
                      <ConversationSidebarPinnedItemRow
                        key={item.id}
                        overflowKey={overflowKey}
                        item={item}
                        overflowOpen={overflowOpen}
                        onOverflowToggle={() => onOverflowMenuToggle(
                          overflowOpen ? null : overflowKey,
                        )}
                      />
                    );
                  })}
                </div>
              ) : null}
            </nav>
          ))}

          {showMyCatsSection ? (
            <ConversationSidebarMyCatsSection
              label={resolvedMyCatsSectionLabel}
              cats={resolvedMyCatsSectionCats}
              bossCatId={payload.chat.bossCatId}
              payloadChannels={payload.chat.channels}
              activeMyCatId={activeMyCatId}
              telegramBoundCatIds={telegramBoundCatIds}
              helpers={helpers}
              overflowMenuOpenId={overflowMenuOpenId}
              onOverflowMenuToggle={onOverflowMenuToggle}
              onDirectChatCat={onDirectChatCat}
              onArchiveCat={onArchiveCat}
              emptyStatePlaceholder={myCatsEmptyStatePlaceholder}
            />
          ) : null}

          <ConversationSidebarRecentsSection
            entries={resolvedRecentEntries}
            emptyStateLabel={recentEmptyStateLabel}
            payload={payload}
            helpers={helpers}
            routeChannelId={routeChannelId}
            busy={busy}
            overflowMenuOpenId={overflowMenuOpenId}
            onSelect={onSelect}
            onDeleteChannel={onDeleteChannel}
            onRenameChannel={onRenameChannel}
            onOverflowMenuToggle={onOverflowMenuToggle}
          />
        </div>
      </div>

      <GuideCatDockSlot slotKind="workspace" />

      <ConversationSidebarFooter
        payload={payload}
        accountMenuOpen={accountMenuOpen}
        accountMenuRef={accountMenuRef}
        runtimeFooterStatus={runtimeFooterStatus}
        runtimeFooterLabel={runtimeFooterLabel}
        onAccountMenuToggle={onAccountMenuToggle}
        onNavigateSettings={onNavigateSettings}
        onNavigateRuntime={onNavigateRuntime}
        catInitials={helpers.catInitials}
      />
    </aside>
  );
}
