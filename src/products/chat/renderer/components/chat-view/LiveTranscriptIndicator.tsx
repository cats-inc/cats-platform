import type { CSSProperties } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import type { LiveIndicatorContentBlock } from '../../../../../shared/runtimeContentBlocks.js';
import { catInitials } from '../../chatUtils.js';
import { normalizeVisibleOrchestratorLabel } from '../../../../../shared/orchestratorLabel.js';
import { MessageBody } from '../MessageBody.js';
import type {
  ResolvedChannelParticipant,
} from '../../../shared/channelParticipants.js';

const LEADING_BLANK_LINES_PATTERN = /^(?:[ \t]*\r?\n)+/u;

function stripLeadingBlankLines(value: string): string {
  return value.replace(LEADING_BLANK_LINES_PATTERN, '');
}

export interface LiveTranscriptIndicatorProps {
  cats: ChatCat[];
  bossCatId: string | null;
  selectedChannelId: string;
  disabledMentionNames: string[];
  liveIndicator: LiveIndicatorState;
  liveSpeakerParticipant: ResolvedChannelParticipant | null;
  liveSpeakerParticipantCat: ChatCat | null;
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
  if (block.kind === 'text') {
    const text = stripLeadingBlankLines(block.text);
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

  if (!showProgressDetails) {
    return null;
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
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
  showProgressDetails = false,
}: LiveTranscriptIndicatorProps) {
  const normalizedStreamSpeakerLabel = (() => {
    const value = liveIndicator.speakerLabel?.trim();
    if (liveIndicator.participantId === 'orchestrator') {
      return normalizeVisibleOrchestratorLabel(value);
    }
    return value || null;
  })();
  const speakerCat = liveIndicator.catId
    ? cats.find((cat) => cat.id === liveIndicator.catId) ?? null
    : null;
  const speakerLabel = liveSpeakerParticipant?.name
    ?? liveSpeakerParticipantCat?.name
    ?? speakerCat?.name
    ?? normalizedStreamSpeakerLabel;

  const sortedBlocks = [...liveIndicator.contentBlocks].sort(
    (left, right) => left.index - right.index,
  );
  const lastBlock = sortedBlocks.at(-1);
  const showTrailingDots =
    liveIndicator.phase === 'streaming'
    && lastBlock != null
    && lastBlock.kind !== 'text';

  return (
    <article className="transcriptMessageStack transcriptMessageStackAgent typingIndicator">
      <div className="transcriptMessage transcriptMessageAgent">
        {liveSpeakerParticipant ? (
          <div className="transcriptMessageTop">
            <div
              className={buildParticipantAvatarClassName(
                liveSpeakerParticipant,
                {
                  transcript: true,
                  catRecord: liveSpeakerParticipantCat,
                },
              )}
              style={buildParticipantAvatarStyle(
                liveSpeakerParticipant,
                liveSpeakerParticipantCat,
              )}
            >
              {resolveParticipantAvatarUrl(
                liveSpeakerParticipant,
                liveSpeakerParticipantCat,
              ) ? null : catInitials(resolveParticipantDisplayName(
                liveSpeakerParticipant,
                liveSpeakerParticipantCat,
              ))}
            </div>
            <strong>{resolveParticipantDisplayName(
              liveSpeakerParticipant,
              liveSpeakerParticipantCat,
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
        {liveIndicator.phase === 'waiting' ? (
          <span className="typingDots"><span /><span /><span /></span>
        ) : sortedBlocks.length === 0 ? (
          showProgressDetails && liveIndicator.progressText ? (
            <p className="typingStatusText">{liveIndicator.progressText}</p>
          ) : (
            <span className="typingDots"><span /><span /><span /></span>
          )
        ) : (
          <>
            {sortedBlocks.map((block) =>
              renderContentBlockSegment(
                block,
                cats,
                selectedChannelId,
                disabledMentionNames,
                showProgressDetails,
              ),
            )}
            {showTrailingDots ? (
              <span className="typingDots"><span /><span /><span /></span>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
