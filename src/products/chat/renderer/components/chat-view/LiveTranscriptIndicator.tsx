import type { CSSProperties } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import type { LiveIndicatorSegmentState } from '../../hooks/useLiveIndicator.js';
import type { LiveIndicatorContentBlock } from '../../../../../shared/runtimeContentBlocks.js';
import { catInitials } from '../../chatUtils.js';
import { normalizeVisibleOrchestratorLabel } from '../../../../../shared/orchestratorLabel.js';
import {
  hasVisibleLiveIndicatorSegmentActivity,
  resolveLiveIndicatorSegments,
} from '../../../../../shared/liveIndicator.js';
import { MessageBody } from '../MessageBody.js';
import {
  shouldRenderLiveTranscriptBlock,
  shouldShowLiveTranscriptTrailingDots,
  stripLeadingLiveTranscriptBlankLines,
} from '../../../../shared/renderer/components/chat-view/liveTranscriptBlockSupport.js';
import type {
  ResolvedChannelParticipant,
} from '../../../shared/channelParticipants.js';

export interface LiveTranscriptIndicatorProps {
  cats: ChatCat[];
  bossCatId: string | null;
  selectedChannelId: string;
  disabledMentionNames: string[];
  liveIndicator: LiveIndicatorState;
  liveSpeakerParticipant: ResolvedChannelParticipant | null;
  liveSpeakerParticipantCat: ChatCat | null;
  resolveLiveIndicatorSegmentParticipant: (
    segment: LiveIndicatorSegmentState,
  ) => ResolvedChannelParticipant | null;
  resolveParticipantCatRecord: (
    participant: ResolvedChannelParticipant | null,
  ) => ChatCat | null;
  buildParticipantAvatarClassName: (
    participant: ResolvedChannelParticipant,
    options?: { transcript?: boolean; catRecord?: ChatCat | null },
  ) => string;
  buildParticipantAvatarStyle: (
    participant: ResolvedChannelParticipant,
    catRecord?: ChatCat | null,
  ) => CSSProperties | undefined;
  resolveParticipantAvatarUrl: (
    participant: ResolvedChannelParticipant,
    catRecord?: ChatCat | null,
  ) => string | null;
  resolveParticipantDisplayName: (
    participant: ResolvedChannelParticipant,
    catRecord?: ChatCat | null,
  ) => string;
  showProgressDetails?: boolean;
}

function renderContentBlockSegment(
  block: LiveIndicatorContentBlock,
  cats: ChatCat[],
  channelId: string,
  disabledMentionNames: string[],
  showProgressDetails: boolean,
): JSX.Element | null {
  if (!shouldRenderLiveTranscriptBlock(block, showProgressDetails)) {
    return null;
  }

  if (block.kind === 'text') {
    const text = stripLeadingLiveTranscriptBlankLines(block.text);
    if (!text.trim()) {
      return null;
    }
    return (
      <MessageBody
        key={block.id}
        body={text}
        cats={cats}
        channelId={channelId}
        disabledMentionNames={disabledMentionNames}
      />
    );
  }

  if (block.kind === 'tool') {
    return (
      <div key={block.id} className={block.status === 'streaming' ? 'toolSegmentChip' : 'toolSegmentChip toolSegmentChipDone'}>
        <span className="toolSegmentChipName">{block.toolName ?? block.title ?? 'tool'}</span>
        {block.text ? (
          <span className="toolSegmentChipDetail">{block.text}</span>
        ) : null}
      </div>
    );
  }

  if (block.kind === 'status' && block.text) {
    return (
      <p key={block.id} className="typingStatusText">{block.text}</p>
    );
  }

  return null;
}

