import type {
  AppShellPayload,
  ParallelChatGroupSummary,
} from '../../../api/contracts.js';
import type { LiveIndicatorState } from '../../hooks/useLiveIndicator.js';
import { buildImplicitRecipient, buildNamedRecipient, buildRecipientFromCat, type RecipientChipTarget } from '../ComposerRecipientChip.js';
import type { ModelSelectorValue } from '../ModelSelector.js';
import { presentChannelTitle, type SelectedChannelView } from '../../chatUtils.js';
import {
  resolveCompareNeighborChannelId,
  resolveActiveCompareChannelId,
} from './compareNavigation.js';
import { resolveParticipantCatId, type ResolvedChannelParticipant } from '../../../shared/channelParticipants.js';

export interface ChatComposerStackParticipantView {
  participantId: string;
  label: string;
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
  busy: string;
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
  const compareDispatchBusy =
    input.busy === 'parallelChat:ack'
    || input.busy === 'parallelChat:dispatch'
    || input.busy === 'parallelChat:relay'
    || input.busy === 'parallelChat:stop';
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
}): string {
  return input.isDirectLane
    ? (
      input.directLaneCat?.name
      ?? input.defaultRecipientCatRecord?.name
      ?? presentChannelTitle(input.selectedChannelTitle)
    )
    : input.isCompareGroup && input.compareGroup
      ? presentChannelTitle(input.compareGroup.title)
      : presentChannelTitle(input.selectedChannelTitle);
}

export function resolveShowRosterAvatars(input: {
  isDirectLane: boolean;
  defaultRecipientCat: ResolvedChannelParticipant | null;
  showBossCatAvatar: boolean;
  isSoloComposer: boolean;
  activeRoomParticipants: ResolvedChannelParticipant[];
}): boolean {
  return input.isDirectLane
    ? Boolean(input.defaultRecipientCat)
    : Boolean(
      (input.showBossCatAvatar && !input.isSoloComposer)
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
    return {
      participantId: participant.participantId,
      label: input.resolveParticipantDisplayName(participant, catRecord),
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

export function resolveChatViewTopBarPresenceState(input: {
  visibleLiveIndicator: LiveIndicatorState | null | undefined;
  selectedChannel: SelectedChannelView;
  activeRoomParticipants: ResolvedChannelParticipant[];
}): ChatViewTopBarPresenceState {
  const activeTopBarCatIds = (() => {
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
    const workflowTargets = input.selectedChannel.roomRouting?.workflow?.activeTurn?.targetStatuses ?? [];
    const runningParticipantIds = workflowTargets
      .filter((target) => target.status === 'running')
      .map((target) => target.participant.participantId)
      .filter((participantId) => participantId.trim().length > 0);
    if (runningParticipantIds.length > 0) {
      return [...new Set(runningParticipantIds)];
    }
    if (input.visibleLiveIndicator?.active && input.selectedChannel.roomRouting?.defaultRecipientId) {
      return [input.selectedChannel.roomRouting.defaultRecipientId];
    }
    return [];
  })();

  const liveSpeakerParticipantId = (() => {
    const activeWorkflowParticipantId = activeTopBarParticipantIds[0] ?? null;
    if (activeWorkflowParticipantId) {
      return activeWorkflowParticipantId;
    }
    if (input.visibleLiveIndicator?.active) {
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
  isSoloComposer: boolean;
  selectedModel: ModelSelectorValue | undefined;
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
    return [buildRecipientFromCat(input.directLaneCat, input.bossCatId)];
  }
  if (input.isSoloComposer && input.selectedModel) {
    return [buildImplicitRecipient(input.selectedModel)];
  }
  if (!input.defaultRecipientParticipant) {
    return [];
  }

  const participantCat = input.resolveParticipantCatRecord(input.defaultRecipientParticipant);
  if (participantCat) {
    return [buildRecipientFromCat(participantCat, input.bossCatId)];
  }

  return [
    buildNamedRecipient({
      participantId: input.defaultRecipientParticipant.participantId,
      name: input.resolveParticipantDisplayName(input.defaultRecipientParticipant, null),
      provider: input.defaultRecipientParticipant.execution.target.provider,
      instance: input.defaultRecipientParticipant.execution.target.instance ?? null,
      model: input.defaultRecipientParticipant.execution.target.model ?? null,
    }),
  ];
}
