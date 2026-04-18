import type { CSSProperties } from 'react';

import type {
  ChatCat,
  ChatMessageChoiceResponse,
  ParallelChatRelayCommandKind,
} from '../../../api/workspaceContracts.js';
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
  RelayActionIcon,
  RetryActionIcon,
  TranscriptMessageActions,
  type TranscriptMessageActionDescriptor,
} from './TranscriptMessageActions.js';
import type {
  ResolvedChannelParticipant,
} from '../../../channelParticipants.js';

const relayActions: Array<{
  command: ParallelChatRelayCommandKind;
  label: string;
}> = [
  { command: 'check_this', label: 'Check with others' },
  { command: 'synthesize_this', label: 'Synthesize with others' },
  { command: 'improve_this', label: 'Improve in others' },
  { command: 'adopt_this', label: 'Adopt in others' },
  { command: 'counter_this', label: 'Counter with others' },
  { command: 'debate_this', label: 'Debate with others' },
];

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
  extraActions?: ReadonlyArray<TranscriptMessageActionDescriptor>;
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
  extraActions = [],
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
  const resolvedExtraActions: TranscriptMessageActionDescriptor[] = [...extraActions];

  if (message.senderKind === 'user' && userTurnStatus === 'failed' && onRetryMessage) {
    resolvedExtraActions.push({
      key: `retry:${message.id}`,
      title: 'Retry response',
      icon: <RetryActionIcon />,
      disabled: retryBusy,
      onSelect: () => {
        void onRetryMessage(message.id);
      },
    });
  }

  if (isCompareGroup && message.senderKind !== 'user' && onRelayMessage) {
    resolvedExtraActions.push({
      key: `relay:${message.id}`,
      kind: 'menu',
      title: 'Relay to others',
      icon: <RelayActionIcon />,
      disabled: compareBusy,
      open: relayMenuOpen,
      onToggle: onToggleRelayMenu,
      items: relayActions.map((action, index) => ({
        key: action.command,
        label: action.label,
        disabled: compareBusy,
        dividerBefore: index === 2 || index === 4,
        onSelect: () => {
          onCloseRelayMenu();
          void onRelayMessage(message.id, action.command);
        },
      })),
    });
  }

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
        {message.senderKind === 'user' && userTurnStatus === 'failed' ? (
          <div className="userTurnStatus userTurnStatusFailed">Response failed</div>
        ) : null}
      </div>
      <TranscriptMessageActions
        senderKind={message.senderKind}
        showDefaultCopyAction={message.body.trim().length > 0}
        onCopyMessage={() => {
          void onCopyMessage(message.body);
        }}
        extraActions={resolvedExtraActions}
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
