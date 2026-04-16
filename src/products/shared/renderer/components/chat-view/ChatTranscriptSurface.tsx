import { useMemo, type RefCallback } from 'react';

import type {
  AppShellPayload,
  ConcurrentChatPresentationMode,
} from '../../../api/workspaceContracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import {
  catInitials,
  messageTone,
  resolveTranscriptMessageSpeaker,
  type SelectedChannelView,
} from '../../workspaceChatUtils.js';
import {
  resolveLiveIndicatorSegments,
} from '../../../../../shared/liveIndicator.js';
import {
  isChoiceBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';
import { MessageBody } from '../MessageBody.js';
import {
  MessageChoices,
  type MessageChoicesSubmitInput,
} from '../MessageChoices.js';
import { ConcurrentClusterRenderer } from './ConcurrentClusterRenderer.js';
import {
  buildConcurrentTranscriptRenderItems,
} from './concurrentTranscriptProjection.js';
import type {
  ConcurrentClusterAction,
  ConcurrentClusterActionContext,
  ConcurrentClusterContext,
} from './concurrentClusterUiState.js';
import { LiveTranscriptIndicator } from './LiveTranscriptIndicator.js';
import {
  TranscriptMessageActions,
  type TranscriptMessageActionDescriptor,
} from './TranscriptMessageActions.js';

export interface TranscriptMessageActionContext {
  message: SelectedChannelView['messages'][number];
  selectedChannel: SelectedChannelView;
}

export interface ChatTranscriptSurfaceProps {
  hasConversationStarted: boolean;
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  busy: WorkspaceBusyState;
  greeting: string;
  liveIndicator?: LiveIndicatorState;
  directLaneExcludedMentionNames: string[];
  transcriptListRef: RefCallback<HTMLDivElement>;
  bottomSentinelRef: RefCallback<HTMLDivElement>;
  onChoiceSubmit: (input: MessageChoicesSubmitInput) => void;
  resolveConcurrentClusterPresentationMode: (
    input: ConcurrentClusterContext,
  ) => ConcurrentChatPresentationMode;
  buildConcurrentClusterActions: (
    input: ConcurrentClusterActionContext,
  ) => ReadonlyArray<ConcurrentClusterAction>;
  buildTranscriptMessageActions?: (
    input: TranscriptMessageActionContext,
  ) => ReadonlyArray<TranscriptMessageActionDescriptor>;
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
  resolveConcurrentClusterPresentationMode,
  buildConcurrentClusterActions,
  buildTranscriptMessageActions,
}: ChatTranscriptSurfaceProps) {
  const defaultRecipientId = selectedChannel.roomRouting.defaultRecipientId;
  const showProgressDetails = payload.chat.showLiveProgressDetails === true;
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

  const visibleMessages = selectedChannel.messages.filter((message) =>
    payload.chat.showVerboseMessages || message.metadata?.verbosity !== 'verbose');
  const renderItems = buildConcurrentTranscriptRenderItems({
    visibleMessages,
    workflow: selectedChannel.roomRouting.workflow,
  });
  const liveIndicatorSegments = liveIndicator?.active
    ? resolveLiveIndicatorSegments(liveIndicator)
    : [];

  async function copyMessageBody(body: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Ignore clipboard failures; the message stays available in the transcript.
    }
  }

  function renderTranscriptMessage(
    message: (typeof selectedChannel.messages)[number],
  ): JSX.Element {
    const hasCopyableBody = message.body.trim().length > 0;
    const extraActions = buildTranscriptMessageActions?.({
      message,
      selectedChannel,
    }) ?? [];
    return (
      <article key={message.id} className={messageTone(message.senderKind)}>
        {message.senderKind !== 'user' && message.senderKind !== 'system' ? (() => {
          const speaker = resolveTranscriptMessageSpeaker(message, payload.chat.cats);
          return speaker.kind === 'cat' && speaker.cat ? (() => {
            const isBoss = speaker.cat.id === payload.chat.bossCatId;
            const isLead = speaker.cat.id === defaultRecipientId;
            return (
              <div className="transcriptMessageTop">
                <div
                  className={isBoss
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
        <TranscriptMessageActions
          senderKind={message.senderKind}
          showDefaultCopyAction={hasCopyableBody}
          onCopyMessage={hasCopyableBody
            ? () => {
                void copyMessageBody(message.body);
              }
            : undefined}
          extraActions={extraActions}
        />
        {message.choices && message.choices.length > 0 ? (
          <MessageChoices
            channelId={selectedChannel.id}
            messageId={message.id}
            choices={message.choices}
            existingResponse={choiceResponsesBySource.get(message.id) ?? null}
            busy={isChoiceBusy(busy, message.id)}
            onSubmit={onChoiceSubmit}
          />
        ) : null}
      </article>
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
            const resolvedMode = resolveConcurrentClusterPresentationMode(clusterContext);
            if (resolvedMode === 'inline_stack') {
              return item.messages.map((message) => renderTranscriptMessage(message));
            }
            const clusterActions = buildConcurrentClusterActions({
              ...clusterContext,
              resolvedMode,
            });
            return (
              <ConcurrentClusterRenderer<never>
                key={item.key}
                mode={resolvedMode}
                segments={item.segments}
                cats={payload.chat.cats}
                bossCatId={payload.chat.bossCatId}
                selectedChannelId={selectedChannel.id}
                disabledMentionNames={directLaneExcludedMentionNames}
                liveSpeakerParticipant={null}
                liveSpeakerParticipantCat={null}
                resolveLiveIndicatorSegmentParticipant={() => null}
                resolveParticipantCatRecord={() => null}
                buildParticipantAvatarClassName={() => 'catAvatar transcriptAvatar'}
                buildParticipantAvatarStyle={() => undefined}
                resolveParticipantAvatarUrl={() => null}
                resolveParticipantDisplayName={() => ''}
                showProgressDetails={showProgressDetails}
                actions={clusterActions}
              />
            );
          }
          return renderTranscriptMessage(item.message);
        })}
        {liveIndicator?.active ? (
          <LiveTranscriptIndicator<never>
            cats={payload.chat.cats}
            bossCatId={payload.chat.bossCatId}
            selectedChannelId={selectedChannel.id}
            disabledMentionNames={directLaneExcludedMentionNames}
            liveIndicator={liveIndicator}
            liveSpeakerParticipant={null}
            liveSpeakerParticipantCat={null}
            resolveLiveIndicatorSegmentParticipant={() => null}
            resolveParticipantCatRecord={() => null}
            buildParticipantAvatarClassName={() => 'catAvatar transcriptAvatar'}
            buildParticipantAvatarStyle={() => undefined}
            resolveParticipantAvatarUrl={() => null}
            resolveParticipantDisplayName={() => ''}
            showProgressDetails={showProgressDetails}
            concurrentPresentationMode={(() => {
              const liveTurnId = selectedChannel.roomRouting.workflow.activeTurn?.id;
              if (!liveTurnId) {
                return 'inline_stack';
              }
              return resolveConcurrentClusterPresentationMode({
                turnId: liveTurnId,
                sourceMessageId:
                  liveIndicator.sourceMessageId
                  ?? selectedChannel.roomRouting.workflow.activeTurn?.sourceMessageId
                  ?? '',
                segmentCount: liveIndicatorSegments.length,
                clusterKind: 'live',
              });
            })()}
            concurrentActions={(() => {
              const liveTurnId = selectedChannel.roomRouting.workflow.activeTurn?.id;
              if (!liveTurnId) {
                return [];
              }
              const resolvedMode = resolveConcurrentClusterPresentationMode({
                turnId: liveTurnId,
                sourceMessageId:
                  liveIndicator.sourceMessageId
                  ?? selectedChannel.roomRouting.workflow.activeTurn?.sourceMessageId
                  ?? '',
                segmentCount: liveIndicatorSegments.length,
                clusterKind: 'live',
              });
              return buildConcurrentClusterActions({
                turnId: liveTurnId,
                sourceMessageId:
                  liveIndicator.sourceMessageId
                  ?? selectedChannel.roomRouting.workflow.activeTurn?.sourceMessageId
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
