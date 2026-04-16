import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import type {
  AppShellPayload,
  ChatChannelView,
  ParallelChatGroupSummary,
  ParallelChatRelayCommandKind,
} from '../../api/contracts';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import { isParallelChatBusy } from '../../../../shared/workspaceBusy.js';
import { resolveCatStatusIndicator } from '../../shared/catStatusResolution';
import { CatStatusRow } from './CatStatusRow';
import type {
  LiveIndicatorSegmentState,
  LiveIndicatorState,
} from '../hooks/useLiveIndicator';
import {
  resolveTranscriptFollowState,
  hasConfirmedLiveIndicatorSegmentSessionStart,
} from '../../../../shared/liveIndicator.js';
import { isBrowserLiveTraceEnabled } from '../../../../shared/liveTrace.js';
import { SidePanel } from '../../../../design/components/SidePanel';
import {
  resolveLayoutMetrics,
  type ChatLayoutMode,
} from '../../../../design/chatLayout';
import {
  presentChannelTitle,
  type SelectedChannelView,
} from '../chatUtils';
import type { ChatOperatorSnapshot } from '../../shared/operator-loop/index';
import {
  buildChatOperatorView,
  buildRunInspectorView,
} from '../../shared/operator-loop/index';
import { type ModelSelectorValue } from './ModelSelector';
import {
  type MessageChoicesSubmitInput,
} from './MessageChoices';
import {
  type ResolvedChannelParticipant,
} from '../../shared/channelParticipants';
import {
  isDirectConversationMode,
  isSoloThreadConversationMode,
  resolveConversationMode,
} from '../conversationMode';
import { ChatViewFrame } from '../../../shared/renderer/components/chat-view/ChatViewFrame';
import { ChatViewTopBar } from '../../../shared/renderer/components/chat-view/ChatViewTopBar';
import {
  useChatParticipantPresentation,
} from '../hooks/useChatParticipantPresentation';
import { useTranscriptAutoScroll } from '../hooks/useTranscriptAutoScroll';
import { buildChatSidePanelSections } from './chat-view/ChatSidePanelSections';
import { ChatComposerArea } from './chat-view/ChatComposerArea';
import { ParallelFooterBar } from './chat-view/ParallelFooterBar';
import { ChatTranscriptPanel } from './chat-view/ChatTranscriptPanel';
import {
  dismissConcurrentClusterUiState,
  resolveConcurrentClusterPresentationMode,
  type ConcurrentClusterActionContext,
  type ConcurrentClusterContext,
  type ConcurrentClusterUiStateMap,
} from './chat-view/concurrentClusterUiState';
import {
  buildChatComposerRecipients,
  buildChatComposerStackParticipants,
  buildChoiceResponsesBySource,
  resolveLatestUserTurnPresentationState,
  messageStackTone,
  resolveChatComposerViewState,
  resolveChatViewCompareState,
  resolveChatViewTopBarPresenceState,
  resolveChatViewTopBarTitle,
  resolveShowRosterAvatars,
} from './chat-view/chatViewSupport';
import { buildChatLaneId } from '../../../../shared/chatCoreIds.js';

let _lastLiveIndicatorLogSignature: string | null = null;

