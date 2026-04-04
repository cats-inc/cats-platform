import { useEffect, useRef, useState, type CSSProperties, type RefObject, type MouseEvent as ReactMouseEvent } from 'react';

import type { AppShellPayload, ChatChannelSummary } from '../../api/contracts';
import {
  catInitials,
  isChatCat,
  presentChannelTitle,
  sortChatCatsForDisplay,
  type Surface,
} from '../chatUtils';
import {
  findDirectLaneForCat,
  resolveMyCatStatusDot,
  statusDotClassName,
  statusDotLabel,
} from '../myCatNavigation';
import { isDirectLaneSummary } from '../../shared/channelTopology';
import type { PlatformSurfaceId } from '../../../../shared/platform-contract.js';
import { resolvePlatformSurfaceFromPath } from '../../../../core/platformSurface.js';
import { PlatformSurfaceSwitcher } from '../../../../design/components/PlatformSurfaceSwitcher.js';

export type SidebarViewMode = 'latest' | 'by_cat' | 'by_chat_type';

export interface SidebarProps {
  payload: AppShellPayload;
  sidebarOpen: boolean;
  accountMenuOpen: boolean;
  overflowMenuOpenId: string | null;
  busy: string;
  surface: Surface;
  routeChannelId: string | null;
  accountMenuRef: RefObject<HTMLDivElement>;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenChatsOverview: () => void;
  onStartNewChat: () => void;
  onStartWorkIntake?: () => void;
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

type RuntimeFooterStatus = 'unknown' | 'connected' | 'degraded' | 'unavailable';
type ChatCatRecord = AppShellPayload['chat']['cats'][number];

function resolveRuntimeFooterStatus(payload: AppShellPayload): RuntimeFooterStatus {
  const rt = payload.runtime;
  if (!rt || typeof rt.reachable !== 'boolean') return 'unknown';
  if (!rt.reachable) return 'unavailable';
  const status = typeof rt.status === 'string' ? rt.status.toLowerCase() : '';
  if (status === 'ok' || status === 'healthy' || status === 'ready') return 'connected';
  if (status === 'degraded' || status === 'warming' || status === 'starting') return 'degraded';
  if (status === 'error' || status === 'unavailable' || status === 'failed') return 'unavailable';
  return rt.reachable ? 'connected' : 'unknown';
}

function runtimeFooterStatusLabel(status: RuntimeFooterStatus): string {
  switch (status) {
    case 'connected': return 'Cats Runtime connected';
    case 'degraded': return 'Cats Runtime degraded';
    case 'unavailable': return 'Cats Runtime unavailable';
    default: return 'Cats Runtime status unknown';
  }
}

function runtimeFooterStatusClassName(status: RuntimeFooterStatus): string {
  switch (status) {
    case 'connected': return 'runtimeStatusDot isConnected';
    case 'degraded': return 'runtimeStatusDot isDegraded';
    case 'unavailable': return 'runtimeStatusDot isUnavailable';
    default: return 'runtimeStatusDot isUnknown';
  }
}

function isDirectCatChat(channel: ChatChannelSummary): boolean {
  return isDirectLaneSummary(channel);
}

function resolveCatForChannel(
  channel: ChatChannelSummary,
  payload: AppShellPayload,
): { name: string; avatarColor: string | null; avatarUrl: string | null; isBoss: boolean } | null {
  const leadCatId = channel.leadCatId;
  if (!leadCatId) return null;
  const cat = payload.chat.cats.find((c) => c.id === leadCatId);
  if (!cat) return null;
  return {
    name: cat.name,
    avatarColor: cat.avatarColor,
    avatarUrl: cat.avatarUrl ?? null,
    isBoss: cat.id === payload.chat.bossCatId,
  };
}

function useFloatingSidebarMenu(
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  open: boolean,
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setStyle(undefined);
      return undefined;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 136;
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      let left = rect.right + 8;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.left - menuWidth - 8);
      }
      let top = rect.top - 4;
      if (menuHeight > 0 && top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - menuHeight - 8);
      }
      setStyle({
        position: 'fixed',
        top,
        left,
      });
    }

    updatePosition();

    const scrollParent = anchorRef.current?.closest('.sidebarScrollable');
    window.addEventListener('resize', updatePosition);
    scrollParent?.addEventListener('scroll', updatePosition, { passive: true });

    return () => {
      window.removeEventListener('resize', updatePosition);
      scrollParent?.removeEventListener('scroll', updatePosition);
    };
  }, [anchorRef, menuRef, open]);

  return style;
}


