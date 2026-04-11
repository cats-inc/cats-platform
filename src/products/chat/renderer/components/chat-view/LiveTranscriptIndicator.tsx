import type { CSSProperties } from 'react';

import type { ChatCat } from '../../../api/contracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import { catInitials } from '../../chatUtils.js';
import { normalizeVisibleOrchestratorLabel } from '../../../../../shared/orchestratorLabel.js';
import { MessageBody } from '../MessageBody.js';
import type {
  ResolvedChannelParticipant,
} from '../../../shared/channelParticipants.js';
import {
  resolveLiveIndicatorPreviewBody,
} from '../../../../shared/renderer/components/chat-view/liveTranscriptIndicatorSupport.js';

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
  const livePreviewText = liveIndicator.previewText ?? '';
  const hasContentBlocks = liveIndicator.contentBlocks.length > 0;
  const showPreviewText = !hasContentBlocks && livePreviewText.trim().length > 0;
  const activeTools = liveIndicator.tools.filter((tool) => !tool.done);
  const simplifiedPreviewText = resolveLiveIndicatorPreviewBody(liveIndicator);
  const showSimplifiedPreviewText = simplifiedPreviewText.trim().length > 0;

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
        ) : !showProgressDetails ? (
          showSimplifiedPreviewText ? (
            <MessageBody
              body={simplifiedPreviewText}
              cats={cats}
              channelId={selectedChannelId}
              disabledMentionNames={disabledMentionNames}
            />
          ) : (
            <span className="typingDots"><span /><span /><span /></span>
          )
        ) : (
          <>
            {showPreviewText ? (
              <MessageBody
                body={liveIndicator.previewText}
                cats={cats}
                channelId={selectedChannelId}
                disabledMentionNames={disabledMentionNames}
              />
            ) : liveIndicator.progressText ? (
              <p className="typingStatusText">{liveIndicator.progressText}</p>
            ) : (
              <span className="typingDots"><span /><span /><span /></span>
            )}
            {!showPreviewText && !hasContentBlocks && activeTools.map((tool) => (
              <span key={tool.toolId} className="typingToolChip">{tool.toolName}</span>
            ))}
            {hasContentBlocks ? (
              <div className="typingContentBlocks">
                {liveIndicator.contentBlocks.map((block) => (
                  <div
                    key={block.id}
                    className={[
                      'typingContentBlock',
                      block.kind === 'text'
                        ? 'typingContentBlockText'
                        : block.kind === 'tool'
                          ? 'typingContentBlockTool'
                          : 'typingContentBlockStatus',
                      block.status === 'streaming'
                        ? 'typingContentBlockStreaming'
                        : block.status === 'error'
                          ? 'typingContentBlockError'
                          : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {block.kind !== 'text' && block.title ? (
                      <span className="typingContentBlockTitle">{block.title}</span>
                    ) : null}
                    {block.text ? (
                      <span className="typingContentBlockBody">{block.text}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : liveIndicator.events.length > 0 ? (
              <div className="typingEventTape">
                {liveIndicator.events.map((event, index) => (
                  <div
                    key={`${event.eventType}:${event.toolId ?? ''}:${index}`}
                    className={[
                      'typingEventRow',
                      event.tone === 'active'
                        ? 'typingEventRowActive'
                        : event.tone === 'success'
                          ? 'typingEventRowSuccess'
                          : event.tone === 'error'
                            ? 'typingEventRowError'
                            : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="typingEventLabel">{event.label}</span>
                    <span className="typingEventText">{event.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}
