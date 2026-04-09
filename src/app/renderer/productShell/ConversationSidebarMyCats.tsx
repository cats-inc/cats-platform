import { useRef } from 'react';

import type {
  ConversationSidebarCat,
  ConversationSidebarChannel,
  ConversationSidebarHelpers,
} from './ConversationSidebar.js';
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

export function ConversationSidebarMyCatsSection<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TDot extends string,
>({
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
}: {
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
}) {
  return (
    <section className="myCatsSection">
      <p className="sectionLabel">My Cats</p>
      <div className="myCatsList">
        {helpers.sortCatsForDisplay(
          cats.filter((cat) => cat.status === 'active'),
          { bossCatIds: bossCatId },
        ).map((cat) => {
          const isBoss = cat.id === bossCatId;
          const isActive = activeMyCatId === cat.id;
          const hasTelegramBinding = telegramBoundCatIds.has(cat.id);
          const directLane = helpers.findDirectLaneForCat(payloadChannels as TChannel[], cat.id);
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
  );
}
