import type {
  AssignChannelCatInput,
  ChannelCatAssignment,
  ChannelParticipantAssignment,
  NewChatDefaults,
  ChatState,
  UpdateGlobalOrchestratorInput,
} from '../../api/contracts.js';
import {
  cloneProviderModelSelection,
  type ProviderModelSelection,
} from '../../../../shared/providerSelection.js';
import { isDirectLaneChannel } from '../../shared/channelTopology.js';
import {
  resolveChannelParticipantAssignments,
  resolveParticipantExecutionAssignments,
} from '../../shared/channelParticipants.js';
import {
  createEmptyExecutionLease,
} from '../defaults.js';
import {
  applyMessageToChannel,
  createMessageRecord,
} from './recordBuilders.js';
import {
  cloneState,
  isoAt,
  normalizeOptionalText,
  requireChannel,
} from './shared.js';

export function updateGlobalOrchestrator(
  state: ChatState,
  input: UpdateGlobalOrchestratorInput,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  nextState.globalOrchestrator = {
    ...nextState.globalOrchestrator,
    executionTarget: {
      provider: input.provider.trim() || nextState.globalOrchestrator.executionTarget.provider,
      instance:
        normalizeOptionalText(input.instance)
        ?? nextState.globalOrchestrator.executionTarget.instance,
      model:
        input.model === undefined
          ? nextState.globalOrchestrator.executionTarget.model
          : normalizeOptionalText(input.model),
    },
    executionModelSelection: input.modelSelection === undefined
      ? cloneProviderModelSelection(nextState.globalOrchestrator.executionModelSelection)
      : cloneProviderModelSelection(input.modelSelection),
    systemPrompt:
      input.systemPrompt?.trim() || nextState.globalOrchestrator.systemPrompt,
    skillProfile: normalizeOptionalText(input.skillProfile),
    mcpProfile: normalizeOptionalText(input.mcpProfile),
    telegramBotName: normalizeOptionalText(input.telegramBotName),
    updatedAt: isoAt(now),
  };
  return nextState;
}

