import { Fragment, useRef } from 'react';

import { SidebarFloatingMenuPortal } from './SidebarFloatingMenuPortal.js';
import { useFloatingSidebarMenu } from './useFloatingSidebarMenu.js';

export interface ConversationSidebarPinnedAction {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

export interface ConversationSidebarPinnedItem {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  statusDot?: { className: string; title?: string };
  overflowActions?: readonly ConversationSidebarPinnedAction[];
}

export function ConversationSidebarPinnedItemRow({
  overflowKey,
  item,
  overflowOpen,
  onOverflowToggle,
}: {
  overflowKey: string;
  item: ConversationSidebarPinnedItem;
  overflowOpen: boolean;
  onOverflowToggle: () => void;
}) {
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuStyle = useFloatingSidebarMenu(
    overflowButtonRef,
    overflowMenuRef,
    overflowOpen,
  );
  const actions = item.overflowActions ?? [];
  const hasMenu = actions.length > 0;

  return (
    <article
      className={[
        'recentItemCard',
        'pinnedItemCard',
        item.isActive ? 'recentItemSelected' : '',
        overflowOpen ? 'recentItemOverflowOpen' : '',
      ].filter(Boolean).join(' ')}
      onClick={item.onClick}
      data-overflow-key={overflowKey}
    >
      <button
        className="recentSelectButton pinnedSelectButton"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          item.onClick();
        }}
      >
        {item.statusDot ? (
          <span
            className={item.statusDot.className}
            data-tooltip={item.statusDot.title ?? undefined}
            aria-hidden="true"
          />
        ) : null}
        <strong>{item.label}</strong>
      </button>
      {hasMenu ? (
        <span className="recentItemTrailing">
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
      {overflowOpen && hasMenu ? (
        <SidebarFloatingMenuPortal
          menuRef={overflowMenuRef}
          className="recentOverflowMenu"
          style={overflowMenuStyle}
          onClick={(event) => event.stopPropagation()}
        >
          {actions.map((action, index) => {
            const previous = index > 0 ? actions[index - 1] : undefined;
            const insertDivider =
              action.destructive === true && previous && previous.destructive !== true;
            return (
              <Fragment key={action.key}>
                {insertDivider ? <div className="recentOverflowMenuDivider" /> : null}
                <button
                  type="button"
                  disabled={action.disabled === true}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              </Fragment>
            );
          })}
        </SidebarFloatingMenuPortal>
      ) : null}
    </article>
  );
}
