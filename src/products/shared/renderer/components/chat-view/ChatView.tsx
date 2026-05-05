import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DependencyList,
  type EffectCallback,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useNavigate } from 'react-router-dom';

import type {
  AppShellPayload,
  ChatChannelView,
  ChatCat,
  ParallelChatGroupSummary,
  ParallelChatRelayCommandKind,
} from '../../../api/workspaceContracts.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import { isParallelChatBusy } from '../../../../../shared/workspaceBusy.js';
import type {
  LiveIndicatorSegmentState,
  LiveIndicatorState,
} from '../../hooks/useLiveIndicator.js';
import {
  hasConfirmedLiveIndicatorSegmentSessionStart,
  resolveTranscriptFollowState,
} from '../../../../../shared/liveIndicator.js';
import { SidePanel, type SidePanelSection } from '../../../../../design/components/SidePanel.js';
import {
  resolveLayoutMetrics,
  type ChatLayoutMode,
} from '../../../../../design/chatLayout.js';
import type { ChatOperatorSnapshot, ChatOperatorView, ChatRunInspectorView } from '../../../operator-loop/index.js';
import {
  buildChatOperatorView,
  buildRunInspectorView,
} from '../../../operator-loop/index.js';
import type { ResolvedChannelParticipant } from '../../../channelParticipants.js';
import { type ExecutionTargetValue } from '../ExecutionTarget.js';
import type { MessageChoicesSubmitInput } from '../MessageChoices.js';
import {
  isDirectConversationMode,
  isSoloThreadConversationMode,
  resolveConversationMode,
} from '../../../../../app/renderer/productShell/conversationMode.js';
import { useTranscriptAutoScroll } from '../../hooks/useTranscriptAutoScroll.js';
import { useWorkspaceParticipantPresentation } from '../../hooks/useWorkspaceParticipantPresentation.js';
import { ChatViewFrame } from './ChatViewFrame.js';
import { ChatViewTopBar } from './ChatViewTopBar.js';
import { buildChatSidePanelSections, type BuildChatSidePanelSectionsOptions } from './ChatSidePanelSections.js';
import { ChatComposerArea } from './ChatComposerArea.js';
import { ChatComposerTargetSlot } from './ChatComposerTargetSlot.js';
import { ParallelFooterBar } from './ParallelFooterBar.js';
import { ChatTranscriptPanel, type TranscriptMessageActionContext } from './ChatTranscriptPanel.js';
import {
  dismissConcurrentClusterUiState,
  loadConcurrentClusterUiStateMap,
  resolveConcurrentClusterPresentationMode,
  type ConcurrentClusterActionContext,
  type ConcurrentClusterContext,
  type ConcurrentClusterUiStateMap,
  writeConcurrentClusterUiStateMap,
} from './concurrentClusterUiState.js';
import {
  buildChatComposerRecipients,
  buildChatComposerStackParticipants,
  buildChoiceResponsesBySource,
  messageStackTone,
  resolveChatComposerViewState,
  resolveChatViewCompareState,
  resolveChatViewTopBarPresenceState,
  resolveChatViewTopBarTitle,
  resolveShowRosterAvatars,
  type ChatComposerStackParticipantView,
} from './chatViewSupport.js';
import type { TranscriptMessageActionDescriptor } from './TranscriptMessageActions.js';
import {
  presentChannelTitle,
  type SelectedChannelView,
} from '../../workspaceChatUtils.js';
import { buildChatLaneId } from '../../../../../shared/chatCoreIds.js';
import { isBrowserLiveTraceEnabled } from '../../../../../shared/liveTrace.js';
import {
  resolveConversationBehaviorPreferences,
  type ConversationBehaviorSurface,
} from '../../../conversationBehavior.js';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';

let _lastLiveIndicatorLogSignature: string | null = null;
let _lastLiveIndicatorLogAt: number | null = null;

