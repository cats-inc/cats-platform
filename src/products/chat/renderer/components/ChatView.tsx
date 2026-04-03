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
  ChatCat,
  ChatChannelView,
  ConcurrentChatGroupSummary,
  ConcurrentChatRelayCommandKind,
} from '../../api/contracts';
import { resolveCatStatusIndicator } from '../../shared/catStatusResolution';
import { CatStatusRow } from './CatStatusRow';
import type { LiveIndicatorState } from '../hooks/useLiveIndicator';
import { buildLiveIndicatorScrollKey } from '../../../../shared/liveIndicator.js';
import { SidePanel, type SidePanelSection } from '../../../../design/components/SidePanel';
import {
  resolveLayoutMetrics,
  type ChatLayoutMode,
} from '../../../../design/chatLayout';
import {
  catInitials,
  messageTone,
  presentChannelTitle,
  resolveTranscriptMessageSpeaker,
  truncatePath,
  type SelectedChannelView,
} from '../chatUtils';
import { openFolderInExplorer } from '../api';
import type { ChatOperatorSnapshot } from '../../shared/operator-loop/index';
import {
  buildChatOperatorView,
  buildRunInspectorView,
} from '../../shared/operator-loop/index';
import { ActivityFeed } from './ActivityFeed';
import { CatAvatarRow } from './CatAvatarRow';
import { ComposerCatStack } from './ComposerCatStack';
import {
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorValue,
} from './ModelSelector';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';
import { ComposerHighlight } from './ComposerHighlight';
import { MessageBody } from './MessageBody';
import {
  MessageChoices,
  type MessageChoicesSubmitInput,
} from './MessageChoices';
import { ProgressSummaryPanel } from './ProgressSummaryPanel';
import { ProviderModelFields } from './ProviderModelFields';
import { RunInspector } from './RunInspector';
import type { ProviderTargetSelection } from '../../../../shared/providerSelection';
import {
  isComposerAckBusy,
  getComposerDispatchChannelId,
  isComposerBusy,
} from '../../../../shared/composer';
import {
  getProviderDisplayName,
  getProviderModels,
} from '../../../../shared/providerCatalog';
import { buildConcurrentChatMemberLabel } from '../../shared/concurrentChats';
import {
  isDirectConversationMode,
  isSoloThreadConversationMode,
  resolveConversationMode,
} from '../conversationMode';
import { useTranscriptAutoScroll } from '../hooks/useTranscriptAutoScroll';
import { resolveComposerWorkspacePath } from '../../../../core/workspacePaths';

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
  compareGroup?: ConcurrentChatGroupSummary | null;
  compareSendScope?: 'all_members' | 'active_only';
  onCompareSendScopeChange?: (value: 'all_members' | 'active_only') => void;
  onRelayMessage?: (messageId: string, command: ConcurrentChatRelayCommandKind) => Promise<void>;
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

  const leadParticipantId = selectedChannel.roomRouting.leadParticipantId;
  const leadCat = leadParticipantId
    ? activeAssignedCats.find((c) => c.catId === leadParticipantId)
    : null;
  const conversationMode = resolveConversationMode(selectedChannel);
  const compareMembers = compareGroup?.members ?? [];
  const compareMemberIndex = compareMembers.findIndex((member) => member.channelId === selectedChannel.id);
  const activeCompareMember = compareMemberIndex >= 0
    ? compareMembers[compareMemberIndex]
    : null;
  const isCompareGroup = compareMembers.length > 1;
  const compareGroupChannels = useMemo(
    () => compareMembers
      .map((member) =>
        payload.chat.channels.find((channel) => channel.id === member.channelId) ?? null,
      )
      .filter((channel): channel is AppShellPayload['chat']['channels'][number] => channel != null),
    [compareMembers, payload.chat.channels],
  );
  const compareDispatchBusy =
    busy === 'concurrent:ack'
    || busy === 'concurrent:dispatch'
    || busy === 'concurrent:relay'
    || busy === 'concurrent:stop';
  const compareRoutingBusy = compareGroupChannels.some((channel) =>
    channel.routingStatus === 'running',
  );
  const compareBusy = compareDispatchBusy || compareRoutingBusy;

  const isSoloComposer = isSoloThreadConversationMode(conversationMode);
  const isDirectLane = isDirectConversationMode(conversationMode);
  const layoutMode: ChatLayoutMode = isDirectLane
    ? 'direct_lane'
    : activeAssignedCats.length > 1
      ? 'multi_cat'
      : 'solo';
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cats');
  const [openRelayMenuId, setOpenRelayMenuId] = useState<string | null>(null);
  useEffect(() => {
    if (!openRelayMenuId) return;
    function onClickOutside(event: MouseEvent): void {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.messageActionMenu')) return;
      setOpenRelayMenuId(null);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [openRelayMenuId]);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  function openSidePanelTo(section: string): void {
    setSidePanelOpen(true);
    setSidePanelSection(section);
  }

  const directLaneCat = isDirectLane && leadCat
    ? payload.chat.cats.find((c) => c.id === leadCat.catId) ?? null
    : null;
  const bossCatRecord = payload.chat.bossCatId
    ? payload.chat.cats.find((c) => c.id === payload.chat.bossCatId) ?? null
    : null;
  const leadCatRecord = leadCat
    ? payload.chat.cats.find((c) => c.id === leadCat.catId) ?? null
    : null;
  const topBarTitle = isDirectLane
    ? (directLaneCat?.name ?? leadCatRecord?.name ?? presentChannelTitle(selectedChannel.title))
    : isCompareGroup && compareGroup
      ? presentChannelTitle(compareGroup.title)
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
    ? Boolean(leadCat)
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
    setOpenRelayMenuId(null);
  }, [selectedChannel.id, compareBusy]);

  const inspectedRun = useMemo(
    () => buildRunInspectorView(operatorView, inspectedRunId),
    [operatorView, inspectedRunId],
  );
  const composerBusy = isComposerBusy(busy) || compareBusy;
  const composerAckBusy = isComposerAckBusy(busy);
  const composerDispatchChannelId = getComposerDispatchChannelId(busy);
  const stopBusy = busy.startsWith('message:stop:') || busy === 'concurrent:stop';
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
      busy === 'concurrent:dispatch'
      || busy === 'concurrent:stop'
    );
  const showStopComposerAction = !showCancelComposerAction && (canStopSingleChat || canStopParallelChat);
  const comparePrevChannelId = isCompareGroup && compareMemberIndex >= 0
    ? compareMembers[(compareMemberIndex - 1 + compareMembers.length) % compareMembers.length]?.channelId ?? null
    : null;
  const compareNextChannelId = isCompareGroup && compareMemberIndex >= 0
    ? compareMembers[(compareMemberIndex + 1) % compareMembers.length]?.channelId ?? null
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

  async function copyMessageBody(body: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Ignore clipboard failures; the message stays available in the transcript.
    }
  }

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
        <header className="channelTopBar">
          <div className="channelTopBarStart">
            {showRosterAvatars ? (
              <div className="rosterAvatars rosterAvatarsExpanded">
                {topBarCats.map((cat) => {
                  const isBoss = cat.id === payload.chat.bossCatId;
                  const isLead = cat.id === leadParticipantId;
                  return (
                    <div
                      key={cat.id}
                      className={[
                        isBoss ? 'catAvatar catAvatarBoss' : 'catAvatar',
                        activeTopBarCatIdSet.has(cat.id) ? 'catAvatarPulsing' : '',
                      ].filter(Boolean).join(' ')}
                      data-tooltip={cat.name}
                      style={cat.avatarUrl
                        ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : cat.avatarColor ? { background: cat.avatarColor } : undefined}
                    >
                      {cat.avatarUrl ? null : catInitials(cat.name)}
                      {isLead ? <span className="catAvatarLeadBadge">&#x2605;</span> : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
            </div>
            <div className="channelTopBarCenter">
              <span className={isDirectLane
                ? 'channelTopBarTitle channelTopBarTitleDirectLane'
                : 'channelTopBarTitle'}
              >
                {topBarTitle}
              </span>
            </div>
          <div className="channelTopBarEnd">
            {isDirectLane && onToggleCompanionMode ? (
              <button
                className="companionToggleButton"
                type="button"
                onClick={onToggleCompanionMode}
                title="Open companion workspace"
              >
                Companion
              </button>
            ) : null}
            {onResumeChannel ? (
              <button
                className="channelActionIconButton"
                type="button"
                disabled={!canResumeChannel}
                onClick={() => void onResumeChannel()}
                aria-label={resumeBusy ? 'Resuming chat session' : 'Resume chat session'}
                data-tooltip={resumeBusy ? 'Resuming chat session' : 'Resume chat session'}
                aria-busy={resumeBusy}
              >
                <svg
                  className={resumeBusy
                    ? 'channelActionIconGlyph channelActionIconGlyphSpinning'
                    : 'channelActionIconGlyph'}
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M13 4v4H9" />
                  <path d="M12.35 8A5.35 5.35 0 1 1 10.7 4.15" />
                </svg>
              </button>
            ) : null}
            <button
              className="sidePanelToggle"
              type="button"
              onClick={() => setSidePanelOpen(!sidePanelOpen)}
              aria-label="Toggle inspector panel"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v12" />
                <rect x="2" y="2" width="12" height="12" rx="2" />
              </svg>
              {(operatorView?.approvals.length ?? 0) > 0 ? (
                <span className="sidePanelBadge">{operatorView?.approvals.length}</span>
              ) : null}
            </button>
          </div>
        </header>
        {layoutMetrics.catStatusRowVisible ? (() => {
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
        <div className="channelWorkspace">
          <section className={hasConversationStarted ? 'channelShell' : 'channelShell channelShellFresh'}>
            {/* Feedback is now shown via NotificationContainer */}

            {hasConversationStarted ? (
              <section className="transcriptPanel">
                <div ref={transcriptListRef} className="transcriptList">
                  {visibleMessages.map((message) => (
                    <article key={message.id} className={messageStackTone(message.senderKind)}>
                      <div className={messageTone(message.senderKind)}>
                        {message.senderKind !== 'user' && message.senderKind !== 'system' ? (() => {
                          const speaker = resolveTranscriptMessageSpeaker(message, payload.chat.cats);
                          return speaker.kind === 'cat' && speaker.cat ? (() => {
                            const isBoss = speaker.cat.id === payload.chat.bossCatId;
                            const isLead = speaker.cat.id === leadParticipantId;
                            return (
                              <div className="transcriptMessageTop">
                                <div
                                  className={isBoss ? 'catAvatar catAvatarBoss transcriptAvatar' : 'catAvatar transcriptAvatar'}
                                  style={speaker.cat.avatarUrl
                                    ? { backgroundImage: `url(${speaker.cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
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
                      </div>
                      {message.senderKind !== 'system' ? (
                        <div
                          className={[
                            'messageActions',
                            message.senderKind === 'user'
                              ? 'messageActionsHoverOnly'
                              : 'messageActionsPersistent',
                          ].join(' ')}
                        >
                          <button
                            className="messageActionIcon"
                            type="button"
                            onClick={() => { void copyMessageBody(message.body); }}
                            title="Copy message"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          {isCompareGroup && message.senderKind !== 'user' && onRelayMessage ? (
                            <div className="messageActionMenu">
                              <button
                                className="messageActionIcon"
                                type="button"
                                disabled={compareBusy}
                                title="Relay to others"
                                onClick={() =>
                                  setOpenRelayMenuId((current) =>
                                    current === message.id ? null : message.id,
                                  )}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                  <polyline points="16 6 12 2 8 6" />
                                  <line x1="12" y1="2" x2="12" y2="15" />
                                </svg>
                              </button>
                              {openRelayMenuId === message.id ? (
                                <div className="messageActionPopover">
                                  <button
                                    type="button"
                                    disabled={compareBusy}
                                    onClick={() => {
                                      setOpenRelayMenuId(null);
                                      void onRelayMessage(message.id, 'check_this');
                                    }}
                                  >
                                    Check with others
                                  </button>
                                  <button
                                    type="button"
                                    disabled={compareBusy}
                                    onClick={() => {
                                      setOpenRelayMenuId(null);
                                      void onRelayMessage(message.id, 'synthesize_this');
                                    }}
                                  >
                                    Synthesize with others
                                  </button>
                                  <div className="messageActionPopoverDivider" />
                                  <button
                                    type="button"
                                    disabled={compareBusy}
                                    onClick={() => {
                                      setOpenRelayMenuId(null);
                                      void onRelayMessage(message.id, 'improve_this');
                                    }}
                                  >
                                    Improve in others
                                  </button>
                                  <button
                                    type="button"
                                    disabled={compareBusy}
                                    onClick={() => {
                                      setOpenRelayMenuId(null);
                                      void onRelayMessage(message.id, 'adopt_this');
                                    }}
                                  >
                                    Adopt in others
                                  </button>
                                  <div className="messageActionPopoverDivider" />
                                  <button
                                    type="button"
                                    disabled={compareBusy}
                                    onClick={() => {
                                      setOpenRelayMenuId(null);
                                      void onRelayMessage(message.id, 'counter_this');
                                    }}
                                  >
                                    Counter with others
                                  </button>
                                  <button
                                    type="button"
                                    disabled={compareBusy}
                                    onClick={() => {
                                      setOpenRelayMenuId(null);
                                      void onRelayMessage(message.id, 'debate_this');
                                    }}
                                  >
                                    Debate with others
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {message.choices && message.choices.length > 0 ? (
                        <MessageChoices
                          channelId={selectedChannel.id}
                          messageId={message.id}
                          choices={message.choices}
                          existingResponse={choiceResponsesBySource.get(message.id) ?? null}
                          busy={busy.startsWith(`choice:${message.id}:`)}
                          onSubmit={onChoiceSubmit}
                        />
                      ) : null}
                    </article>
                  ))}
                  {liveIndicator?.active ? (() => {
                    const speakerCat = liveIndicator.catId
                      ? payload.chat.cats.find((c) => c.id === liveIndicator.catId) ?? null
                      : null;
                    const speakerLabel = speakerCat?.name ?? liveIndicator.speakerLabel;
                    const livePreviewText = liveIndicator.previewText ?? '';
                    const hasContentBlocks = liveIndicator.contentBlocks.length > 0;
                    const showPreviewText = !hasContentBlocks && livePreviewText.trim().length > 0;
                    const activeTools = liveIndicator.tools.filter((t) => !t.done);
                    return (
                      <article className="transcriptMessageStack transcriptMessageStackAgent typingIndicator">
                        <div className="transcriptMessage transcriptMessageAgent">
                          {speakerCat ? (
                            <div className="transcriptMessageTop">
                              <div
                                className={speakerCat.id === payload.chat.bossCatId ? 'catAvatar catAvatarBoss transcriptAvatar' : 'catAvatar transcriptAvatar'}
                                style={speakerCat.avatarUrl
                                  ? { backgroundImage: `url(${speakerCat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                                  : speakerCat.avatarColor ? { background: speakerCat.avatarColor } : undefined}
                              >
                                {speakerCat.avatarUrl ? null : catInitials(speakerCat.name)}
                              </div>
                              <strong>{speakerCat.name}</strong>
                            </div>
                          ) : speakerLabel ? (
                            <div className="transcriptMessageTop">
                              <strong>{speakerLabel}</strong>
                            </div>
                          ) : null}
                          {liveIndicator.phase === 'waiting' ? (
                            <span className="typingDots"><span /><span /><span /></span>
                          ) : (
                            <>
                              {showPreviewText ? (
                                <MessageBody
                                  body={liveIndicator.previewText}
                                  cats={payload.chat.cats}
                                  channelId={selectedChannel.id}
                                  disabledMentionNames={directLaneExcludedMentionNames}
                                />
                              ) : liveIndicator.progressText ? (
                                <p className="typingStatusText">{liveIndicator.progressText}</p>
                              ) : (
                                <span className="typingDots"><span /><span /><span /></span>
                              )}
                              {!showPreviewText && !hasContentBlocks && activeTools.map((tool) => (
                                <span key={tool.toolId} className="typingToolChip">{tool.toolName}</span>
                              ))}
                              {hasContentBlocks ? (
                                <div className="typingContentBlocks">
                                  {liveIndicator.contentBlocks.map((block) => (
                                    <div
                                      key={block.id}
                                      className={[
                                        'typingContentBlock',
                                        block.kind === 'text'
                                          ? 'typingContentBlockText'
                                          : block.kind === 'tool'
                                            ? 'typingContentBlockTool'
                                            : 'typingContentBlockStatus',
                                        block.status === 'streaming'
                                          ? 'typingContentBlockStreaming'
                                          : block.status === 'error'
                                            ? 'typingContentBlockError'
                                            : '',
                                      ].filter(Boolean).join(' ')}
                                    >
                                      {block.kind !== 'text' && block.title ? (
                                        <span className="typingContentBlockTitle">{block.title}</span>
                                      ) : null}
                                      {block.text ? (
                                        <span className="typingContentBlockBody">{block.text}</span>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : liveIndicator.events.length > 0 ? (
                                <div className="typingEventTape">
                                  {liveIndicator.events.map((event, index) => (
                                    <div
                                      key={`${event.eventType}:${event.toolId ?? ''}:${index}`}
                                      className={[
                                        'typingEventRow',
                                        event.tone === 'active'
                                          ? 'typingEventRowActive'
                                          : event.tone === 'success'
                                            ? 'typingEventRowSuccess'
                                            : event.tone === 'error'
                                              ? 'typingEventRowError'
                                              : '',
                                      ].filter(Boolean).join(' ')}
                                    >
                                      <span className="typingEventLabel">{event.label}</span>
                                      <span className="typingEventText">{event.text}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })() : null}
                </div>
              </section>
            ) : (
              <section className="freshChatIntro">
                <div className="draftGreeting"><h1>{greeting}</h1></div>
              </section>
            )}

            <form
              ref={composerCardRef}
              className={
                hasConversationStarted
                  ? isCompareGroup
                    ? 'composerCard composerCardDocked composerCardDockedParallel'
                    : 'composerCard composerCardDocked'
                  : 'composerCard composerCardFresh'
              }
              onSubmit={(event) => void onSendMessage(event)}
            >
              {hasConversationStarted && !isNearBottom ? (
                <button
                  className="scrollToBottomButton"
                  type="button"
                  aria-label="Scroll to latest"
                  onClick={scrollToBottom}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v10" />
                    <path d="M3 9l5 5 5-5" />
                  </svg>
                </button>
              ) : null}
              {channelFiles.length > 0 ? (
                <div className="composerAttachments">
                  {channelFiles.map((file, index) => {
                    const isImage = file.type.startsWith('image/');
                    return (
                      <div key={`${file.name}-${file.size}-${index}`} className="attachmentCard">
                        <button
                          className="attachmentRemove"
                          type="button"
                          disabled={composerBusy}
                          onClick={() => onChannelFilesChange(channelFiles.filter((_, i) => i !== index))}
                          aria-label={`Remove ${file.name}`}
                        >
                          &times;
                        </button>
                        {isImage ? (
                          <img
                            className="attachmentPreview"
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                          />
                        ) : (
                          <div className="attachmentFileIcon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                            </svg>
                          </div>
                        )}
                        <span className="attachmentName">{file.name}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="composerInputWrapper">
                <ComposerHighlight
                  text={composerDraft}
                  cats={payload.chat.cats}
                  excludedMentionNames={directLaneExcludedMentionNames}
                />
                <textarea
                  className="composerInput composerInputOverlay"
                  rows={1}
                  placeholder={compareBusy ? 'Waiting for parallel replies...' : hasConversationStarted ? 'Reply...' : 'How can I help you today?'}
                  value={composerDraft}
                  disabled={composerBusy}
                  onChange={(event) => { onComposerChange(event.target.value); autoResize(event.target); }}
                  onKeyDown={(event) => void onComposerKeyDown(event)}
                />
              </div>
              <div className="composerBottomRow">
                <div className="composerLeftGroup">
                  <div className="composerPlusWrapper" ref={channelPlusMenuRef}>
                    <button
                      className="composerPlusButton"
                      type="button"
                      aria-label="Attach"
                      disabled={composerBusy}
                      onClick={onToggleChannelPlusMenu}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3v10" />
                        <path d="M3 8h10" />
                      </svg>
                    </button>
                    {channelPlusMenuOpen ? (
                      <div className="composerPlusMenu">
                        <button
                          className="composerPlusMenuItem"
                          type="button"
                          disabled={composerBusy}
                          onClick={onChannelFileSelect}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
                            <path d="M8 2v8" />
                            <path d="M4 6l4-4 4 4" />
                          </svg>
                          Add photos and files
                        </button>
                      </div>
                    ) : null}
                  </div>
                {(() => {
                  if (!composerWorkspacePath) return null;
                  return (
                    <span
                      className="composerCwdChip composerCwdClickable"
                      data-tooltip={composerWorkspacePath}
                      role="button"
                      tabIndex={0}
                      onClick={() => openSidePanelTo('cwd')}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8L6.5 3H3a1 1 0 0 0-1 1z" />
                      </svg>
                      <span>{truncatePath(composerWorkspacePath)}</span>
                    </span>
                  );
                })()}
              </div>
                {isDirectLane && directLaneCat && directLaneModelValue ? (
                  <ComposerCatStack
                    cats={[directLaneCat]}
                    bossCatId={payload.chat.bossCatId}
                    leadCatId={directLaneCat.id}
                    onClick={composerBusy ? undefined : () => openSidePanelTo('execution')}
                  />
                ) : isSoloComposer && selectedModel && onModelChange ? (
                  <div style={{ marginRight: 8 }}>
                    <ModelSelectorChip
                      label={buildModelSelectorLabel(selectedModel)}
                      onClick={composerBusy ? undefined : () => openSidePanelTo('execution')}
                    />
                  </div>
                ) : !isSoloComposer && leadCat ? (
                  <ComposerCatStack
                    cats={assignedCatRecords.length > 0
                      ? assignedCatRecords
                      : leadCatRecord ? [leadCatRecord] : []}
                    bossCatId={payload.chat.bossCatId}
                    leadCatId={leadCat.catId}
                    onClick={composerBusy ? undefined : () => openSidePanelTo('execution')}
                  />
                ) : null}
                {showCancelComposerAction ? (
                  <button
                    className="composerSendButton composerCancelButton"
                    type="button"
                    aria-label="Cancel send"
                    onClick={() => onCancelPendingSend?.()}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 4l6 6" />
                      <path d="M10 4l-6 6" />
                    </svg>
                  </button>
                ) : showStopComposerAction ? (
                  <button
                    className="composerSendButton composerStopButton"
                    disabled={stopBusy}
                    type="button"
                    aria-label="Stop"
                    onClick={() => void onStopMessage?.()}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                      <rect x="3" y="3" width="8" height="8" rx="1.6" />
                    </svg>
                  </button>
                ) : isCompareGroup ? (
                  <div className="composerSplitSend">
                    <button
                      className="composerSplitSendMain"
                      disabled={!composerDraft.trim() || composerBusy || compareBusy}
                      type="submit"
                      aria-label={compareSendScope === 'all_members' ? 'Send to all chats' : 'Send to this chat'}
                    >
                      {compareSendScope === 'all_members' ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 13V6" /><path d="M1 9l3-3 3 3" />
                          <path d="M12 13V6" /><path d="M9 9l3-3 3 3" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 13V3" />
                          <path d="M3 7l5-5 5 5" />
                        </svg>
                      )}
                    </button>
                    <button
                      className="composerSplitSendToggle"
                      type="button"
                      aria-label="Switch send mode"
                      onClick={() => onCompareSendScopeChange?.(compareSendScope === 'all_members' ? 'active_only' : 'all_members')}
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 3l3 3 3-3" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    className="composerSendButton"
                    disabled={!composerDraft.trim() || composerBusy || compareBusy}
                    type="submit"
                    aria-label="Send"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 13V3" />
                      <path d="M3 7l5-5 5 5" />
                    </svg>
                  </button>
                )}
              </div>
              <input
                ref={channelFileInputRef}
                type="file"
                multiple
                disabled={composerBusy}
                style={{ display: 'none' }}
                onChange={(event) => {
                  const input = event.currentTarget;
                  if (input.files && input.files.length > 0) {
                    const selected = Array.from(input.files);
                    onChannelFilesChange([...channelFiles, ...selected]);
                  }
                  input.value = '';
                }}
              />
            </form>
            {isCompareGroup ? (
              <nav className="parallelFooterBar" aria-label="Parallel chat navigation">
                <button
                  className="parallelFooterNavButton"
                  type="button"
                  disabled={!comparePrevChannelId}
                  onClick={() => navigateCompareMember('prev')}
                  aria-label="Previous parallel chat"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="parallelFooterTabs" role="tablist" aria-label="Parallel chats">
                  {compareMembers.map((member) => {
                    const active = member.channelId === selectedChannel.id;
                    const label = buildConcurrentChatMemberLabel(member);
                    return (
                      <button
                        key={member.channelId}
                        className={active ? 'parallelFooterTab parallelFooterTabActive' : 'parallelFooterTab'}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        title={`${label} · ${presentChannelTitle(member.title)}`}
                        onClick={() => onSelect(member.channelId)}
                      >
                        <span className="parallelFooterTabLabel">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="parallelFooterNavButton"
                  type="button"
                  disabled={!compareNextChannelId}
                  onClick={() => navigateCompareMember('next')}
                  aria-label="Next parallel chat"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </nav>
            ) : null}
            <div ref={bottomSentinelRef} className="transcriptBottomSentinel" aria-hidden="true" />
          </section>

        </div>
      </div>
      {sidePanelOpen ? (
        <SidePanel
          title="Chat Setup"
          activeSection={sidePanelSection}
          onSectionToggle={setSidePanelSection}
          onClose={() => setSidePanelOpen(false)}
          position={layoutMetrics.secondarySurfacePosition === 'bottom' ? 'bottom' : 'side'}
          className="chatPaneSidePanel chatPaneSidePanelBelowBar"
          sections={buildSidePanelSections()}
        />
      ) : null}
    </>
  );

  function buildSidePanelSections(): SidePanelSection[] {
    const sections: SidePanelSection[] = [];

    if (showAddCatButton || assignedCatRecords.length > 0) {
      sections.push({
        id: 'cats',
        title: 'Cats',
        children: (
          <div className="sidePanelSectionStack">
            {assignedCatRecords.length > 0 ? (
              <CatAvatarRow
                cats={assignedCatRecords}
                bossCatId={payload.chat.bossCatId}
                selectedIds={assignedCatRecords.map((cat) => cat.id)}
                highlightedId={leadCat?.catId ?? null}
                leadCatId={leadCat?.catId ?? null}
                toggleable={false}
                showLeadBadge
                onToggle={() => {}}
                onHighlight={() => {}}
              />
            ) : (
              <p className="operatorEmptyState">No cats are in this chat yet.</p>
            )}
            {showAddCatButton ? (
              <button
                type="button"
                className="operatorActionButton"
                onClick={() => {
                  setSidePanelOpen(false);
                  onOpenAddCat?.();
                }}
              >
                Choose cats
              </button>
            ) : null}
          </div>
        ),
      });
    }

    const executionChildren = (() => {
      if (isDirectLane && directLaneCat && directLaneModelValue) {
        return (
          <>
            <CatAvatarRow
              cats={[directLaneCat]}
              bossCatId={payload.chat.bossCatId}
              selectedIds={[directLaneCat.id]}
              highlightedId={directLaneCat.id}
              leadCatId={directLaneCat.id}
              toggleable={false}
              showLeadBadge
              onToggle={() => {}}
              onHighlight={() => {}}
            />
            <ProviderModelFields
              provider={directLaneModelValue.provider}
              instance={directLaneModelValue.instance ?? ''}
              model={directLaneModelValue.model ?? ''}
              modelSelection={directLaneModelValue.modelSelection}
              onTargetChange={(target: ProviderTargetSelection) => {
                onDirectLaneModelChange?.(directLaneCat.id, {
                  provider: target.provider,
                  model: target.model || null,
                  instance: target.instance || null,
                  modelSelection: target.modelSelection ?? null,
                });
              }}
            />
          </>
        );
      }
      if (isSoloComposer && selectedModel && onModelChange) {
        return (
          <ProviderModelFields
            provider={selectedModel.provider}
            instance={selectedModel.instance ?? ''}
            model={selectedModel.model ?? ''}
            modelSelection={selectedModel.modelSelection}
            onTargetChange={(target: ProviderTargetSelection) => {
              onModelChange({
                provider: target.provider,
                model: target.model || null,
                instance: target.instance || null,
                modelSelection: target.modelSelection ?? null,
              });
            }}
          />
        );
      }
      if (!isSoloComposer && leadCat) {
        const catRecord = payload.chat.cats.find((c) => c.id === leadCat.catId);
        const providerName = getProviderDisplayName(leadCat.execution.target.provider);
        const modelLabel = leadCat.execution.target.model
          ? (getProviderModels(leadCat.execution.target.provider)
              .find((m) => m.value === leadCat.execution.target.model)?.label ?? leadCat.execution.target.model)
              .replace(/\s*\(default\)\s*/iu, '')
          : null;
        return (
          <div className="catInspectPanelBody">
            <div className="catInspectIdentity">
              <div
                className={leadCat.catId === payload.chat.bossCatId ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
                style={catRecord?.avatarUrl
                  ? { backgroundImage: `url(${catRecord.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : leadCat.avatarColor ? { background: leadCat.avatarColor } : undefined}
              >
                {catRecord?.avatarUrl ? null : catInitials(leadCat.name)}
              </div>
              <div>
                <strong>{leadCat.name}</strong>
                {leadCat.catId === payload.chat.bossCatId ? <span className="catInspectBadge">Boss</span> : null}
              </div>
            </div>
            <div className="catInspectField">
              <span className="catInspectFieldLabel">AI Service</span>
              <span>{providerName}</span>
            </div>
            {leadCat.execution.target.instance ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Connection</span>
                <span>{leadCat.execution.target.instance}</span>
              </div>
            ) : null}
            <div className="catInspectField">
              <span className="catInspectFieldLabel">Model</span>
              <span>{modelLabel ?? 'default'}</span>
            </div>
          </div>
        );
      }
      return <p className="operatorEmptyState">No AI reply setup yet.</p>;
    })();
    sections.push({ id: 'execution', title: 'AI Reply', children: executionChildren });

    const cwd = selectedChannel.repoPath ?? selectedChannel.chatCwd;
    sections.push({
      id: 'cwd',
      title: 'Folder',
      children: cwd ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', wordBreak: 'break-all' }}>{cwd}</p>
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => void openFolderInExplorer(cwd)}
          >
            Open folder
          </button>
        </div>
      ) : (
        <p className="operatorEmptyState">No folder selected yet.</p>
      ),
    });

    sections.push({
      id: 'operator',
      title: 'Run Status',
      badge: operatorView?.approvals.length ?? 0,
      children: (
        <>
          {operatorError ? (
            <section className="operatorPanel operatorPanelError">
              <div className="operatorPanelHeader">
                <div>
                  <p className="operatorEyebrow">Run Status</p>
                  <h2>Status unavailable</h2>
                </div>
              </div>
              <p className="operatorEmptyState">{operatorError}</p>
            </section>
          ) : null}
          {operatorLoading && !operatorView ? (
            <section className="operatorPanel">
              <div className="operatorPanelHeader">
                <div>
                  <p className="operatorEyebrow">Run Status</p>
                  <h2>Loading</h2>
                </div>
              </div>
              <p className="operatorEmptyState">Loading approvals, activity, and run details.</p>
            </section>
          ) : null}
          <ApprovalQueuePanel
            approvals={operatorView?.approvals ?? []}
            actorNameById={operatorView?.actorNameById ?? {}}
            busy={busy}
            onDecision={onApprovalDecision}
          />
          <ProgressSummaryPanel
            inspector={inspectedRun}
            effectivePolicy={operatorView?.effectivePolicy ?? null}
            incidentActions={inspectedRun?.incidentActions ?? operatorView?.incidentActions ?? []}
            pendingApprovalCount={operatorView?.approvals.length ?? 0}
            guardReason={inspectedRun?.guardReason ?? operatorView?.guardReason ?? null}
            cooldownLabel={inspectedRun?.cooldownLabel ?? operatorView?.cooldownLabel ?? null}
            onInspectRun={setInspectedRunId}
            onOperatorAction={onOperatorAction}
          />
          <ActivityFeed items={operatorView?.activityFeed ?? []} />
          <RunInspector
            runs={operatorView?.runs ?? []}
            actorNameById={operatorView?.actorNameById ?? {}}
            inspector={inspectedRun}
            onSelectRun={setInspectedRunId}
          />
        </>
      ),
    });

    return sections;
  }
}
