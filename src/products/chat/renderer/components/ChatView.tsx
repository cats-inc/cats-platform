import {
  useEffect,
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
import { resolveCatStatusIndicator } from '../../shared/catStatusResolution';
import { CatStatusRow } from './CatStatusRow';
import type { LiveIndicatorState } from '../hooks/useLiveIndicator';
import { buildLiveIndicatorScrollKey } from '../../../../shared/liveIndicator.js';
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
import {
  buildNamedRecipient,
  buildRecipientFromCat,
  buildImplicitRecipient,
} from './ComposerRecipientChip';
import { type ModelSelectorValue } from './ModelSelector';
import {
  type MessageChoicesSubmitInput,
} from './MessageChoices';
import {
  isComposerAckBusy,
  getComposerDispatchChannelId,
  isComposerBusy,
} from '../../../../shared/composer';
import {
  resolveParticipantCatId,
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
import { resolveComposerWorkspacePath } from '../../../../core/workspacePaths';
import { buildChatSidePanelSections } from './chat-view/ChatSidePanelSections';
import { ChatComposerArea } from './chat-view/ChatComposerArea';
import { ParallelFooterBar } from './chat-view/ParallelFooterBar';
import { ChatTranscriptPanel } from './chat-view/ChatTranscriptPanel';
import {
  resolveActiveCompareChannelId,
  resolveCompareNeighborChannelId,
} from './chat-view/compareNavigation';

export interface ChatViewProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  routeChannelId?: string | null;
  operatorSnapshot: ChatOperatorSnapshot | null;
  operatorLoading: boolean;
  operatorError: string;
  composerDraft: string;
  busy: string;
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
  onResumeChannel,
  onOperatorAction,
  autoResize,
  selectedModel,
  onModelChange,
  onDirectLaneModelChange,
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
  function messageStackTone(senderKind: string): string {
    switch (senderKind) {
      case 'user':
        return 'transcriptMessageStack transcriptMessageStackUser';
      case 'orchestrator':
        return 'transcriptMessageStack transcriptMessageStackOrchestrator';
      case 'agent':
        return 'transcriptMessageStack transcriptMessageStackAgent';
      default:
        return 'transcriptMessageStack transcriptMessageStackSystem';
    }
  }

  const visibleMessages = selectedChannel.messages.filter(
    (message) => payload.chat.showVerboseMessages || message.metadata?.verbosity !== 'verbose',
  );
  const hasConversationStarted = visibleMessages.length > 0;

  const conversationMode = resolveConversationMode(selectedChannel);
  const compareMembers = compareGroup?.members ?? [];
  const isCompareGroup = compareMembers.length > 1;
  const activeCompareChannelId = resolveActiveCompareChannelId(
    compareMembers,
    routeChannelId,
    selectedChannel.id,
  );
  const compareMemberIndex = compareMembers.findIndex(
    (member) => member.channelId === activeCompareChannelId,
  );
  const compareGroupChannels = useMemo(
    () => compareMembers
      .map((member) =>
        payload.chat.channels.find((channel) => channel.id === member.channelId) ?? null,
      )
      .filter((channel): channel is AppShellPayload['chat']['channels'][number] => channel != null),
    [compareMembers, payload.chat.channels],
  );
  const compareDispatchBusy =
    busy === 'parallelChat:ack'
    || busy === 'parallelChat:dispatch'
    || busy === 'parallelChat:relay'
    || busy === 'parallelChat:stop';
  const compareRoutingBusy = compareGroupChannels.some((channel) =>
    channel.routingStatus === 'running',
  );
  const compareBusy = compareDispatchBusy || compareRoutingBusy;

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
  function openSidePanelTo(section: string): void {
    setSidePanelOpen(true);
    setSidePanelSection(section);
  }

  const topBarTitle = isDirectLane
    ? (directLaneCat?.name ?? defaultRecipientCatRecord?.name ?? presentChannelTitle(selectedChannel.title))
    : isCompareGroup && compareGroup
      ? presentChannelTitle(compareGroup.title)
      : presentChannelTitle(selectedChannel.title);
  const showRosterAvatars = isDirectLane
    ? Boolean(defaultRecipientCat)
    : Boolean((showBossCatAvatar && !isSoloComposer) || activeRoomParticipants.length > 0);
  const participantChipLabel = activeRoomParticipants.length > 0
    ? `${activeRoomParticipants.length} participant${activeRoomParticipants.length === 1 ? '' : 's'}`
    : 'Participants';
  const directLaneModelValue: ModelSelectorValue | null = directLaneCat
    ? {
        provider: directLaneCat.defaultExecutionTarget.provider,
        model: directLaneCat.defaultExecutionTarget.model,
        instance: directLaneCat.defaultExecutionTarget.instance,
        modelSelection: directLaneCat.defaultModelSelection ?? null,
      }
    : null;
  const directLaneExcludedMentionNames = useMemo(
    () => (isDirectLane && directLaneCat?.name ? [directLaneCat.name] : []),
    [directLaneCat?.name, isDirectLane],
  );
  const operatorView = useMemo(
    () => buildChatOperatorView(operatorSnapshot, selectedChannel.id),
    [operatorSnapshot, selectedChannel.id],
  );
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
  const runIdsKey = useMemo(
    () => operatorView?.runs.map((run) => run.id).join('|') ?? '',
    [operatorView],
  );
  const liveIndicatorScrollKey = useMemo(
    () => buildLiveIndicatorScrollKey(liveIndicator),
    [liveIndicator],
  );
  const activeTopBarCatIds = useMemo(() => {
    const ids = liveIndicator?.activeCatIds?.filter((id) => id.trim().length > 0) ?? [];
    if (ids.length > 0) {
      return [...new Set(ids)];
    }
    if (liveIndicator?.active && liveIndicator.catId) {
      return [liveIndicator.catId];
    }
    return [];
  }, [liveIndicator]);
  const activeTopBarCatIdSet = useMemo(
    () => new Set(activeTopBarCatIds),
    [activeTopBarCatIds],
  );
  const activeTopBarParticipantIds = useMemo(() => {
    const workflowTargets = selectedChannel.roomRouting?.workflow?.activeTurn?.targetStatuses ?? [];
    const runningParticipantIds = workflowTargets
      .filter((target) => target.status === 'running')
      .map((target) => target.participant.participantId)
      .filter((participantId) => participantId.trim().length > 0);
    if (runningParticipantIds.length > 0) {
      return [...new Set(runningParticipantIds)];
    }
    if (liveIndicator?.active && selectedChannel.roomRouting?.defaultRecipientId) {
      return [selectedChannel.roomRouting.defaultRecipientId];
    }
    return [];
  }, [
    liveIndicator?.active,
    selectedChannel.roomRouting?.defaultRecipientId,
    selectedChannel.roomRouting?.workflow?.activeTurn,
  ]);
  const activeTopBarParticipantIdSet = useMemo(
    () => new Set(activeTopBarParticipantIds),
    [activeTopBarParticipantIds],
  );
  const liveSpeakerParticipantId = useMemo(() => {
    const activeWorkflowParticipantId = activeTopBarParticipantIds[0] ?? null;
    if (activeWorkflowParticipantId) {
      return activeWorkflowParticipantId;
    }
    if (liveIndicator?.active) {
      return selectedChannel.roomRouting?.defaultRecipientId ?? null;
    }
    return null;
  }, [
    activeTopBarParticipantIds,
    liveIndicator?.active,
    selectedChannel.roomRouting?.defaultRecipientId,
  ]);
  const liveSpeakerParticipant = useMemo(
    () => liveSpeakerParticipantId
      ? activeRoomParticipants.find(
          (participant) => participant.participantId === liveSpeakerParticipantId,
        ) ?? null
      : liveIndicator?.catId
        ? activeRoomParticipants.find((participant) =>
          resolveParticipantCatId(participant) === liveIndicator.catId)
          ?? null
        : null,
    [
      activeRoomParticipants,
      liveIndicator?.catId,
      liveSpeakerParticipantId,
    ],
  );
  const composerRecipients = useMemo(() => {
    if (isDirectLane && directLaneCat) {
      return [buildRecipientFromCat(directLaneCat, payload.chat.bossCatId)];
    }
    if (isSoloComposer && selectedModel) {
      return [buildImplicitRecipient(selectedModel)];
    }
    if (!defaultRecipientParticipant) {
      return [];
    }

    const participantCat = resolveParticipantCatRecord(defaultRecipientParticipant);
    if (participantCat) {
      return [buildRecipientFromCat(participantCat, payload.chat.bossCatId)];
    }

    return [
      buildNamedRecipient({
        participantId: defaultRecipientParticipant.participantId,
        name: resolveParticipantDisplayName(defaultRecipientParticipant, null),
        provider: defaultRecipientParticipant.execution.target.provider,
        instance: defaultRecipientParticipant.execution.target.instance ?? null,
        model: defaultRecipientParticipant.execution.target.model ?? null,
      }),
    ];
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
  const composerBusy = isComposerBusy(busy) || compareBusy;
  const composerAckBusy = isComposerAckBusy(busy);
  const composerDispatchChannelId = getComposerDispatchChannelId(busy);
  const stopBusy = busy.startsWith('message:stop:') || busy === 'parallelChat:stop';
  const resumeBusy = busy === 'channel:resume';
  const canResumeChannel = !composerBusy && !resumeBusy;
  const showCancelComposerAction = composerAckBusy && onCancelPendingSend != null;
  const canStopSingleChat =
    !isCompareGroup
    && composerDispatchChannelId === selectedChannel.id
    && onStopMessage != null;
  const canStopParallelChat =
    isCompareGroup
    && onStopMessage != null
    && (
      busy === 'parallelChat:dispatch'
      || busy === 'parallelChat:stop'
    );
  const showStopComposerAction = !showCancelComposerAction && (canStopSingleChat || canStopParallelChat);
  const comparePrevChannelId = isCompareGroup && compareMemberIndex >= 0
    ? resolveCompareNeighborChannelId(compareMembers, activeCompareChannelId, 'prev')
    : null;
  const compareNextChannelId = isCompareGroup && compareMemberIndex >= 0
    ? resolveCompareNeighborChannelId(compareMembers, activeCompareChannelId, 'next')
    : null;
  const composerWorkspacePath = resolveComposerWorkspacePath(
    selectedChannel.repoPath,
    selectedChannel.chatCwd,
  );
  const { transcriptListRef, composerCardRef, bottomSentinelRef, isNearBottom, scrollToBottom } = useTranscriptAutoScroll({
    channelId: selectedChannel.id,
    scrollKey: [
      selectedChannel.updatedAt ?? '',
      selectedChannel.messages.length,
      liveIndicatorScrollKey,
    ].join('::'),
    scrollOnChannelChange: true,
  });

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
              cats={payload.chat.cats}
              bossCatId={payload.chat.bossCatId}
              selectedChannelId={selectedChannel.id}
              disabledMentionNames={directLaneExcludedMentionNames}
              busy={busy}
              compareBusy={compareBusy}
              isCompareGroup={isCompareGroup}
              choiceResponsesBySource={choiceResponsesBySource}
              onChoiceSubmit={onChoiceSubmit}
              onRelayMessage={onRelayMessage}
              liveIndicator={liveIndicator}
              liveSpeakerParticipant={liveSpeakerParticipant}
              liveSpeakerParticipantCat={resolveParticipantCatRecord(liveSpeakerParticipant)}
              messageStackTone={messageStackTone}
              resolveMessageParticipant={resolveMessageParticipant}
              resolveParticipantCatRecord={resolveParticipantCatRecord}
              buildParticipantAvatarClassName={buildParticipantAvatarClassName}
              buildParticipantAvatarStyle={buildParticipantAvatarStyle}
              resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
              resolveParticipantDisplayName={resolveParticipantDisplayName}
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
              isDirectLane={isDirectLane}
              isSoloComposer={isSoloComposer}
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