export interface ChatViewProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  routeChannelId?: string | null;
  operatorSnapshot: ChatOperatorSnapshot | null;
  operatorLoading: boolean;
  operatorError: string;
  composerDraft: string;
  busy: WorkspaceBusyState;
  feedback: string;
  greeting: string;
  channelFiles: File[];
  channelPlusMenuOpen: boolean;
  channelPlusMenuRef: RefObject<HTMLDivElement>;
  channelFileInputRef: RefObject<HTMLInputElement>;
  activeAssignedCats: SelectedChannelView['assignedCats'];
  bossCatName: string;
  bossCatAvatarColor: string | null;
  showBossCatAvatar: boolean;
  onComposerChange: (value: string) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: (event: FormEvent<HTMLFormElement>) => void;
  onCancelPendingSend?: () => void;
  onStopMessage?: () => void;
  onToggleChannelPlusMenu: () => void;
  onChannelFileSelect: () => void;
  onChannelFilesChange: (files: File[]) => void;
  onApprovalDecision: (taskId: string, action: 'approve' | 'reroute' | 'reject') => void;
  onChoiceSubmit: (input: MessageChoicesSubmitInput) => void;
  onRetryMessage?: (messageId: string) => Promise<void>;
  onResumeChannel?: () => void;
  onOperatorAction: (input: {
    action: 'retry' | 'acknowledge';
    taskId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
  }) => void;
  autoResize: (el: HTMLTextAreaElement) => void;
  selectedModel?: ModelSelectorValue;
  onModelChange?: (value: ModelSelectorValue) => void;
  onDirectLaneModelChange?: (catId: string, value: ModelSelectorValue) => void;
  activeWorkflowShape?: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys?: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  onSelect: (channelId: string) => void;
  onOpenAddCat?: () => void;
  showAddCatButton?: boolean;
  liveIndicator?: LiveIndicatorState;
  onToggleCompanionMode?: () => void;
  compareGroup?: ParallelChatGroupSummary | null;
  compareSendScope?: 'all_members' | 'active_only';
  onCompareSendScopeChange?: (value: 'all_members' | 'active_only') => void;
  onRelayMessage?: (messageId: string, command: ParallelChatRelayCommandKind) => Promise<void>;
  onUpdateChannelParticipant?: (
    participantId: string,
    input: { name?: string; roleHint?: string | null },
  ) => Promise<void>;
}