export function LiveTranscriptIndicator({
  cats,
  bossCatId,
  selectedChannelId,
  disabledMentionNames,
  liveIndicator,
  liveSpeakerParticipant,
  liveSpeakerParticipantCat,
  resolveLiveIndicatorSegmentParticipant,
  resolveParticipantCatRecord,
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
  showProgressDetails = false,
}: LiveTranscriptIndicatorProps) {
  return (
    <>
      {resolveLiveIndicatorSegments(liveIndicator).map((segment, index, segments) => {
        const isPrimarySegment = segment.id === segments.at(-1)?.id;
        const resolvedSegmentParticipant = resolveLiveIndicatorSegmentParticipant(segment);
        const resolvedSegmentParticipantCat = resolveParticipantCatRecord(resolvedSegmentParticipant);
        const segmentParticipant = resolvedSegmentParticipant
          ?? (isPrimarySegment ? liveSpeakerParticipant : null);
        const segmentParticipantCat = resolvedSegmentParticipant
          ? resolvedSegmentParticipantCat
          : (isPrimarySegment ? liveSpeakerParticipantCat : null);
        const normalizedStreamSpeakerLabel = (() => {
          const value = segment.speakerLabel?.trim();
          if (segment.participantId === 'orchestrator') {
            return normalizeVisibleOrchestratorLabel(value);
          }
          return value || null;
        })();
        const speakerCat = segment.catId
          ? cats.find((cat) => cat.id === segment.catId) ?? null
          : null;
        const speakerLabel = segmentParticipant?.name
          ?? segmentParticipantCat?.name
          ?? speakerCat?.name
          ?? normalizedStreamSpeakerLabel;
        const sortedBlocks = [...segment.contentBlocks].sort(
          (left, right) => left.index - right.index,
        );
        const lastBlock = sortedBlocks.at(-1);
        const showTrailingDots = shouldShowLiveTranscriptTrailingDots(segment.phase, lastBlock);
        const renderedSegments = sortedBlocks
          .map((block) =>
            renderContentBlockSegment(
              block,
              cats,
              selectedChannelId,
              disabledMentionNames,
              showProgressDetails,
            ),
          )
          .filter((block): block is JSX.Element => block != null);
        const hasSegmentIdentity = Boolean(
          segment.participantId || segment.catId || segment.speakerLabel,
        );
        const shouldRenderSegment =
          segment.phase === 'waiting'
          || renderedSegments.length > 0
          || (showProgressDetails && segment.progressText.trim().length > 0)
          || (
            segment.phase === 'streaming'
            && (hasVisibleLiveIndicatorSegmentActivity(segment) || hasSegmentIdentity)
          )
          || showTrailingDots;

        if (!shouldRenderSegment) {
          return null;
        }

        return (
          <article key={segment.id} className="transcriptMessageStack transcriptMessageStackAgent typingIndicator">
            <div className="transcriptMessage transcriptMessageAgent">
              {segmentParticipant ? (
                <div className="transcriptMessageTop">
                  <div
                    className={buildParticipantAvatarClassName(
                      segmentParticipant,
                      {
                        transcript: true,
                        catRecord: segmentParticipantCat,
                      },
                    )}
                    style={buildParticipantAvatarStyle(
                      segmentParticipant,
                      segmentParticipantCat,
                    )}
                  >
                    {resolveParticipantAvatarUrl(
                      segmentParticipant,
                      segmentParticipantCat,
                    ) ? null : catInitials(resolveParticipantDisplayName(
                      segmentParticipant,
                      segmentParticipantCat,
                    ))}
                  </div>
                  <strong>{resolveParticipantDisplayName(
                    segmentParticipant,
                    segmentParticipantCat,
                  )}</strong>
                </div>
              ) : speakerCat ? (
                <div className="transcriptMessageTop">
                  <div
                    className={speakerCat.id === bossCatId
                      ? 'catAvatar catAvatarBoss transcriptAvatar'
                      : 'catAvatar transcriptAvatar'}
                    style={speakerCat.avatarUrl
                      ? {
                          backgroundImage: `url(${speakerCat.avatarUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : speakerCat.avatarColor ? { background: speakerCat.avatarColor } : undefined}
                  >
                    {speakerCat.avatarUrl ? null : catInitials(speakerCat.name)}
                  </div>
                  <strong>{speakerCat.name}</strong>
                </div>
              ) : speakerLabel ? (
                <div className="transcriptMessageTop">
                  <strong>{speakerLabel}</strong>
                </div>
              ) : null}
              {segment.phase === 'waiting' ? (
                <span className="typingDots"><span /><span /><span /></span>
              ) : renderedSegments.length === 0 ? (
                showProgressDetails && segment.progressText ? (
                  <p className="typingStatusText">{segment.progressText}</p>
                ) : segment.phase === 'streaming'
                  && hasVisibleLiveIndicatorSegmentActivity(segment) ? (
                  <span className="typingDots"><span /><span /><span /></span>
                ) : showTrailingDots ? (
                  <span className="typingDots"><span /><span /><span /></span>
                ) : null
              ) : (
                <>
                  {renderedSegments}
                  {showTrailingDots ? (
                    <span className="typingDots"><span /><span /><span /></span>
                  ) : null}
                </>
              )}
            </div>
          </article>
        );
      })}
    </>
  );
}
