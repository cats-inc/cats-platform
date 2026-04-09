import {
  useMemo,
  type CSSProperties,
} from 'react';

import type {
  AppShellPayload,
  ChatCat,
} from '../../api/contracts.js';
import {
  buildDraftParticipantExecutionLabel,
  type SelectedChannelView,
} from '../chatUtils.js';
import {
  activeAssignedParticipants,
  findAssignedParticipant,
  resolveParticipantCatId,
  type ResolvedChannelParticipant,
} from '../../shared/channelParticipants.js';

export interface TopBarParticipant {
  key: string;
  label: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  isBoss: boolean;
  useNeutralAvatar: boolean;
  pulseParticipantId: string | null;
  pulseCatId: string | null;
}

export function useChatParticipantPresentation(options: {
  payload: AppShellPayload;
  selectedChannel: SelectedChannelView;
  activeAssignedCats: SelectedChannelView['assignedCats'];
  showBossCatAvatar: boolean;
  isDirectLane: boolean;
  isSoloComposer: boolean;
}) {
  const {
    payload,
    selectedChannel,
    activeAssignedCats,
    showBossCatAvatar,
    isDirectLane,
    isSoloComposer,
  } = options;
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
  const catsById = useMemo(
    () => new Map(payload.chat.cats.map((cat) => [cat.id, cat] as const)),
    [payload.chat.cats],
  );

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

  const directLaneCat = isDirectLane && defaultRecipientCat
    ? payload.chat.cats.find((cat) => cat.id === defaultRecipientCat.catId) ?? null
    : null;
  const bossCatRecord = payload.chat.bossCatId
    ? payload.chat.cats.find((cat) => cat.id === payload.chat.bossCatId) ?? null
    : null;
  const defaultRecipientCatRecord = defaultRecipientCat
    ? payload.chat.cats.find((cat) => cat.id === defaultRecipientCat.catId) ?? null
    : null;
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
      if (showBossCatAvatar && !isSoloComposer && bossCatRecord) {
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
      for (const participant of activeRoomParticipants) {
        const catRecord = resolveParticipantCatRecord(participant);
        ordered.push({
          key: `participant:${participant.participantId}`,
          label: resolveParticipantDisplayName(participant, catRecord),
          avatarColor: catRecord?.avatarColor ?? participant.avatarColor ?? null,
          avatarUrl: catRecord?.avatarUrl ?? participant.avatarUrl ?? null,
          isBoss: catRecord?.id === payload.chat.bossCatId,
          useNeutralAvatar: participantUsesNeutralAvatar(participant, catRecord),
          pulseParticipantId: participant.participantId,
          pulseCatId: catRecord?.id ?? null,
        });
      }
    }
    return ordered;
  }, [
    activeRoomParticipants,
    bossCatRecord,
    defaultRecipientCatRecord,
    defaultRecipientParticipant?.participantId,
    isDirectLane,
    isSoloComposer,
    payload.chat.bossCatId,
    participantUsesNeutralAvatar,
    resolveParticipantDisplayName,
    resolveParticipantCatRecord,
    showBossCatAvatar,
  ]);

  return {
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
  };
}
