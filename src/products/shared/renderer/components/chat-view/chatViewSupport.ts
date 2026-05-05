import type {
  AppShellPayload,
  ParallelChatGroupSummary,
} from '../../../api/workspaceContracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import {
  isComposerAckBusyForChannel,
  isComposerDispatchBusyForChannel,
} from '../../../../../shared/composer.js';
import {
  isParallelChatBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';
import {
  hasLiveIndicatorIdentity,
  hasVisibleAssistantReplyAfterMessage,
  hasVisibleSessionStartAfterMessage,
} from '../../../../../shared/liveIndicator.js';
import { buildChatLaneId } from '../../../../../shared/chatCoreIds.js';
import { resolveComposerWorkspacePath } from '../../../../../core/workspacePaths.js';
import { buildImplicitRecipient, buildNamedRecipient, type RecipientChipTarget } from '../ComposerRecipientChip.js';
import type { ExecutionTargetValue } from '../../../../shared/renderer/components/ExecutionTarget.js';
import { presentChannelTitle, type SelectedChannelView } from '../../workspaceChatUtils.js';
import {
  resolveCompareNeighborChannelId,
  resolveActiveCompareChannelId,
} from './compareNavigation.js';
import { resolveParticipantCatId, type ResolvedChannelParticipant } from '../../../channelParticipants.js';
import {
  buildCatExecutionLabel,
  buildParticipantExecutionLabel,
} from '../../../../../shared/executionLabel.js';
import {
  createTranslator,
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../../shared/i18n/index.js';

type ChatViewSupportTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const defaultChatViewSupportTranslator = createTranslator('en');

export interface ChatComposerStackParticipantView {
  participantId: string;
  label: string;
  executionLabel: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss: boolean;
  useNeutralAvatar: boolean;
}

export interface ChatViewCompareState {
  compareMembers: ParallelChatGroupSummary['members'];
  isCompareGroup: boolean;
  activeCompareChannelId: string;
  compareMemberIndex: number;
  compareBusy: boolean;
  comparePrevChannelId: string | null;
  compareNextChannelId: string | null;
}

export interface ChatViewTopBarPresenceState {
  activeTopBarCatIds: string[];
  activeTopBarParticipantIds: string[];
  liveSpeakerParticipant: ResolvedChannelParticipant | null;
}

export interface LatestUserTurnPresentationState {
  messageId: string | null;
  status: 'idle' | 'processing' | 'failed';
}

export function messageStackTone(senderKind: string): string {
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

export function resolveChatViewCompareState(input: {
  compareGroup: ParallelChatGroupSummary | null;
  channels: AppShellPayload['chat']['channels'];
  routeChannelId: string | null;
  selectedChannelId: string;
  busy: WorkspaceBusyState;
}): ChatViewCompareState {
  const compareMembers = input.compareGroup?.members ?? [];
  const isCompareGroup = compareMembers.length > 1;
  const activeCompareChannelId = resolveActiveCompareChannelId(
    compareMembers,
    input.routeChannelId,
    input.selectedChannelId,
  );
  const compareMemberIndex = compareMembers.findIndex(
    (member) => member.channelId === activeCompareChannelId,
  );
  const compareGroupChannels = compareMembers
    .map((member) =>
      input.channels.find((channel) => channel.id === member.channelId) ?? null)
    .filter((channel): channel is AppShellPayload['chat']['channels'][number] => channel != null);
  const compareDispatchBusy = isParallelChatBusy(input.busy);
  const compareRoutingBusy = compareGroupChannels.some((channel) =>
    channel.routingStatus === 'running',
  );
  return {
    compareMembers,
    isCompareGroup,
    activeCompareChannelId,
    compareMemberIndex,
    compareBusy: compareDispatchBusy || compareRoutingBusy,
    comparePrevChannelId: isCompareGroup && compareMemberIndex >= 0
      ? resolveCompareNeighborChannelId(compareMembers, activeCompareChannelId, 'prev')
      : null,
    compareNextChannelId: isCompareGroup && compareMemberIndex >= 0
      ? resolveCompareNeighborChannelId(compareMembers, activeCompareChannelId, 'next')
      : null,
  };
}

export function resolveChatViewTopBarTitle(input: {
  isDirectLane: boolean;
  directLaneCat: AppShellPayload['chat']['cats'][number] | null;
  defaultRecipientCatRecord: AppShellPayload['chat']['cats'][number] | null;
  selectedChannelTitle: string;
  isCompareGroup: boolean;
  compareGroup: ParallelChatGroupSummary | null;
  t?: ChatViewSupportTranslator;
}): string {
  const t = input.t ?? defaultChatViewSupportTranslator;
  return input.isDirectLane
    ? (
      input.directLaneCat?.name
      ?? input.defaultRecipientCatRecord?.name
      ?? presentChannelTitle(input.selectedChannelTitle, t)
    )
    : input.isCompareGroup && input.compareGroup
      ? presentChannelTitle(input.compareGroup.title, t)
      : presentChannelTitle(input.selectedChannelTitle, t);
}

export function resolveShowRosterAvatars(input: {
  isDirectLane: boolean;
  defaultRecipientCat: ResolvedChannelParticipant | null;
  showBossCatAvatar: boolean;
  isDefaultChatComposer: boolean;
  activeRoomParticipants: ResolvedChannelParticipant[];
}): boolean {
  return input.isDirectLane
    ? Boolean(input.defaultRecipientCat)
    : Boolean(
      (input.showBossCatAvatar && !input.isDefaultChatComposer)
      || input.activeRoomParticipants.length > 0
    );
}

export function buildChatComposerStackParticipants(input: {
  activeRoomParticipants: ResolvedChannelParticipant[];
  bossCatId: string | null;
  resolveParticipantCatRecord: (
    participant: ResolvedChannelParticipant | null | undefined,
  ) => AppShellPayload['chat']['cats'][number] | null;
  resolveParticipantDisplayName: (
    participant: ResolvedChannelParticipant,
    catRecord: AppShellPayload['chat']['cats'][number] | null,
  ) => string;
}): ChatComposerStackParticipantView[] {
  return input.activeRoomParticipants.map((participant) => {
    const catRecord = input.resolveParticipantCatRecord(participant);
    const executionLabel = buildParticipantExecutionLabel(participant)
      ?? (catRecord?.defaultExecutionTarget
        ? buildCatExecutionLabel(catRecord as Parameters<typeof buildCatExecutionLabel>[0])
        : null);
    return {
      participantId: participant.participantId,
      label: input.resolveParticipantDisplayName(participant, catRecord),
      executionLabel,
      avatarColor: catRecord?.avatarColor ?? participant.avatarColor ?? null,
      avatarUrl: catRecord?.avatarUrl ?? participant.avatarUrl ?? null,
      isBoss: catRecord?.id === input.bossCatId,
      useNeutralAvatar: catRecord == null,
    };
  });
}

export function buildChoiceResponsesBySource(
  messages: SelectedChannelView['messages'],
): Map<string, NonNullable<SelectedChannelView['messages'][number]['choiceResponse']>> {
  const responses = new Map<
    string,
    NonNullable<SelectedChannelView['messages'][number]['choiceResponse']>
  >();
  for (const message of messages) {
    if (message.choiceResponse?.sourceMessageId) {
      responses.set(message.choiceResponse.sourceMessageId, message.choiceResponse);
    }
  }
  return responses;
}

function findLatestUserMessage(
  messages: SelectedChannelView['messages'],
): SelectedChannelView['messages'][number] | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.senderKind === 'user') {
      return message;
    }
  }
  return null;
}

