import type { AppShellPayload } from '../../api/contracts.js';
import type { AppShellPayload as BaseAppShellPayload } from '../../../shared/api/workspaceContracts.js';
import { normalizeAppShellPayload as normalizeBaseAppShellPayload } from '../../../shared/renderer/api/normalization.js';
import { resolveChannelKind } from '../../shared/channelTopology.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeChannelKind(
  channel: Record<string, unknown>,
  roomMode: 'boss_chat' | 'direct_cat_chat',
): void {
  const participantAssignments = Array.isArray(channel.participantAssignments)
    ? channel.participantAssignments
    : [];
  const catAssignments = Array.isArray(channel.catAssignments)
    ? channel.catAssignments
    : [];
  const assignedParticipants = Array.isArray(channel.assignedParticipants)
    ? channel.assignedParticipants
    : [];
  const assignedCats = Array.isArray(channel.assignedCats)
    ? channel.assignedCats
    : [];
  const participants: Array<{ participantId: string; status: 'active' | 'removed' }> = (
    participantAssignments.length > 0
      ? participantAssignments
      : assignedParticipants.length > 0
        ? assignedParticipants
        : catAssignments.length > 0
          ? catAssignments
          : assignedCats
  ).map((assignmentValue) => {
    const assignment = asRecord(assignmentValue) ?? {};
    return {
      participantId: readString(assignment.participantId) || readString(assignment.catId),
      status: readString(assignment.status, 'active') === 'removed' ? 'removed' : 'active',
    };
  });

  channel.channelKind = resolveChannelKind({
    channelKind:
      channel.channelKind === 'boss_thread'
      || channel.channelKind === 'direct_lane'
      || channel.channelKind === 'multi_cat_room'
        ? channel.channelKind
        : null,
    roomMode,
    participants,
  });
}

function normalizeGuideCat(nextPayload: AppShellPayload & Record<string, unknown>): void {
  if (nextPayload.guideCat === undefined) {
    nextPayload.guideCat = null;
    return;
  }

  const guideCat = asRecord(nextPayload.guideCat);
  if (!guideCat) {
    nextPayload.guideCat = null;
    return;
  }

  if (!asRecord(guideCat.executionTarget)) {
    guideCat.executionTarget = {
      provider: readString(guideCat.provider, 'claude'),
      instance: readNullableString(guideCat.instance),
      model: readNullableString(guideCat.model),
    };
  }
  const executionTarget = asRecord(guideCat.executionTarget);
  if (executionTarget && executionTarget.instance === undefined) {
    executionTarget.instance = readNullableString(guideCat.instance);
  }
  if (guideCat.modelSelection === undefined) {
    guideCat.modelSelection = null;
  }
}

function normalizeAssistantPresets(nextPayload: AppShellPayload & Record<string, unknown>): void {
  if (!Array.isArray(nextPayload.assistantPresets)) {
    nextPayload.assistantPresets = [];
    return;
  }

  nextPayload.assistantPresets = nextPayload.assistantPresets.map((assistantValue) => {
    const assistant = asRecord(assistantValue) ?? {};
    if (!asRecord(assistant.executionTarget)) {
      assistant.executionTarget = {
        provider: readString(assistant.provider, 'claude'),
        instance: readNullableString(assistant.instance),
        model: readNullableString(assistant.model),
      };
    }
    const executionTarget = asRecord(assistant.executionTarget);
    if (executionTarget && executionTarget.instance === undefined) {
      executionTarget.instance = readNullableString(assistant.instance);
    }
    if (assistant.modelSelection === undefined) {
      assistant.modelSelection = null;
    }
    if (assistant.roleHint === undefined) {
      assistant.roleHint = null;
    }
    return assistant;
  }) as unknown as AppShellPayload['assistantPresets'];
}

