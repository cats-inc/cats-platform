import { useState } from 'react';

import {
  buildSegmentCopyLabel,
  copySegmentPlainTextToClipboard,
  extractSegmentPlainText,
  resolveSegmentPresentation,
  SegmentSpeakerHeader,
  SegmentSpeakerInlineSummary,
  SegmentContentBody,
  type ClusterLayoutProps,
  type ResolvedSegmentPresentation,
} from './ConcurrentClusterRenderer.js';

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

function hasSpeakerIdentity<Participant>(
  presentation: ResolvedSegmentPresentation<Participant>,
): boolean {
  return Boolean(
    presentation.segmentParticipant || presentation.speakerCat || presentation.speakerLabel,
  );
}

function buildToggleLabel<Participant>(
  presentation: ResolvedSegmentPresentation<Participant>,
  isExpanded: boolean,
): string {
  const accessibleName = (
    presentation.segmentParticipantDisplayName
    ?? presentation.segmentParticipantCat?.name
    ?? presentation.speakerCat?.name
    ?? presentation.speakerLabel?.trim()
    ?? 'unnamed response'
  );
  return accessibleName === 'unnamed response'
    ? `${isExpanded ? 'Collapse' : 'Expand'} unnamed response`
    : `${isExpanded ? 'Collapse' : 'Expand'} response from ${accessibleName}`;
}

function AnonymousSecondarySummary(): JSX.Element {
  return (
    <span className="focusRailSecondaryAnonymousIndicator" aria-hidden="true">
      <span className="focusRailSecondaryAnonymousDot" />
    </span>
  );
}

export function shouldShowFocusRailSecondaryAnonymousIndicator({
  hasSpeakerIdentity,
  isActive,
  isExpanded,
}: {
  hasSpeakerIdentity: boolean;
  isActive: boolean;
  isExpanded: boolean;
}): boolean {
  return !hasSpeakerIdentity && (!isActive || isExpanded);
}

export function FocusRailLayout<Participant>(
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
        const primaryCopyLabel = buildSegmentCopyLabel(primaryPresentation);
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
                    onClick={() => { void copySegmentPlainTextToClipboard(primaryPlainText); }}
                    aria-label={primaryCopyLabel}
                    title={primaryCopyLabel}
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
            const hasSpeaker = hasSpeakerIdentity(presentation);
            const showActivityDots = isActive && !isExpanded;
            const showAnonymousIndicator = shouldShowFocusRailSecondaryAnonymousIndicator({
              hasSpeakerIdentity: hasSpeaker,
              isActive,
              isExpanded,
            });
            const toggleLabel = buildToggleLabel(presentation, isExpanded);
            const copyLabel = buildSegmentCopyLabel(presentation);
            return (
              <div key={segment.id} className="focusRailSecondarySlot">
                <button
                  type="button"
                  className="focusRailSecondaryHeader"
                  onClick={() => setExpandedId(isExpanded ? null : segment.id)}
                  aria-label={toggleLabel}
                  title={toggleLabel}
                  aria-expanded={isExpanded}
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
                  ) : showAnonymousIndicator ? <AnonymousSecondarySummary /> : null}
                  {showActivityDots ? (
                    <span className="focusRailSecondaryDots">
                      <span className="typingDots"><span /><span /><span /></span>
                    </span>
                  ) : null}
                  <span
                    className={isExpanded
                      ? 'focusRailExpandIcon focusRailExpandIconOpen'
                      : 'focusRailExpandIcon'}
                  >
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
                          onClick={() => { void copySegmentPlainTextToClipboard(secondaryPlainText); }}
                          aria-label={copyLabel}
                          title={copyLabel}
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