function findMessageIndex(
  messages: SelectedChannelView['messages'],
  messageId: string | null | undefined,
): number {
  if (!messageId) {
    return -1;
  }
  return messages.findIndex((message) => message.id === messageId);
}

function hasDispatchedWorkflowTarget(
  activeTurn: SelectedChannelView['roomRouting']['workflow']['activeTurn'] | null | undefined,
): boolean {
  const dispatchedTargets = (activeTurn?.targetStatuses ?? []).filter((target) =>
    target.status === 'running' || target.status === 'completed');
  if (dispatchedTargets.length === 0) {
    return false;
  }

  if (activeTurn?.workflowShape === 'concurrent') {
    return true;
  }

  return dispatchedTargets.some((target) => target.status === 'completed')
    || dispatchedTargets.length > 1;
}

export function resolveLatestUserTurnPresentationState(input: {
  selectedChannel: SelectedChannelView;
  visibleLiveIndicator: LiveIndicatorState | null | undefined;
}): LatestUserTurnPresentationState {
  const latestUserMessage = findLatestUserMessage(input.selectedChannel.messages);
  if (!latestUserMessage) {
    return {
      messageId: null,
      status: 'idle',
    };
  }

  const activeTurn = input.selectedChannel.roomRouting.workflow.activeTurn ?? null;
  const lastOutcome = input.selectedChannel.roomRouting.lastOutcome ?? null;
  const latestUserMessageIndex = findMessageIndex(
    input.selectedChannel.messages,
    latestUserMessage.id,
  );
  const activeTurnSourceMessageId = activeTurn?.sourceMessageId ?? null;
  const activeTurnSourceMessageIndex = findMessageIndex(
    input.selectedChannel.messages,
    activeTurnSourceMessageId,
  );
  const liveIndicatorSourceMessageId = input.visibleLiveIndicator?.sourceMessageId ?? null;
  const liveIndicatorMatchesLatestUserMessage = liveIndicatorSourceMessageId
    ? liveIndicatorSourceMessageId === latestUserMessage.id
    : activeTurnSourceMessageId === latestUserMessage.id;
  const hasAssistantIdentityBubble = liveIndicatorMatchesLatestUserMessage
    && hasLiveIndicatorIdentity(input.visibleLiveIndicator);
  const hasVisibleAssistantReply = hasVisibleAssistantReplyAfterMessage(
    input.selectedChannel.messages,
    latestUserMessage.id,
  );
  const activeTurnTargetStateIds = activeTurn?.targetStatuses
    ?.map((target) => target.id ?? null)
    ?? [];
  const activeTurnLaneIds = activeTurn?.targetStatuses
    ?.map((target) => {
      const persistedLaneId = target.laneId?.trim() || null;
      if (persistedLaneId) {
        return persistedLaneId;
      }
      if (!activeTurn.id || !target.id) {
        return null;
      }
      return buildChatLaneId(activeTurn.id, target.id, target.participant.participantId);
    })
    ?? [];
  const activeTurnParticipantIds = activeTurn?.targetStatuses
    ?.map((target) => target.participant.participantId ?? null)
    ?? [];
  const hasVisibleSessionStart = hasVisibleSessionStartAfterMessage(
    input.selectedChannel.messages,
    latestUserMessage.id,
    {
      laneIds: activeTurnLaneIds,
      targetStateIds: activeTurnTargetStateIds,
      participantIds: activeTurnParticipantIds,
    },
  );
  const hasDispatchedTarget = hasDispatchedWorkflowTarget(activeTurn);
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
    return {
      messageId: latestUserMessage.id,
      status: 'processing',
    };
  }

  if (
    lastOutcome?.sourceMessageId === latestUserMessage.id
    && lastOutcome.status === 'error'
  ) {
    return {
      messageId: latestUserMessage.id,
      status: 'failed',
    };
  }

  return {
    messageId: latestUserMessage.id,
    status: 'idle',
  };
}

