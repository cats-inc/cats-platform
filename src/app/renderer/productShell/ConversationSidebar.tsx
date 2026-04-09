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
import { AccountIdentityMenu } from '../../../design/components/AccountIdentityMenu.js';
import { PlatformSurfaceSwitcher } from '../../../design/components/PlatformSurfaceSwitcher.js';
import { executeEnvironmentRecovery } from '../../../shared/environmentRecoveryAction.js';
import {
  resolveRuntimeDotClassName,
} from '../../../shared/runtimeStatusPresentation.js';
import { ConversationSidebarMyCatsSection } from './ConversationSidebarMyCats.js';
import { buildConversationSidebarViewModel } from './conversationSidebarViewModel.js';
import { ConversationSidebarRecentsSection } from './ConversationSidebarRecents.js';

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
  statusDotLabel: (dot: TDot) => string;
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
  busy: string;
  surface: string;
  shellSurface?: PlatformSurfaceId;
  routeChannelId: string | null;
  accountMenuRef: RefObject<HTMLDivElement>;
  primaryActions: readonly ConversationSidebarAction[];
  extraActionGroups?: readonly ConversationSidebarActionGroup[];
  recentEntries?: readonly ConversationSidebarRecentEntry<TChannel>[];
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
  onSwitchProduct,
  activeMyCatId,
  onDirectChatCat,
}: ConversationSidebarProps<TCat, TChannel, TPayload, TDot>) {
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
  });

  function handleAccountMenuOpenChange(nextOpen: boolean): void {
    if (nextOpen !== accountMenuOpen) {
      onAccountMenuToggle();
    }
  }

  function renderActionGroup(group: ConversationSidebarActionGroup): ReactNode {
    return (
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
      </nav>
    );
  }

  return (
    <aside
      className={sidebarOpen ? 'sidebar' : 'sidebar sidebarCollapsed'}
      onClick={(event) => onCollapsedSidebarClick(event)}
    >
      <div className="sidebarInner">
        <div className="brandRow">
          <div className="brandCopy">
            <PlatformSurfaceSwitcher
              activeSurface={activeSurface}
              onSelectSurface={onSwitchProduct}
            />
          </div>
          <button
            className="chromeButton"
            type="button"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            onClick={onToggleSidebar}
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
              <rect x="1" y="2" width="14" height="12" rx="2" />
              <path d="M6 2v12" />
            </svg>
          </button>
        </div>

        <nav className="navGroup" aria-label="Primary">
          {primaryActions.map((item) => (
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
        </nav>

        <div className="sidebarScrollable">
          <nav className="navGroup navGroupChat" aria-label="Chat">
            <button
              className={surface === 'chats' ? 'navItem navItemActive' : 'navItem'}
              onClick={onOpenChatsOverview}
              type="button"
            >
              <span className="navGlyph navGlyphSquare" aria-hidden="true" />
              <span className="navLabel">Chats</span>
            </button>
          </nav>

          {extraActionGroups.map((group) => renderActionGroup(group))}

          {showMyCats ? (
            <ConversationSidebarMyCatsSection
              cats={visibleCats}
              bossCatId={payload.chat.bossCatId}
              payloadChannels={payload.chat.channels}
              activeMyCatId={activeMyCatId}
              telegramBoundCatIds={telegramBoundCatIds}
              helpers={helpers}
              overflowMenuOpenId={overflowMenuOpenId}
              onOverflowMenuToggle={onOverflowMenuToggle}
              onDirectChatCat={onDirectChatCat}
              onArchiveCat={onArchiveCat}
            />
          ) : null}

          <ConversationSidebarRecentsSection
            entries={resolvedRecentEntries}
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

      <AccountIdentityMenu
        open={accountMenuOpen}
        onOpenChange={handleAccountMenuOpenChange}
        onNavigateSettings={onNavigateSettings}
        onNavigateEnvironment={() => {
          void executeEnvironmentRecovery({
            runtimeStatus: runtimeFooterStatus,
            runtimeBaseUrl: resolvedRuntime.baseUrl,
            runtimeSetupStatus: payload.runtimeSetup?.status,
          });
        }}
        containerClassName="sidebarFooter"
        triggerClassName="sidebarFooterButton"
        menuWidth="trigger"
        rootRef={accountMenuRef}
        avatar={(
          <div
            className="profileBadge"
            style={payload.ownerAvatarUrl
              ? {
                  backgroundImage: `url(${payload.ownerAvatarUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined}
          >
            {payload.ownerAvatarUrl ? null : helpers.catInitials(payload.ownerDisplayName)}
          </div>
        )}
        meta={(
          <div className="sidebarFooterMeta">
            <strong>{payload.ownerDisplayName}</strong>
          </div>
        )}
        statusIndicator={(
          <span
            className={resolveRuntimeDotClassName(runtimeFooterStatus)}
            data-tooltip={runtimeFooterLabel}
            aria-label={runtimeFooterLabel}
          />
        )}
      />
    </aside>
  );
}
