import { useMemo, type RefCallback } from 'react';

import type {
  AppShellPayload,
  ConcurrentChatPresentationMode,
} from '../../../api/workspaceContracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import {
  buildChoiceResponsesBySource,
  resolveLatestUserTurnPresentationState,
  messageStackTone,
} from './chatViewSupport.js';
import { ChatTranscriptPanel, type TranscriptMessageActionContext } from './ChatTranscriptPanel.js';
import type {
  ConcurrentClusterAction,
  ConcurrentClusterActionContext,
  ConcurrentClusterContext,
} from './concurrentClusterUiState.js';
import type { TranscriptMessageActionDescriptor } from './TranscriptMessageActions.js';
import type { SelectedChannelView } from '../../workspaceChatUtils.js';

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
  onChoiceSubmit: (input: {
    channelId: string;
    messageId: string;
    choiceId: string;
    optionIds: string[];
    customValue?: string;
  }) => void;
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
  const choiceResponsesBySource = useMemo(
    () => buildChoiceResponsesBySource(selectedChannel.messages),
    [selectedChannel.messages],
  );
  const latestUserTurnPresentation = useMemo(
    () => resolveLatestUserTurnPresentationState({
      selectedChannel,
      visibleLiveIndicator: liveIndicator,
    }),
    [liveIndicator, selectedChannel],
  );

  return (
    <ChatTranscriptPanel
      hasConversationStarted={hasConversationStarted}
      greeting={greeting}
      transcriptListRef={transcriptListRef}
      bottomSentinelRef={bottomSentinelRef}
      selectedChannel={selectedChannel}
      visibleMessages={selectedChannel.messages.filter((message) =>
        payload.chat.showVerboseMessages || message.metadata?.verbosity !== 'verbose')}
      workflow={selectedChannel.roomRouting.workflow}
      cats={payload.chat.cats}
      bossCatId={payload.chat.bossCatId}
      selectedChannelId={selectedChannel.id}
      disabledMentionNames={directLaneExcludedMentionNames}
      busy={busy}
      compareBusy={false}
      isCompareGroup={false}
      choiceResponsesBySource={choiceResponsesBySource}
      onChoiceSubmit={onChoiceSubmit}
      latestUserTurnMessageId={latestUserTurnPresentation.messageId}
      latestUserTurnStatus={latestUserTurnPresentation.status}
      liveIndicator={liveIndicator}
      liveSpeakerParticipant={null}
      liveSpeakerParticipantCat={null}
      resolveLiveIndicatorSegmentParticipant={() => null}
      messageStackTone={messageStackTone}
      resolveMessageParticipant={() => null}
      resolveParticipantCatRecord={() => null}
      buildParticipantAvatarClassName={() => 'catAvatar transcriptAvatar'}
      buildParticipantAvatarStyle={() => undefined}
      resolveParticipantAvatarUrl={() => null}
      resolveParticipantDisplayName={() => ''}
      showLiveProgressDetails={payload.chat.showLiveProgressDetails === true}
      resolveConcurrentClusterPresentationMode={resolveConcurrentClusterPresentationMode}
      buildConcurrentClusterActions={buildConcurrentClusterActions}
      buildTranscriptMessageActions={buildTranscriptMessageActions}
    />
  );
}
