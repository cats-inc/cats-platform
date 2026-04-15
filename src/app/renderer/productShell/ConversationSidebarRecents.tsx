import { useRef, type ReactNode } from 'react';
import {
  isChannelBusy,
  isConcurrentGroupBusy,
  type WorkspaceBusyState,
} from '../../../shared/workspaceBusy.js';

import {
  type ConversationSidebarCat,
  type ConversationSidebarChannel,
  type ConversationSidebarHelpers,
  type ConversationSidebarPayload,
  type ConversationSidebarRecentChannelEntry,
  type ConversationSidebarRecentEntry,
} from './ConversationSidebar.js';
import { SidebarFloatingMenuPortal } from './SidebarFloatingMenuPortal.js';
import { useFloatingSidebarMenu } from './useFloatingSidebarMenu.js';
import { useSidebarInlineRename } from './useSidebarInlineRename.js';

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
  busy: WorkspaceBusyState;
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
        <SidebarFloatingMenuPortal
          menuRef={overflowMenuRef}
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
            disabled={isChannelBusy(busy, 'delete', channel.id)}
            onClick={onDelete}
          >
            {isChannelBusy(busy, 'delete', channel.id) ? 'Deleting...' : 'Delete'}
          </button>
        </SidebarFloatingMenuPortal>
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
  busy: WorkspaceBusyState;
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
  const groupIdFromBusyKey = (busyKey?: string): string | undefined => busyKey?.split(':').at(-1);
  const renameBusy = renameBusyKey
    ? isConcurrentGroupBusy(busy, 'rename', groupIdFromBusyKey(renameBusyKey))
    : false;
  const ungroupBusy = ungroupBusyKey
    ? isConcurrentGroupBusy(busy, 'ungroup', groupIdFromBusyKey(ungroupBusyKey))
    : false;
  const deleteBusy = deleteBusyKey
    ? isConcurrentGroupBusy(busy, 'delete', groupIdFromBusyKey(deleteBusyKey))
    : false;
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
        <SidebarFloatingMenuPortal
          menuRef={overflowMenuRef}
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
        </SidebarFloatingMenuPortal>
      ) : null}
    </article>
  );
}

export function ConversationSidebarRecentsSection<
  TCat extends ConversationSidebarCat,
  TChannel extends ConversationSidebarChannel,
  TDot extends string,
>({
  entries,
  payload,
  helpers,
  routeChannelId,
  busy,
  overflowMenuOpenId,
  onSelect,
  onDeleteChannel,
  onRenameChannel,
  onOverflowMenuToggle,
}: {
  entries: readonly ConversationSidebarRecentEntry<TChannel>[];
  payload: ConversationSidebarPayload<TCat, TChannel>;
  helpers: ConversationSidebarHelpers<TCat, TChannel, TDot>;
  routeChannelId: string | null;
  busy: WorkspaceBusyState;
  overflowMenuOpenId: string | null;
  onSelect: (channelId: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onRenameChannel: (channelId: string, title: string) => void;
  onOverflowMenuToggle: (channelId: string | null) => void;
}) {
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
    if (entries.length === 0) {
      return (
        <div className="recentEmpty">
          <p>No chats yet</p>
        </div>
      );
    }

    return entries.map((entry) => {
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
    <section className="recentSection">
      <div className="recentHeader">
        <p className="sectionLabel">Recents</p>
      </div>
      <div className="recentList">{renderRecentEntries()}</div>
    </section>
  );
}