export function ChatView({
  payload,
  selectedChannel,
  routeChannelId = null,
  operatorSnapshot,
  operatorLoading,
  operatorError,
  composerDraft,
  busy,
  feedback,
  greeting,
  channelFiles,
  channelPlusMenuOpen,
  channelPlusMenuRef,
  channelFileInputRef,
  activeAssignedCats,
  bossCatName,
  bossCatAvatarColor,
  showBossCatAvatar,
  onComposerChange,
  onComposerKeyDown,
  onSendMessage,
  onCancelPendingSend,
  onStopMessage,
  onToggleChannelPlusMenu,
  onChannelFileSelect,
  onChannelFilesChange,
  onApprovalDecision,
  onChoiceSubmit,
  onRetryMessage,
  onResumeChannel,
  onOperatorAction,
  autoResize,
  selectedModel,
  onModelChange,
  onDirectLaneModelChange,
  activeWorkflowShape = 'sequential',
  onToggleActiveWorkflowShape,
  activeAudienceKeys = null,
  onSetActiveAudienceKeys,
  onSelect,
  onOpenAddCat,
  showAddCatButton = true,
  liveIndicator,
  onToggleCompanionMode,
  compareGroup = null,
  compareSendScope = 'all_members',
  onCompareSendScopeChange,
  onRelayMessage,
  onUpdateChannelParticipant,
}: ChatViewProps) {
  const visibleMessages = selectedChannel.messages.filter(
    (message) => payload.chat.showVerboseMessages || message.metadata?.verbosity !== 'verbose',
  );
  const hasConversationStarted = visibleMessages.length > 0;
  const transcriptFollowState = useMemo(
    () => resolveTranscriptFollowState(
      liveIndicator,
      visibleMessages,
      selectedChannel.roomRouting.workflow.activeTurn?.updatedAt ?? null,
      selectedChannel.messages,
    ),
    [
      liveIndicator,
      selectedChannel.messages,
      selectedChannel.roomRouting.workflow.activeTurn?.updatedAt,
      visibleMessages,
    ],
  );
  const { visibleLiveIndicator, transcriptScrollKey } = transcriptFollowState;

  const conversationMode = resolveConversationMode(selectedChannel);
  const compareState = useMemo(
    () => resolveChatViewCompareState({
      compareGroup,
      channels: payload.chat.channels,
      routeChannelId,
      selectedChannelId: selectedChannel.id,
      busy,
    }),
    [busy, compareGroup, payload.chat.channels, routeChannelId, selectedChannel.id],
  );
  const {
    compareMembers,
    isCompareGroup,
    activeCompareChannelId,
    compareMemberIndex,
    compareBusy,
    comparePrevChannelId,
    compareNextChannelId,
  } = compareState;

  const isSoloComposer = isSoloThreadConversationMode(conversationMode);
  const isDirectLane = isDirectConversationMode(conversationMode);
  const {
    activeRoomParticipants,
    defaultRecipientParticipant,
    defaultRecipientCat,
    directLaneCat,
    bossCatRecord,
    defaultRecipientCatRecord,
    assignedCatRecords,
    assignedAdhocParticipants,
    topBarParticipants,
    resolveParticipantCatRecord,
    resolveParticipantDisplayName,
    resolveParticipantAvatarUrl,
    buildParticipantAvatarStyle,
    buildParticipantAvatarClassName,
    resolveMessageParticipant,
  } = useChatParticipantPresentation({
    payload,
    selectedChannel,
    activeAssignedCats,
    showBossCatAvatar,
    isDirectLane,
    isSoloComposer,
  });
  const layoutMode: ChatLayoutMode = isDirectLane
    ? 'direct_lane'
    : activeRoomParticipants.length > 1
      ? 'multi_cat'
      : 'solo';
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cats');
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editingParticipantName, setEditingParticipantName] = useState('');
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const [concurrentClusterUiStateByKey, setConcurrentClusterUiStateByKey] =
    useState<ConcurrentClusterUiStateMap>({});
  const resolveConcurrentClusterMode = useCallback(
    (context: ConcurrentClusterContext) =>
      resolveConcurrentClusterPresentationMode({
        channelId: selectedChannel.id,
        turnId: context.turnId,
        userDefault: payload.chat.concurrentPresentationMode ?? 'inline_stack',
        segmentCount: context.segmentCount,
        viewportWidth,
        workflowRecommendation: null,
        uiStateByKey: concurrentClusterUiStateByKey,
      }),
    [
      concurrentClusterUiStateByKey,
      payload.chat.concurrentPresentationMode,
      selectedChannel.id,
      viewportWidth,
    ],
  );
  const buildConcurrentClusterActions = useCallback(
    (context: ConcurrentClusterActionContext) => {
      if (context.resolvedMode === 'inline_stack') {
        return [];
      }
      return [
        {
          key: `dismiss:${context.turnId}`,
          label: 'Dismiss',
          title: 'Dismiss layout',
          onSelect: () => {
            setConcurrentClusterUiStateByKey((previous) =>
              dismissConcurrentClusterUiState(previous, {
                channelId: selectedChannel.id,
                turnId: context.turnId,
              }));
          },
        },
      ];
    },
    [selectedChannel.id],
  );
  function openSidePanelTo(section: string): void {
    setSidePanelOpen(true);
    setSidePanelSection(section);
  }

  const topBarTitle = resolveChatViewTopBarTitle({
    isDirectLane,
    directLaneCat,
    defaultRecipientCatRecord,
    selectedChannelTitle: selectedChannel.title,
    isCompareGroup,
    compareGroup,
  });
  const showRosterAvatars = resolveShowRosterAvatars({
    isDirectLane,
    defaultRecipientCat,
    showBossCatAvatar,
    isSoloComposer,
    activeRoomParticipants,
  });
  const composerStackParticipants = useMemo(
    () => buildChatComposerStackParticipants({
      activeRoomParticipants,
      bossCatId: payload.chat.bossCatId,
      resolveParticipantCatRecord,
      resolveParticipantDisplayName,
    }),
    [
      activeRoomParticipants,
      payload.chat.bossCatId,
      resolveParticipantCatRecord,
      resolveParticipantDisplayName,
    ],
  );
  const operatorView = useMemo(
    () => buildChatOperatorView(operatorSnapshot, selectedChannel),
    [operatorSnapshot, selectedChannel],
  );
  const choiceResponsesBySource = useMemo(
    () => buildChoiceResponsesBySource(selectedChannel.messages),
    [selectedChannel.messages],
  );
  const latestUserTurnPresentation = useMemo(
    () => resolveLatestUserTurnPresentationState({
      selectedChannel,
      visibleLiveIndicator,
    }),
    [selectedChannel, visibleLiveIndicator],
  );
  const runIdsKey = useMemo(
    () => operatorView?.runs.map((run) => run.id).join('|') ?? '',
    [operatorView],
  );
  const topBarPresenceState = useMemo(
    () => resolveChatViewTopBarPresenceState({
      visibleLiveIndicator,
      selectedChannel,
      activeRoomParticipants,
    }),
    [activeRoomParticipants, selectedChannel, visibleLiveIndicator],
  );
  const { activeTopBarCatIds, activeTopBarParticipantIds, liveSpeakerParticipant } =
    topBarPresenceState;
  const resolveLiveIndicatorSegmentParticipant = useCallback(
    (segment: LiveIndicatorSegmentState) => {
      if (segment.participantId) {
        const byParticipantId = activeRoomParticipants.find(
          (participant) => participant.participantId === segment.participantId,
        ) ?? null;
        if (byParticipantId) {
          return byParticipantId;
        }
      }

      const confirmedIdentityParticipantId = (() => {
        const identityParticipantId = segment.identityParticipantId?.trim() || null;
        if (!identityParticipantId || identityParticipantId === segment.participantId) {
          return null;
        }
        return hasConfirmedLiveIndicatorSegmentSessionStart(segment, selectedChannel.messages)
          ? identityParticipantId
          : null;
      })();
      if (confirmedIdentityParticipantId) {
        const byIdentityParticipantId = activeRoomParticipants.find(
          (participant) => participant.participantId === confirmedIdentityParticipantId,
        ) ?? null;
        if (byIdentityParticipantId) {
          return byIdentityParticipantId;
        }
      }

      if (segment.catId) {
        const byCatId = activeRoomParticipants.find((participant) =>
          resolveParticipantCatRecord(participant)?.id === segment.catId)
          ?? null;
        if (byCatId) {
          return byCatId;
        }
      }

      if (segment.phase === 'sealed') {
        const workflowTurnHistory = Array.isArray(selectedChannel.roomRouting.workflow.turnHistory)
          ? selectedChannel.roomRouting.workflow.turnHistory
          : [];
        const matchingWorkflowTarget = [
          selectedChannel.roomRouting.workflow.activeTurn,
          ...workflowTurnHistory,
        ]
          .filter((turn): turn is NonNullable<typeof selectedChannel.roomRouting.workflow.activeTurn> =>
            turn != null)
          .flatMap((turn) =>
            turn.targetStatuses.map((target) => ({
              participantId: target.participant.participantId,
              targetStateId: target.id,
              laneId: target.laneId?.trim() || buildChatLaneId(
                turn.id,
                target.id,
                target.participant.participantId,
              ),
            })))
          .find((target) =>
            (segment.targetStateId != null && target.targetStateId === segment.targetStateId)
            || (segment.laneId != null && target.laneId === segment.laneId));

        if (matchingWorkflowTarget) {
          const byWorkflowTarget = activeRoomParticipants.find(
            (participant) => participant.participantId === matchingWorkflowTarget.participantId,
          ) ?? null;
          if (byWorkflowTarget) {
            return byWorkflowTarget;
          }
        }
      }

      const normalizedSpeakerLabel = segment.speakerLabel?.trim();
      if (!normalizedSpeakerLabel) {
        return null;
      }

      return activeRoomParticipants.find((participant) => {
        const participantCat = resolveParticipantCatRecord(participant);
        return resolveParticipantDisplayName(participant, participantCat) === normalizedSpeakerLabel;
      }) ?? null;
    },
    [
      activeRoomParticipants,
      resolveParticipantCatRecord,
      resolveParticipantDisplayName,
    ],
  );
  const activeTopBarCatIdSet = useMemo(
    () => new Set(activeTopBarCatIds),
    [activeTopBarCatIds],
  );
  const activeTopBarParticipantIdSet = useMemo(
    () => new Set(activeTopBarParticipantIds),
    [activeTopBarParticipantIds],
  );
  const composerRecipients = useMemo(() => {
    return buildChatComposerRecipients({
      isDirectLane,
      directLaneCat,
      isSoloComposer,
      selectedModel,
      defaultRecipientParticipant,
      bossCatId: payload.chat.bossCatId,
      resolveParticipantCatRecord,
      resolveParticipantDisplayName,
    });
  }, [
    defaultRecipientParticipant,
    directLaneCat,
    isDirectLane,
    isSoloComposer,
    payload.chat.bossCatId,
    selectedModel,
  ]);
  const layoutMetrics = useMemo(
    () => resolveLayoutMetrics(layoutMode, viewportWidth),
    [layoutMode, viewportWidth],
  );
  const layoutStyle = useMemo<CSSProperties>(
    () => ({
      '--chat-transcript-max-width': layoutMetrics.transcriptMaxWidth,
    } as CSSProperties),
    [layoutMetrics.transcriptMaxWidth],
  );
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(null);

  useEffect(() => {
    setInspectedRunId((current) => {
      if (current && operatorView?.runs.some((run) => run.id === current)) {
        return current;
      }

      return operatorView?.latestRun?.id ?? null;
    });
  }, [operatorView?.latestRun?.id, runIdsKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    function handleResize(): void {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const inspectedRun = useMemo(
    () => buildRunInspectorView(operatorView, inspectedRunId),
    [operatorView, inspectedRunId],
  );
  const {
    participantChipLabel,
    directLaneModelValue,
    directLaneExcludedMentionNames,
    composerBusy,
    composerAckBusy,
    resumeBusy,
    showCancelComposerAction,
    showStopComposerAction,
    composerWorkspacePath,
  } = useMemo(
    () => resolveChatComposerViewState({
      activeRoomParticipants,
      directLaneCat: isDirectLane ? directLaneCat : null,
      busy,
      isCompareGroup,
      selectedChannelId: selectedChannel.id,
      onCancelPendingSend,
      onStopMessage,
      repoPath: selectedChannel.repoPath,
      chatCwd: selectedChannel.chatCwd,
    }),
    [
      activeRoomParticipants,
      busy,
      directLaneCat,
      isCompareGroup,
      isDirectLane,
      onCancelPendingSend,
      onStopMessage,
      selectedChannel.chatCwd,
      selectedChannel.id,
      selectedChannel.repoPath,
    ],
  );
  const canResumeChannel = !composerBusy && !resumeBusy;
  const stopBusy = isParallelChatBusy(busy, 'stop');
  const { transcriptListRef, composerCardRef, bottomSentinelRef, isNearBottom, scrollToBottom } = useTranscriptAutoScroll({
    channelId: selectedChannel.id,
    scrollKey: transcriptScrollKey,
    scrollOnChannelChange: true,
  });

  useLayoutEffect(() => {
    if (!visibleLiveIndicator?.active || !isNearBottom) {
      return;
    }

    scrollToBottom();
  }, [isNearBottom, scrollToBottom, transcriptScrollKey, visibleLiveIndicator?.active]);

  function navigateCompareMember(direction: 'prev' | 'next'): void {
    const channelId = direction === 'prev' ? comparePrevChannelId : compareNextChannelId;
    if (!channelId) {
      return;
    }

    onSelect(channelId);
  }

  function beginParticipantRename(participant: ResolvedChannelParticipant): void {
    setEditingParticipantId(participant.participantId);
    setEditingParticipantName(participant.name);
  }

  function cancelParticipantRename(): void {
    setEditingParticipantId(null);
    setEditingParticipantName('');
  }

  async function submitParticipantRename(participantId: string): Promise<void> {
    const nextName = editingParticipantName.trim();
    if (!nextName || !onUpdateChannelParticipant) {
      return;
    }
    await onUpdateChannelParticipant(participantId, { name: nextName });
    cancelParticipantRename();
  }

  return (
    <ChatViewFrame
      conversationMode={conversationMode}
      layoutMode={layoutMode}
      composerVariant={layoutMetrics.composerVariant}
      secondarySurfacePosition={layoutMetrics.secondarySurfacePosition}
      layoutStyle={layoutStyle}
      hasConversationStarted={hasConversationStarted}
      topBar={(
        <ChatViewTopBar
          avatars={topBarParticipants.map((participant) => ({
            key: participant.key,
            label: participant.label,
            executionLabel: participant.executionLabel,
            avatarColor: participant.avatarColor,
            avatarUrl: participant.avatarUrl,
            isBoss: participant.isBoss,
            useNeutralAvatar: participant.useNeutralAvatar,
            pulsing: Boolean(
              (participant.pulseParticipantId
                && activeTopBarParticipantIdSet.has(participant.pulseParticipantId))
              || (participant.pulseCatId && activeTopBarCatIdSet.has(participant.pulseCatId)),
            ),
          }))}
          showRosterAvatars={showRosterAvatars}
          isDirectLane={isDirectLane}
          topBarTitle={topBarTitle}
          canResumeChannel={canResumeChannel}
          resumeBusy={resumeBusy}
          sidePanelOpen={sidePanelOpen}
          approvalCount={operatorView?.approvals.length ?? 0}
          extraActions={isDirectLane && onToggleCompanionMode ? (
            <button
              className="companionToggleButton"
              type="button"
              onClick={onToggleCompanionMode}
              title="Open companion workspace"
            >
              Companion
            </button>
          ) : null}
          onResumeChannel={onResumeChannel}
          onToggleSidePanel={() => setSidePanelOpen(!sidePanelOpen)}
        />
      )}
      statusRow={layoutMetrics.catStatusRowVisible ? (() => {
        const catStatusIndicators = activeAssignedCats
          .map((assignment) => {
            const cat = payload.chat.cats.find((c) => c.id === assignment.catId);
            if (!cat) return null;
            return resolveCatStatusIndicator(
              cat,
              selectedChannel as unknown as ChatChannelView,
              operatorView,
            );
          })
          .filter((indicator): indicator is NonNullable<typeof indicator> => indicator !== null);
        return catStatusIndicators.length > 0 ? (
          <CatStatusRow
            indicators={catStatusIndicators}
            onInspect={(catId) => openSidePanelTo(`cat:${catId}`)}
          />
        ) : null;
      })() : null}
      sidePanel={sidePanelOpen ? (
        <SidePanel
          title="Chat Setup"
          activeSection={sidePanelSection}
          onSectionToggle={setSidePanelSection}
          onClose={() => setSidePanelOpen(false)}
          position={layoutMetrics.secondarySurfacePosition === 'bottom' ? 'bottom' : 'side'}
          className="chatPaneSidePanel chatPaneSidePanelBelowBar"
          sections={buildChatSidePanelSections({
            payload,
            selectedChannel,
            busy,
            operatorView,
            operatorLoading,
            operatorError,
            assignedCatRecords,
            assignedAdhocParticipants,
            defaultRecipientCatId: defaultRecipientCat?.catId ?? null,
            defaultRecipientParticipant,
            directLaneCat,
            directLaneModelValue,
            isDirectLane,
            isSoloComposer,
            selectedModel,
            inspectedRun,
            showAddCatButton,
            editingParticipantId,
            editingParticipantName,
            canRenameParticipants: onUpdateChannelParticipant != null,
            onEditingParticipantNameChange: setEditingParticipantName,
            onBeginParticipantRename: beginParticipantRename,
            onCancelParticipantRename: cancelParticipantRename,
            onSubmitParticipantRename: (participantId) => {
              void submitParticipantRename(participantId);
            },
            onOpenAddCat,
            onCloseSidePanel: () => setSidePanelOpen(false),
            onInspectRun: setInspectedRunId,
            onApprovalDecision,
            onOperatorAction,
            onModelChange,
            onDirectLaneModelChange,
            buildParticipantAvatarStyle,
          })}
        />
      ) : null}
    >

            <ChatTranscriptPanel
              hasConversationStarted={hasConversationStarted}
              greeting={greeting}
              transcriptListRef={transcriptListRef}
              bottomSentinelRef={bottomSentinelRef}
              visibleMessages={visibleMessages}
              workflow={selectedChannel.roomRouting.workflow}
              cats={payload.chat.cats}
              bossCatId={payload.chat.bossCatId}
              selectedChannelId={selectedChannel.id}
              disabledMentionNames={directLaneExcludedMentionNames}
              busy={busy}
              compareBusy={compareBusy}
              isCompareGroup={isCompareGroup}
              choiceResponsesBySource={choiceResponsesBySource}
              onChoiceSubmit={onChoiceSubmit}
              latestUserTurnMessageId={latestUserTurnPresentation.messageId}
              latestUserTurnStatus={latestUserTurnPresentation.status}
              onRetryMessage={onRetryMessage}
              onRelayMessage={onRelayMessage}
              liveIndicator={(() => {
                if (visibleLiveIndicator?.active && isBrowserLiveTraceEnabled()) {
                  const ss = visibleLiveIndicator.segments?.length
                    ? visibleLiveIndicator.segments
                    : [visibleLiveIndicator];
                  const sig = visibleLiveIndicator.phase + ':' + ss.length + ':' + ss.map((s) => {
                    const blockDetail = s.contentBlocks
                      .map((b) => b.kind + '#' + b.index + ':' + b.status)
                      .join('|');
                    const metaDetail = [
                      s.targetStateId ? 'ts:' + s.targetStateId : null,
                      s.sessionId ? 'sid:' + s.sessionId : null,
                      s.participantId ? 'pid:' + s.participantId : null,
                      s.speakerLabel ? 'sp:' + s.speakerLabel : null,
                      s.progressKind ? 'pk:' + s.progressKind : null,
                      s.progressText ? 'pt:' + s.progressText : null,
                      s.tools.length > 0 ? 'tools:' + s.tools.map((tool) => `${tool.toolName}:${tool.done ? 'done' : 'pending'}`).join(',') : null,
                      s.events.length > 0 ? 'events:' + s.events.map((event) => event.eventType).join(',') : null,
                    ]
                      .filter((detail): detail is string => detail != null && detail.length > 0)
                      .join('|');
                    return `${s.phase}:si${s.segmentIndex}:${blockDetail || metaDetail || 'empty'}`;
                  }).join(';');
                  if (sig !== _lastLiveIndicatorLogSignature) {
                    _lastLiveIndicatorLogSignature = sig;
                    console.log('[CV] li ph=' + visibleLiveIndicator.phase + ' segs=' + ss.length + ' detail=' + JSON.stringify(
                      sig.split(';'),
                    ) + ' nb=' + (isNearBottom ? '1' : '0'));
                  }
                }
                return visibleLiveIndicator ?? undefined;
              })()}
              liveSpeakerParticipant={liveSpeakerParticipant}
              liveSpeakerParticipantCat={resolveParticipantCatRecord(liveSpeakerParticipant)}
              resolveLiveIndicatorSegmentParticipant={resolveLiveIndicatorSegmentParticipant}
              messageStackTone={messageStackTone}
              resolveMessageParticipant={resolveMessageParticipant}
              resolveParticipantCatRecord={resolveParticipantCatRecord}
              buildParticipantAvatarClassName={buildParticipantAvatarClassName}
              buildParticipantAvatarStyle={buildParticipantAvatarStyle}
              resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
              resolveParticipantDisplayName={resolveParticipantDisplayName}
              showLiveProgressDetails={payload.chat.showLiveProgressDetails === true}
              resolveConcurrentClusterPresentationMode={resolveConcurrentClusterMode}
              buildConcurrentClusterActions={buildConcurrentClusterActions}
            />

            <ChatComposerArea
              hasConversationStarted={hasConversationStarted}
              isCompareGroup={isCompareGroup}
              isNearBottom={isNearBottom}
              payload={payload}
              composerDraft={composerDraft}
              channelFiles={channelFiles}
              channelPlusMenuOpen={channelPlusMenuOpen}
              channelPlusMenuRef={channelPlusMenuRef}
              channelFileInputRef={channelFileInputRef}
              composerBusy={composerBusy}
              compareBusy={compareBusy}
              stopBusy={stopBusy}
              composerWorkspacePath={composerWorkspacePath}
              directLaneExcludedMentionNames={directLaneExcludedMentionNames}
              composerRecipients={composerRecipients}
              defaultRecipientParticipantId={defaultRecipientParticipant?.participantId ?? null}
              composerStackParticipants={composerStackParticipants}
              isDirectLane={isDirectLane}
              isSoloComposer={isSoloComposer}
              activeWorkflowShape={activeWorkflowShape}
              onToggleActiveWorkflowShape={onToggleActiveWorkflowShape}
              activeAudienceKeys={activeAudienceKeys}
              onSetActiveAudienceKeys={onSetActiveAudienceKeys}
              compareSendScope={compareSendScope}
              showCancelComposerAction={showCancelComposerAction}
              showStopComposerAction={showStopComposerAction}
              composerCardRef={composerCardRef}
              onOpenSection={openSidePanelTo}
              onComposerChange={onComposerChange}
              onComposerKeyDown={onComposerKeyDown}
              onSendMessage={onSendMessage}
              onToggleChannelPlusMenu={onToggleChannelPlusMenu}
              onChannelFileSelect={onChannelFileSelect}
              onChannelFilesChange={onChannelFilesChange}
              onScrollToBottom={scrollToBottom}
              onCompareSendScopeChange={onCompareSendScopeChange}
              onCancelPendingSend={onCancelPendingSend}
              onStopMessage={onStopMessage}
              autoResize={autoResize}
            />
            {isCompareGroup ? (
              <ParallelFooterBar
                compareMembers={compareMembers}
                selectedChannelId={activeCompareChannelId}
                comparePrevChannelId={comparePrevChannelId}
                compareNextChannelId={compareNextChannelId}
                onSelect={onSelect}
                onNavigatePrev={() => navigateCompareMember('prev')}
                onNavigateNext={() => navigateCompareMember('next')}
              />
            ) : null}
    </ChatViewFrame>
  );
}