export function setGlobalOrchestratorExecutionTarget(
  state: ChatState,
  input: {
    provider?: string | null;
    instance?: string | null;
    model?: string | null;
    modelSelection?: ProviderModelSelection | null;
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  nextState.globalOrchestrator = {
    ...nextState.globalOrchestrator,
    executionTarget: {
      provider: input.provider?.trim() || nextState.globalOrchestrator.executionTarget.provider,
      instance:
        input.instance === undefined
          ? nextState.globalOrchestrator.executionTarget.instance
          : normalizeOptionalText(input.instance),
      model:
        input.model === undefined
          ? nextState.globalOrchestrator.executionTarget.model
          : normalizeOptionalText(input.model),
    },
    executionModelSelection: input.modelSelection === undefined
      ? cloneProviderModelSelection(nextState.globalOrchestrator.executionModelSelection)
      : cloneProviderModelSelection(input.modelSelection),
    updatedAt: isoAt(now),
  };
  return nextState;
}

export function updateNewChatDefaults(
  state: ChatState,
  input: Partial<NewChatDefaults>,
): ChatState {
  const nextState = cloneState(state);
  nextState.newChatDefaults = {
    provider: input.provider?.trim() || nextState.newChatDefaults.provider,
    instance:
      input.instance === undefined
        ? nextState.newChatDefaults.instance
        : normalizeOptionalText(input.instance),
    model:
      input.model === undefined
        ? nextState.newChatDefaults.model
        : normalizeOptionalText(input.model),
    modelSelection: input.modelSelection === undefined
      ? cloneProviderModelSelection(nextState.newChatDefaults.modelSelection)
      : cloneProviderModelSelection(input.modelSelection),
  };
  return nextState;
}

export function setChannelPendingExecutionTarget(
  state: ChatState,
  channelId: string,
  input: {
    provider?: string | null;
    model?: string | null;
    instance?: string | null;
    modelSelection?: AssignChannelCatInput['modelSelection'];
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);

  if (input.provider !== undefined) {
    channel.pendingProvider = normalizeOptionalText(input.provider);
  }
  if (input.model !== undefined) {
    channel.pendingModel = normalizeOptionalText(input.model);
  }
  if (input.instance !== undefined) {
    channel.pendingInstance = normalizeOptionalText(input.instance);
  }
  if (input.modelSelection !== undefined) {
    channel.pendingModelSelection = cloneProviderModelSelection(input.modelSelection);
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}

export function resetSoloChannelContinuity(
  state: ChatState,
  channelId: string,
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  if (channel.composerMode !== 'solo' || isDirectLaneChannel(channel)) {
    throw new Error('Start fresh is currently only supported for solo chats.');
  }

  const nowIso = isoAt(now);
  channel.continuityResetAt = nowIso;
  channel.orchestratorLease = createEmptyExecutionLease();
  channel.updatedAt = nowIso;

  applyMessageToChannel(
    channel,
    createMessageRecord(
      channelId,
      'system',
      'Chat',
      'Started fresh. The next solo turn will not inherit earlier chat continuity.',
      nowIso,
      {
        event: 'continuity_reset',
        resetMode: 'fresh_start',
        targetKind: 'orchestrator',
        continuityResetAt: nowIso,
      },
      null,
    ),
    nowIso,
  );

  return nextState;
}

export function setChannelCatExecutionTarget(
  state: ChatState,
  channelId: string,
  catId: string,
  input: {
    provider?: string | null;
    model?: string | null;
    instance?: string | null;
    modelSelection?: AssignChannelCatInput['modelSelection'];
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const assignment = channel.catAssignments.find((candidate) => candidate.catId === catId);

  if (!assignment) {
    throw new Error(`Channel cat assignment not found: ${catId}`);
  }

  if (input.provider !== undefined) {
    assignment.execution.target.provider =
      input.provider?.trim() || assignment.execution.target.provider;
  }
  if (input.model !== undefined) {
    assignment.execution.target.model = normalizeOptionalText(input.model);
  }
  if (input.instance !== undefined) {
    assignment.execution.target.instance = normalizeOptionalText(input.instance);
  }
  if (input.modelSelection !== undefined) {
    assignment.execution.modelSelection = cloneProviderModelSelection(input.modelSelection);
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}

export function setChannelParticipantExecutionTarget(
  state: ChatState,
  channelId: string,
  participantId: string,
  input: {
    provider?: string | null;
    model?: string | null;
    instance?: string | null;
    modelSelection?: AssignChannelCatInput['modelSelection'];
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const { participantAssignment, catAssignment } = resolveParticipantExecutionAssignments(
    channel,
    participantId,
  );

  if (!participantAssignment && !catAssignment) {
    throw new Error(`Channel participant assignment not found: ${participantId}`);
  }

  const assignments = [
    participantAssignment,
    catAssignment,
  ].filter((assignment): assignment is ChannelParticipantAssignment | ChannelCatAssignment => assignment != null);

  for (const assignment of assignments) {
    if (input.provider !== undefined) {
      assignment.execution.target.provider =
        input.provider?.trim() || assignment.execution.target.provider;
    }
    if (input.model !== undefined) {
      assignment.execution.target.model = normalizeOptionalText(input.model);
    }
    if (input.instance !== undefined) {
      assignment.execution.target.instance = normalizeOptionalText(input.instance);
    }
    if (input.modelSelection !== undefined) {
      assignment.execution.modelSelection = cloneProviderModelSelection(input.modelSelection);
    }
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}

export function updateChannelParticipantProfile(
  state: ChatState,
  channelId: string,
  participantId: string,
  input: {
    name?: string | null;
    roleHint?: string | null;
  },
  now: Date = new Date(),
): ChatState {
  const nextState = cloneState(state);
  const channel = requireChannel(nextState, channelId);
  const participantAssignment = resolveChannelParticipantAssignments(channel).find(
    (candidate) => candidate.participantId === participantId,
  ) ?? null;

  if (!participantAssignment) {
    throw new Error(`Channel participant assignment not found: ${participantId}`);
  }
  if (participantAssignment.sourceKind === 'cat') {
    throw new Error('Only temporary participants can be renamed here.');
  }

  const adhocAssignment = channel.participantAssignments?.find(
    (candidate) => candidate.participantId === participantId,
  ) ?? null;
  if (!adhocAssignment) {
    throw new Error(`Temporary participant assignment not found: ${participantId}`);
  }

  if (input.name !== undefined) {
    const nextName = input.name?.trim() || '';
    if (!nextName) {
      throw new Error('Temporary participant name is required');
    }
    adhocAssignment.name = nextName;
  }

  if (input.roleHint !== undefined) {
    adhocAssignment.roleHint = normalizeOptionalText(input.roleHint);
  }

  channel.updatedAt = isoAt(now);
  return nextState;
}
