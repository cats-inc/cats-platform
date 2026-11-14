import {
  Fragment,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Ref,
  type RefCallback,
  type ReactNode,
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
import { ConcurrentClusterRenderer } from '../../../../shared/renderer/components/conversation-view/ConcurrentClusterRenderer.js';
import { buildConcurrentTranscriptRenderItems } from '../../../../shared/renderer/components/conversation-view/concurrentTranscriptProjection.js';
import type {
  ConcurrentClusterAction,
  ConcurrentClusterActionContext,
  ConcurrentClusterContext,
} from '../../../../shared/renderer/components/conversation-view/concurrentClusterUiState.js';
import { LiveTranscriptIndicator } from '../../../../shared/renderer/components/conversation-view/LiveTranscriptIndicator.js';
import type { TranscriptMessageActionDescriptor } from './TranscriptMessageActions.js';
import { reconcileConversationPresentationLive } from '../../../../../shared/conversationPresentationLive.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import {
  currentDayKey,
  dayLabel,
  dayStartKeys,
  messageTimestamp,
  readMessageTime,
  subscribeDay,
} from '../../messageTime.js';

/**
 * The line that starts a new day in the transcript: Today, Yesterday, then the date. It alone follows the day
 * clock, so at midnight Today becomes Yesterday without redrawing the transcript.
 */
function TranscriptDayDivider({ at }: { at: Date }) {
  const { t, locale } = useI18n();
  // The server snapshot is the same day: server rendering (tests, previews) labels the dividers as the client does.
  useSyncExternalStore(subscribeDay, currentDayKey, currentDayKey);
  return (
    <div className="transcriptDayDivider" role="separator" data-tooltip={messageTimestamp(at, locale)}>
      <span>{dayLabel(at, new Date(), locale, {
        today: t(messageKeys.chatTranscriptDayToday),
        yesterday: t(messageKeys.chatTranscriptDayYesterday),
      })}</span>
    </div>
  );
}

export interface TranscriptMessageActionContext {
  message: SelectedChannelView['messages'][number];
  selectedChannel: SelectedChannelView;
}

export interface ConversationTranscriptPanelProps {
  readOnly?: boolean;
  hasConversationStarted: boolean;
  greeting: string;
  transcriptListRef: Ref<HTMLDivElement>;
  bottomSentinelRef: RefCallback<HTMLDivElement>;
  selectedChannel: SelectedChannelView;
  visibleMessages: SelectedChannelView['messages'];
  workflow: SelectedChannelView['roomRouting']['workflow'];
  cats: ChatCat[];
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
  /** In a direct message, the lane's cat: its face is the top bar's, so its bubbles carry none. */
  directLaneCatId?: string | null;
  resolveConcurrentClusterPresentationMode: (
    input: ConcurrentClusterContext,
  ) => ConcurrentChatPresentationMode;
  buildConcurrentClusterActions?: (
    input: ConcurrentClusterActionContext,
  ) => ReadonlyArray<ConcurrentClusterAction>;
  buildTranscriptMessageActions?: (
    input: TranscriptMessageActionContext,
  ) => ReadonlyArray<TranscriptMessageActionDescriptor>;
  historyControls?: ReactNode;
}

export function ConversationTranscriptPanel({
  readOnly = false,
  hasConversationStarted,
  greeting,
  transcriptListRef,
  bottomSentinelRef,
  selectedChannel,
  visibleMessages,
  workflow,
  cats,
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
  directLaneCatId = null,
  resolveConcurrentClusterPresentationMode,
  buildConcurrentClusterActions,
  buildTranscriptMessageActions,
  historyControls,
}: ConversationTranscriptPanelProps) {
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

  const reconciled = reconcileConversationPresentationLive(visibleMessages, liveIndicator);
  liveIndicator = reconciled.live;
  visibleMessages = reconciled.messages;
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
        readOnly={readOnly}
        key={String((message.metadata?.presentation as { id?: string } | undefined)?.id ?? message.id)}
        showProgressDetails={showLiveProgressDetails}
        message={message}
        stackClassName={messageStackTone(message.senderKind)}
        cats={cats}
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
        hideSpeakerCatId={directLaneCatId}
      />
    );
  }

  function renderItem(item: (typeof renderItems)[number]): ReactNode {
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
          hideSpeakerCatId={directLaneCatId}
          actions={clusterActions}
        />
      );
    }
    return renderTranscriptMessage(item.message);
  }

  // When a transcript item was sent: a message's time, a cluster's first message's. Each new day gets a divider
  // above its first item, counting only the messages shown (the verbose switch has filtered them already).
  function renderItemTime(item: (typeof renderItems)[number]): Date | null {
    return readMessageTime(item.kind === 'message' ? item.message.createdAt : item.messages[0]?.createdAt);
  }
  const dayStarts = dayStartKeys(renderItems, renderItemTime, (item) => item.key);

  return (
    <section className="transcriptPanel">
      <div ref={transcriptListRef} className="transcriptList">
        {historyControls}
        {renderItems.map((item) => (
          <Fragment key={item.key}>
            {dayStarts.has(item.key) ? <TranscriptDayDivider at={renderItemTime(item)!} /> : null}
            {renderItem(item)}
          </Fragment>
        ))}
        {shouldRenderLiveTranscriptIndicator && liveIndicator ? (
          <LiveTranscriptIndicator
            cats={cats}
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
            hideSpeakerCatId={directLaneCatId}
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
