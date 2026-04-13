import { useMemo, type RefCallback } from 'react';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import type { LiveIndicatorContentBlock, LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import {
  catInitials,
  messageTone,
  resolveTranscriptMessageSpeaker,
  type SelectedChannelView,
} from '../../workspaceChatUtils.js';
import { MessageBody } from '../MessageBody.js';
import {
  MessageChoices,
  type MessageChoicesSubmitInput,
} from '../MessageChoices.js';
import {
  shouldRenderLiveTranscriptBlock,
  shouldShowLiveTranscriptTrailingDots,
  stripLeadingLiveTranscriptBlankLines,
} from './liveTranscriptBlockSupport.js';

export interface ChatTranscriptSurfaceProps {
  hasConversationStarted: boolean;
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  busy: string;
  greeting: string;
  liveIndicator?: LiveIndicatorState;
  directLaneExcludedMentionNames: string[];
  transcriptListRef: RefCallback<HTMLDivElement>;
  bottomSentinelRef: RefCallback<HTMLDivElement>;
  onChoiceSubmit: (input: MessageChoicesSubmitInput) => void;
}

export function ChatTranscriptSurface({
  hasConversationStarted,
  payload,
  selectedChannel,
  busy,
  greeting,
  liveIndicator,
  directLaneExcludedMentionNames,
  transcriptListRef,
  bottomSentinelRef,
  onChoiceSubmit,
}: ChatTranscriptSurfaceProps) {
  const defaultRecipientId = selectedChannel.roomRouting.defaultRecipientId;
  const choiceResponsesBySource = useMemo(() => {
    const responses = new Map<
      string,
      NonNullable<(typeof selectedChannel.messages)[number]['choiceResponse']>
    >();
    for (const message of selectedChannel.messages) {
      if (message.choiceResponse?.sourceMessageId) {
        responses.set(message.choiceResponse.sourceMessageId, message.choiceResponse);
      }
    }
    return responses;
  }, [selectedChannel.messages]);

  if (!hasConversationStarted) {
    return (
      <section className="freshChatIntro">
        <div className="draftGreeting"><h1>{greeting}</h1></div>
      </section>
    );
  }

  return (
    <section className="transcriptPanel">
      <div ref={transcriptListRef} className="transcriptList">
        {selectedChannel.messages
          .filter((message) => payload.chat.showVerboseMessages || message.metadata?.verbosity !== 'verbose')
          .map((message) => (
            <article key={message.id} className={messageTone(message.senderKind)}>
              {message.senderKind !== 'user' && message.senderKind !== 'system' ? (() => {
                const speaker = resolveTranscriptMessageSpeaker(message, payload.chat.cats);
                return speaker.kind === 'cat' && speaker.cat ? (() => {
                  const isBoss = speaker.cat.id === payload.chat.bossCatId;
                  const isLead = speaker.cat.id === defaultRecipientId;
                  return (
                    <div className="transcriptMessageTop">
                      <div
                        className={isBoss ? 'catAvatar catAvatarBoss transcriptAvatar' : 'catAvatar transcriptAvatar'}
                        style={speaker.cat.avatarUrl
                          ? { backgroundImage: `url(${speaker.cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                          : speaker.cat.avatarColor ? { background: speaker.cat.avatarColor } : undefined}
                      >
                        {speaker.cat.avatarUrl ? null : catInitials(speaker.cat.name)}
                        {isLead ? <span className="catAvatarLeadBadge">&#x2605;</span> : null}
                      </div>
                      <strong>{speaker.label}</strong>
                    </div>
                  );
                })() : speaker.label ? (
                  <div className="transcriptMessageTop">
                    <strong>{speaker.label}</strong>
                  </div>
                ) : null;
              })() : null}
              {message.body ? (
                <MessageBody
                  body={message.body}
                  cats={payload.chat.cats}
                  channelId={selectedChannel.id}
                  disabledMentionNames={directLaneExcludedMentionNames}
                />
              ) : null}
              {message.choices && message.choices.length > 0 ? (
                <MessageChoices
                  channelId={selectedChannel.id}
                  messageId={message.id}
                  choices={message.choices}
                  existingResponse={choiceResponsesBySource.get(message.id) ?? null}
                  busy={busy.startsWith(`choice:${message.id}:`)}
                  onSubmit={onChoiceSubmit}
                />
              ) : null}
            </article>
          ))}
        {liveIndicator?.active ? (() => {
          const speakerCat = liveIndicator.catId
            ? payload.chat.cats.find((cat) => cat.id === liveIndicator.catId) ?? null
            : null;
          const speakerLabel = speakerCat?.name ?? liveIndicator.speakerLabel;
          const showProgressDetails = payload.chat.showLiveProgressDetails === true;
          const sortedBlocks = [...liveIndicator.contentBlocks].sort(
            (left, right) => left.index - right.index,
          );
          const lastBlock = sortedBlocks.at(-1);
          const showTrailingDots = shouldShowLiveTranscriptTrailingDots(
            liveIndicator.phase,
            lastBlock,
          );

          function renderBlock(block: LiveIndicatorContentBlock): JSX.Element | null {
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
                  cats={payload.chat.cats}
                  channelId={selectedChannel.id}
                  disabledMentionNames={directLaneExcludedMentionNames}
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
              return <p key={block.id} className="typingStatusText">{block.text}</p>;
            }
            return null;
          }

          const renderedBlocks = sortedBlocks
            .map(renderBlock)
            .filter((block): block is JSX.Element => block != null);

          return (
            <article className="transcriptMessage transcriptMessageAgent typingIndicator">
              {speakerCat ? (
                <div className="transcriptMessageTop">
                  <div
                    className={speakerCat.id === payload.chat.bossCatId ? 'catAvatar catAvatarBoss transcriptAvatar' : 'catAvatar transcriptAvatar'}
                    style={speakerCat.avatarUrl
                      ? { backgroundImage: `url(${speakerCat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
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
              ) : renderedBlocks.length === 0 ? (
                showProgressDetails && liveIndicator.progressText ? (
                  <p className="typingStatusText">{liveIndicator.progressText}</p>
                ) : (
                  <span className="typingDots"><span /><span /><span /></span>
                )
              ) : (
                <>
                  {renderedBlocks}
                  {showTrailingDots ? (
                    <span className="typingDots"><span /><span /><span /></span>
                  ) : null}
                </>
              )}
            </article>
          );
        })() : null}
        <div ref={bottomSentinelRef} className="transcriptBottomSentinel" aria-hidden="true" />
      </div>
    </section>
  );
}
