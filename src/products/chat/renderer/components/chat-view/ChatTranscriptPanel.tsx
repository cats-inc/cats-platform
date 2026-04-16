import {
  useEffect,
  useState,
  type CSSProperties,
  type Ref,
  type RefCallback,
} from 'react';

import type {
  ChatCat,
  ChatMessageChoiceResponse,
  ConcurrentChatPresentationMode,
  ParallelChatRelayCommandKind,
} from '../../../api/contracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import type { LiveIndicatorSegmentState } from '../../hooks/useLiveIndicator.js';
import type {
  MessageChoicesSubmitInput,
} from '../MessageChoices.js';
import type { SelectedChannelView } from '../../chatUtils.js';
import type {
  ResolvedChannelParticipant,
} from '../../../shared/channelParticipants.js';
import {
  resolveLiveIndicatorSegments,
} from '../../../../../shared/liveIndicator.js';
import {
  isBusyActive,
  isChoiceBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';
import { TranscriptMessageItem } from './TranscriptMessageItem.js';
import { LiveTranscriptIndicator } from './LiveTranscriptIndicator.js';

export interface ChatTranscriptPanelProps {
  hasConversationStarted: boolean;
  greeting: string;
  transcriptListRef: Ref<HTMLDivElement>;
  bottomSentinelRef: RefCallback<HTMLDivElement>;
  visibleMessages: SelectedChannelView['messages'];
  cats: ChatCat[];
  bossCatId: string | null;
  selectedChannelId: string;
  disabledMentionNames: string[];
  busy: WorkspaceBusyState;
  compareBusy: boolean;
  isCompareGroup: boolean;
  choiceResponsesBySource: Map<string, ChatMessageChoiceResponse>;
  onChoiceSubmit: (input: MessageChoicesSubmitInput) => void;
  latestUserTurnMessageId: string | null;
  latestUserTurnStatus: 'idle' | 'processing' | 'failed';
  onRetryMessage?: (messageId: string) => Promise<void>;
  onRelayMessage?: (messageId: string, command: ParallelChatRelayCommandKind) => Promise<void>;
  liveIndicator?: LiveIndicatorState;
  liveSpeakerParticipant: ResolvedChannelParticipant | null;
  liveSpeakerParticipantCat: ChatCat | null;
  resolveLiveIndicatorSegmentParticipant: (
    segment: LiveIndicatorSegmentState,
  ) => ResolvedChannelParticipant | null;
  messageStackTone: (senderKind: string) => string;
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
  showLiveProgressDetails?: boolean;
  concurrentPresentationMode?: ConcurrentChatPresentationMode;
}

export function ChatTranscriptPanel({
  hasConversationStarted,
  greeting,
  transcriptListRef,
  bottomSentinelRef,
  visibleMessages,
  cats,
  bossCatId,
  selectedChannelId,
  disabledMentionNames,
  busy,
  compareBusy,
  isCompareGroup,
  choiceResponsesBySource,
  onChoiceSubmit,
  latestUserTurnMessageId,
  latestUserTurnStatus,
  onRetryMessage,
  onRelayMessage,
  liveIndicator,
  liveSpeakerParticipant,
  liveSpeakerParticipantCat,
  resolveLiveIndicatorSegmentParticipant,
  messageStackTone,
  resolveMessageParticipant,
  resolveParticipantCatRecord,
  buildParticipantAvatarClassName,
  buildParticipantAvatarStyle,
  resolveParticipantAvatarUrl,
  resolveParticipantDisplayName,
  showLiveProgressDetails = false,
  concurrentPresentationMode,
}: ChatTranscriptPanelProps) {
  const [openRelayMenuId, setOpenRelayMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openRelayMenuId) {
      return;
    }

    function onClickOutside(event: MouseEvent): void {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.messageActionMenu')) {
        return;
      }
      setOpenRelayMenuId(null);
    }

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openRelayMenuId]);

  async function copyMessageBody(body: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Ignore clipboard failures; the message stays available in the transcript.
    }
  }

  if (!hasConversationStarted) {
    return (
      <section className="freshChatIntro">
        <div className="draftGreeting"><h1>{greeting}</h1></div>
      </section>
    );
  }

  const shouldRenderLiveTranscriptIndicator = Boolean(
    liveIndicator?.active
    && resolveLiveIndicatorSegments(liveIndicator).length > 0
  );

  return (
    <section className="transcriptPanel">
      <div ref={transcriptListRef} className="transcriptList">
        {visibleMessages.map((message) => (
            <TranscriptMessageItem
              key={message.id}
              message={message}
              stackClassName={messageStackTone(message.senderKind)}
              cats={cats}
              bossCatId={bossCatId}
              selectedChannelId={selectedChannelId}
              disabledMentionNames={disabledMentionNames}
              compareBusy={compareBusy}
              choiceBusy={isChoiceBusy(busy, message.id)}
              isCompareGroup={isCompareGroup}
              relayMenuOpen={openRelayMenuId === message.id}
              userTurnStatus={
                message.senderKind === 'user' && message.id === latestUserTurnMessageId
                  ? latestUserTurnStatus
                  : 'idle'
              }
              retryBusy={isBusyActive(busy)}
              existingChoiceResponse={choiceResponsesBySource.get(message.id) ?? null}
              onChoiceSubmit={onChoiceSubmit}
              onRetryMessage={onRetryMessage}
              onCopyMessage={copyMessageBody}
              onToggleRelayMenu={() =>
                setOpenRelayMenuId((current) =>
                  current === message.id ? null : message.id,
                )}
              onCloseRelayMenu={() => setOpenRelayMenuId(null)}
              onRelayMessage={onRelayMessage}
              resolveMessageParticipant={resolveMessageParticipant}
              resolveParticipantCatRecord={resolveParticipantCatRecord}
              buildParticipantAvatarClassName={buildParticipantAvatarClassName}
              buildParticipantAvatarStyle={buildParticipantAvatarStyle}
              resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
              resolveParticipantDisplayName={resolveParticipantDisplayName}
              showSpeakerHeader
            />
        ))}
        {shouldRenderLiveTranscriptIndicator && liveIndicator ? (
          <LiveTranscriptIndicator
            cats={cats}
            bossCatId={bossCatId}
            selectedChannelId={selectedChannelId}
            disabledMentionNames={disabledMentionNames}
            liveIndicator={liveIndicator}
            liveSpeakerParticipant={liveSpeakerParticipant}
            liveSpeakerParticipantCat={liveSpeakerParticipantCat}
            resolveLiveIndicatorSegmentParticipant={resolveLiveIndicatorSegmentParticipant}
            resolveParticipantCatRecord={resolveParticipantCatRecord}
            buildParticipantAvatarClassName={buildParticipantAvatarClassName}
            buildParticipantAvatarStyle={buildParticipantAvatarStyle}
            resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
            resolveParticipantDisplayName={resolveParticipantDisplayName}
            showProgressDetails={showLiveProgressDetails}
            concurrentPresentationMode={concurrentPresentationMode}
          />
        ) : null}
        <div ref={bottomSentinelRef} className="transcriptBottomSentinel" aria-hidden="true" />
      </div>
    </section>
  );
}
