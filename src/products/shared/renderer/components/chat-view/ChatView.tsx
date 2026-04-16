import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import type { AppShellPayload, ChatCat } from '../../../api/workspaceContracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import type { WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import { isChannelBusy } from '../../../../../shared/workspaceBusy.js';
import {
  resolveLayoutMetrics,
  type ChatLayoutMode,
} from '../../../../../design/chatLayout.js';
import {
  resolveTranscriptFollowState,
} from '../../../../../shared/liveIndicator.js';
import {
  presentChannelTitle,
  type SelectedChannelView,
} from '../../workspaceChatUtils.js';
import type { ChatOperatorSnapshot } from '../../../operator-loop/index.js';
import {
  buildChatOperatorView,
  buildRunInspectorView,
} from '../../../operator-loop/index.js';
import { type ModelSelectorValue } from '../ModelSelector.js';
import type { MessageChoicesSubmitInput } from '../MessageChoices.js';
import { isComposerBusyForChannel } from '../../../../../shared/composer.js';
import {
  isDirectConversationMode,
  isSoloThreadConversationMode,
  resolveConversationMode,
} from '../../../../../app/renderer/productShell/conversationMode.js';
import { useTranscriptAutoScroll } from '../../hooks/useTranscriptAutoScroll.js';
import { resolveComposerWorkspacePath } from '../../../../../core/workspacePaths.js';
import { ChatComposerSurface } from './ChatComposerSurface.js';
import { WorkspaceComposerTargetSlot } from './WorkspaceComposerTargetSlot.js';
import { ChatViewFrame } from './ChatViewFrame.js';
import { ChatViewTopBar } from './ChatViewTopBar.js';
import { ChatViewSidePanel } from './ChatViewSidePanel.js';
import { ChatTranscriptSurface } from './ChatTranscriptSurface.js';
import {
  dismissConcurrentClusterUiState,
  resolveConcurrentClusterPresentationMode,
  type ConcurrentClusterActionContext,
  type ConcurrentClusterContext,
  type ConcurrentClusterUiStateMap,
} from './concurrentClusterUiState.js';

export interface ChatViewProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
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
  onOpenAddCat?: () => void;
  showAddCatButton?: boolean;
  liveIndicator?: LiveIndicatorState;
}

