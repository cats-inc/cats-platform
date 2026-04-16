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

function phaseStatusLabel(phase: string): JSX.Element | null {
  switch (phase) {
    case 'streaming':
      return <span className="compareCardStatus compareCardStatusStreaming">Responding…</span>;
    case 'sealed':
      return <span className="compareCardStatus compareCardStatusSealed">Done</span>;
    default:
      return null;
  }
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

  return (
    <div className="compareCardsGrid">
      {segments.map((segment) => {
        const presentation = resolveSegmentPresentation(
          segment,
          segment.id === primarySegmentId,
          props,
        );
        if (!presentation.shouldRender) {
          return null;
        }
        return (
          <article key={segment.id} className={phaseClassName(segment.phase)}>
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
              {phaseStatusLabel(segment.phase)}
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
  );
}
