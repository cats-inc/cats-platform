import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import type { AppShellPayload, ChatCat } from '../../api/contracts';
import type { LiveIndicatorState } from '../hooks/useLiveIndicator';
import {
  resolveLayoutMetrics,
  type ChatLayoutMode,
} from '../../../../design/chatLayout';
import { buildLiveIndicatorScrollKey } from '../../../../shared/liveIndicator.js';
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
import type { MessageChoicesSubmitInput } from './MessageChoices';
import { isComposerBusy } from '../../../../shared/composer';
import {
  isDirectConversationMode,
  isSoloThreadConversationMode,
  resolveConversationMode,
} from '../conversationMode';
import { useTranscriptAutoScroll } from '../hooks/useTranscriptAutoScroll';
import { resolveComposerWorkspacePath } from '../../../../core/workspacePaths';
import { ChatComposerSurface } from '../../../shared/renderer/components/chat-view/ChatComposerSurface.js';
import { ChatViewTopBar } from '../../../shared/renderer/components/chat-view/ChatViewTopBar.js';
import { ChatViewSidePanel } from '../../../shared/renderer/components/chat-view/ChatViewSidePanel.js';
import { ChatTranscriptSurface } from '../../../shared/renderer/components/chat-view/ChatTranscriptSurface.js';

export interface ChatViewProps {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
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
      if (!cat || seen.has(cat.id)) return false;
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
    () => buildChatOperatorView(operatorSnapshot, selectedChannel.id),
    [operatorSnapshot, selectedChannel.id],
  );
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
  const composerBusy = isComposerBusy(busy);
  const resumeBusy = busy === 'channel:resume';
  const canResumeChannel = !composerBusy && !resumeBusy;
  const composerWorkspacePath = resolveComposerWorkspacePath(
    selectedChannel.repoPath,
    selectedChannel.chatCwd,
  );
  const { transcriptListRef, composerCardRef, bottomSentinelRef } = useTranscriptAutoScroll({
    channelId: selectedChannel.id,
    scrollKey: [
      selectedChannel.updatedAt ?? '',
      selectedChannel.messages.length,
      liveIndicatorScrollKey,
    ].join('::'),
  });

  return (
    <>
      <div
        className="viewShell viewShellChannel"
        data-conversation-mode={conversationMode}
        data-layout-mode={layoutMode}
        data-composer-variant={layoutMetrics.composerVariant}
        data-secondary-surface-position={layoutMetrics.secondarySurfacePosition}
        style={layoutStyle}
      >
        <ChatViewTopBar
          topBarCats={topBarCats}
          bossCatId={payload.chat.bossCatId}
          defaultRecipientId={defaultRecipientId}
          activeTopBarCatIdSet={activeTopBarCatIdSet}
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
        <div className="channelWorkspace">
          <section className={hasConversationStarted ? 'channelShell' : 'channelShell channelShellFresh'}>
            {/* Feedback is now shown via NotificationContainer */}

            <ChatTranscriptSurface
              hasConversationStarted={hasConversationStarted}
              payload={payload}
              selectedChannel={selectedChannel}
              busy={busy}
              greeting={greeting}
              liveIndicator={liveIndicator}
              directLaneExcludedMentionNames={directLaneExcludedMentionNames}
              transcriptListRef={transcriptListRef}
              onChoiceSubmit={onChoiceSubmit}
            />

            <ChatComposerSurface
              hasConversationStarted={hasConversationStarted}
              payload={payload}
              selectedChannel={selectedChannel}
              composerDraft={composerDraft}
              channelFiles={channelFiles}
              channelPlusMenuOpen={channelPlusMenuOpen}
              channelPlusMenuRef={channelPlusMenuRef}
              channelFileInputRef={channelFileInputRef}
              composerBusy={composerBusy}
              composerWorkspacePath={composerWorkspacePath}
              directLaneExcludedMentionNames={directLaneExcludedMentionNames}
              selectedModel={selectedModel}
              directLaneCat={directLaneCat}
              directLaneModelValue={directLaneModelValue}
              defaultRecipientCat={defaultRecipientCat ?? null}
              assignedCatRecords={assignedCatRecords}
              leadCatRecord={leadCatRecord}
              isDirectLane={isDirectLane}
              isSoloComposer={isSoloComposer}
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
            <div ref={bottomSentinelRef} className="transcriptBottomSentinel" aria-hidden="true" />
          </section>

        </div>
      </div>
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
    </>
  );
}
