import { useState } from 'react';

import type { LiveIndicatorSegmentState } from '../../hooks/useLiveIndicator.js';
import {
  resolveSegmentPresentation,
  SegmentSpeakerHeader,
  SegmentContentBody,
  type ClusterLayoutProps,
} from './ConcurrentClusterRenderer.js';

function phaseClassName(phase: string): string {
  switch (phase) {
    case 'streaming': return 'compareCard compareCardStreaming';
    case 'sealed': return 'compareCard compareCardSealed';
    default: return 'compareCard';
  }
}

function extractSegmentPlainText(segment: LiveIndicatorSegmentState): string {
  return [...segment.contentBlocks]
    .sort((a, b) => a.index - b.index)
    .filter((block) => block.kind === 'text' && block.text.trim())
    .map((block) => block.text)
    .join('\n');
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Ignore clipboard failures.
  }
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export function CompareCardsLayout(props: ClusterLayoutProps): JSX.Element {
  const {
    segments,
    bossCatId,
    buildParticipantAvatarClassName,
    buildParticipantAvatarStyle,
    resolveParticipantAvatarUrl,
    resolveParticipantDisplayName,
    showProgressDetails,
  } = props;
  const primarySegmentId = segments[0]?.id ?? null;

  const renderableSegments = segments.filter((segment) => {
    const presentation = resolveSegmentPresentation(
      segment,
      segment.id === primarySegmentId,
      props,
    );
    return presentation.shouldRender;
  });

  const total = renderableSegments.length;
  const [startIndex, setStartIndex] = useState(0);
  const clampedStart = total > 0 ? wrapIndex(startIndex, total) : 0;
  if (clampedStart !== startIndex) {
    setStartIndex(clampedStart);
  }

  const visibleSegments = total <= 2
    ? renderableSegments
    : [
        renderableSegments[clampedStart],
        renderableSegments[wrapIndex(clampedStart + 1, total)],
      ];
  const visibleIndices = total <= 2
    ? renderableSegments.map((_, i) => i)
    : [clampedStart, wrapIndex(clampedStart + 1, total)];
  const showNav = total > 2;

  return (
    <div className="compareCardsCarousel">
      {showNav ? (
        <button
          type="button"
          className="compareCardsNavButton compareCardsNavPrev"
          onClick={() => setStartIndex(wrapIndex(clampedStart - 1, total))}
          aria-label="Previous card"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      ) : null}
      <div className="compareCardsGrid">
        {visibleSegments.map((segment) => {
          const presentation = resolveSegmentPresentation(
            segment,
            segment.id === primarySegmentId,
            props,
          );
          const hasSpeaker = Boolean(
            presentation.segmentParticipant || presentation.speakerCat || presentation.speakerLabel,
          );
          const plainText = extractSegmentPlainText(segment);
          return (
            <article key={segment.id} className={phaseClassName(segment.phase)}>
              {hasSpeaker ? (
                <div className="compareCardHeader">
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
                </div>
              ) : null}
              <div className="compareCardBody">
                <SegmentContentBody
                  segment={segment}
                  renderedBlocks={presentation.renderedBlocks}
                  showTrailingDots={presentation.showTrailingDots}
                  showProgressDetails={showProgressDetails}
                />
              </div>
              {plainText ? (
                <div className="compareCardFooter">
                  <button
                    type="button"
                    className="compareCardCopyButton"
                    onClick={() => { void copyToClipboard(plainText); }}
                    title="Copy message"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {showNav ? (
        <button
          type="button"
          className="compareCardsNavButton compareCardsNavNext"
          onClick={() => setStartIndex(wrapIndex(clampedStart + 1, total))}
          aria-label="Next card"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      ) : null}
      {total > 1 ? (
        <div className="compareCardsPagination">
          {renderableSegments.map((segment, i) => (
            <button
              key={segment.id}
              type="button"
              className={visibleIndices.includes(i)
                ? 'compareCardsPaginationDot compareCardsPaginationDotActive'
                : 'compareCardsPaginationDot'}
              onClick={() => setStartIndex(i)}
              aria-label={`Card ${i + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
