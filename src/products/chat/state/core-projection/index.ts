import type { CatsCoreState, CoreTaskRecord } from '../../../../core/types.js';
import { CATS_CORE_STATE_VERSION } from '../../../../core/types.js';
import { createDefaultCoreState } from '../../../../core/model/index.js';
import {
  createDefaultOwnerProfile,
} from '../../../../core/actors.js';
import type { ChatState } from '../../api/contracts.js';
import {
  buildChatArchiveId,
  buildChatConversationId,
  buildChatTaskId,
  resolveChatConversationActorIds,
} from '../../../../shared/chatCoreIds.js';
import {
  createArchiveMetadata,
  createCatActor,
  createChatConversationParticipants,
  createChatRootContainer,
  createConversationFromChannel,
  createDirectLaneTransportBindings,
  createOrchestratorActor,
  createOwnerActor,
  createParallelGroupContainer,
  createBotTransportBindings,
  createTaskFromChannel,
  createTemporaryParticipantActors,
  preserveCoreOwnedContainers,
  preserveCoreOwnedParticipants,
  preserveCoreOwnedActors,
  preserveCoreOwnedArchives,
  preserveCoreOwnedConversations,
  preserveCoreOwnedTransportBindings,
  preserveCoreOwnedTasks,
  syncBotBindings,
} from './entities.js';
import {
  collectWorkflowTurns,
  createWorkflowActivity,
  createWorkflowCheckpoint,
  createWorkflowMission,
  createWorkflowOutcome,
  createWorkflowRun,
  createWorkflowTrace,
  preserveCoreOwnedActivities,
  preserveCoreOwnedCheckpoints,
  preserveCoreOwnedMissions,
  preserveCoreOwnedOutcomes,
  preserveCoreOwnedRuns,
  preserveCoreOwnedTraces,
} from './workflow.js';

