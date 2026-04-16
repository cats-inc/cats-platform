import { useState } from 'react';

import {
  resolveSegmentPresentation,
  SegmentSpeakerHeader,
  SegmentContentBody,
  type ClusterLayoutProps,
} from './ConcurrentClusterRenderer.js';

function phaseChipLabel(phase: string): string {
  switch (phase) {
    case 'streaming': return 'Responding…';
    case 'sealed': return 'Done';
    case 'waiting': return 'Waiting…';
    default: return '';
  }
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

  const primarySegment = segments[0];
  const secondarySegments = segments.slice(1);
  const primaryPresentation = primarySegment
    ? resolveSegmentPresentation(primarySegment, true, props)
    : null;

  return (
    <div className="focusRailContainer">
      {primarySegment && primaryPresentation?.shouldRender ? (
        <article className="focusRailPrimary">
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
          <SegmentContentBody
            segment={primarySegment}
            renderedBlocks={primaryPresentation.renderedBlocks}
            showTrailingDots={primaryPresentation.showTrailingDots}
            showProgressDetails={showProgressDetails}
          />
        </article>
      ) : null}

      {secondarySegments.length > 0 ? (
        <div className="focusRailSecondaries">
          {secondarySegments.map((segment) => {
            const presentation = resolveSegmentPresentation(segment, false, props);
            if (!presentation.shouldRender) {
              return null;
            }
            const isExpanded = expandedId === segment.id;
            return (
              <div key={segment.id} className="focusRailSecondarySlot">
                <button
                  type="button"
                  className="focusRailSecondaryHeader"
                  onClick={() => setExpandedId(isExpanded ? null : segment.id)}
                >
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
                  <span className="focusRailSecondaryChip">{phaseChipLabel(segment.phase)}</span>
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