function ChannelItem({
  channel,
  payload,
  isSelected,
  busy,
  overflowOpen,
  onSelect,
  onRename,
  onDelete,
  onOverflowToggle,
}: {
  channel: ChatChannelSummary;
  payload: AppShellPayload;
  isSelected: boolean;
  busy: string;
  overflowOpen: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onOverflowToggle: () => void;
}) {
  const cat = resolveCatForChannel(channel, payload);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuStyle = useFloatingSidebarMenu(overflowButtonRef, overflowMenuRef, overflowOpen);

  function startRename() {
    onOverflowToggle();
    setRenameValue(channel.title);
    setRenaming(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (trimmed && trimmed !== channel.title) {
      onRename(trimmed);
    }
  }

  function cancelRename() {
    setRenaming(false);
  }

  return (
    <article
      className={[
        'recentItemCard',
        isSelected ? 'recentItemSelected' : '',
        overflowOpen ? 'recentItemOverflowOpen' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => {
        if (!renaming) onSelect();
      }}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="recentRenameInput"
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') cancelRename();
          }}
          onBlur={commitRename}
        />
      ) : (
        <button
          className="recentSelectButton"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          type="button"
        >
          <strong>{presentChannelTitle(channel.title)}</strong>
        </button>
      )}
      {!renaming ? (
        <span className="recentItemTrailing">
          {cat ? (
            <span
              className={cat.isBoss ? 'recentCatAvatar recentCatAvatarBoss' : 'recentCatAvatar'}
              data-tooltip={cat.name}
              style={cat.avatarUrl
                ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { background: cat.avatarColor ?? '#90A4AE' }}
            >
              {cat.avatarUrl ? null : catInitials(cat.name)}
            </span>
          ) : null}
          <button
            ref={overflowButtonRef}
            className="recentOverflowButton"
            type="button"
            onClick={(e) => { e.stopPropagation(); onOverflowToggle(); }}
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
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={startRename}>
            Rename
          </button>
          <div className="recentOverflowMenuDivider" />
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

function MyCatRowItem({
  cat,
  isBoss,
  isActive,
  hasTelegramBinding,
  dotClass,
  dotTitle,
  overflowOpen,
  onDirectChat,
  onArchive,
  onOverflowToggle,
}: {
  cat: ChatCatRecord;
  isBoss: boolean;
  isActive: boolean;
  hasTelegramBinding: boolean;
  dotClass: string;
  dotTitle: string;
  overflowOpen: boolean;
  onDirectChat: () => void;
  onArchive: () => void;
  onOverflowToggle: () => void;
}) {
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuStyle = useFloatingSidebarMenu(overflowButtonRef, overflowMenuRef, overflowOpen);

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
        onClick={(e) => {
          e.stopPropagation();
          onDirectChat();
        }}
      >
        <span
          className={isBoss ? 'myCatAvatarWrap catAvatar catAvatarBoss' : 'myCatAvatarWrap catAvatar'}
          style={cat.avatarUrl
            ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : cat.avatarColor ? { background: cat.avatarColor } : undefined}
        >
          {cat.avatarUrl ? null : catInitials(cat.name)}
          {dotClass ? <span className={dotClass} data-tooltip={dotTitle} /> : null}
        </span>
        <span className="myCatName">{cat.name}</span>
      </button>
      <span className="myCatTrailing">
        {hasTelegramBinding ? (
          <span className="myCatTelegramIcon" data-tooltip="Telegram bot bound" aria-label="Telegram bot bound">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.66 3.88 2.92 10.9a.73.73 0 0 0 .04 1.38l4.45 1.4 1.72 5.52a.78.78 0 0 0 1.24.37l2.48-2.02 4.87 3.6a.78.78 0 0 0 1.2-.46L21.7 4.76c.17-.7-.52-1.27-1.04-0.88ZM10.1 14.6l-.44 3.15-1.34-4.3 9.38-6.2Z" />
            </svg>
          </span>
        ) : null}
        <button
          ref={overflowButtonRef}
          className="myCatOverflowButton"
          type="button"
          onClick={(e) => { e.stopPropagation(); onOverflowToggle(); }}
        >
          &#x22EF;
        </button>
      </span>
      {overflowOpen ? (
        <div
          ref={overflowMenuRef}
          className="myCatOverflowMenu"
          style={overflowMenuStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={false}
            onClick={onArchive}
          >
            Archive
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({
  payload,
  sidebarOpen,
  accountMenuOpen,
  overflowMenuOpenId,
  busy,
  surface,
  routeChannelId,
  accountMenuRef,
  onToggleSidebar,
  onCollapsedSidebarClick,
  onOpenChatsOverview,
  onStartNewChat,
  onStartWorkIntake,
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
}: SidebarProps) {
  const activeSurface = resolvePlatformSurfaceFromPath(globalThis.location?.pathname ?? '/chat');
  const chatCats = payload.chat.cats.filter(isChatCat);
  const showMyCats = chatCats.length > 0;
  const telegramBoundCatIds = new Set(
    (payload.chat.botBindings ?? [])
      .filter((binding) => binding.platform === 'telegram' && binding.status === 'active')
      .map((binding) => binding.catId)
      .filter((catId): catId is string => Boolean(catId)),
  );

  function renderChannelList(channels: ChatChannelSummary[]) {
    if (channels.length === 0) {
      return <div className="recentEmpty"><p>No chats yet</p></div>;
    }
    return channels.map((channel) => (
      <ChannelItem
        key={channel.id}
        channel={channel}
        payload={payload}
        isSelected={routeChannelId === channel.id}
        busy={busy}
        overflowOpen={overflowMenuOpenId === channel.id}
        onSelect={() => onSelect(channel.id)}
        onRename={(title) => { void onRenameChannel(channel.id, title); }}
        onDelete={() => { onOverflowMenuToggle(null); void onDeleteChannel(channel.id); }}
        onOverflowToggle={() => onOverflowMenuToggle(overflowMenuOpenId === channel.id ? null : channel.id)}
      />
    ));
  }

  const recentsChannels = payload.chat.channels.filter((ch) => !isDirectCatChat(ch));

  function renderByLatest() {
    return renderChannelList(recentsChannels);
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="2" width="14" height="12" rx="2" />
              <path d="M6 2v12" />
            </svg>
          </button>
        </div>

        <nav className="navGroup" aria-label="Primary">
          <button
            className="navItem"
            onClick={() => void onStartNewChat()}
            type="button"
          >
            <span className="navGlyph" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10" />
                <path d="M3 8h10" />
              </svg>
            </span>
            <span className="navLabel">New chat</span>
          </button>
          {onStartWorkIntake ? (
            <button
              className="navItem"
              onClick={() => void onStartWorkIntake()}
              type="button"
            >
              <span className="navGlyph" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="10" height="10" rx="1.5" />
                  <path d="M6 7h4" />
                  <path d="M6 9.5h2.5" />
                </svg>
              </span>
              <span className="navLabel">Start work</span>
            </button>
          ) : null}
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

        {showMyCats ? (
          <section className="myCatsSection">
            <p className="sectionLabel">My Cats</p>
            <div className="myCatsList">
              {sortChatCatsForDisplay(
                chatCats.filter((cat) => cat.status === 'active'),
                { bossCatIds: payload.chat.bossCatId },
              ).map((cat) => {
                  const isBoss = cat.id === payload.chat.bossCatId;
                  const isActive = activeMyCatId === cat.id;
                  const hasTelegramBinding = telegramBoundCatIds.has(cat.id);
                  const directLane = findDirectLaneForCat(payload.chat.channels, cat.id);
                  const dot = resolveMyCatStatusDot(directLane?.leadParticipantLeaseStatus);
                  const dotClass = statusDotClassName(dot);
                  const dotTitle = statusDotLabel(dot);
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
                      onDirectChat={() => onDirectChatCat(cat.id)}
                      onArchive={() => {
                        onOverflowMenuToggle(null);
                        void onArchiveCat(cat.id);
                      }}
                      onOverflowToggle={() => onOverflowMenuToggle(catOverflowOpen ? null : overflowKey)}
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
          <div className="recentList">
            {renderByLatest()}
          </div>
        </section>
        </div>
      </div>

      <div className="sidebarFooter" ref={accountMenuRef}>
        <button
          className="sidebarFooterButton"
          type="button"
          onClick={onAccountMenuToggle}
          aria-label="Account menu"
        >
          <div
            className="profileBadge"
            style={payload.ownerAvatarUrl
              ? { backgroundImage: `url(${payload.ownerAvatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined}
          >
            {payload.ownerAvatarUrl ? null : catInitials(payload.ownerDisplayName)}
          </div>
          <div className="sidebarFooterMeta">
            <strong>{payload.ownerDisplayName}</strong>
          </div>
          <span
            className={runtimeFooterStatusClassName(resolveRuntimeFooterStatus(payload))}
            data-tooltip={runtimeFooterStatusLabel(resolveRuntimeFooterStatus(payload))}
            aria-label={runtimeFooterStatusLabel(resolveRuntimeFooterStatus(payload))}
          />
        </button>
        {accountMenuOpen ? (
          <div className="accountMenu">
            <button
              className="accountMenuItem"
              type="button"
              onClick={onNavigateSettings}
            >
              Settings
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