export function resolveChatViewTopBarPresenceState(input: {
  visibleLiveIndicator: LiveIndicatorState | null | undefined;
  selectedChannel: SelectedChannelView;
  activeRoomParticipants: ResolvedChannelParticipant[];
}): ChatViewTopBarPresenceState {
  const liveIndicatorStreaming = input.visibleLiveIndicator?.phase === 'streaming';
  const liveIndicatorHasExplicitSpeaker = Boolean(
    liveIndicatorStreaming && (
      input.visibleLiveIndicator?.speakerLabel
      || input.visibleLiveIndicator?.catId
      || (input.visibleLiveIndicator?.activeCatIds.length ?? 0) > 0
    )
  );
  const activeTopBarCatIds = (() => {
    if (!liveIndicatorStreaming) {
      return [];
    }
    const ids = input.visibleLiveIndicator?.activeCatIds?.filter((id) => id.trim().length > 0) ?? [];
    if (ids.length > 0) {
      return [...new Set(ids)];
    }
    if (input.visibleLiveIndicator?.active && input.visibleLiveIndicator.catId) {
      return [input.visibleLiveIndicator.catId];
    }
    return [];
  })();

  const activeTopBarParticipantIds = (() => {
    if (!liveIndicatorStreaming) {
      return [];
    }
    const workflowTargets = input.selectedChannel.roomRouting?.workflow?.activeTurn?.targetStatuses ?? [];
    const runningParticipantIds = workflowTargets
      .filter((target) => target.status === 'running')
      .map((target) => target.participant.participantId)
      .filter((participantId) => participantId.trim().length > 0);
    if (runningParticipantIds.length > 0) {
      return [...new Set(runningParticipantIds)];
    }
    if (
      input.visibleLiveIndicator?.active
      && !liveIndicatorHasExplicitSpeaker
      && input.selectedChannel.roomRouting?.defaultRecipientId
    ) {
      return [input.selectedChannel.roomRouting.defaultRecipientId];
    }
    return [];
  })();

  const liveSpeakerParticipantId = (() => {
    const activeWorkflowParticipantId = activeTopBarParticipantIds[0] ?? null;
    if (activeWorkflowParticipantId) {
      return activeWorkflowParticipantId;
    }
    if (
      liveIndicatorStreaming
      && input.visibleLiveIndicator?.active
      && !liveIndicatorHasExplicitSpeaker
    ) {
      return input.selectedChannel.roomRouting?.defaultRecipientId ?? null;
    }
    return null;
  })();

  const fallbackLiveCatId = input.visibleLiveIndicator?.catId ?? null;
  const liveSpeakerParticipant = liveSpeakerParticipantId
    ? input.activeRoomParticipants.find(
      (participant) => participant.participantId === liveSpeakerParticipantId,
    ) ?? null
    : fallbackLiveCatId
      ? input.activeRoomParticipants.find((participant) =>
        resolveParticipantCatId(participant) === fallbackLiveCatId)
        ?? null
      : null;

  return {
    activeTopBarCatIds,
    activeTopBarParticipantIds,
    liveSpeakerParticipant,
  };
}

