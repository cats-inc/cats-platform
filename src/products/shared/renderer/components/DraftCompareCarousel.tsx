import {
  useCallback,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';

export interface DraftCompareCarouselCard {
  /** Stable identity so React/CSS transitions animate the right element. */
  id: string;
  /** The rendered card content (composerHeaderRow + form + composerFooterRow). */
  content: ReactNode;
}

export interface DraftCompareCarouselProps {
  cards: ReadonlyArray<DraftCompareCarouselCard>;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Horizontal 3D carousel for compare/parallel composer cards.
 *
 * - Bounded (no wrap): index 0 has nothing on its left (lead branch),
 *   index N−1 has nothing on its right.
 * - Peek cards layer in the same CSS-grid cell as the active card via
 *   inline transforms (translateX + rotateY + scale), so the active
 *   card drives the container's natural height and chrome rows above
 *   /below sit flush against it.
 * - Nav buttons + pagination dots only render when cards.length > 1.
 *   When only one card is provided, callers should skip the carousel
 *   entirely and render the card inline.
 */
export function DraftCompareCarousel({
  cards,
  activeIndex,
  onActiveIndexChange,
  disabled = false,
  ariaLabel,
}: DraftCompareCarouselProps) {
  const { t } = useI18n();
  const total = cards.length;
  const resolvedAriaLabel = ariaLabel
    ?? t(messageKeys.chatDraftCompareCarouselAriaLabel);

  const goPrev = useCallback(() => {
    if (disabled) return;
    onActiveIndexChange(Math.max(0, activeIndex - 1));
  }, [activeIndex, disabled, onActiveIndexChange]);

  const goNext = useCallback(() => {
    if (disabled) return;
    onActiveIndexChange(Math.min(total - 1, activeIndex + 1));
  }, [activeIndex, disabled, onActiveIndexChange, total]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLTextAreaElement) return;
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    }
  }

  if (total === 0) return null;
  // Single-card mode is a valid first-class state: it still routes
  // through the carousel so the +compare slot can anchor on the right
  // even before the user expands to a second branch. Boundary nav
  // arrows + the dot pagination simply suppress themselves below
  // (`activeIndex > 0`, `activeIndex < total - 1`, `total > 1`).

  return (
    <div
      className="draftCompareCarousel"
      role="region"
      aria-label={resolvedAriaLabel}
      onKeyDown={onKeyDown}
    >
      <div className="draftCompareCarouselTrack">
        {/* Owner directive (2026-05-01): nav arrows + the +compare slot
            are owned by the active card's `draftBranchFormAnchor` (in
            `ChatNewChatDraft`) so all three buttons share the form's
            vertical centre. Carousel-level rendering would anchor at
            `top: 50%` of the cell, which tracks the tallest branch's
            chrome and drifted higher than the form on single-branch
            (+New / +Group) drafts. Keyboard arrow shortcuts still fire
            `goPrev` / `goNext` via this carousel's `onKeyDown`. */}
        {cards.map((card, index) => (
          <DraftCompareCarouselCardWrapper
            key={card.id}
            active={index === activeIndex}
            relative={index - activeIndex}
            disabled={disabled}
            onPromote={
              index === activeIndex || disabled
                ? undefined
                : () => onActiveIndexChange(index)
            }
          >
            {card.content}
          </DraftCompareCarouselCardWrapper>
        ))}
      </div>

      {total > 1 ? (
        <div
          className="draftCompareCarouselDots"
          aria-label={t(messageKeys.chatDraftCompareCarouselSelectBranchAria)}
        >
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              className={`draftCompareCarouselDot${index === activeIndex ? ' draftCompareCarouselDotActive' : ''}`}
              onClick={() => onActiveIndexChange(index)}
              disabled={disabled}
              aria-label={t(messageKeys.chatDraftCompareCarouselGoToBranchAria, {
                branchIndex: `${index + 1}`,
              })}
              aria-current={index === activeIndex ? 'true' : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface CardWrapperProps {
  active: boolean;
  relative: number;
  disabled: boolean;
  onPromote?: () => void;
  children: ReactNode;
}

function DraftCompareCarouselCardWrapper({
  active,
  relative,
  disabled,
  onPromote,
  children,
}: CardWrapperProps) {
  // Active stays in the grid cell at identity transform; its natural
  // height drives the carousel height so chrome above/below sits flush
  // against the composer. Peek cards overlay the same cell via inline
  // transforms and do not contribute to layout (grid ignores transforms).
  const absRel = Math.abs(relative);
  const sign = relative === 0 ? 0 : relative > 0 ? 1 : -1;
  const translatePercent = sign * (88 + (absRel - 1) * 28);
  const rotateDeg = -sign * (38 + (absRel - 1) * 10);
  const scale = Math.max(0.38, 0.55 - (absRel - 1) * 0.12);
  const opacity = Math.max(0.1, 0.64 - (absRel - 1) * 0.28);
  const zIndex = active ? 1000 : Math.max(1, 900 - absRel * 10);

  const style: CSSProperties = active
    ? { zIndex }
    : {
        transform: `translate(${translatePercent}%, 0) rotateY(${rotateDeg}deg) scale(${scale.toFixed(3)})`,
        opacity: opacity.toFixed(3),
        zIndex,
      };

  const className = active
    ? 'draftCompareCarouselCard draftCompareCarouselCardActive'
    : 'draftCompareCarouselCard draftCompareCarouselCardPeek';

  function handleClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (active || disabled || !onPromote) return;
    if (
      event.target instanceof HTMLElement
      && event.target.closest('button, textarea, input, [role="button"]')
    ) {
      return;
    }
    onPromote();
  }

  return (
    <div
      className={className}
      style={style}
      aria-hidden={active ? undefined : true}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}
