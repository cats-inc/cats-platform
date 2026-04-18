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
} from '../../../api/workspaceContracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import type { LiveIndicatorSegmentState } from '../../hooks/useLiveIndicator.js';
import type {
  MessageChoicesSubmitInput,
} from '../MessageChoices.js';
import type { SelectedChannelView } from '../../workspaceChatUtils.js';
import type {
  ResolvedChannelParticipant,
} from '../../../channelParticipants.js';
import {
  resolveLiveIndicatorSegments,
} from '../../../../../shared/liveIndicator.js';
import {
  isBusyActive,
  isChoiceBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';
import { TranscriptMessageItem } from './TranscriptMessageItem.js';
import { ConcurrentClusterRenderer } from '../../../../shared/renderer/components/chat-view/ConcurrentClusterRenderer.js';
import { buildConcurrentTranscriptRenderItems } from '../../../../shared/renderer/components/chat-view/concurrentTranscriptProjection.js';
import type {
  ConcurrentClusterAction,
  ConcurrentClusterActionContext,
  ConcurrentClusterContext,
} from '../../../../shared/renderer/components/chat-view/concurrentClusterUiState.js';
import { LiveTranscriptIndicator } from '../../../../shared/renderer/components/chat-view/LiveTranscriptIndicator.js';
import type { TranscriptMessageActionDescriptor } from './TranscriptMessageActions.js';

export interface TranscriptMessageActionContext {
  message: SelectedChannelView['messages'][number];
  selectedChannel: SelectedChannelView;
}

export interface ChatTranscriptPanelProps {
  hasConversationStarted: boolean;
  greeting: string;
  transcriptListRef: Ref<HTMLDivElement>;
  bottomSentinelRef: RefCallback<HTMLDivElement>;
  selectedChannel: SelectedChannelView;
  visibleMessages: SelectedChannelView['messages'];
  workflow: SelectedChannelView['roomRouting']['workflow'];
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
  resolveConcurrentClusterPresentationMode: (
    input: ConcurrentClusterContext,
  ) => ConcurrentChatPresentationMode;
  buildConcurrentClusterActions?: (
    input: ConcurrentClusterActionContext,
  ) => ReadonlyArray<ConcurrentClusterAction>;
  buildTranscriptMessageActions?: (
    input: TranscriptMessageActionContext,
  ) => ReadonlyArray<TranscriptMessageActionDescriptor>;
}

export function ChatTranscriptPanel({
  hasConversationStarted,
  greeting,
  transcriptListRef,
  bottomSentinelRef,
  selectedChannel,
  visibleMessages,
  workflow,
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
  resolveConcurrentClusterPresentationMode,
  buildConcurrentClusterActions,
  buildTranscriptMessageActions,
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
  const liveIndicatorSegments = liveIndicator?.active
    ? resolveLiveIndicatorSegments(liveIndicator)
    : [];
  const renderItems = buildConcurrentTranscriptRenderItems({
    visibleMessages,
    workflow,
  });

  function renderTranscriptMessage(
    message: SelectedChannelView['messages'][number],
  ): JSX.Element {
    return (
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
        extraActions={buildTranscriptMessageActions?.({
          message,
          selectedChannel,
        }) ?? []}
        resolveMessageParticipant={resolveMessageParticipant}
        resolveParticipantCatRecord={resolveParticipantCatRecord}
        buildParticipantAvatarClassName={buildParticipantAvatarClassName}
        buildParticipantAvatarStyle={buildParticipantAvatarStyle}
        resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
        resolveParticipantDisplayName={resolveParticipantDisplayName}
        showSpeakerHeader
      />
    );
  }

  return (
    <section className="transcriptPanel">
      <div ref={transcriptListRef} className="transcriptList">
        {renderItems.map((item) => {
          if (item.kind === 'concurrent_cluster') {
            const clusterContext: ConcurrentClusterContext = {
              turnId: item.turnId,
              sourceMessageId: item.sourceMessageId,
              segmentCount: item.segments.length,
              clusterKind: 'durable',
            };
            const resolvedClusterMode = resolveConcurrentClusterPresentationMode(clusterContext);
            if (resolvedClusterMode === 'inline_stack') {
              return item.messages.map((message) => renderTranscriptMessage(message));
            }
            const clusterActions = buildConcurrentClusterActions?.({
              ...clusterContext,
              resolvedMode: resolvedClusterMode,
            }) ?? [];
            return (
              <ConcurrentClusterRenderer
                key={item.key}
                mode={resolvedClusterMode}
                segments={item.segments}
                cats={cats}
                bossCatId={bossCatId}
                selectedChannelId={selectedChannelId}
                disabledMentionNames={disabledMentionNames}
                liveSpeakerParticipant={null}
                liveSpeakerParticipantCat={null}
                resolveLiveIndicatorSegmentParticipant={resolveLiveIndicatorSegmentParticipant}
                resolveParticipantCatRecord={resolveParticipantCatRecord}
                buildParticipantAvatarClassName={buildParticipantAvatarClassName}
                buildParticipantAvatarStyle={buildParticipantAvatarStyle}
                resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
                resolveParticipantDisplayName={resolveParticipantDisplayName}
                showProgressDetails={showLiveProgressDetails}
                actions={clusterActions}
              />
            );
          }
          return renderTranscriptMessage(item.message);
        })}
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
            concurrentPresentationMode={(() => {
              const liveTurnId = workflow.activeTurn?.id;
              if (!liveTurnId) {
                return 'inline_stack';
              }
              return resolveConcurrentClusterPresentationMode({
                turnId: liveTurnId,
                sourceMessageId:
                  liveIndicator.sourceMessageId
                  ?? workflow.activeTurn?.sourceMessageId
                  ?? '',
                segmentCount: liveIndicatorSegments.length,
                clusterKind: 'live',
              });
            })()}
            concurrentActions={(() => {
              const liveTurnId = workflow.activeTurn?.id;
              if (!liveTurnId || !buildConcurrentClusterActions) {
                return [];
              }
              const resolvedMode = resolveConcurrentClusterPresentationMode({
                turnId: liveTurnId,
                sourceMessageId:
                  liveIndicator.sourceMessageId
                  ?? workflow.activeTurn?.sourceMessageId
                  ?? '',
                segmentCount: liveIndicatorSegments.length,
                clusterKind: 'live',
              });
              return buildConcurrentClusterActions({
                turnId: liveTurnId,
                sourceMessageId:
                  liveIndicator.sourceMessageId
                  ?? workflow.activeTurn?.sourceMessageId
                  ?? '',
                segmentCount: liveIndicatorSegments.length,
                clusterKind: 'live',
                resolvedMode,
              });
            })()}
          />
        ) : null}
        <div ref={bottomSentinelRef} className="transcriptBottomSentinel" aria-hidden="true" />
      </div>
    </section>
  );
}
