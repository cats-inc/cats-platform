import { useState } from 'react';

import {
  buildSegmentCopyLabel,
  copySegmentPlainTextToClipboard,
  extractSegmentPlainText,
  resolveSegmentPresentation,
  SegmentSpeakerHeader,
  SegmentContentBody,
  type ClusterLayoutProps,
} from './ConcurrentClusterRenderer.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

function phaseClassName(phase: string): string {
  switch (phase) {
    case 'streaming': return 'compareCard compareCardStreaming';
    case 'sealed': return 'compareCard compareCardSealed';
    default: return 'compareCard';
  }
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

const COMPARE_CARDS_VISIBLE_COUNT = 2;

export interface CompareCardsWindow<T> {
  normalizedStartIndex: number;
  showNav: boolean;
  singleVisibleCard: boolean;
  total: number;
  visibleIndices: number[];
  visibleItems: T[];
}

export function resolveCompareCardsWindow<T>(
  items: ReadonlyArray<T>,
  startIndex: number,
): CompareCardsWindow<T> {
  const total = items.length;
  if (total === 0) {
    return {
      normalizedStartIndex: 0,
      showNav: false,
      singleVisibleCard: false,
      total: 0,
      visibleIndices: [],
      visibleItems: [],
    };
  }

  const normalizedStartIndex = wrapIndex(startIndex, total);
  if (total <= COMPARE_CARDS_VISIBLE_COUNT) {
    return {
      normalizedStartIndex,
      showNav: false,
      singleVisibleCard: total === 1,
      total,
      visibleIndices: items.map((_, index) => index),
      visibleItems: [...items],
    };
  }

  return {
    normalizedStartIndex,
    showNav: true,
    singleVisibleCard: false,
    total,
    visibleIndices: [
      normalizedStartIndex,
      wrapIndex(normalizedStartIndex + 1, total),
    ],
    visibleItems: [
      items[normalizedStartIndex]!,
      items[wrapIndex(normalizedStartIndex + 1, total)]!,
    ],
  };
}

function CopyButton(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CompareCardsLayout<Participant>(
  props: ClusterLayoutProps<Participant>,
): JSX.Element {
  const {
    segments,
    bossCatId,
    buildParticipantAvatarClassName,
    buildParticipantAvatarStyle,
    resolveParticipantAvatarUrl,
    resolveParticipantDisplayName,
    showProgressDetails,
  } = props;
  const { t } = useI18n();
  const primarySegmentId = segments[0]?.id ?? null;

    const renderableCards = segments.flatMap((segment) => {
    const presentation = resolveSegmentPresentation(
      segment,
      segment.id === primarySegmentId,
      props,
      t,
    );
    if (!presentation.shouldRender) {
      return [];
    }
    return [{
      segment,
      presentation,
    }];
  });
  const [startIndex, setStartIndex] = useState(0);
  const {
    normalizedStartIndex,
    showNav,
    singleVisibleCard,
    total,
    visibleIndices,
    visibleItems,
  } = resolveCompareCardsWindow(renderableCards, startIndex);

  return (
    <div
      className={showNav
        ? 'compareCardsCarousel compareCardsCarouselNavVisible'
        : 'compareCardsCarousel'}
    >
      {showNav ? (
        <button
          type="button"
          className="compareCardsNavButton compareCardsNavPrev"
          onClick={() => setStartIndex(wrapIndex(normalizedStartIndex - 1, total))}
          aria-label={t(messageKeys.chatCompareCardsPrevCardAriaLabel)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      ) : null}
      <div
        className={singleVisibleCard
          ? 'compareCardsGrid compareCardsGridSingle'
          : 'compareCardsGrid'}
      >
        {visibleItems.map(({ segment, presentation }) => {
          const hasSpeaker = Boolean(
            presentation.segmentParticipant
            || presentation.speakerCat
            || presentation.speakerLabel,
          );
          const plainText = extractSegmentPlainText(segment);
          const copyLabel = buildSegmentCopyLabel(presentation, t);
          return (
            <article key={segment.id} className={phaseClassName(segment.phase)}>
              <div className="compareCardHeader">
                {hasSpeaker ? (
                  <SegmentSpeakerHeader
                    segmentParticipant={presentation.segmentParticipant}
                    segmentParticipantCat={presentation.segmentParticipantCat}
                    speakerCat={presentation.speakerCat}
                    speakerLabel={presentation.speakerLabel}
                    bossCatId={bossCatId}
                    buildParticipantAvatarClassName={buildParticipantAvatarClassName}
                    buildParticipantAvatarStyle={buildParticipantAvatarStyle}
                    resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
                    resolveParticipantDisplayName={resolveParticipantDisplayName}
                  />
                ) : null}
                {plainText ? (
                  <div className="compareCardActions">
                    <button
                      type="button"
                      className="compareCardActionIcon"
                      onClick={() => { void copySegmentPlainTextToClipboard(plainText); }}
                      aria-label={copyLabel}
                      title={copyLabel}
                    >
                      <CopyButton />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="compareCardBody">
                <SegmentContentBody
                  segment={segment}
                  renderedBlocks={presentation.renderedBlocks}
                  showTrailingDots={presentation.showTrailingDots}
                  showProgressDetails={showProgressDetails}
                />
              </div>
            </article>
          );
        })}
      </div>
      {showNav ? (
        <button
          type="button"
          className="compareCardsNavButton compareCardsNavNext"
          onClick={() => setStartIndex(wrapIndex(normalizedStartIndex + 1, total))}
          aria-label={t(messageKeys.chatCompareCardsNextCardAriaLabel)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : null}
      {total > 1 ? (
        <div className="compareCardsPagination">
          {renderableCards.map(({ segment }, i) => (
            <button
              key={segment.id}
              type="button"
              className={visibleIndices.includes(i)
                ? 'compareCardsPaginationDot compareCardsPaginationDotActive'
                : 'compareCardsPaginationDot'}
              onClick={() => setStartIndex(i)}
              aria-label={t(messageKeys.chatCompareCardsPaginationItemAriaLabel, {
                cardIndex: i + 1,
              })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