function normalizeGlobalOrchestrator(chatState: Record<string, unknown>): void {
  const orchestrator = asRecord(chatState.globalOrchestrator);
  if (!orchestrator) {
    return;
  }

  const visibleParticipant = asRecord(orchestrator.visibleParticipant) ?? {};
  const executionTarget = asRecord(visibleParticipant.executionTarget)
    ?? asRecord(orchestrator.executionTarget)
    ?? {
      provider: 'claude',
      instance: null,
      model: null,
    };
  const executionModelSelection =
    visibleParticipant.executionModelSelection ?? orchestrator.executionModelSelection ?? null;

  orchestrator.routerConfig = {
    kind: 'chat_deterministic_router',
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    defaultDispatch: 'room_default',
    mentionAliases: readStringArray(asRecord(orchestrator.routerConfig)?.mentionAliases).length > 0
      ? readStringArray(asRecord(orchestrator.routerConfig)?.mentionAliases)
      : ['Orchestrator'],
    audiencePolicy: 'chat_capabilities',
  };
  orchestrator.visibleParticipant = {
    kind: 'visible_orchestrator_participant',
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    displayName: readString(visibleParticipant.displayName, 'Orchestrator'),
    executionTarget,
    executionModelSelection,
  };
  orchestrator.executionTarget = executionTarget;
  orchestrator.executionModelSelection = executionModelSelection;
}

