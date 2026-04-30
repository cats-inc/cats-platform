import { useRef } from 'react';

import type {
  ConversationSidebarCat,
  ConversationSidebarChannel,
  ConversationSidebarHelpers,
} from './ConversationSidebar.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../i18n/index.js';
import { SidebarFloatingMenuPortal } from './SidebarFloatingMenuPortal.js';
import { useFloatingSidebarMenu } from './useFloatingSidebarMenu.js';

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
  const { t } = useI18n();
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
            data-tooltip={t(messageKeys.conversationSidebarTelegramBoundTooltip)}
            aria-label={t(messageKeys.conversationSidebarTelegramBoundTooltip)}
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
        <SidebarFloatingMenuPortal
          menuRef={overflowMenuRef}
          className="myCatOverflowMenu"
          style={overflowMenuStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" disabled={false} onClick={onArchive}>
            {t(messageKeys.conversationSidebarArchiveButton)}
          </button>
        </SidebarFloatingMenuPortal>
      ) : null}
    </div>
  );
}

export interface ConversationSidebarMyCatsPlaceholder {
  label: string;
  onClick?: () => void;
}

function MyCatPlaceholderRow({
  label,
  onClick,
}: ConversationSidebarMyCatsPlaceholder) {
  const interactive = typeof onClick === 'function';
  const handleClick = () => {
    if (interactive) {
      onClick?.();
    }
  };
  return (
    <div
      className={[
        'myCatRow',
        'myCatRowPlaceholder',
        interactive ? '' : 'myCatRowPlaceholderStatic',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
    >
      <button
        className="myCatItem myCatItemPlaceholder"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleClick();
        }}
        disabled={!interactive}
      >
        <span className="myCatAvatarWrap catAvatar catAvatarPlaceholder" aria-hidden="true">
          <svg
            className="myCatPlaceholderIcon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </span>
        <span className="myCatName myCatNamePlaceholder">{label}</span>
      </button>
    </div>
  );
}

export function ConversationSidebarMyCatsSection<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TDot extends string,
>({
  label,
  cats,
  bossCatId,
  payloadChannels,
  activeMyCatId,
  telegramBoundCatIds,
  helpers,
  overflowMenuOpenId,
  onOverflowMenuToggle,
  onDirectChatCat,
  onArchiveCat,
  emptyStatePlaceholder,
}: {
  label?: string;
  cats: readonly TCat[];
  bossCatId: string | null;
  payloadChannels: readonly TChannel[];
  activeMyCatId: string | null;
  telegramBoundCatIds: ReadonlySet<string>;
  helpers: ConversationSidebarHelpers<TCat, TChannel, TDot>;
  overflowMenuOpenId: string | null;
  onOverflowMenuToggle: (channelId: string | null) => void;
  onDirectChatCat: (catId: string) => void;
  onArchiveCat: (catId: string) => void;
  emptyStatePlaceholder?: ConversationSidebarMyCatsPlaceholder;
}) {
  const { t } = useI18n();
  const activeCats = helpers.sortCatsForDisplay(
    cats.filter((cat) => cat.status === 'active'),
    { bossCatIds: bossCatId },
  );
  const showPlaceholder = activeCats.length === 0 && emptyStatePlaceholder != null;
  return (
    <section className="myCatsSection">
      <p className="sectionLabel">{label ?? t(messageKeys.conversationSidebarMyCatsLabel)}</p>
      <div className="myCatsList">
        {showPlaceholder ? (
          <MyCatPlaceholderRow
            label={emptyStatePlaceholder!.label}
            onClick={emptyStatePlaceholder!.onClick}
          />
        ) : null}
        {activeCats.map((cat) => {
          const isBoss = cat.id === bossCatId;
          const isActive = activeMyCatId === cat.id;
          const hasTelegramBinding = telegramBoundCatIds.has(cat.id);
          const directLane = helpers.findDirectLaneForCat(payloadChannels as TChannel[], cat.id);
          const dot = helpers.resolveMyCatStatusDot(
            directLane?.defaultRecipientLeaseStatus,
          );
          const dotClass = helpers.statusDotClassName(dot);
          const dotLabelKey = helpers.statusDotLabel(dot);
          const dotTitle = dotLabelKey ? t(dotLabelKey) : '';
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
  );
}