export function buildChatComposerRecipients(input: {
  isDirectLane: boolean;
  directLaneCat: AppShellPayload['chat']['cats'][number] | null;
  isDefaultChatComposer: boolean;
  selectedExecutionTarget: ExecutionTargetValue | undefined;
  defaultRecipientParticipant: ResolvedChannelParticipant | null;
  bossCatId: string | null;
  resolveParticipantCatRecord: (
    participant: ResolvedChannelParticipant | null | undefined,
  ) => AppShellPayload['chat']['cats'][number] | null;
  resolveParticipantDisplayName: (
    participant: ResolvedChannelParticipant,
    catRecord: AppShellPayload['chat']['cats'][number] | null,
  ) => string;
}): RecipientChipTarget[] {
  if (input.isDirectLane && input.directLaneCat) {
    return [
      buildNamedRecipient({
        participantId: input.defaultRecipientParticipant?.participantId,
        catId: input.directLaneCat.id,
        name: input.directLaneCat.name,
        executionLabel: input.defaultRecipientParticipant
          ? buildParticipantExecutionLabel(input.defaultRecipientParticipant)
          : buildCatExecutionLabel(input.directLaneCat as Parameters<typeof buildCatExecutionLabel>[0]),
        avatarColor: input.directLaneCat.avatarColor ?? null,
        avatarUrl: input.directLaneCat.avatarUrl ?? null,
        provider: input.defaultRecipientParticipant?.execution.target.provider
          ?? input.directLaneCat.defaultExecutionTarget.provider,
        instance: input.defaultRecipientParticipant?.execution.target.instance
          ?? input.directLaneCat.defaultExecutionTarget.instance
          ?? null,
        model: input.defaultRecipientParticipant?.execution.target.model
          ?? input.directLaneCat.defaultExecutionTarget.model
          ?? null,
        modelSelection: input.defaultRecipientParticipant?.execution.modelSelection
          ?? input.directLaneCat.defaultModelSelection
          ?? null,
        isBoss: input.directLaneCat.id === input.bossCatId,
      }),
    ];
  }
  if (input.isDefaultChatComposer && input.selectedExecutionTarget) {
    return [buildImplicitRecipient(input.selectedExecutionTarget)];
  }
  if (!input.defaultRecipientParticipant) {
    return [];
  }

  const participantCat = input.resolveParticipantCatRecord(input.defaultRecipientParticipant);
  if (participantCat) {
    return [
      buildNamedRecipient({
        participantId: input.defaultRecipientParticipant.participantId,
        catId: participantCat.id,
        name: participantCat.name,
        executionLabel: buildParticipantExecutionLabel(input.defaultRecipientParticipant)
          ?? buildCatExecutionLabel(participantCat as Parameters<typeof buildCatExecutionLabel>[0]),
        avatarColor: participantCat.avatarColor ?? null,
        avatarUrl: participantCat.avatarUrl ?? null,
        provider: input.defaultRecipientParticipant.execution.target.provider,
        instance: input.defaultRecipientParticipant.execution.target.instance ?? null,
        model: input.defaultRecipientParticipant.execution.target.model ?? null,
        modelSelection: input.defaultRecipientParticipant.execution.modelSelection ?? null,
        isBoss: participantCat.id === input.bossCatId,
      }),
    ];
  }

  return [
    buildNamedRecipient({
      participantId: input.defaultRecipientParticipant.participantId,
      name: input.resolveParticipantDisplayName(input.defaultRecipientParticipant, null),
      executionLabel: buildParticipantExecutionLabel(input.defaultRecipientParticipant),
      provider: input.defaultRecipientParticipant.execution.target.provider,
      instance: input.defaultRecipientParticipant.execution.target.instance ?? null,
      model: input.defaultRecipientParticipant.execution.target.model ?? null,
      modelSelection: input.defaultRecipientParticipant.execution.modelSelection ?? null,
    }),
  ];
}

