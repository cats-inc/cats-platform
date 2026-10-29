import { ConversationMessage, ConversationSegmentBody } from '@cats-inc/platform-ui-web';
import { readConversationPresentation, splitConversationPresentation, conversationPlainText } from '@cats-inc/platform-ui-web/contracts';
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
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { resolveLocalizedChatMessageBody } from '../../../../../shared/chatMessageLocalization.js';
import { CompanionMessageReferencePreviews } from './CompanionMessageReferencePreviews.js';
import { CatImageAttachment } from './CatImageAttachment.js';
import {
  MessageChoices,
  type MessageChoicesSubmitInput,
} from '../MessageChoices.js';
import {
  RelayActionIcon,
  RetryActionIcon,
  type TranscriptMessageActionDescriptor,
} from './TranscriptMessageActions.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import type {
  ResolvedChannelParticipant,
} from '../../../channelParticipants.js';
import { isAdminCat } from '../../../catGroups.js';

const relayActions: Array<{
  command: ParallelChatRelayCommandKind;
  titleLabel: keyof typeof messageKeys;
}> = [
  { command: 'check_this', titleLabel: 'chatTranscriptMessageCheckWithOthersLabel' },
  { command: 'synthesize_this', titleLabel: 'chatTranscriptMessageSynthesizeWithOthersLabel' },
  { command: 'improve_this', titleLabel: 'chatTranscriptMessageImproveWithOthersLabel' },
  { command: 'adopt_this', titleLabel: 'chatTranscriptMessageAdoptWithOthersLabel' },
  { command: 'counter_this', titleLabel: 'chatTranscriptMessageCounterWithOthersLabel' },
  { command: 'debate_this', titleLabel: 'chatTranscriptMessageDebateWithOthersLabel' },
];

export interface TranscriptMessageItemProps {
  message: SelectedChannelView['messages'][number];
  stackClassName: string;
  cats: ChatCat[];
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
  showProgressDetails?: boolean;
}

export function TranscriptMessageItem({
  message,
  stackClassName,
  cats,
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
  showProgressDetails = false,
}: TranscriptMessageItemProps) {
  const { t } = useI18n();
  const speaker = resolveTranscriptMessageSpeaker(message, cats, t);
  const displayBody = resolveLocalizedChatMessageBody(message, t);
  const presentation = readConversationPresentation(message.metadata?.presentation);
  const transcriptParticipant = resolveMessageParticipant(message);
  const transcriptParticipantCat = resolveParticipantCatRecord(transcriptParticipant);
  const resolvedExtraActions: TranscriptMessageActionDescriptor[] = [...extraActions];

  if (message.senderKind === 'user' && userTurnStatus === 'failed' && onRetryMessage) {
    resolvedExtraActions.push({
      key: `retry:${message.id}`,
      title: t(messageKeys.chatTranscriptMessageRetryResponseLabel),
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
      title: t(messageKeys.chatTranscriptMessageRelayToOthersLabel),
      icon: <RelayActionIcon />,
      disabled: compareBusy,
      open: relayMenuOpen,
      onToggle: onToggleRelayMenu,
      items: relayActions.map((action, index) => ({
        key: action.command,
        label: t(action.titleLabel),
        disabled: compareBusy,
        dividerBefore: index === 2 || index === 4,
        onSelect: () => {
          onCloseRelayMenu();
          void onRelayMessage(message.id, action.command);
        },
      })),
    });
  }

  const speakerHeader = (showSpeakerHeader && message.senderKind !== 'user' && message.senderKind !== 'system' ? (
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
                className={isAdminCat(speaker.cat)
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
        ) : null);
  const parts = presentation ? splitConversationPresentation(presentation).filter(part =>
    part.phase !== 'sealed' || part.blocks.some(block => block.kind === 'text'
      ? block.text.trim() : showProgressDetails || block.status === 'error')) : [null];
  return <>{parts.map((part, index) => {
    const last = index === parts.length - 1;
    const body = part ? conversationPlainText(part.blocks) : displayBody;
    return (
    <ConversationMessage
      key={part?.id ?? message.id}
      id={part?.id}
      senderKind={message.senderKind}
      stackClassName={stackClassName}
      bubbleClassName={messageTone(message.senderKind)}
      speaker={index === 0 ? speakerHeader : null}
      copyLabel={t(messageKeys.chatTranscriptMessageCopyLabel)}
      showCopy={body.trim().length > 0}
      onCopy={() => { void onCopyMessage(body); }}
      actions={last ? resolvedExtraActions : []}
      afterBubble={last && message.choices && message.choices.length > 0 ? (
        <MessageChoices channelId={selectedChannelId} messageId={message.id}
          choices={message.choices} existingResponse={existingChoiceResponse}
          busy={choiceBusy} onSubmit={onChoiceSubmit} />
      ) : null}
    >
        {last ? <CatImageAttachment key={message.id} metadata={message.metadata} /> : null}
        {part ? <ConversationSegmentBody phase={part.phase} blocks={part.blocks}
          showProgressDetails={showProgressDetails}
          labels={{ tool: t(messageKeys.chatConcurrentToolLabel), input: t(messageKeys.chatConversationToolInput),
            result: t(messageKeys.chatConversationToolResult), noResult: t(messageKeys.chatConversationNoResult), error: t(messageKeys.chatConversationToolError) }}
          renderText={body => <MessageBody body={body} cats={cats} channelId={selectedChannelId}
            disabledMentionNames={disabledMentionNames} format="markdown" />} /> : displayBody ? (
          <MessageBody
            body={displayBody}
            cats={cats}
            channelId={selectedChannelId}
            disabledMentionNames={disabledMentionNames}
            format={message.senderKind === 'agent' ? 'markdown' : 'plain'}
          />
        ) : null}
        {last ? <CompanionMessageReferencePreviews
          body={displayBody}
          metadata={message.metadata}
        /> : null}
        {message.senderKind === 'user' && userTurnStatus === 'failed' ? (
          <div className="userTurnStatus userTurnStatusFailed">
            {t(messageKeys.chatTranscriptMessageFailedStatusLabel)}
          </div>
        ) : null}
    </ConversationMessage>
    );
  })}</>;
}
