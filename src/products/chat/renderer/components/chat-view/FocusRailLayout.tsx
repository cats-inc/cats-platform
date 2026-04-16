import { useState } from 'react';

import type { LiveIndicatorSegmentState } from '../../hooks/useLiveIndicator.js';
import {
  resolveSegmentPresentation,
  SegmentSpeakerHeader,
  SegmentSpeakerInlineSummary,
  SegmentContentBody,
  type ClusterLayoutProps,
} from './ConcurrentClusterRenderer.js';

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

function CopyButton(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function FocusRailLayout(props: ClusterLayoutProps): JSX.Element {
  const {
    segments,
    bossCatId,
    buildParticipantAvatarClassName,
    buildParticipantAvatarStyle,
    resolveParticipantAvatarUrl,
    resolveParticipantDisplayName,
    showProgressDetails,
  } = props;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const primarySegment = segments[0] ?? null;
  const secondarySegments = primarySegment
    ? segments.filter((segment) => segment.id !== primarySegment.id)
    : [];
  const primaryPresentation = primarySegment
    ? resolveSegmentPresentation(primarySegment, true, props)
    : null;

  return (
    <div className="focusRailContainer">
      {primarySegment && primaryPresentation?.shouldRender ? (() => {
        const primaryPlainText = extractSegmentPlainText(primarySegment);
        return (
          <article className="focusRailPrimary">
            <div className="focusRailPrimaryHeader">
              <SegmentSpeakerHeader
                segmentParticipant={primaryPresentation.segmentParticipant}
                segmentParticipantCat={primaryPresentation.segmentParticipantCat}
                speakerCat={primaryPresentation.speakerCat}
                speakerLabel={primaryPresentation.speakerLabel}
                bossCatId={bossCatId}
                buildParticipantAvatarClassName={buildParticipantAvatarClassName}
                buildParticipantAvatarStyle={buildParticipantAvatarStyle}
                resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
                resolveParticipantDisplayName={resolveParticipantDisplayName}
              />
              {primaryPlainText ? (
                <div className="focusRailPrimaryActions">
                  <button
                    type="button"
                    className="focusRailActionIcon"
                    onClick={() => { void copyToClipboard(primaryPlainText); }}
                    title="Copy message"
                  >
                    <CopyButton />
                  </button>
                </div>
              ) : null}
            </div>
            <SegmentContentBody
              segment={primarySegment}
              renderedBlocks={primaryPresentation.renderedBlocks}
              showTrailingDots={primaryPresentation.showTrailingDots}
              showProgressDetails={showProgressDetails}
            />
          </article>
        );
      })() : null}

      {secondarySegments.length > 0 ? (
        <div className="focusRailSecondaries">
          {secondarySegments.map((segment) => {
            const presentation = resolveSegmentPresentation(
              segment,
              false,
              props,
            );
            if (!presentation.shouldRender) {
              return null;
            }
            const secondaryPlainText = extractSegmentPlainText(segment);
            const isExpanded = expandedId === segment.id;
            const isActive = segment.phase === 'streaming' || segment.phase === 'waiting';
            const hasSpeaker = Boolean(
              presentation.segmentParticipant || presentation.speakerCat || presentation.speakerLabel,
            );
            return (
              <div key={segment.id} className="focusRailSecondarySlot">
                <button
                  type="button"
                  className="focusRailSecondaryHeader"
                  onClick={() => setExpandedId(isExpanded ? null : segment.id)}
                >
                  {hasSpeaker ? (
                    <SegmentSpeakerInlineSummary
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
                  {isActive && !isExpanded ? (
                    <span className="focusRailSecondaryDots">
                      <span className="typingDots"><span /><span /><span /></span>
                    </span>
                  ) : null}
                  <span className={isExpanded ? 'focusRailExpandIcon focusRailExpandIconOpen' : 'focusRailExpandIcon'}>
                    ›
                  </span>
                </button>
                {isExpanded ? (
                  <div className="focusRailSecondaryBody">
                    <SegmentContentBody
                      segment={segment}
                      renderedBlocks={presentation.renderedBlocks}
                      showTrailingDots={presentation.showTrailingDots}
                      showProgressDetails={showProgressDetails}
                    />
                    {secondaryPlainText ? (
                      <div className="focusRailSecondaryFooter">
                        <button
                          type="button"
                          className="focusRailActionIcon"
                          onClick={() => { void copyToClipboard(secondaryPlainText); }}
                          title="Copy message"
                        >
                          <CopyButton />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