export interface ChatComposerViewState {
  participantChipLabel: string;
  directLaneExecutionTarget: ExecutionTargetValue | null;
  directLaneExcludedMentionNames: string[];
  composerBusy: boolean;
  composerAckBusy: boolean;
  showCancelComposerAction: boolean;
  showStopComposerAction: boolean;
  composerWorkspacePath: string | null;
}

export function resolveChatComposerViewState(input: {
  activeRoomParticipants: ResolvedChannelParticipant[];
  directLaneCat: AppShellPayload['chat']['cats'][number] | null;
  busy: WorkspaceBusyState;
  isCompareGroup: boolean;
  selectedChannelId: string;
  onCancelPendingSend?: (() => void) | null;
  onStopMessage?: (() => void) | null;
  repoPath?: string | null;
  chatCwd?: string | null;
  t?: ChatViewSupportTranslator;
}): ChatComposerViewState {
  const t = input.t ?? defaultChatViewSupportTranslator;
  const composerAckBusy =
    isParallelChatBusy(input.busy, 'ack')
    || isComposerAckBusyForChannel(input.busy, input.selectedChannelId);
  const compareBusy = isParallelChatBusy(input.busy);
  const composerDispatchBusy = isComposerDispatchBusyForChannel(
    input.busy,
    input.selectedChannelId,
  );
  const composerBusy =
    composerAckBusy
    || composerDispatchBusy
    || compareBusy;
  const showCancelComposerAction = composerAckBusy && input.onCancelPendingSend != null;
  const canStopSingleChat =
    !input.isCompareGroup
    && composerDispatchBusy
    && input.onStopMessage != null;
  const canStopParallelChat =
    input.isCompareGroup
    && input.onStopMessage != null
    && (
      isParallelChatBusy(input.busy, 'dispatch')
      || isParallelChatBusy(input.busy, 'stop')
    );

  return {
    participantChipLabel: input.activeRoomParticipants.length > 0
      ? t(
          input.activeRoomParticipants.length === 1
            ? messageKeys.chatParticipantChipCountOne
            : messageKeys.chatParticipantChipCountMany,
          { count: input.activeRoomParticipants.length },
        )
      : t(messageKeys.chatParticipantChipDefault),
    directLaneExecutionTarget: input.directLaneCat
      ? {
          provider: input.directLaneCat.defaultExecutionTarget.provider,
          model: input.directLaneCat.defaultExecutionTarget.model,
          instance: input.directLaneCat.defaultExecutionTarget.instance,
          modelSelection: input.directLaneCat.defaultModelSelection ?? null,
        }
      : null,
    directLaneExcludedMentionNames:
      input.directLaneCat?.name ? [input.directLaneCat.name] : [],
    composerBusy,
    composerAckBusy,
    showCancelComposerAction,
    showStopComposerAction:
      !showCancelComposerAction && (canStopSingleChat || canStopParallelChat),
    composerWorkspacePath: resolveComposerWorkspacePath(input.repoPath, input.chatCwd),
  };
}
