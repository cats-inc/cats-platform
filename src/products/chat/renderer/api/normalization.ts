import type { AppShellPayload } from '../../api/contracts';

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
    if (!Array.isArray(selectedChannel.catAssignments)) {
      selectedChannel.catAssignments = [];
    }

    if (!Array.isArray(selectedChannel.assignedCats)) {
      if (Array.isArray(selectedChannel.catAssignments)) {
        selectedChannel.assignedCats = selectedChannel.catAssignments.map((assignmentValue) => {
          const assignment = asRecord(assignmentValue) ?? {};
          const cat = catsById.get(readString(assignment.catId)) ?? {};
          return {
            catId: readString(assignment.catId),
            name: readString(cat.name, 'Cat'),
            roles: Array.isArray(assignment.roles) ? assignment.roles : readStringArray(cat.roles),
            skillProfile: readNullableString(cat.skillProfile),
            mcpProfile: readNullableString(cat.mcpProfile),
            status: readString(assignment.status, 'active'),
            joinedAt: readString(assignment.joinedAt),
            leftAt: readNullableString(assignment.leftAt),
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
  if (chatState.showVerboseMessages === undefined) {
    chatState.showVerboseMessages = false;
  }

  if (Array.isArray(chatState.channels)) {
    chatState.channels = chatState.channels.map((channelValue) => {
      const channel = asRecord(channelValue) ?? {};
      if (channel.catCount === undefined) {
        channel.catCount = 0;
      }
      if (channel.activeCatCount === undefined) {
        channel.activeCatCount = 0;
      }
      return channel;
    });
  }

  return nextPayload;
}
