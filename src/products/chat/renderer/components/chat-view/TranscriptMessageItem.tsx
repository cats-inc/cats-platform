import type { CSSProperties } from 'react';

import type {
  ChatCat,
  ChatMessageChoiceResponse,
  ParallelChatRelayCommandKind,
} from '../../../api/contracts.js';
import {
  catInitials,
  messageTone,
  resolveTranscriptMessageSpeaker,
  type SelectedChannelView,
} from '../../chatUtils.js';
import { MessageBody } from '../MessageBody.js';
import {
  MessageChoices,
  type MessageChoicesSubmitInput,
} from '../MessageChoices.js';
import { TranscriptMessageActions } from './TranscriptMessageActions.js';
import type {
  ResolvedChannelParticipant,
} from '../../../shared/channelParticipants.js';

export interface TranscriptMessageItemProps {
  message: SelectedChannelView['messages'][number];
  stackClassName: string;
  cats: ChatCat[];
  bossCatId: string | null;
  selectedChannelId: string;
  disabledMentionNames: string[];
  compareBusy: boolean;
  choiceBusy: boolean;
  isCompareGroup: boolean;
  relayMenuOpen: boolean;
  userTurnStatus: 'idle' | 'processing' | 'failed';
  retryBusy: boolean;
  existingChoiceResponse?: ChatMessageChoiceResponse | null;
  onChoiceSubmit: (input: MessageChoicesSubmitInput) => void;
  onRetryMessage?: (messageId: string) => Promise<void>;
  onCopyMessage: (body: string) => Promise<void>;
  onToggleRelayMenu: () => void;
  onCloseRelayMenu: () => void;
  onRelayMessage?: (messageId: string, command: ParallelChatRelayCommandKind) => Promise<void>;
  resolveMessageParticipant: (
    message: SelectedChannelView['messages'][number],
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
  showSpeakerHeader?: boolean;
}

export function TranscriptMessageItem({
  message,
  stackClassName,
  cats,
  bossCatId,
  selectedChannelId,
  disabledMentionNames,
  compareBusy,
  choiceBusy,
  isCompareGroup,
  relayMenuOpen,
  userTurnStatus,
  retryBusy,
  existingChoiceResponse = null,
  onChoiceSubmit,
  onRetryMessage,
  onCopyMessage,
  onToggleRelayMenu,
  onCloseRelayMenu,
  onRelayMessage,
  resolveMessageParticipant,
  resolveParticipantCatRecord,
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
  showSpeakerHeader = true,
}: TranscriptMessageItemProps) {
  const speaker = resolveTranscriptMessageSpeaker(message, cats);
  const transcriptParticipant = resolveMessageParticipant(message);
  const transcriptParticipantCat = resolveParticipantCatRecord(transcriptParticipant);

  return (
    <article className={stackClassName}>
      <div className={messageTone(message.senderKind)}>
        {showSpeakerHeader && message.senderKind !== 'user' && message.senderKind !== 'system' ? (
          transcriptParticipant ? (
            <div className="transcriptMessageTop">
              <div
                className={buildParticipantAvatarClassName(
                  transcriptParticipant,
                  {
                    transcript: true,
                    catRecord: transcriptParticipantCat,
                  },
                )}
                style={buildParticipantAvatarStyle(
                  transcriptParticipant,
                  transcriptParticipantCat,
                )}
              >
                {resolveParticipantAvatarUrl(
                  transcriptParticipant,
                  transcriptParticipantCat,
                ) ? null : catInitials(resolveParticipantDisplayName(
                  transcriptParticipant,
                  transcriptParticipantCat,
                ))}
              </div>
              <strong>{resolveParticipantDisplayName(
                transcriptParticipant,
                transcriptParticipantCat,
              )}</strong>
            </div>
          ) : speaker.kind === 'cat' && speaker.cat ? (
            <div className="transcriptMessageTop">
              <div
                className={speaker.cat.id === bossCatId
                  ? 'catAvatar catAvatarBoss transcriptAvatar'
                  : 'catAvatar transcriptAvatar'}
                style={speaker.cat.avatarUrl
                  ? {
                      backgroundImage: `url(${speaker.cat.avatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : speaker.cat.avatarColor ? { background: speaker.cat.avatarColor } : undefined}
              >
                {speaker.cat.avatarUrl ? null : catInitials(speaker.cat.name)}
              </div>
              <strong>{speaker.label}</strong>
            </div>
          ) : speaker.label ? (
            <div className="transcriptMessageTop">
              <strong>{speaker.label}</strong>
            </div>
          ) : null
        ) : null}
        {message.body ? (
          <MessageBody
            body={message.body}
            cats={cats}
            channelId={selectedChannelId}
            disabledMentionNames={disabledMentionNames}
          />
        ) : null}
        {message.senderKind === 'user' && userTurnStatus === 'processing' ? (
          <div className="userTurnStatus userTurnStatusProcessing" aria-label="Preparing response">
            <span className="typingDots userTurnStatusDots" aria-hidden="true"><span /><span /><span /></span>
          </div>
        ) : null}
        {message.senderKind === 'user' && userTurnStatus === 'failed' ? (
          <div className="userTurnStatus userTurnStatusFailed">Response failed</div>
        ) : null}
      </div>
      <TranscriptMessageActions
        messageId={message.id}
        messageBody={message.body}
        senderKind={message.senderKind}
        compareBusy={compareBusy}
        isCompareGroup={isCompareGroup}
        relayMenuOpen={relayMenuOpen}
        showRetryAction={userTurnStatus === 'failed'}
        retryBusy={retryBusy}
        onRetryMessage={onRetryMessage}
        onCopyMessage={onCopyMessage}
        onToggleRelayMenu={onToggleRelayMenu}
        onCloseRelayMenu={onCloseRelayMenu}
        onRelayMessage={onRelayMessage}
      />

      {message.choices && message.choices.length > 0 ? (
        <MessageChoices
          channelId={selectedChannelId}
          messageId={message.id}
          choices={message.choices}
          existingResponse={existingChoiceResponse}
          busy={choiceBusy}
          onSubmit={onChoiceSubmit}
        />
      ) : null}
    </article>
  );
}