function buildLiveTraceSegmentDetail(segment: LiveIndicatorSegmentState): string {
  const blockDetail = segment.contentBlocks
    .map((block) => {
      const base = block.kind + '#' + block.index + ':' + block.status;
      if (block.kind === 'text') {
        const trimmed = block.text.trim();
        if (trimmed.length === 0) {
          return base + '(empty)';
        }
        if (trimmed.length < 40) {
          return base + '(len' + trimmed.length + ')';
        }
        if (trimmed.length < 400) {
          return base + '(len~' + Math.floor(trimmed.length / 40) * 40 + ')';
        }
        return base + '(len~' + Math.floor(trimmed.length / 400) * 400 + ')';
      }
      return base;
    })
    .join('|');
  const metaDetail = [
    segment.targetStateId ? 'ts:' + segment.targetStateId : null,
    segment.sessionId ? 'sid:' + segment.sessionId : null,
    segment.participantId ? 'pid:' + segment.participantId : null,
    segment.speakerLabel ? 'sp:' + segment.speakerLabel : null,
    segment.progressKind ? 'pk:' + segment.progressKind : null,
    segment.progressText ? 'pt:' + segment.progressText : null,
    segment.tools.length > 0
      ? 'tools:' + segment.tools.map((tool) => `${tool.toolName}:${tool.done ? 'done' : 'pending'}`).join(',')
      : null,
    segment.events.length > 0
      ? 'events:' + segment.events.map((event) => event.eventType).join(',')
      : null,
  ]
    .filter((detail): detail is string => detail != null && detail.length > 0)
    .join('|');
  return `${segment.phase}:si${segment.segmentIndex}:${blockDetail || metaDetail || 'empty'}`;
}

function buildLiveTraceStateSignature(state: LiveIndicatorState | null | undefined): string {
  if (!state) {
    return 'null';
  }
  if (!state.active) {
    return 'inactive';
  }
  const segments = state.segments?.length ? state.segments : [state as unknown as LiveIndicatorSegmentState];
  return state.phase + ':' + segments.length + ':' + segments.map(buildLiveTraceSegmentDetail).join(';');
}

function useIsoLayoutEffect(effect: EffectCallback, deps: DependencyList): void {
  const hook = typeof document === 'undefined' ? useEffect : useLayoutEffect;
  hook(effect, deps);
}

export interface ChatViewRenderContext {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  activeAssignedCats: SelectedChannelView['assignedCats'];
  activeRoomParticipants: ResolvedChannelParticipant[];
  assignedCatRecords: ChatCat[];
  assignedAdhocParticipants: ResolvedChannelParticipant[];
  defaultRecipientParticipant: ResolvedChannelParticipant | null;
  defaultRecipientCat: SelectedChannelView['assignedCats'][number] | null;
  directLaneCat: ChatCat | null;
  directLaneExecutionTarget: ExecutionTargetValue | null;
  operatorView: ChatOperatorView | null;
  inspectedRun: ChatRunInspectorView | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  sidePanelOpen: boolean;
  openSidePanelTo: (section: string) => void;
}

