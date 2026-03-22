import type { RefObject, MouseEvent as ReactMouseEvent } from 'react';

import type { AppShellPayload, ChatChannelSummary } from '../../../../shared/app-shell';
import { catInitials, presentChannelTitle, type Surface } from '../chatUtils';

export type SidebarViewMode = 'latest' | 'by_cat' | 'by_chat_type';

export interface SidebarProps {
  payload: AppShellPayload;
  sidebarOpen: boolean;
  accountMenuOpen: boolean;
  overflowMenuOpenId: string | null;
  busy: string;
  surface: Surface;
  routeChannelId: string | null;
  sidebarView: SidebarViewMode;
  accountMenuRef: RefObject<HTMLDivElement>;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onOpenChatsOverview: () => void;
  onStartNewChat: () => void;
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onAccountMenuToggle: () => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onNavigateSettings: () => void;
  onSidebarViewChange: (mode: SidebarViewMode) => void;
  onDirectChatCat: (catId: string) => void;
}

function resolveCatForChannel(
  channel: ChatChannelSummary,
  payload: AppShellPayload,
): { name: string; avatarColor: string | null } | null {
  const leadCatId = (channel as { leadCatId?: string | null }).leadCatId;
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

function channelRoomMode(channel: ChatChannelSummary): string {
  return (channel as { roomMode?: string | null }).roomMode ?? 'boss_chat';
}

function roomModeLabel(mode: string): string {
  switch (mode) {
    case 'direct_cat_chat': return 'Direct';
    case 'transport_inbox': return 'Inbox';
    default: return 'Boss Chat';
  }
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
              title={cat.name}
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
  sidebarView,
  accountMenuRef,
  onToggleSidebar,
  onCollapsedSidebarClick,
  onOpenChatsOverview,
  onStartNewChat,
  onSelect,
  onDeleteChannel,
  onAccountMenuToggle,
  onOverflowMenuToggle,
  onNavigateSettings,
  onSidebarViewChange,
  onDirectChatCat,
}: SidebarProps) {
  const showMyCats = payload.chat.cats.length > 0;

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

  function renderByLatest() {
    return renderChannelList(payload.chat.channels);
  }

  function renderByCat() {
    const groups = new Map<string, { catName: string; channels: ChatChannelSummary[] }>();
    const ungrouped: ChatChannelSummary[] = [];

    for (const channel of payload.chat.channels) {
      const leadId = (channel as { leadCatId?: string | null }).leadCatId;
      if (leadId) {
        const cat = payload.chat.cats.find((c) => c.id === leadId);
        const key = leadId;
        if (!groups.has(key)) {
          groups.set(key, { catName: cat?.name ?? 'Unknown', channels: [] });
        }
        groups.get(key)!.channels.push(channel);
      } else {
        ungrouped.push(channel);
      }
    }

    return (
      <>
        {Array.from(groups.entries()).map(([catId, group]) => (
          <div key={catId} className="recentGroup">
            <p className="recentGroupLabel">{group.catName}</p>
            {renderChannelList(group.channels)}
          </div>
        ))}
        {ungrouped.length > 0 ? (
          <div className="recentGroup">
            <p className="recentGroupLabel">Boss Chat</p>
            {renderChannelList(ungrouped)}
          </div>
        ) : null}
      </>
    );
  }

  function renderByChatType() {
    const groups: Record<string, ChatChannelSummary[]> = {};
    for (const channel of payload.chat.channels) {
      const mode = channelRoomMode(channel);
      if (!groups[mode]) groups[mode] = [];
      groups[mode].push(channel);
    }

    return (
      <>
        {Object.entries(groups).map(([mode, channels]) => (
          <div key={mode} className="recentGroup">
            <p className="recentGroupLabel">{roomModeLabel(mode)}</p>
            {renderChannelList(channels)}
          </div>
        ))}
      </>
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
              {[...payload.chat.cats]
                .filter((cat) => cat.status === 'active')
                .sort((a, b) => {
                  const aIsBoss = a.id === payload.chat.bossCatId ? 0 : 1;
                  const bIsBoss = b.id === payload.chat.bossCatId ? 0 : 1;
                  return aIsBoss - bIsBoss;
                })
                .map((cat) => {
                  const isBoss = cat.id === payload.chat.bossCatId;
                  return (
                    <button
                      key={cat.id}
                      className="myCatItem"
                      type="button"
                      onClick={() => onDirectChatCat(cat.id)}
                    >
                      <span
                        className={isBoss ? 'catAvatar catAvatarBoss' : 'catAvatar'}
                        style={cat.avatarColor ? { background: cat.avatarColor } : undefined}
                      >
                        {catInitials(cat.name)}
                      </span>
                      <span className="myCatName">{cat.name}</span>
                      {isBoss ? <span className="myCatBadge">Boss</span> : null}
                    </button>
                  );
                })}
            </div>
          </section>
        ) : null}

        <section className="recentSection">
          <div className="recentHeader">
            <p className="sectionLabel">Recents</p>
            <div className="viewModeToggle">
              {(['latest', 'by_cat', 'by_chat_type'] as const).map((mode) => (
                <button
                  key={mode}
                  className={sidebarView === mode ? 'viewModeBtn viewModeBtnActive' : 'viewModeBtn'}
                  type="button"
                  onClick={() => onSidebarViewChange(mode)}
                  title={mode === 'latest' ? 'Latest' : mode === 'by_cat' ? 'By Cat' : 'By Type'}
                >
                  {mode === 'latest' ? 'All' : mode === 'by_cat' ? 'Cat' : 'Type'}
                </button>
              ))}
            </div>
          </div>
          <div className="recentList">
            {sidebarView === 'latest' ? renderByLatest()
              : sidebarView === 'by_cat' ? renderByCat()
              : renderByChatType()}
          </div>
        </section>
      </div>

      <div className="sidebarFooter" ref={accountMenuRef}>
        <button
          className="sidebarFooterButton"
          type="button"
          onClick={onAccountMenuToggle}
          aria-label="Account menu"
        >
          <div className="profileBadge">{catInitials(payload.ownerDisplayName)}</div>
          <div className="sidebarFooterMeta">
            <strong>{payload.ownerDisplayName}</strong>
          </div>
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
