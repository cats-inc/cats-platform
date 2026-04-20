import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { resolveChannelKind } from '../../channelTopology.js';
import { createDefaultAdvancedDraftControlsPreferences } from '../../advancedDraftControls.js';
import { normalizeConversationBehaviorPreferences } from '../../conversationBehavior.js';
import { createDefaultFolderBrowsePreferences } from '../../folderBrowsePreferences.js';

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
  const catAssignments = Array.isArray(channel.catAssignments)
    ? channel.catAssignments
    : [];
  const assignedCats = Array.isArray(channel.assignedCats)
    ? channel.assignedCats
    : [];
  const participants: Array<{ catId: string; status: 'active' | 'removed' }> = (
    catAssignments.length > 0
      ? catAssignments
      : assignedCats
  ).map((assignmentValue) => {
    const assignment = asRecord(assignmentValue) ?? {};
    return {
      catId: readString(assignment.catId),
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

export function normalizeAppShellPayload(payload: AppShellPayload): AppShellPayload {
  const nextPayload = structuredClone(payload) as AppShellPayload & Record<string, unknown>;
  const chatState = asRecord(nextPayload.chat) ?? {};
  nextPayload.chat = chatState as unknown as AppShellPayload['chat'];
  const globalOrchestrator = asRecord(chatState.globalOrchestrator);

  if (globalOrchestrator && !asRecord(globalOrchestrator.executionTarget)) {
    globalOrchestrator.executionTarget = {
      provider: readString(globalOrchestrator.provider, 'claude'),
      instance: readNullableString(globalOrchestrator.instance),
      model: readNullableString(globalOrchestrator.model),
    };
  }
  const orchestratorExecutionTarget = asRecord(globalOrchestrator?.executionTarget);
  if (orchestratorExecutionTarget && orchestratorExecutionTarget.instance === undefined) {
    orchestratorExecutionTarget.instance = readNullableString(globalOrchestrator?.instance);
  }

  if (globalOrchestrator && !asRecord(globalOrchestrator.memory)) {
    globalOrchestrator.memory = {
      summary: null,
      facts: [],
      openLoops: [],
      updatedAt: null,
    };
  }

  const selectedChannel = asRecord(chatState.selectedChannel);
  if (selectedChannel && !asRecord(selectedChannel.orchestratorLease)) {
    const executionTarget = asRecord(globalOrchestrator?.executionTarget);
    selectedChannel.orchestratorLease = {
      sessionId: null,
      status: 'not_started',
      cwd: null,
      lastError: null,
      provider: readNullableString(executionTarget?.provider) ?? 'claude',
      instance: readNullableString(executionTarget?.instance),
      model: readNullableString(executionTarget?.model),
      startedAt: null,
      lastUsedAt: null,
    };
  }

  if (!Array.isArray(chatState.cats)) {
    chatState.cats = [];
  }

  const cats = (chatState.cats as Array<Record<string, unknown>>).map((catValue) => {
    const cat = asRecord(catValue) ?? {};
    if (!asRecord(cat.defaultExecutionTarget)) {
      cat.defaultExecutionTarget = {
        provider: readString(cat.provider, 'claude'),
        instance: readNullableString(cat.instance),
        model: readNullableString(cat.model),
      };
    }
    const defaultExecutionTarget = asRecord(cat.defaultExecutionTarget);
    if (defaultExecutionTarget && defaultExecutionTarget.instance === undefined) {
      defaultExecutionTarget.instance = readNullableString(cat.instance);
    }
    if (!asRecord(cat.memory)) {
      cat.memory = {
        summary: null,
        facts: [],
        openLoops: [],
        updatedAt: null,
      };
    }
    if (!Array.isArray(cat.roles)) {
      cat.roles = readStringArray(cat.roles);
    }
    return cat;
  });
  const catsById = new Map(cats.map((cat) => [readString(cat.id), cat]));

  if (selectedChannel) {
    const roomRouting = asRecord(selectedChannel.roomRouting);
    normalizeChannelKind(
      selectedChannel,
      readString(roomRouting?.mode, 'boss_chat') === 'direct_cat_chat'
        ? 'direct_cat_chat'
        : 'boss_chat',
    );
    if (!Array.isArray(selectedChannel.catAssignments)) {
      selectedChannel.catAssignments = [];
    }

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
    if (
      participantAssignments.length > 0
      || !Array.isArray(selectedChannel.assignedParticipants)
    ) {
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

  chatState.cats = Array.from(catsById.values());

  if (nextPayload.setupCompleteAt === undefined) {
    (nextPayload as Record<string, unknown>).setupCompleteAt = null;
  }
  if (!nextPayload.ownerDisplayName) {
    (nextPayload as Record<string, unknown>).ownerDisplayName = 'Owner';
  }
  if (nextPayload.ownerAvatarColor === undefined) {
    (nextPayload as Record<string, unknown>).ownerAvatarColor = null;
  }
  if (chatState.bossCatId === undefined) {
    chatState.bossCatId = null;
  }
  chatState.conversationBehavior = normalizeConversationBehaviorPreferences(
    chatState.conversationBehavior,
  );
  if (!asRecord(chatState.advancedDraftControls)) {
    chatState.advancedDraftControls = createDefaultAdvancedDraftControlsPreferences();
  }
  if (!asRecord(chatState.folderBrowsePreferences)) {
    chatState.folderBrowsePreferences = createDefaultFolderBrowsePreferences();
  }
  if (!asRecord(chatState.newChatDefaults)) {
    chatState.newChatDefaults = {
      provider: readString(orchestratorExecutionTarget?.provider, 'claude'),
      instance: readNullableString(orchestratorExecutionTarget?.instance),
      model: readNullableString(orchestratorExecutionTarget?.model),
      modelSelection: null,
    };
  }

  if (Array.isArray(chatState.channels)) {
    chatState.channels = chatState.channels.map((channelValue) => {
      const channel = asRecord(channelValue) ?? {};
      normalizeChannelKind(
        channel,
        readString(channel.roomMode, 'boss_chat') === 'direct_cat_chat'
          ? 'direct_cat_chat'
          : 'boss_chat',
      );
      if (channel.catCount === undefined) {
        channel.catCount = 0;
      }
      if (channel.activeCatCount === undefined) {
        channel.activeCatCount = 0;
      }
      return channel;
    });
  }

  if (!Array.isArray(chatState.parallelChatGroups)) {
    chatState.parallelChatGroups = [];
  }

  return nextPayload;
}
