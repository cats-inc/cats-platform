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
  buildDraftParticipantExecutionLabel,
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
  activeAssignedParticipants,
  findAssignedParticipant,
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
import { useTranscriptAutoScroll } from '../hooks/useTranscriptAutoScroll';
import { resolveComposerWorkspacePath } from '../../../../core/workspacePaths';
import { buildChatSidePanelSections } from './chat-view/ChatSidePanelSections';
import { ChatComposerArea } from './chat-view/ChatComposerArea';
import { ParallelFooterBar } from './chat-view/ParallelFooterBar';
import { LiveTranscriptIndicator } from './chat-view/LiveTranscriptIndicator';
import { TranscriptMessageItem } from './chat-view/TranscriptMessageItem';

type TopBarParticipant = {
  key: string;
  label: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss: boolean;
  useNeutralAvatar: boolean;
  pulseParticipantId: string | null;
  pulseCatId: string | null;
};

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

  function buildAvatarStyle(
    avatarUrl: string | null,
    avatarColor: string | null,
    useColorFallback: boolean,
  ): CSSProperties | undefined {
    if (avatarUrl) {
      return {
        backgroundImage: `url(${avatarUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (useColorFallback && avatarColor) {
      return { background: avatarColor };
    }
    return undefined;
  }

  function buildParticipantAvatarStyle(
    participant: ResolvedChannelParticipant,
    catRecord: ChatCat | null = null,
  ): CSSProperties | undefined {
    return buildAvatarStyle(
      catRecord?.avatarUrl ?? participant.avatarUrl ?? null,
      catRecord?.avatarColor ?? participant.avatarColor ?? null,
      catRecord != null,
    );
  }

  const visibleMessages = selectedChannel.messages.filter(
    (message) => payload.chat.showVerboseMessages || message.metadata?.verbosity !== 'verbose',
  );
  const hasConversationStarted = visibleMessages.length > 0;

  const defaultRecipientId = selectedChannel.roomRouting.defaultRecipientId;
  const activeRoomParticipants = useMemo<ResolvedChannelParticipant[]>(
    () => activeAssignedParticipants(selectedChannel),
    [selectedChannel],
  );
  const defaultRecipientParticipant = defaultRecipientId
    ? activeRoomParticipants.find((participant) => participant.participantId === defaultRecipientId)
      ?? null
    : activeRoomParticipants[0] ?? null;
  const defaultRecipientCat = defaultRecipientParticipant?.sourceKind === 'cat'
    ? activeAssignedCats.find((candidate) =>
      candidate.participantId === defaultRecipientParticipant.participantId)
      ?? null
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
  const layoutMode: ChatLayoutMode = isDirectLane
    ? 'direct_lane'
    : activeRoomParticipants.length > 1
      ? 'multi_cat'
      : 'solo';
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelSection, setSidePanelSection] = useState<string | null>('cats');
  const [openRelayMenuId, setOpenRelayMenuId] = useState<string | null>(null);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editingParticipantName, setEditingParticipantName] = useState('');
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

  const directLaneCat = isDirectLane && defaultRecipientCat
    ? payload.chat.cats.find((c) => c.id === defaultRecipientCat.catId) ?? null
    : null;
  const bossCatRecord = payload.chat.bossCatId
    ? payload.chat.cats.find((c) => c.id === payload.chat.bossCatId) ?? null
    : null;
  const defaultRecipientCatRecord = defaultRecipientCat
    ? payload.chat.cats.find((c) => c.id === defaultRecipientCat.catId) ?? null
    : null;
  const catsById = useMemo(
    () => new Map(payload.chat.cats.map((cat) => [cat.id, cat] as const)),
    [payload.chat.cats],
  );

  function resolveParticipantCatRecord(
    participant: ResolvedChannelParticipant | null | undefined,
  ): ChatCat | null {
    if (!participant) {
      return null;
    }
    const catId = resolveParticipantCatId(participant);
    return catId ? catsById.get(catId) ?? null : null;
  }

  function participantUsesNeutralAvatar(
    participant: ResolvedChannelParticipant | null | undefined,
    catRecord: ChatCat | null = resolveParticipantCatRecord(participant),
  ): boolean {
    return !participant || catRecord == null;
  }

  function resolveParticipantDisplayName(
    participant: ResolvedChannelParticipant,
    catRecord: ChatCat | null = resolveParticipantCatRecord(participant),
  ): string {
    return catRecord?.name ?? participant.name;
  }

  function resolveParticipantAvatarUrl(
    participant: ResolvedChannelParticipant,
    catRecord: ChatCat | null = resolveParticipantCatRecord(participant),
  ): string | null {
    return catRecord?.avatarUrl ?? participant.avatarUrl ?? null;
  }

  function buildParticipantAvatarClassName(
    participant: ResolvedChannelParticipant,
    options: {
      transcript?: boolean;
      composer?: boolean;
      catRecord?: ChatCat | null;
    } = {},
  ): string {
    const catRecord = options.catRecord ?? resolveParticipantCatRecord(participant);
    return [
      'catAvatar',
      options.transcript ? 'transcriptAvatar' : '',
      options.composer ? 'composerStackAvatar' : '',
      catRecord?.id === payload.chat.bossCatId ? 'catAvatarBoss' : '',
      participantUsesNeutralAvatar(participant, catRecord) ? 'channelParticipantAvatar' : '',
    ].filter(Boolean).join(' ');
  }

  function readMessageExecutionLabelSnapshot(
    message: SelectedChannelView['messages'][number],
  ): string | null {
    const snapshot = message.metadata?.executionLabelSnapshot;
    return typeof snapshot === 'string' && snapshot.trim() ? snapshot.trim() : null;
  }

  function resolveMessageParticipant(
    message: SelectedChannelView['messages'][number],
  ): ResolvedChannelParticipant | null {
    const targetId = typeof message.metadata?.targetId === 'string'
      ? message.metadata.targetId.trim()
      : '';
    if (targetId) {
      return findAssignedParticipant(selectedChannel, targetId);
    }

    const candidateLabels = new Set<string>();
    const trimmedSenderName = message.senderName?.trim();
    if (trimmedSenderName && trimmedSenderName !== 'Orchestrator') {
      candidateLabels.add(trimmedSenderName);
    }
    const executionLabelSnapshot = readMessageExecutionLabelSnapshot(message);
    if (executionLabelSnapshot) {
      candidateLabels.add(executionLabelSnapshot);
    }
    if (candidateLabels.size === 0) {
      return null;
    }

    return activeRoomParticipants.find((participant) => {
      const executionLabel = buildDraftParticipantExecutionLabel(participant.execution.target);
      return candidateLabels.has(participant.name) || candidateLabels.has(executionLabel);
    }) ?? null;
  }
  const topBarTitle = isDirectLane
    ? (directLaneCat?.name ?? defaultRecipientCatRecord?.name ?? presentChannelTitle(selectedChannel.title))
    : isCompareGroup && compareGroup
      ? presentChannelTitle(compareGroup.title)
      : presentChannelTitle(selectedChannel.title);
  const assignedCatRecords = useMemo(
    () =>
      activeRoomParticipants
        .map((participant) => {
          const catRef = resolveParticipantCatId(participant);
          return catRef
            ? payload.chat.cats.find((cat) => cat.id === catRef) ?? null
            : null;
        })
        .filter((cat): cat is ChatCat => cat != null),
    [activeRoomParticipants, payload.chat.cats],
  );
  const assignedAdhocParticipants = useMemo(
    () => activeRoomParticipants.filter((participant) => participant.sourceKind !== 'cat'),
    [activeRoomParticipants],
  );
  const topBarParticipants = useMemo<TopBarParticipant[]>(() => {
    const ordered: TopBarParticipant[] = [];
    if (isDirectLane) {
      if (defaultRecipientCatRecord) {
        ordered.push({
          key: `participant:${defaultRecipientCatRecord.id}`,
          label: defaultRecipientCatRecord.name,
          avatarColor: defaultRecipientCatRecord.avatarColor ?? null,
          avatarUrl: defaultRecipientCatRecord.avatarUrl ?? null,
          isBoss: defaultRecipientCatRecord.id === payload.chat.bossCatId,
          useNeutralAvatar: false,
          pulseParticipantId: defaultRecipientParticipant?.participantId ?? null,
          pulseCatId: defaultRecipientCatRecord.id,
        });
      }
    } else {
      if (showBossCatAvatar && !isSoloComposer) {
        if (bossCatRecord) {
          ordered.push({
            key: `participant:${bossCatRecord.id}`,
            label: bossCatRecord.name,
            avatarColor: bossCatRecord.avatarColor ?? null,
            avatarUrl: bossCatRecord.avatarUrl ?? null,
            isBoss: true,
            useNeutralAvatar: false,
            pulseParticipantId: null,
            pulseCatId: bossCatRecord.id,
          });
        }
      }
      for (const participant of activeRoomParticipants) {
        const catRecord = resolveParticipantCatRecord(participant);
        ordered.push({
          key: `participant:${participant.participantId}`,
          label: resolveParticipantDisplayName(participant, catRecord),
          avatarColor: catRecord?.avatarColor ?? participant.avatarColor ?? null,
          avatarUrl: resolveParticipantAvatarUrl(participant, catRecord),
          isBoss: catRecord?.id === payload.chat.bossCatId,
          useNeutralAvatar: participantUsesNeutralAvatar(participant, catRecord),
          pulseParticipantId: participant.participantId,
          pulseCatId: catRecord?.id ?? null,
        });
      }
    }
    const seen = new Set<string>();
    return ordered.filter((participant) => {
      if (seen.has(participant.key)) {
        return false;
      }
      seen.add(participant.key);
      return true;
    });
  }, [
    activeRoomParticipants,
    bossCatRecord,
    catsById,
    defaultRecipientParticipant,
    isDirectLane,
    isSoloComposer,
    defaultRecipientCatRecord,
    payload.chat.bossCatId,
    showBossCatAvatar,
  ]);
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
      ? findAssignedParticipant(selectedChannel, liveSpeakerParticipantId)
      : liveIndicator?.catId
        ? activeRoomParticipants.find((participant) =>
          resolveParticipantCatId(participant) === liveIndicator.catId)
          ?? null
        : null,
    [
      activeRoomParticipants,
      liveIndicator?.catId,
      liveSpeakerParticipantId,
      selectedChannel,
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
      bottomSentinelRef={bottomSentinelRef}
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

            {hasConversationStarted ? (
              <section className="transcriptPanel">
                <div ref={transcriptListRef} className="transcriptList">
                  {visibleMessages.map((message) => (
                    <TranscriptMessageItem
                      key={message.id}
                      message={message}
                      stackClassName={messageStackTone(message.senderKind)}
                      cats={payload.chat.cats}
                      bossCatId={payload.chat.bossCatId}
                      selectedChannelId={selectedChannel.id}
                      disabledMentionNames={directLaneExcludedMentionNames}
                      compareBusy={compareBusy}
                      choiceBusy={busy.startsWith(`choice:${message.id}:`)}
                      isCompareGroup={isCompareGroup}
                      relayMenuOpen={openRelayMenuId === message.id}
                      existingChoiceResponse={choiceResponsesBySource.get(message.id) ?? null}
                      onChoiceSubmit={onChoiceSubmit}
                      onCopyMessage={copyMessageBody}
                      onToggleRelayMenu={() =>
                        setOpenRelayMenuId((current) =>
                          current === message.id ? null : message.id,
                        )}
                      onCloseRelayMenu={() => setOpenRelayMenuId(null)}
                      onRelayMessage={onRelayMessage}
                      resolveMessageParticipant={resolveMessageParticipant}
                      resolveParticipantCatRecord={resolveParticipantCatRecord}
                      buildParticipantAvatarClassName={buildParticipantAvatarClassName}
                      buildParticipantAvatarStyle={buildParticipantAvatarStyle}
                      resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
                      resolveParticipantDisplayName={resolveParticipantDisplayName}
                    />
                  ))}
                  {liveIndicator?.active ? (
                    <LiveTranscriptIndicator
                      cats={payload.chat.cats}
                      bossCatId={payload.chat.bossCatId}
                      selectedChannelId={selectedChannel.id}
                      disabledMentionNames={directLaneExcludedMentionNames}
                      liveIndicator={liveIndicator}
                      liveSpeakerParticipant={liveSpeakerParticipant}
                      liveSpeakerParticipantCat={liveSpeakerParticipant
                        ? catsById.get(resolveParticipantCatId(liveSpeakerParticipant) ?? '') ?? null
                        : null}
                      buildParticipantAvatarClassName={buildParticipantAvatarClassName}
                      buildParticipantAvatarStyle={buildParticipantAvatarStyle}
                      resolveParticipantAvatarUrl={resolveParticipantAvatarUrl}
                      resolveParticipantDisplayName={resolveParticipantDisplayName}
                    />
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="freshChatIntro">
                <div className="draftGreeting"><h1>{greeting}</h1></div>
              </section>
            )}

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
                selectedChannelId={selectedChannel.id}
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