export function syncCoreStateWithChatState(
  chat: ChatState,
  existingCore: Partial<CatsCoreState> = createDefaultCoreState(),
): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = existingCore.ownerProfile ?? createDefaultOwnerProfile(updatedAt);
  const ownerActor = createOwnerActor(ownerProfile);
  const orchestratorActor = createOrchestratorActor(chat);
  const catActors = chat.cats.map((cat) => createCatActor(cat, chat.bossCatId));
  const temporaryParticipantActors = createTemporaryParticipantActors(chat);
  const preservedActors = preserveCoreOwnedActors(existingCore.actors ?? []);
  const existingTasks = new Map((existingCore.tasks ?? []).map((task) => [task.id, task]));
  const existingArchives = new Map((existingCore.archives ?? []).map((archive) => [archive.id, archive]));
  const preservedParticipants = preserveCoreOwnedParticipants(existingCore.participants ?? []);
  const preservedContainers = preserveCoreOwnedContainers(existingCore.containers ?? []);
  const preservedConversations = preserveCoreOwnedConversations(
    existingCore.conversations ?? [],
  );
  const conversations = chat.channels.map((channel) =>
    createConversationFromChannel(
      channel,
      resolveChatConversationActorIds({
        channelId: channel.id,
        channelKind: channel.channelKind,
        assignments: channel.participantAssignments ?? [],
      }),
    ),
  );
  const participants = chat.channels.flatMap((channel) =>
    createChatConversationParticipants(channel));
  const containers = [
    createChatRootContainer(chat),
    ...chat.parallelChatGroups.map((group) => createParallelGroupContainer(group)),
  ];
  const tasks = chat.channels.map((channel) =>
    createTaskFromChannel(
      channel,
      ownerProfile.actorId,
      buildChatConversationId(channel.id),
      existingTasks.get(buildChatTaskId(channel.id)) as CoreTaskRecord | null ?? null,
    ),
  );
  const preservedTasks = preserveCoreOwnedTasks(existingCore.tasks ?? []);
  const preservedMissions = preserveCoreOwnedMissions(existingCore.missions ?? []);
  const preservedTransportBindings = preserveCoreOwnedTransportBindings(
    existingCore.transportBindings ?? [],
  );
  const preservedRuns = preserveCoreOwnedRuns(existingCore.runs ?? []);
  const preservedTraces = preserveCoreOwnedTraces(existingCore.traces ?? []);
  const preservedCheckpoints = preserveCoreOwnedCheckpoints(existingCore.checkpoints ?? []);
  const preservedOutcomes = preserveCoreOwnedOutcomes(existingCore.outcomes ?? []);
  const preservedActivities = preserveCoreOwnedActivities(existingCore.activities ?? []);
  const preservedArchives = preserveCoreOwnedArchives(existingCore.archives ?? []);
  const archives = chat.channels.map((channel) =>
    createArchiveMetadata(
      channel,
      buildChatConversationId(channel.id),
      existingArchives.get(buildChatArchiveId(channel.id)) ?? null,
    ),
  );
  const workflowTurns = chat.channels.flatMap((channel) =>
    collectWorkflowTurns(channel).map((turn) => ({ channel, turn })),
  );
  const workflowRuns = workflowTurns.map(({ channel, turn }) =>
    createWorkflowRun(channel, turn),
  );
  const workflowMissions = workflowTurns.flatMap(({ channel, turn }) =>
    turn.targetStatuses.map((target) => createWorkflowMission(channel, turn, target)),
  );
  const workflowTraces = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowTrace(channel, turn, event)),
  );
  const workflowCheckpoints = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'checkpoint')
      .map((event) => createWorkflowCheckpoint(channel, turn, event)),
  );
  const workflowOutcomes = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'outcome')
      .map((event) => createWorkflowOutcome(channel, turn, event)),
  );
  const workflowActivities = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowActivity(channel, turn, event)),
  );
  const botBindings = syncBotBindings(chat, existingCore.botBindings ?? []);
  const transportBindings = [
    ...createDirectLaneTransportBindings(chat),
    ...createBotTransportBindings(botBindings),
    ...preservedTransportBindings,
  ];

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: existingCore.setupCompleteAt ?? null,
    ownerProfile: {
      ...ownerProfile,
      updatedAt: ownerProfile.updatedAt || updatedAt,
    },
    guideCat: existingCore.guideCat ? structuredClone(existingCore.guideCat) : null,
    assistantPresets: structuredClone(existingCore.assistantPresets ?? []),
    actors: [
      ownerActor,
      orchestratorActor,
      ...catActors,
      ...temporaryParticipantActors,
      ...preservedActors,
    ],
    participants: [...participants, ...preservedParticipants],
    containers: [...containers, ...preservedContainers],
    conversations: [...conversations, ...preservedConversations],
    turns: structuredClone(existingCore.turns ?? []),
    lanes: structuredClone(existingCore.lanes ?? []),
    segments: structuredClone(existingCore.segments ?? []),
    sessions: structuredClone(existingCore.sessions ?? []),
    projects: structuredClone(existingCore.projects ?? []),
    workItems: structuredClone(existingCore.workItems ?? []),
    missions: [...workflowMissions, ...preservedMissions],
    tasks: [...tasks, ...preservedTasks],
    runs: [...workflowRuns, ...preservedRuns],
    traces: [...workflowTraces, ...preservedTraces],
    checkpoints: [...workflowCheckpoints, ...preservedCheckpoints],
    outcomes: [...workflowOutcomes, ...preservedOutcomes],
    artifacts: structuredClone(existingCore.artifacts ?? []),
    activities: [...workflowActivities, ...preservedActivities],
    approvalBindings: structuredClone(existingCore.approvalBindings ?? []),
    transportBindings,
    botBindings,
    archives: [...archives, ...preservedArchives],
    durableMemory: structuredClone(existingCore.durableMemory ?? []),
  };
}