function normalizeSelectedChannel(
  chatState: Record<string, unknown>,
  catsById: Map<string, Record<string, unknown>>,
): void {
  const selectedChannel = asRecord(chatState.selectedChannel);
  if (!selectedChannel) {
    return;
  }

  const roomRouting = asRecord(selectedChannel.roomRouting);
  const roomMode = readString(roomRouting?.mode, 'boss_chat') === 'direct_cat_chat'
    ? 'direct_cat_chat'
    : 'boss_chat';
  normalizeChannelKind(selectedChannel, roomMode);

  const catAssignments = Array.isArray(selectedChannel.catAssignments)
    ? selectedChannel.catAssignments
    : [];
  if (!Array.isArray(selectedChannel.participantAssignments)) {
    selectedChannel.participantAssignments = catAssignments.map((assignmentValue) => {
      const assignment = asRecord(assignmentValue) ?? {};
      const cat = catsById.get(readString(assignment.catId)) ?? {};
      return {
        participantId: readString(assignment.participantId, readString(assignment.catId)),
        sourceKind: readString(assignment.sourceKind, 'cat') === 'cat' ? 'cat' : 'adhoc',
        sourceRefId:
          readNullableString(assignment.sourceRefId) ?? readNullableString(assignment.catId),
        name: readString(assignment.name, readString(cat.name, 'Participant')),
        status: readString(assignment.status, 'active'),
        roles: Array.isArray(assignment.roles) ? assignment.roles : [],
        roleHint: readNullableString(assignment.roleHint),
        joinedAt: readString(assignment.joinedAt),
        leftAt: readNullableString(assignment.leftAt),
        execution: assignment.execution,
      };
    });
  }

  if (catAssignments.length > 0 || !Array.isArray(selectedChannel.assignedCats)) {
    selectedChannel.assignedCats = catAssignments.map((assignmentValue) => {
      const assignment = asRecord(assignmentValue) ?? {};
      const cat = catsById.get(readString(assignment.catId)) ?? {};
      return {
        participantId: readString(assignment.participantId, readString(assignment.catId)),
        sourceKind: 'cat',
        sourceRefId: readString(assignment.sourceRefId, readString(assignment.catId)),
        catId: readString(assignment.catId),
        name: readString(cat.name, 'Cat'),
        roles: Array.isArray(assignment.roles) ? assignment.roles : readStringArray(cat.roles),
        roleHint: readNullableString(assignment.roleHint),
        skillProfile: readNullableString(cat.skillProfile),
        mcpProfile: readNullableString(cat.mcpProfile),
        status: readString(assignment.status, 'active'),
        joinedAt: readString(assignment.joinedAt),
        leftAt: readNullableString(assignment.leftAt),
        avatarColor: readNullableString(cat.avatarColor),
        avatarUrl: readNullableString(cat.avatarUrl),
        execution: assignment.execution,
        memory: asRecord(cat.memory) ?? {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      };
    });
  }

  const participantAssignments = Array.isArray(selectedChannel.participantAssignments)
    ? selectedChannel.participantAssignments
    : [];
  if (participantAssignments.length > 0 || !Array.isArray(selectedChannel.assignedParticipants)) {
    selectedChannel.assignedParticipants = participantAssignments.map((assignmentValue) => {
      const assignment = asRecord(assignmentValue) ?? {};
      const sourceRefId = readNullableString(assignment.sourceRefId);
      const cat = sourceRefId ? (catsById.get(sourceRefId) ?? null) : null;
      return {
        participantId: readString(assignment.participantId),
        sourceKind: readString(assignment.sourceKind, 'adhoc') === 'cat' ? 'cat' : 'adhoc',
        sourceRefId,
        name: readString(assignment.name, readString(cat?.name, 'Participant')),
        roles: Array.isArray(assignment.roles) ? assignment.roles : readStringArray(cat?.roles),
        roleHint: readNullableString(assignment.roleHint),
        skillProfile: readNullableString(cat?.skillProfile),
        mcpProfile: readNullableString(cat?.mcpProfile),
        status: readString(assignment.status, 'active'),
        joinedAt: readString(assignment.joinedAt),
        leftAt: readNullableString(assignment.leftAt),
        avatarColor: readNullableString(cat?.avatarColor),
        avatarUrl: readNullableString(cat?.avatarUrl),
        execution: assignment.execution,
        memory: asRecord(cat?.memory) ?? {
          summary: null,
          facts: [],
          openLoops: [],
          updatedAt: null,
        },
      };
    });
  }
}

function normalizeChannelSummaries(chatState: Record<string, unknown>): void {
  if (!Array.isArray(chatState.channels)) {
    return;
  }

  chatState.channels = chatState.channels.map((channelValue) => {
    const channel = asRecord(channelValue) ?? {};
    normalizeChannelKind(
      channel,
      readString(channel.roomMode, 'boss_chat') === 'direct_cat_chat'
        ? 'direct_cat_chat'
        : 'boss_chat',
    );
    const participantCount = typeof channel.participantCount === 'number'
      ? channel.participantCount
      : typeof channel.catCount === 'number'
        ? channel.catCount
        : 0;
    const activeParticipantCount = typeof channel.activeParticipantCount === 'number'
      ? channel.activeParticipantCount
      : typeof channel.activeCatCount === 'number'
        ? channel.activeCatCount
        : participantCount;
    if (channel.participantCount === undefined) {
      channel.participantCount = participantCount;
    }
    if (channel.activeParticipantCount === undefined) {
      channel.activeParticipantCount = activeParticipantCount;
    }
    if (channel.catCount === undefined) {
      channel.catCount = participantCount;
    }
    if (channel.activeCatCount === undefined) {
      channel.activeCatCount = activeParticipantCount;
    }
    return channel;
  });
}

export function normalizeAppShellPayload(payload: AppShellPayload): AppShellPayload {
  const nextPayload = normalizeBaseAppShellPayload(
    payload as unknown as BaseAppShellPayload,
  ) as unknown as AppShellPayload & Record<string, unknown>;
  const chatState = asRecord(nextPayload.chat) ?? {};
  nextPayload.chat = chatState as unknown as AppShellPayload['chat'];
  const cats = Array.isArray(chatState.cats)
    ? (chatState.cats as Array<Record<string, unknown>>)
    : [];
  const catsById = new Map(cats.map((cat) => [readString(cat.id), cat]));

  normalizeSelectedChannel(chatState, catsById);
  normalizeGlobalOrchestrator(chatState);
  normalizeGuideCat(nextPayload);
  normalizeAssistantPresets(nextPayload);
  normalizeChannelSummaries(chatState);

  if (!Array.isArray(chatState.parallelChatGroups)) {
    chatState.parallelChatGroups = [];
  }

  return nextPayload;
}