export interface ChatViewComposerTargetSlotContext {
  payload: AppShellPayload;
  composerBusy: boolean;
  selectedExecutionTarget?: ExecutionTargetValue;
  composerRecipients: ReturnType<typeof buildChatComposerRecipients>;
  defaultRecipientParticipantId: string | null;
  composerStackParticipants: ChatComposerStackParticipantView[];
  directLaneCat: ChatCat | null;
  defaultRecipientCat: SelectedChannelView['assignedCats'][number] | null;
  assignedCatRecords: ChatCat[];
  leadCatRecord: ChatCat | null;
  isDirectLane: boolean;
  isSoloComposer: boolean;
  activeWorkflowShape: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  onOpenSection: (section: string) => void;
}

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
  onTakeScreenshot?: () => void;
  screenshotCaptureDisabled?: boolean;
  onChannelFilesChange: (files: File[]) => void;
  onApprovalDecision: (taskId: string, action: 'approve' | 'reroute' | 'reject') => void;
  onChoiceSubmit: (input: MessageChoicesSubmitInput) => void;
  onRetryMessage?: (messageId: string) => Promise<void>;
  onStartFresh?: () => void;
  onOperatorAction: (input: {
    action: 'retry' | 'acknowledge';
    taskId?: string | null;
    runId?: string | null;
    checkpointId?: string | null;
    outcomeId?: string | null;
  }) => void;
  autoResize: (el: HTMLTextAreaElement) => void;
  selectedExecutionTarget?: ExecutionTargetValue;
  onExecutionTargetChange?: (value: ExecutionTargetValue) => void;
  onDirectLaneExecutionTargetChange?: (catId: string, value: ExecutionTargetValue) => void;
  activeWorkflowShape?: 'sequential' | 'concurrent';
  onToggleActiveWorkflowShape?: () => void;
  activeAudienceKeys?: string[] | null;
  onSetActiveAudienceKeys?: (keys: string[]) => void;
  onSelect?: (channelId: string) => void;
  onOpenAddCat?: () => void;
  showAddCatButton?: boolean;
  behaviorSurface?: ConversationBehaviorSurface;
  liveIndicator?: LiveIndicatorState;
  compareGroup?: ParallelChatGroupSummary | null;
  compareSendScope?: 'all_members' | 'active_only';
  onCompareSendScopeChange?: (value: 'all_members' | 'active_only') => void;
  onRelayMessage?: (messageId: string, command: ParallelChatRelayCommandKind) => Promise<void>;
  onUpdateChannelParticipant?: (
    participantId: string,
    input: { name?: string; roleHint?: string | null },
  ) => Promise<void>;
  buildTranscriptMessageActions?: (
    input: TranscriptMessageActionContext,
  ) => ReadonlyArray<TranscriptMessageActionDescriptor>;
  renderStatusRow?: (context: ChatViewRenderContext) => ReactNode;
  renderTopBarExtraActions?: (context: ChatViewRenderContext) => ReactNode;
  renderComposerTargetSlot?: (context: ChatViewComposerTargetSlotContext) => ReactNode;
  renderComposerHeaderAccessory?: (context: ChatViewRenderContext) => ReactNode;
  renderComposerHeaderWhereExtras?: (context: ChatViewRenderContext) => ReactNode;
  renderComposerFooterAccessory?: (context: ChatViewRenderContext) => ReactNode;
  renderComposerSurfaceTag?: (context: ChatViewRenderContext) => ReactNode;
  buildSidePanelSections?: (
    options: BuildChatSidePanelSectionsOptions,
  ) => SidePanelSection[];
  sidePanelTitle?: string;
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
  onTakeScreenshot,
  screenshotCaptureDisabled,
  onChannelFilesChange,
  onApprovalDecision,
  onChoiceSubmit,
  onRetryMessage,
  onStartFresh,
  onOperatorAction,
  autoResize,
  selectedExecutionTarget,
  onExecutionTargetChange,
  onDirectLaneExecutionTargetChange,
  activeWorkflowShape = 'sequential',
  onToggleActiveWorkflowShape,
  activeAudienceKeys = null,
  onSetActiveAudienceKeys,
  onSelect,
  onOpenAddCat,
  showAddCatButton = true,
  behaviorSurface = 'chat',
  liveIndicator,
  compareGroup = null,
  compareSendScope = 'all_members',
  onCompareSendScopeChange,
  onRelayMessage,
  onUpdateChannelParticipant,
  buildTranscriptMessageActions,
  renderStatusRow,
  renderTopBarExtraActions,
  renderComposerTargetSlot,
  renderComposerHeaderAccessory,
  renderComposerHeaderWhereExtras,
  renderComposerFooterAccessory,
  renderComposerSurfaceTag,
  buildSidePanelSections,
  sidePanelTitle = '',
}: ChatViewProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const resolvedSidePanelTitle = sidePanelTitle || t(messageKeys.chatNewChatDraftSidePanelTitle);
  const conversationBehavior = useMemo(
    () => resolveConversationBehaviorPreferences(
      payload.chat.conversationBehavior,
      behaviorSurface,
    ),
    [behaviorSurface, payload.chat.conversationBehavior],
  );
  const visibleMessages = selectedChannel.messages.filter(
    (message) =>
      conversationBehavior.showVerboseMessages || message.metadata?.verbosity !== 'verbose',
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
  } = useWorkspaceParticipantPresentation({
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
  const [initialConcurrentClusterUiStateLoad] = useState(() =>
    loadConcurrentClusterUiStateMap(
      typeof window === 'undefined' ? null : window.localStorage,
    ),
  );
  const [concurrentClusterUiStateByKey, setConcurrentClusterUiStateByKey] =
    useState<ConcurrentClusterUiStateMap>(initialConcurrentClusterUiStateLoad.value);
  // Seed the "first-mount skip" ref from the load result: when parse normalized
  // storage (dirty), let the first effect actually write the cleaned map so the
  // bloat doesn't linger until the next user dismiss.
  const hasPersistedConcurrentClusterUiStateRef = useRef(
    initialConcurrentClusterUiStateLoad.requiresPersistedCleanup,
  );
  const resolveConcurrentClusterMode = useCallback(
    (context: ConcurrentClusterContext) =>
      resolveConcurrentClusterPresentationMode({
        channelId: selectedChannel.id,
        turnId: context.turnId,
        userDefault: conversationBehavior.concurrentPresentationMode,
        segmentCount: context.segmentCount,
        viewportWidth,
        workflowRecommendation: null,
        uiStateByKey: concurrentClusterUiStateByKey,
      }),
    [
      conversationBehavior.concurrentPresentationMode,
      concurrentClusterUiStateByKey,
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
          label: t(messageKeys.chatConcurrentClusterDismissActionLabel),
          title: t(messageKeys.chatConcurrentClusterDismissActionTitle),
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
    t,
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
    () => ({
      messageId: selectedChannel.messages
        .slice()
        .reverse()
        .find((message) => message.senderKind === 'user')?.id ?? null,
      status: (() => {
        const latestUserMessage = selectedChannel.messages
          .slice()
          .reverse()
          .find((message) => message.senderKind === 'user') ?? null;
        if (!latestUserMessage) {
          return 'idle' as const;
        }
        const activeTurn = selectedChannel.roomRouting.workflow.activeTurn ?? null;
        const lastOutcome = selectedChannel.roomRouting.lastOutcome ?? null;
        const latestUserMessageIndex = selectedChannel.messages.findIndex(
          (message) => message.id === latestUserMessage.id,
        );
        const activeTurnSourceMessageId = activeTurn?.sourceMessageId ?? null;
        const activeTurnSourceMessageIndex = activeTurnSourceMessageId
          ? selectedChannel.messages.findIndex((message) => message.id === activeTurnSourceMessageId)
          : -1;
        const liveIndicatorSourceMessageId = visibleLiveIndicator?.sourceMessageId ?? null;
        const liveIndicatorMatchesLatestUserMessage = liveIndicatorSourceMessageId
          ? liveIndicatorSourceMessageId === latestUserMessage.id
          : activeTurnSourceMessageId === latestUserMessage.id;
        const hasAssistantIdentityBubble = liveIndicatorMatchesLatestUserMessage
          && Boolean(
            visibleLiveIndicator?.speakerLabel
            || visibleLiveIndicator?.participantId
            || visibleLiveIndicator?.catId,
          );
        const hasVisibleAssistantReply = selectedChannel.messages.some((message, index) =>
          index > latestUserMessageIndex
          && message.senderKind !== 'user'
          && message.senderKind !== 'system'
          && !(
            message.metadata?.verbosity === 'verbose'
            && conversationBehavior.showVerboseMessages !== true
          ));
        const activeTurnTargetStateIds: string[] = activeTurn?.targetStatuses
          ?.map((target) => target.id)
          ?? [];
        const activeTurnLaneIds: string[] = (activeTurn?.targetStatuses ?? [])
          .map((target) => {
            const persistedLaneId = target.laneId?.trim() || null;
            if (persistedLaneId) {
              return persistedLaneId;
            }
            if (!activeTurn?.id || !target.id) {
              return null;
            }
            return buildChatLaneId(activeTurn.id, target.id, target.participant.participantId);
          })
          .filter((laneId): laneId is string => laneId != null);
        const activeTurnParticipantIds: string[] = (activeTurn?.targetStatuses ?? [])
          .map((target) => target.participant.participantId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        const hasVisibleSessionStart = selectedChannel.messages.some((message, index) => {
          if (index <= latestUserMessageIndex) return false;
          if (message.metadata?.kind !== 'session_start') return false;
          const targetStateId = typeof message.metadata?.targetStateId === 'string'
            ? message.metadata.targetStateId
            : null;
          const laneId = typeof message.metadata?.laneId === 'string'
            ? message.metadata.laneId
            : null;
          const participantId = typeof message.metadata?.participantId === 'string'
            ? message.metadata.participantId
            : null;
          return (
            (targetStateId != null && activeTurnTargetStateIds.includes(targetStateId))
            || (laneId != null && activeTurnLaneIds.includes(laneId))
            || (participantId != null && activeTurnParticipantIds.includes(participantId))
          );
        });
        const dispatchedTargets = (activeTurn?.targetStatuses ?? []).filter((target) =>
          target.status === 'running' || target.status === 'completed');
        const hasDispatchedTarget = dispatchedTargets.length > 0
          && (
            activeTurn?.workflowShape === 'concurrent'
            || dispatchedTargets.some((target) => target.status === 'completed')
            || dispatchedTargets.length > 1
          );
        const activeTurnOwnsLatestUserMessage =
          activeTurn?.sourceMessageId === latestUserMessage.id
          && (activeTurn.status === 'running' || activeTurn.status === 'pending');
        const queuedBehindActiveTurn = (
          latestUserMessageIndex > -1
          && activeTurnSourceMessageIndex > -1
          && activeTurnSourceMessageIndex < latestUserMessageIndex
          && (activeTurn?.status === 'running' || activeTurn?.status === 'pending')
        );

        if (
          (
            (activeTurnOwnsLatestUserMessage && !hasDispatchedTarget)
            || queuedBehindActiveTurn
          )
          && !hasAssistantIdentityBubble
          && (
            queuedBehindActiveTurn
            || (!hasVisibleAssistantReply && !hasVisibleSessionStart)
          )
        ) {
          return 'processing' as const;
        }

        if (
          lastOutcome?.sourceMessageId === latestUserMessage.id
          && lastOutcome.status === 'error'
        ) {
          return 'failed' as const;
        }

        return 'idle' as const;
      })(),
    }),
    [conversationBehavior.showVerboseMessages, selectedChannel, visibleLiveIndicator],
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
      selectedChannel.messages,
      selectedChannel.roomRouting.workflow.activeTurn,
      selectedChannel.roomRouting.workflow.turnHistory,
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
      selectedExecutionTarget,
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
    resolveParticipantCatRecord,
    resolveParticipantDisplayName,
    selectedExecutionTarget,
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!hasPersistedConcurrentClusterUiStateRef.current) {
      hasPersistedConcurrentClusterUiStateRef.current = true;
      return;
    }
    const persisted = writeConcurrentClusterUiStateMap(
      window.localStorage,
      concurrentClusterUiStateByKey,
    );
    // Under quota pressure the writer may shrink or drop the payload. Sync the
    // in-memory map back to what actually landed so the UI doesn't promise
    // dismissals that vanish after refresh and the next write isn't driven by
    // a stale oversized map. Functional setter guards against a newer dismiss
    // landing between the write and this state update.
    if (persisted !== concurrentClusterUiStateByKey) {
      setConcurrentClusterUiStateByKey((prev) =>
        prev === concurrentClusterUiStateByKey ? persisted : prev,
      );
    }
  }, [concurrentClusterUiStateByKey]);

  const inspectedRun = useMemo(
    () => buildRunInspectorView(operatorView, inspectedRunId),
    [operatorView, inspectedRunId],
  );
  const {
    directLaneExecutionTarget,
    directLaneExcludedMentionNames,
    composerBusy,
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
      t,
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
      t,
    ],
  );
  const stopBusy = isParallelChatBusy(busy, 'stop');
  const { transcriptListRef, composerCardRef, bottomSentinelRef, isNearBottom, scrollToBottom } =
    useTranscriptAutoScroll({
      channelId: selectedChannel.id,
      scrollKey: transcriptScrollKey,
      scrollOnChannelChange: true,
    });

  useIsoLayoutEffect(() => {
    if (!visibleLiveIndicator?.active || !isNearBottom) {
      return;
    }

    scrollToBottom();
  }, [isNearBottom, scrollToBottom, transcriptScrollKey, visibleLiveIndicator?.active]);

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

  const viewContext: ChatViewRenderContext = {
    payload,
    selectedChannel,
    activeAssignedCats,
    activeRoomParticipants,
    assignedCatRecords,
    assignedAdhocParticipants,
    defaultRecipientParticipant,
    defaultRecipientCat,
    directLaneCat,
    directLaneExecutionTarget,
    operatorView,
    inspectedRun,
    isDirectLane,
    isSoloComposer,
    sidePanelOpen,
    openSidePanelTo,
  };
  const composerTargetSlotContext: ChatViewComposerTargetSlotContext = {
    payload,
    composerBusy,
    selectedExecutionTarget,
    composerRecipients,
    defaultRecipientParticipantId: defaultRecipientParticipant?.participantId ?? null,
    composerStackParticipants,
    directLaneCat,
    defaultRecipientCat,
    assignedCatRecords,
    leadCatRecord: defaultRecipientCatRecord,
    isDirectLane,
    isSoloComposer,
    activeWorkflowShape,
    onToggleActiveWorkflowShape,
    activeAudienceKeys,
    onSetActiveAudienceKeys,
    onOpenSection: openSidePanelTo,
  };
  const composerTargetSlot = renderComposerTargetSlot?.(composerTargetSlotContext) ?? (
    <ChatComposerTargetSlot
      payload={payload}
      composerBusy={composerBusy}
      composerRecipients={composerRecipients}
      defaultRecipientParticipantId={defaultRecipientParticipant?.participantId ?? null}
      composerStackParticipants={composerStackParticipants}
      directLaneCat={directLaneCat}
      isDirectLane={isDirectLane}
      isSoloComposer={isSoloComposer}
      activeWorkflowShape={activeWorkflowShape}
      onToggleActiveWorkflowShape={onToggleActiveWorkflowShape}
      activeAudienceKeys={activeAudienceKeys}
      onSetActiveAudienceKeys={onSetActiveAudienceKeys}
      onOpenSection={openSidePanelTo}
    />
  );
  const sidePanelSections = (buildSidePanelSections ?? buildChatSidePanelSections)({
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
    directLaneExecutionTarget,
    isDirectLane,
    isSoloComposer,
    selectedExecutionTarget,
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
    onExecutionTargetChange,
    onStartFresh,
    onDirectLaneExecutionTargetChange,
    buildParticipantAvatarStyle,
  });

  const topBarExtraActions = renderTopBarExtraActions?.(viewContext) ?? null;
  const statusRow = renderStatusRow?.(viewContext) ?? null;
  const composerHeaderAccessory = renderComposerHeaderAccessory?.(viewContext) ?? null;
  const composerHeaderWhereExtras = renderComposerHeaderWhereExtras?.(viewContext) ?? null;
  const composerFooterAccessory = renderComposerFooterAccessory?.(viewContext) ?? null;
  const composerSurfaceTag = renderComposerSurfaceTag?.(viewContext) ?? null;

  function navigateCompareMember(direction: 'prev' | 'next'): void {
    const channelId = direction === 'prev' ? comparePrevChannelId : compareNextChannelId;
    if (!channelId || !onSelect) {
      return;
    }

    onSelect(channelId);
  }

  return (
    <ChatViewFrame
      conversationMode={conversationMode}
      layoutMode={layoutMode}
      composerVariant={layoutMetrics.composerVariant}
      secondarySurfacePosition={layoutMetrics.secondarySurfacePosition}
      layoutStyle={layoutStyle}
      hasConversationStarted={hasConversationStarted}
      activeDirectCatId={isDirectLane && hasConversationStarted ? (defaultRecipientCat?.catId ?? null) : null}
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
          sidePanelOpen={sidePanelOpen}
          approvalCount={operatorView?.approvals.length ?? 0}
          extraActions={topBarExtraActions}
          onToggleSidePanel={() => setSidePanelOpen(!sidePanelOpen)}
          onOpenCatProfile={
            isDirectLane && defaultRecipientCat?.catId
              ? () =>
                  navigate(
                    `/cats/${encodeURIComponent(defaultRecipientCat.catId)}`,
                  )
              : undefined
          }
        />
      )}
      statusRow={statusRow}
      sidePanel={sidePanelOpen ? (
        <SidePanel
          title={resolvedSidePanelTitle}
          activeSection={sidePanelSection}
          onSectionToggle={setSidePanelSection}
          onClose={() => setSidePanelOpen(false)}
          position={layoutMetrics.secondarySurfacePosition === 'bottom' ? 'bottom' : 'side'}
          className="chatPaneSidePanel chatPaneSidePanelBelowBar"
          sections={sidePanelSections}
        />
      ) : null}
    >
      <ChatTranscriptPanel
        hasConversationStarted={hasConversationStarted}
        greeting={greeting}
        transcriptListRef={transcriptListRef}
        bottomSentinelRef={bottomSentinelRef}
        selectedChannel={selectedChannel}
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
          if (isBrowserLiveTraceEnabled()) {
            const rawSignature = buildLiveTraceStateSignature(liveIndicator);
            const visibleSignature = buildLiveTraceStateSignature(visibleLiveIndicator);
            const activeTurnUpdatedAt = selectedChannel.roomRouting.workflow.activeTurn?.updatedAt ?? null;
            const messagesSignature = visibleMessages
              .map((message) => {
                // Body length bin (no content preview) keeps the trace
                // useful for diffing transcripts without leaking real
                // message text into the shared ChatView log surface.
                const bodyLength = message.body?.trim().length ?? 0;
                const bodyHint = bodyLength === 0
                  ? '∅'
                  : bodyLength < 40
                    ? 'len' + bodyLength
                    : bodyLength < 400
                      ? 'len~' + Math.floor(bodyLength / 40) * 40
                      : 'len~' + Math.floor(bodyLength / 400) * 400;
                return `${message.senderKind}#${message.id.slice(-6)}:${bodyHint}`;
              })
              .join(',');
            const combinedSignature =
              `raw=${rawSignature}|vis=${visibleSignature}|turn=${activeTurnUpdatedAt ?? 'none'}|msgs=${messagesSignature}`;
            const isIdleOpeningFrame = _lastLiveIndicatorLogSignature === null
              && rawSignature === 'inactive'
              && visibleSignature === 'inactive';
            if (isIdleOpeningFrame) {
              _lastLiveIndicatorLogSignature = combinedSignature;
              _lastLiveIndicatorLogAt = Date.now();
            } else if (combinedSignature !== _lastLiveIndicatorLogSignature) {
              const now = Date.now();
              const gapMs = _lastLiveIndicatorLogAt != null ? now - _lastLiveIndicatorLogAt : 0;
              _lastLiveIndicatorLogSignature = combinedSignature;
              _lastLiveIndicatorLogAt = now;
              console.log(
                '[CV] li gap=' + gapMs + 'ms'
                + ' raw=' + rawSignature
                + ' vis=' + visibleSignature
                + ' turn=' + (activeTurnUpdatedAt ?? 'none')
                + ' msgs[' + visibleMessages.length + ']=' + messagesSignature
                + ' nb=' + (isNearBottom ? '1' : '0'),
              );
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
        showLiveProgressDetails={conversationBehavior.showLiveProgressDetails}
        resolveConcurrentClusterPresentationMode={resolveConcurrentClusterMode}
        buildConcurrentClusterActions={buildConcurrentClusterActions}
        buildTranscriptMessageActions={buildTranscriptMessageActions}
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
        composerTargetSlot={composerTargetSlot}
        composerHeaderAccessory={composerHeaderAccessory}
        composerHeaderWhereExtras={composerHeaderWhereExtras}
        composerFooterAccessory={composerFooterAccessory}
        surfaceTag={composerSurfaceTag}
        onOpenSection={openSidePanelTo}
        onComposerChange={onComposerChange}
        onComposerKeyDown={onComposerKeyDown}
        onSendMessage={onSendMessage}
        onToggleChannelPlusMenu={onToggleChannelPlusMenu}
        onChannelFileSelect={onChannelFileSelect}
        onTakeScreenshot={onTakeScreenshot}
        screenshotCaptureDisabled={screenshotCaptureDisabled}
        onChannelFilesChange={onChannelFilesChange}
        onScrollToBottom={scrollToBottom}
        onCompareSendScopeChange={onCompareSendScopeChange}
        onCancelPendingSend={onCancelPendingSend}
        onStopMessage={onStopMessage}
        autoResize={autoResize}
      />
      {compareMembers.length > 1 && onSelect ? (
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
