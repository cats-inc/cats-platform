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
import { SidePanel, type SidePanelSection } from '../../../../design/components/SidePanel';
import {
  resolveLayoutMetrics,
  type ChatLayoutMode,
} from '../../../../design/chatLayout';
import {
  buildDraftParticipantExecutionLabel,
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
  ComposerRecipientChip,
  buildNamedRecipient,
  buildRecipientFromCat,
  buildImplicitRecipient,
} from './ComposerRecipientChip';
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
import { ParallelFooterBar } from './chat-view/ParallelFooterBar';
import { TranscriptMessageActions } from './chat-view/TranscriptMessageActions';

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
          sections={buildSidePanelSections()}
        />
      ) : null}
    >

            {hasConversationStarted ? (
              <section className="transcriptPanel">
                <div ref={transcriptListRef} className="transcriptList">
                  {visibleMessages.map((message) => (
                    <article key={message.id} className={messageStackTone(message.senderKind)}>
                      <div className={messageTone(message.senderKind)}>
                        {message.senderKind !== 'user' && message.senderKind !== 'system' ? (() => {
                          const speaker = resolveTranscriptMessageSpeaker(message, payload.chat.cats);
                          const transcriptParticipant = resolveMessageParticipant(message);
                          const transcriptParticipantCat = resolveParticipantCatRecord(
                            transcriptParticipant,
                          );
                          return transcriptParticipant ? (
                            <div className="transcriptMessageTop">
                              <div
                                className={buildParticipantAvatarClassName(
                                  transcriptParticipant,
                                  {
                                    transcript: true,
                                    catRecord: transcriptParticipantCat,
                                  },
                                )}
                                style={buildParticipantAvatarStyle(
                                  transcriptParticipant,
                                  transcriptParticipantCat,
                                )}
                              >
                                {resolveParticipantAvatarUrl(
                                  transcriptParticipant,
                                  transcriptParticipantCat,
                                ) ? null : catInitials(resolveParticipantDisplayName(
                                  transcriptParticipant,
                                  transcriptParticipantCat,
                                ))}
                              </div>
                              <strong>{resolveParticipantDisplayName(
                                transcriptParticipant,
                                transcriptParticipantCat,
                              )}</strong>
                            </div>
                          ) : speaker.kind === 'cat' && speaker.cat ? (() => {
                            const isBoss = speaker.cat.id === payload.chat.bossCatId;
                            return (
                              <div className="transcriptMessageTop">
                                <div
                                  className={isBoss ? 'catAvatar catAvatarBoss transcriptAvatar' : 'catAvatar transcriptAvatar'}
                                  style={speaker.cat.avatarUrl
                                    ? { backgroundImage: `url(${speaker.cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                                    : speaker.cat.avatarColor ? { background: speaker.cat.avatarColor } : undefined}
                                >
                                  {speaker.cat.avatarUrl ? null : catInitials(speaker.cat.name)}
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
                      <TranscriptMessageActions
                        messageId={message.id}
                        messageBody={message.body}
                        senderKind={message.senderKind}
                        compareBusy={compareBusy}
                        isCompareGroup={isCompareGroup}
                        relayMenuOpen={openRelayMenuId === message.id}
                        onCopyMessage={copyMessageBody}
                        onToggleRelayMenu={() =>
                          setOpenRelayMenuId((current) =>
                            current === message.id ? null : message.id,
                          )}
                        onCloseRelayMenu={() => setOpenRelayMenuId(null)}
                        onRelayMessage={onRelayMessage}
                      />

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
                    const liveSpeakerParticipantCatId = liveSpeakerParticipant
                      ? resolveParticipantCatId(liveSpeakerParticipant)
                      : null;
                    const liveSpeakerParticipantCat = liveSpeakerParticipantCatId
                      ? catsById.get(liveSpeakerParticipantCatId) ?? null
                      : null;
                    const speakerLabel = liveSpeakerParticipant?.name
                      ?? liveSpeakerParticipantCat?.name
                      ?? speakerCat?.name
                      ?? liveIndicator.speakerLabel;
                    const livePreviewText = liveIndicator.previewText ?? '';
                    const hasContentBlocks = liveIndicator.contentBlocks.length > 0;
                    const showPreviewText = !hasContentBlocks && livePreviewText.trim().length > 0;
                    const activeTools = liveIndicator.tools.filter((t) => !t.done);
                    return (
                      <article className="transcriptMessageStack transcriptMessageStackAgent typingIndicator">
                        <div className="transcriptMessage transcriptMessageAgent">
                          {liveSpeakerParticipant ? (
                            <div className="transcriptMessageTop">
                              <div
                                className={buildParticipantAvatarClassName(
                                  liveSpeakerParticipant,
                                  {
                                    transcript: true,
                                    catRecord: liveSpeakerParticipantCat,
                                  },
                                )}
                                style={buildParticipantAvatarStyle(
                                  liveSpeakerParticipant,
                                  liveSpeakerParticipantCat,
                                )}
                              >
                                {resolveParticipantAvatarUrl(
                                  liveSpeakerParticipant,
                                  liveSpeakerParticipantCat,
                                ) ? null : catInitials(resolveParticipantDisplayName(
                                  liveSpeakerParticipant,
                                  liveSpeakerParticipantCat,
                                ))}
                              </div>
                              <strong>{resolveParticipantDisplayName(
                                liveSpeakerParticipant,
                                liveSpeakerParticipantCat,
                              )}</strong>
                            </div>
                          ) : speakerCat ? (
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
                {(() => {
                  if (composerRecipients.length === 0) return null;
                  return (
                    <ComposerRecipientChip
                      recipients={composerRecipients}
                      disabled={composerBusy}
                      onClick={composerBusy ? undefined : () => openSidePanelTo(
                        isDirectLane || isSoloComposer ? 'execution' : 'cats',
                      )}
                    />
                  );
                })()}
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

  function buildSidePanelSections(): SidePanelSection[] {
    const sections: SidePanelSection[] = [];

    if (showAddCatButton || activeRoomParticipants.length > 0) {
      sections.push({
        id: 'cats',
        title: assignedAdhocParticipants.length > 0 ? 'Participants' : 'Cats',
        children: (
          <div className="sidePanelSectionStack">
            {assignedCatRecords.length > 0 ? (
              <CatAvatarRow
                cats={assignedCatRecords}
                bossCatId={payload.chat.bossCatId}
                selectedIds={assignedCatRecords.map((cat) => cat.id)}
                highlightedId={defaultRecipientCat?.catId ?? null}
                defaultRecipientCatId={defaultRecipientCat?.catId ?? null}
                toggleable={false}
                onToggle={() => {}}
                onHighlight={() => {}}
              />
            ) : null}
            {assignedAdhocParticipants.length > 0 ? (
              <div className="addCatList">
                {assignedAdhocParticipants.map((participant) => (
                  <div key={participant.participantId} className="addCatItem">
                    <div>
                      <strong>{participant.name}</strong>
                      <p>{buildDraftParticipantExecutionLabel(participant.execution.target)}</p>
                      {participant.roleHint ? <p>{participant.roleHint}</p> : null}
                      {editingParticipantId === participant.participantId ? (
                        <form
                          className="stackForm"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void submitParticipantRename(participant.participantId);
                          }}
                        >
                          <label className="fieldLabel">
                            <span>Name</span>
                            <input
                              className="textInput"
                              value={editingParticipantName}
                              onChange={(event) => setEditingParticipantName(event.target.value)}
                              placeholder="Participant name"
                            />
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              className="operatorActionButton"
                              onClick={cancelParticipantRename}
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="primaryButton"
                              disabled={
                                !editingParticipantName.trim()
                                || busy === `channel:participant:update:${participant.participantId}`
                              }
                            >
                              Save name
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {onUpdateChannelParticipant ? (
                        <button
                          type="button"
                          className="addCatAssignButton"
                          disabled={busy === `channel:participant:update:${participant.participantId}`}
                          onClick={() => beginParticipantRename(participant)}
                        >
                          Rename
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {assignedCatRecords.length === 0 && assignedAdhocParticipants.length === 0 ? (
              <p className="operatorEmptyState">No participants are in this chat yet.</p>
            ) : null}
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
              defaultRecipientCatId={directLaneCat.id}
              toggleable={false}
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
      if (!isSoloComposer && defaultRecipientParticipant) {
        const providerName = getProviderDisplayName(defaultRecipientParticipant.execution.target.provider);
        const modelLabel = defaultRecipientParticipant.execution.target.model
          ? (getProviderModels(defaultRecipientParticipant.execution.target.provider)
              .find((m) => m.value === defaultRecipientParticipant.execution.target.model)?.label
                ?? defaultRecipientParticipant.execution.target.model)
              .replace(/\s*\(default\)\s*/iu, '')
          : null;
        if (defaultRecipientParticipant.sourceKind !== 'cat') {
          return (
            <div className="catInspectPanelBody">
              <div className="catInspectIdentity">
                <div
                  className="catAvatar catInspectAvatar channelParticipantAvatar"
                  style={buildParticipantAvatarStyle(defaultRecipientParticipant)}
                >
                  {defaultRecipientParticipant.avatarUrl ? null : catInitials(defaultRecipientParticipant.name)}
                </div>
                <div>
                  <strong>{defaultRecipientParticipant.name}</strong>
                  <span className="catInspectBadge">Temporary</span>
                </div>
              </div>
              {defaultRecipientParticipant.roleHint ? (
                <div className="catInspectField">
                  <span className="catInspectFieldLabel">Role</span>
                  <span>{defaultRecipientParticipant.roleHint}</span>
                </div>
              ) : null}
              <div className="catInspectField">
                <span className="catInspectFieldLabel">AI Service</span>
                <span>{providerName}</span>
              </div>
              {defaultRecipientParticipant.execution.target.instance ? (
                <div className="catInspectField">
                  <span className="catInspectFieldLabel">Connection</span>
                  <span>{defaultRecipientParticipant.execution.target.instance}</span>
                </div>
              ) : null}
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Model</span>
                <span>{modelLabel ?? 'default'}</span>
              </div>
            </div>
          );
        }

        const defaultRecipientCatRef = resolveParticipantCatId(defaultRecipientParticipant);
        const catRecord = defaultRecipientCatRef
          ? payload.chat.cats.find((c) => c.id === defaultRecipientCatRef) ?? null
          : null;
        return (
          <div className="catInspectPanelBody">
            <div className="catInspectIdentity">
              <div
                className={defaultRecipientCatRef === payload.chat.bossCatId ? 'catAvatar catAvatarBoss catInspectAvatar' : 'catAvatar catInspectAvatar'}
                style={catRecord?.avatarUrl
                  ? { backgroundImage: `url(${catRecord.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : defaultRecipientParticipant.avatarColor ? { background: defaultRecipientParticipant.avatarColor } : undefined}
              >
                {catRecord?.avatarUrl ? null : catInitials(defaultRecipientParticipant.name)}
              </div>
              <div>
                <strong>{defaultRecipientParticipant.name}</strong>
                {defaultRecipientCatRef === payload.chat.bossCatId ? <span className="catInspectBadge">Boss</span> : null}
              </div>
            </div>
            <div className="catInspectField">
              <span className="catInspectFieldLabel">AI Service</span>
              <span>{providerName}</span>
            </div>
            {defaultRecipientParticipant.execution.target.instance ? (
              <div className="catInspectField">
                <span className="catInspectFieldLabel">Connection</span>
                <span>{defaultRecipientParticipant.execution.target.instance}</span>
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
