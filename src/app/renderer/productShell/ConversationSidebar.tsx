import {
  useRef,
  useState,
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
import { resolvePlatformSurfaceFromPath } from '../../../core/platformSurface.js';
import { AccountIdentityMenu } from '../../../design/components/AccountIdentityMenu.js';
import { PlatformSurfaceSwitcher } from '../../../design/components/PlatformSurfaceSwitcher.js';
import { executeEnvironmentRecovery } from '../../../shared/environmentRecoveryAction.js';
import {
  resolveRuntimeDotClassName,
  resolveRuntimePresentationStatus,
  resolveRuntimeTooltip,
} from '../../../shared/runtimeStatusPresentation.js';
import { useFloatingSidebarMenu } from './useFloatingSidebarMenu.js';
import { useSidebarInlineRename } from './useSidebarInlineRename.js';

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

interface ConversationSidebarLegacyRuntimeFields {
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

function resolveCatForChannel<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
>(
  channel: TChannel,
  payload: ConversationSidebarPayload<TCat, TChannel>,
): { name: string; avatarColor: string | null; avatarUrl: string | null; isBoss: boolean } | null {
  const defaultRecipientCatId = channel.defaultRecipientCatId;
  if (!defaultRecipientCatId) {
    return null;
  }

  const cat = payload.chat.cats.find((candidate) => candidate.id === defaultRecipientCatId);
  if (!cat) {
    return null;
  }

  return {
    name: cat.name,
    avatarColor: cat.avatarColor,
    avatarUrl: cat.avatarUrl ?? null,
    isBoss: cat.id === payload.chat.bossCatId,
  };
}

function ChannelItem<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TDot extends string,
>({
  channel,
  payload,
  helpers,
  isSelected,
  busy,
  overflowOpen,
  onSelect,
  onRename,
  onDelete,
  onOverflowToggle,
  titleOverride,
  disableRename,
}: {
  channel: TChannel;
  payload: ConversationSidebarPayload<TCat, TChannel>;
  helpers: ConversationSidebarHelpers<TCat, TChannel, TDot>;
  isSelected: boolean;
  busy: string;
  overflowOpen: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onOverflowToggle: () => void;
  titleOverride?: string;
  disableRename?: boolean;
}) {
  const cat = resolveCatForChannel(channel, payload);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuStyle = useFloatingSidebarMenu(
    overflowButtonRef,
    overflowMenuRef,
    overflowOpen,
  );
  const {
    renaming,
    renameValue,
    inputRef,
    setRenameValue,
    startRename,
    commitRename,
    cancelRename,
  } = useSidebarInlineRename({
    title: channel.title,
    onRename: disableRename ? undefined : onRename,
    onBeforeStart: onOverflowToggle,
  });

  return (
    <article
      className={[
        'recentItemCard',
        isSelected ? 'recentItemSelected' : '',
        overflowOpen ? 'recentItemOverflowOpen' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => {
        if (!renaming) {
          onSelect();
        }
      }}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="recentRenameInput"
          type="text"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitRename();
            }
            if (event.key === 'Escape') {
              cancelRename();
            }
          }}
          onBlur={commitRename}
        />
      ) : (
        <button
          className="recentSelectButton"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          type="button"
        >
          <strong>{helpers.presentChannelTitle(titleOverride ?? channel.title)}</strong>
        </button>
      )}
      {!renaming ? (
        <span className="recentItemTrailing">
          {cat ? (
            <span
              className={cat.isBoss ? 'recentCatAvatar recentCatAvatarBoss' : 'recentCatAvatar'}
              data-tooltip={cat.name}
              style={cat.avatarUrl
                ? {
                    backgroundImage: `url(${cat.avatarUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : { background: cat.avatarColor ?? '#90A4AE' }}
            >
              {cat.avatarUrl ? null : helpers.catInitials(cat.name)}
            </span>
          ) : null}
          <button
            ref={overflowButtonRef}
            className="recentOverflowButton"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOverflowToggle();
            }}
          >
            &#x22EF;
          </button>
        </span>
      ) : null}
      {overflowOpen ? (
        <div
          ref={overflowMenuRef}
          className="recentOverflowMenu"
          style={overflowMenuStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {!disableRename ? (
            <>
              <button type="button" onClick={startRename}>
                Rename
              </button>
              <div className="recentOverflowMenuDivider" />
            </>
          ) : null}
          <button
            type="button"
            disabled={busy === `channel:delete:${channel.id}`}
            onClick={onDelete}
          >
            {busy === `channel:delete:${channel.id}` ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function GroupHeaderItem({
  title,
  isSelected,
  busy,
  overflowOpen,
  onSelect,
  onRename,
  onUngroup,
  onDelete,
  onOverflowToggle,
  renameBusyKey,
  ungroupBusyKey,
  deleteBusyKey,
}: {
  title: string;
  isSelected: boolean;
  busy: string;
  overflowOpen: boolean;
  onSelect: () => void;
  onRename?: (title: string) => void;
  onUngroup?: () => void;
  onDelete?: () => void;
  onOverflowToggle: () => void;
  renameBusyKey?: string;
  ungroupBusyKey?: string;
  deleteBusyKey?: string;
}) {
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuStyle = useFloatingSidebarMenu(
    overflowButtonRef,
    overflowMenuRef,
    overflowOpen,
  );
  const renameBusy = renameBusyKey ? busy === renameBusyKey : false;
  const ungroupBusy = ungroupBusyKey ? busy === ungroupBusyKey : false;
  const deleteBusy = deleteBusyKey ? busy === deleteBusyKey : false;
  const {
    renaming,
    renameValue,
    inputRef,
    setRenameValue,
    startRename,
    commitRename,
    cancelRename,
  } = useSidebarInlineRename({
    title,
    onRename,
    onBeforeStart: onOverflowToggle,
  });

  return (
    <article
      className={[
        'recentItemCard',
        isSelected ? 'recentItemSelected' : '',
        overflowOpen ? 'recentItemOverflowOpen' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => {
        if (!renaming) {
          onSelect();
        }
      }}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="recentRenameInput"
          type="text"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitRename();
            }
            if (event.key === 'Escape') {
              cancelRename();
            }
          }}
          onBlur={commitRename}
        />
      ) : (
        <button
          className="recentSelectButton"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          type="button"
        >
          <strong>{title}</strong>
        </button>
      )}
      {!renaming ? (
        <span className="recentItemTrailing">
          <span className="recentParallelGlyph">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 13V3h12v10H2z" />
              <path d="M7 3v10" />
              <path d="M11 3v10" />
            </svg>
          </span>
          <button
            ref={overflowButtonRef}
            className="recentOverflowButton"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOverflowToggle();
            }}
          >
            &#x22EF;
          </button>
        </span>
      ) : null}
      {overflowOpen ? (
        <div
          ref={overflowMenuRef}
          className="recentOverflowMenu"
          style={overflowMenuStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {onRename ? (
            <button type="button" disabled={renameBusy} onClick={startRename}>
              {renameBusy ? 'Renaming...' : 'Rename'}
            </button>
          ) : null}
          {onUngroup ? (
            <button
              type="button"
              disabled={ungroupBusy}
              onClick={() => {
                onOverflowToggle();
                onUngroup();
              }}
            >
              {ungroupBusy ? 'Ungrouping...' : 'Ungroup'}
            </button>
          ) : null}
          {onDelete ? (
            <>
              {onRename || onUngroup ? <div className="recentOverflowMenuDivider" /> : null}
              <button type="button" disabled={deleteBusy} onClick={onDelete}>
                {deleteBusy ? 'Deleting...' : 'Delete All'}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function MyCatRowItem<TCat extends ConversationSidebarCat>({
  cat,
  isBoss,
  isActive,
  hasTelegramBinding,
  dotClass,
  dotTitle,
  overflowOpen,
  catInitials,
  onDirectChat,
  onArchive,
  onOverflowToggle,
}: {
  cat: TCat;
  isBoss: boolean;
  isActive: boolean;
  hasTelegramBinding: boolean;
  dotClass: string;
  dotTitle: string;
  overflowOpen: boolean;
  catInitials: (name: string) => string;
  onDirectChat: () => void;
  onArchive: () => void;
  onOverflowToggle: () => void;
}) {
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuStyle = useFloatingSidebarMenu(
    overflowButtonRef,
    overflowMenuRef,
    overflowOpen,
  );

  return (
    <div
      className={[
        'myCatRow',
        isActive ? 'myCatRowActive' : '',
        overflowOpen ? 'myCatRowOverflowOpen' : '',
      ].filter(Boolean).join(' ')}
      onClick={onDirectChat}
    >
      <button
        className={isActive ? 'myCatItem myCatItemActive' : 'myCatItem'}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDirectChat();
        }}
      >
        <span
          className={isBoss ? 'myCatAvatarWrap catAvatar catAvatarBoss' : 'myCatAvatarWrap catAvatar'}
          style={cat.avatarUrl
            ? {
                backgroundImage: `url(${cat.avatarUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : cat.avatarColor ? { background: cat.avatarColor } : undefined}
        >
          {cat.avatarUrl ? null : catInitials(cat.name)}
          {dotClass ? <span className={dotClass} data-tooltip={dotTitle} /> : null}
        </span>
        <span className="myCatName">{cat.name}</span>
      </button>
      <span className="myCatTrailing">
        {hasTelegramBinding ? (
          <span
            className="myCatTelegramIcon"
            data-tooltip="Telegram bot bound"
            aria-label="Telegram bot bound"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.66 3.88 2.92 10.9a.73.73 0 0 0 .04 1.38l4.45 1.4 1.72 5.52a.78.78 0 0 0 1.24.37l2.48-2.02 4.87 3.6a.78.78 0 0 0 1.2-.46L21.7 4.76c.17-.7-.52-1.27-1.04-0.88ZM10.1 14.6l-.44 3.15-1.34-4.3 9.38-6.2Z" />
            </svg>
          </span>
        ) : null}
        <button
          ref={overflowButtonRef}
          className="myCatOverflowButton"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOverflowToggle();
          }}
        >
          &#x22EF;
        </button>
      </span>
      {overflowOpen ? (
        <div
          ref={overflowMenuRef}
          className="myCatOverflowMenu"
          style={overflowMenuStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" disabled={false} onClick={onArchive}>
            Archive
          </button>
        </div>
      ) : null}
    </div>
  );
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
  const activeSurface = shellSurface ?? resolvePlatformSurfaceFromPath(currentPath);
  const visibleCats = payload.chat.cats.filter((cat) => helpers.isVisibleCat(cat));
  const showMyCats = visibleCats.length > 0;
  const resolvedRuntime = payload.runtime ?? {
    baseUrl: (payload as ConversationSidebarLegacyRuntimeFields).runtimeBaseUrl ?? '',
    reachable: (payload as ConversationSidebarLegacyRuntimeFields).runtimeReachable,
    status: null,
  };
  const telegramBoundCatIds = new Set(
    (payload.chat.botBindings ?? [])
      .filter((binding) => binding.platform === 'telegram' && binding.status === 'active')
      .map((binding) => binding.catId)
      .filter((catId): catId is string => Boolean(catId)),
  );

  const recentsChannels = payload.chat.channels.filter(
    (channel) => !helpers.isDirectLaneSummary(channel),
  );
  const resolvedRecentEntries = recentEntries
    ?? recentsChannels.map((channel) => ({ kind: 'channel', channel } as const));

  const runtimeFooterStatus = resolveRuntimePresentationStatus(resolvedRuntime);
  const runtimeFooterLabel = resolveRuntimeTooltip(runtimeFooterStatus);

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

  function renderChannelItem(
    entry: ConversationSidebarRecentChannelEntry<TChannel>,
  ): ReactNode {
    const overflowKey = entry.key ?? entry.channel.id;
    return (
      <ChannelItem
        key={entry.key ?? entry.channel.id}
        channel={entry.channel}
        payload={payload}
        helpers={helpers}
        isSelected={routeChannelId === entry.channel.id}
        busy={busy}
        overflowOpen={overflowMenuOpenId === overflowKey}
        onSelect={() => onSelect(entry.channel.id)}
        onRename={(title) => {
          void onRenameChannel(entry.channel.id, title);
        }}
        onDelete={() => {
          onOverflowMenuToggle(null);
          void onDeleteChannel(entry.channel.id);
        }}
        onOverflowToggle={() => onOverflowMenuToggle(
          overflowMenuOpenId === overflowKey ? null : overflowKey,
        )}
        titleOverride={entry.titleOverride}
        disableRename={entry.disableRename}
      />
    );
  }

  function renderRecentEntries(): ReactNode {
    if (resolvedRecentEntries.length === 0) {
      return (
        <div className="recentEmpty">
          <p>No chats yet</p>
        </div>
      );
    }

    return resolvedRecentEntries.map((entry) => {
      if (entry.kind === 'channel') {
        return renderChannelItem(entry);
      }

      const overflowKey = entry.overflowKey ?? entry.key;
      return (
        <section key={entry.key} className="recentGroupCard">
          <GroupHeaderItem
            title={entry.title}
            isSelected={entry.isSelected ?? false}
            busy={busy}
            overflowOpen={overflowMenuOpenId === overflowKey}
            onSelect={entry.onSelect}
            onRename={entry.onRename}
            onUngroup={entry.onUngroup}
            onDelete={entry.onDelete}
            onOverflowToggle={() => onOverflowMenuToggle(
              overflowMenuOpenId === overflowKey ? null : overflowKey,
            )}
            renameBusyKey={entry.renameBusyKey}
            ungroupBusyKey={entry.ungroupBusyKey}
            deleteBusyKey={entry.deleteBusyKey}
          />
          <div className="recentGroupList">
            {entry.channels.map((channelEntry) => renderChannelItem(channelEntry))}
          </div>
        </section>
      );
    });
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
            <section className="myCatsSection">
              <p className="sectionLabel">My Cats</p>
              <div className="myCatsList">
                {helpers.sortCatsForDisplay(
                  visibleCats.filter((cat) => cat.status === 'active'),
                  { bossCatIds: payload.chat.bossCatId },
                ).map((cat) => {
                  const isBoss = cat.id === payload.chat.bossCatId;
                  const isActive = activeMyCatId === cat.id;
                  const hasTelegramBinding = telegramBoundCatIds.has(cat.id);
                  const directLane = helpers.findDirectLaneForCat(payload.chat.channels, cat.id);
                  const dot = helpers.resolveMyCatStatusDot(
                    directLane?.defaultRecipientLeaseStatus,
                  );
                  const dotClass = helpers.statusDotClassName(dot);
                  const dotTitle = helpers.statusDotLabel(dot);
                  const overflowKey = `cat:${cat.id}`;
                  const catOverflowOpen = overflowMenuOpenId === overflowKey;

                  return (
                    <MyCatRowItem
                      key={cat.id}
                      cat={cat}
                      isBoss={isBoss}
                      isActive={isActive}
                      hasTelegramBinding={hasTelegramBinding}
                      dotClass={dotClass}
                      dotTitle={dotTitle}
                      overflowOpen={catOverflowOpen}
                      catInitials={helpers.catInitials}
                      onDirectChat={() => onDirectChatCat(cat.id)}
                      onArchive={() => {
                        onOverflowMenuToggle(null);
                        void onArchiveCat(cat.id);
                      }}
                      onOverflowToggle={() => onOverflowMenuToggle(
                        catOverflowOpen ? null : overflowKey,
                      )}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="recentSection">
            <div className="recentHeader">
              <p className="sectionLabel">Recents</p>
            </div>
            <div className="recentList">{renderRecentEntries()}</div>
          </section>
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