export function ChatView({
  payload,
  selectedChannel,
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
  onOpenAddCat,
  showAddCatButton = true,
  liveIndicator,
}: ChatViewProps) {
  const hasConversationStarted =
    selectedChannel.messages.some((message) => message.senderKind !== 'system');
  const transcriptFollowState = useMemo(
    () => resolveTranscriptFollowState(
      liveIndicator,
      selectedChannel.messages,
      selectedChannel.roomRouting.workflow.activeTurn?.updatedAt ?? null,
    ),
    [liveIndicator, selectedChannel.messages, selectedChannel.roomRouting.workflow.activeTurn?.updatedAt],
  );
  const { visibleLiveIndicator, transcriptScrollKey } = transcriptFollowState;

  const defaultRecipientId = selectedChannel.roomRouting.defaultRecipientId;
  const defaultRecipientCat = defaultRecipientId
    ? activeAssignedCats.find((c) => c.catId === defaultRecipientId)
    : null;
  const conversationMode = resolveConversationMode(selectedChannel);
  const isSoloComposer = isSoloThreadConversationMode(conversationMode);
  const isDirectLane = isDirectConversationMode(conversationMode);
  const layoutMode: ChatLayoutMode = isDirectLane
    ? 'direct_lane'
    : activeAssignedCats.length > 1
      ? 'multi_cat'
      : 'solo';
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cats');
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

  const directLaneCat = isDirectLane && defaultRecipientCat
    ? payload.chat.cats.find((c) => c.id === defaultRecipientCat.catId) ?? null
    : null;
  const bossCatRecord = payload.chat.bossCatId
    ? payload.chat.cats.find((c) => c.id === payload.chat.bossCatId) ?? null
    : null;
  const leadCatRecord = defaultRecipientCat
    ? payload.chat.cats.find((c) => c.id === defaultRecipientCat.catId) ?? null
    : null;
  const topBarTitle = isDirectLane
    ? (directLaneCat?.name ?? leadCatRecord?.name ?? presentChannelTitle(selectedChannel.title))
    : presentChannelTitle(selectedChannel.title);
  const assignedCatRecords = useMemo(
    () =>
      activeAssignedCats
        .map((assignedCat) => payload.chat.cats.find((cat) => cat.id === assignedCat.catId) ?? null)
        .filter((cat): cat is ChatCat => cat != null),
    [activeAssignedCats, payload.chat.cats],
  );
  const topBarCats = useMemo(() => {
    const ordered: Array<ChatCat | null> = [];
    if (isDirectLane) {
      ordered.push(leadCatRecord);
    } else {
      if (showBossCatAvatar && !isSoloComposer) {
        ordered.push(bossCatRecord);
      }
      ordered.push(...assignedCatRecords);
    }
    const seen = new Set<string>();
    return ordered.filter((cat): cat is ChatCat => {
      if (!cat || seen.has(cat.id)) {
        return false;
      }
      seen.add(cat.id);
      return true;
    });
  }, [
    assignedCatRecords,
    bossCatRecord,
    isDirectLane,
    isSoloComposer,
    leadCatRecord,
    showBossCatAvatar,
  ]);
  const showRosterAvatars = isDirectLane
    ? Boolean(defaultRecipientCat)
    : Boolean((showBossCatAvatar && !isSoloComposer) || activeAssignedCats.length > 0);
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
    () => buildChatOperatorView(operatorSnapshot, selectedChannel),
    [operatorSnapshot, selectedChannel],
  );
  const runIdsKey = useMemo(
    () => operatorView?.runs.map((run) => run.id).join('|') ?? '',
    [operatorView],
  );
  const activeTopBarCatIds = useMemo(() => {
    const ids = visibleLiveIndicator?.activeCatIds?.filter((id) => id.trim().length > 0) ?? [];
    if (ids.length > 0) {
      return [...new Set(ids)];
    }
    if (visibleLiveIndicator?.active && visibleLiveIndicator.catId) {
      return [visibleLiveIndicator.catId];
    }
    return [];
  }, [visibleLiveIndicator]);
  const activeTopBarCatIdSet = useMemo(
    () => new Set(activeTopBarCatIds),
    [activeTopBarCatIds],
  );
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
  const composerBusy = isComposerBusyForChannel(busy, selectedChannel.id);
  const resumeBusy = isChannelBusy(busy, 'resume');
  const canResumeChannel = !composerBusy && !resumeBusy;
  const composerWorkspacePath = resolveComposerWorkspacePath(
    selectedChannel.repoPath,
    selectedChannel.chatCwd,
  );
  const { transcriptListRef, composerCardRef, bottomSentinelRef } = useTranscriptAutoScroll({
    channelId: selectedChannel.id,
    scrollKey: transcriptScrollKey,
  });

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
          avatars={topBarCats.map((cat) => ({
            key: cat.id,
            label: cat.name,
            avatarColor: cat.avatarColor,
            avatarUrl: cat.avatarUrl,
            isBoss: cat.id === payload.chat.bossCatId,
            showLeadBadge: cat.id === defaultRecipientId,
            pulsing: activeTopBarCatIdSet.has(cat.id),
          }))}
          showRosterAvatars={showRosterAvatars}
          isDirectLane={isDirectLane}
          topBarTitle={topBarTitle}
          canResumeChannel={canResumeChannel}
          resumeBusy={resumeBusy}
          sidePanelOpen={sidePanelOpen}
          approvalCount={operatorView?.approvals.length ?? 0}
          onResumeChannel={onResumeChannel}
          onToggleSidePanel={() => setSidePanelOpen(!sidePanelOpen)}
        />
      )}
      sidePanel={(
        <ChatViewSidePanel
          sidePanelOpen={sidePanelOpen}
          sidePanelSection={sidePanelSection}
          sidePanelPosition={layoutMetrics.secondarySurfacePosition === 'bottom' ? 'bottom' : 'side'}
          payload={payload}
          selectedChannel={selectedChannel}
          busy={busy}
          operatorView={operatorView}
          operatorLoading={operatorLoading}
          operatorError={operatorError}
          assignedCatRecords={assignedCatRecords}
          defaultRecipientCat={defaultRecipientCat ?? null}
          directLaneCat={directLaneCat}
          directLaneModelValue={directLaneModelValue}
          isDirectLane={isDirectLane}
          isSoloComposer={isSoloComposer}
          selectedModel={selectedModel}
          inspectedRun={inspectedRun}
          showAddCatButton={showAddCatButton}
          onSectionToggle={setSidePanelSection}
          onClose={() => setSidePanelOpen(false)}
          onInspectRun={setInspectedRunId}
          onApprovalDecision={onApprovalDecision}
          onOperatorAction={onOperatorAction}
          onModelChange={onModelChange}
          onDirectLaneModelChange={onDirectLaneModelChange}
          onOpenAddCat={onOpenAddCat}
        />
      )}
    >
      <ChatTranscriptSurface
        hasConversationStarted={hasConversationStarted}
        payload={payload}
        selectedChannel={selectedChannel}
        busy={busy}
        greeting={greeting}
        liveIndicator={visibleLiveIndicator ?? undefined}
        directLaneExcludedMentionNames={directLaneExcludedMentionNames}
        transcriptListRef={transcriptListRef}
        bottomSentinelRef={bottomSentinelRef}
        onChoiceSubmit={onChoiceSubmit}
        resolveConcurrentClusterPresentationMode={resolveConcurrentClusterMode}
        buildConcurrentClusterActions={buildConcurrentClusterActions}
      />
      <ChatComposerSurface
        hasConversationStarted={hasConversationStarted}
        payload={payload}
        composerDraft={composerDraft}
        channelFiles={channelFiles}
        channelPlusMenuOpen={channelPlusMenuOpen}
        channelPlusMenuRef={channelPlusMenuRef}
        channelFileInputRef={channelFileInputRef}
        composerBusy={composerBusy}
        composerWorkspacePath={composerWorkspacePath}
        directLaneExcludedMentionNames={directLaneExcludedMentionNames}
        composerTargetSlot={(
          <WorkspaceComposerTargetSlot
            payload={payload}
            composerBusy={composerBusy}
            selectedModel={selectedModel}
            directLaneCat={directLaneCat}
            defaultRecipientCat={defaultRecipientCat ?? null}
            assignedCatRecords={assignedCatRecords}
            leadCatRecord={leadCatRecord}
            isDirectLane={isDirectLane}
            isSoloComposer={isSoloComposer}
            onOpenSection={openSidePanelTo}
          />
        )}
        composerCardRef={composerCardRef}
        onOpenSection={openSidePanelTo}
        onComposerChange={onComposerChange}
        onComposerKeyDown={onComposerKeyDown}
        onSendMessage={onSendMessage}
        onToggleChannelPlusMenu={onToggleChannelPlusMenu}
        onChannelFileSelect={onChannelFileSelect}
        onChannelFilesChange={onChannelFilesChange}
        autoResize={autoResize}
      />
    </ChatViewFrame>
  );
}
