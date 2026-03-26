import type { RefObject, MouseEvent as ReactMouseEvent } from 'react';

import type { AppShellPayload, ChatChannelSummary } from '../../api/contracts';
import { catInitials, isChatCat, presentChannelTitle, type Surface } from '../chatUtils';
import {
  findDirectLaneForCat,
  resolveMyCatStatusDot,
  statusDotClassName,
  statusDotLabel,
} from '../myCatNavigation';

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
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onArchiveCat: (catId: string) => void;
  onAccountMenuToggle: () => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onNavigateSettings: () => void;
  activeMyCatId: string | null;
  onDirectChatCat: (catId: string) => void;
}

type RuntimeFooterStatus = 'unknown' | 'connected' | 'degraded' | 'unavailable';

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
  return channel.roomMode === 'direct_cat_chat';
}

function resolveCatForChannel(
  channel: ChatChannelSummary,
  payload: AppShellPayload,
): { name: string; avatarColor: string | null } | null {
  const leadCatId = channel.leadCatId;
  if (leadCatId) {
    const cat = payload.chat.cats.find((c) => c.id === leadCatId);
    if (cat) return { name: cat.name, avatarColor: cat.avatarColor };
  }
  // For boss_chat, show boss cat
  if (payload.chat.bossCatId) {
    const boss = payload.chat.cats.find((c) => c.id === payload.chat.bossCatId);
    if (boss) return { name: boss.name, avatarColor: boss.avatarColor };
  }
  return null;
}


function ChannelItem({
  channel,
  payload,
  isSelected,
  busy,
  overflowOpen,
  onSelect,
  onDelete,
  onOverflowToggle,
}: {
  channel: ChatChannelSummary;
  payload: AppShellPayload;
  isSelected: boolean;
  busy: string;
  overflowOpen: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onOverflowToggle: () => void;
}) {
  const cat = resolveCatForChannel(channel, payload);

  return (
    <article className={isSelected ? 'recentItemCard recentItemSelected' : 'recentItemCard'}>
      <button className="recentSelectButton" onClick={onSelect} type="button">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {cat ? (
            <span
              className="recentCatDot"
              style={{ background: cat.avatarColor ?? '#90A4AE', width: 8, height: 8, borderRadius: '50%', flexShrink: 0 }}
              data-tooltip={cat.name}
            />
          ) : null}
          <strong>{presentChannelTitle(channel.title)}</strong>
        </div>
      </button>
      <button
        className="recentOverflowButton"
        type="button"
        onClick={(e) => { e.stopPropagation(); onOverflowToggle(); }}
      >
        &#x22EF;
      </button>
      {overflowOpen ? (
        <div className="recentOverflowMenu">
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
  onSelect,
  onDeleteChannel,
  onArchiveCat,
  onAccountMenuToggle,
  onOverflowMenuToggle,
  onNavigateSettings,
  activeMyCatId,
  onDirectChatCat,
}: SidebarProps) {
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
            <p className="brandLabel">Cats Chat</p>
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
              {[...chatCats]
                .filter((cat) => cat.status === 'active')
                .sort((a, b) => {
                  const aIsBoss = a.id === payload.chat.bossCatId ? 0 : 1;
                  const bIsBoss = b.id === payload.chat.bossCatId ? 0 : 1;
                  return aIsBoss - bIsBoss;
                })
                .map((cat) => {
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
                    <div key={cat.id} className="myCatRow">
                      <button
                        className={isActive ? 'myCatItem myCatItemActive' : 'myCatItem'}
                        type="button"
                        onClick={() => onDirectChatCat(cat.id)}
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
                        {hasTelegramBinding ? (
                          <span className="myCatTelegramIcon" data-tooltip="Telegram bot bound" aria-label="Telegram bot bound">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20.66 3.88 2.92 10.9a.73.73 0 0 0 .04 1.38l4.45 1.4 1.72 5.52a.78.78 0 0 0 1.24.37l2.48-2.02 4.87 3.6a.78.78 0 0 0 1.2-.46L21.7 4.76c.17-.7-.52-1.27-1.04-0.88ZM10.1 14.6l-.44 3.15-1.34-4.3 9.38-6.2Z" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                      <button
                        className="myCatOverflowButton"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOverflowMenuToggle(catOverflowOpen ? null : overflowKey); }}
                      >
                        &#x22EF;
                      </button>
                      {catOverflowOpen ? (
                        <div className="myCatOverflowMenu">
                          <button
                            type="button"
                            disabled={false}
                            onClick={() => {
                              onOverflowMenuToggle(null);
                              void onArchiveCat(cat.id);
                            }}
                          >
                            Archive
                          </button>
                        </div>
                      ) : null}
                    </div>
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
