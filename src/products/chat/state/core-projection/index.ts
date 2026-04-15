import type {
  CatsCoreState,
  CoreTaskRecord,
  CoreWorkItemRecord,
} from '../../../../core/types.js';
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
  buildChatWorkItemId,
  resolveChatChannelContainerId,
  resolveChatConversationActorIds,
  resolveChatChannelParallelGroupId,
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
  createWorkItemFromChannel,
  createTemporaryParticipantActors,
  preserveCoreOwnedContainers,
  preserveCoreOwnedParticipants,
  preserveCoreOwnedActors,
  preserveCoreOwnedArchives,
  preserveCoreOwnedConversations,
  preserveCoreOwnedTransportBindings,
  preserveCoreOwnedTasks,
  preserveCoreOwnedWorkItems,
  syncBotBindings,
} from './entities.js';
import {
  projectChatInteractionRecordsToCore,
} from './interaction.js';
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
  const existingWorkItems = new Map((existingCore.workItems ?? []).map((workItem) => [workItem.id, workItem]));
  const existingArchives = new Map((existingCore.archives ?? []).map((archive) => [archive.id, archive]));
  const preservedParticipants = preserveCoreOwnedParticipants(existingCore.participants ?? []);
  const preservedContainers = preserveCoreOwnedContainers(existingCore.containers ?? []);
  const preservedConversations = preserveCoreOwnedConversations(
    existingCore.conversations ?? [],
  );
  const conversations = chat.channels.map((channel) =>
    createConversationFromChannel(
      channel,
      resolveChatChannelContainerId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
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
      resolveChatChannelContainerId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
      resolveChatChannelParallelGroupId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
      existingTasks.get(buildChatTaskId(channel.id)) as CoreTaskRecord | null ?? null,
    ),
  );
  const workItems = chat.channels.map((channel) =>
    createWorkItemFromChannel(
      channel,
      ownerProfile.actorId,
      buildChatConversationId(channel.id),
      resolveChatChannelContainerId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
      resolveChatChannelParallelGroupId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
      existingWorkItems.get(buildChatWorkItemId(channel.id)) as CoreWorkItemRecord | null ?? null,
    ),
  );
  const preservedTasks = preserveCoreOwnedTasks(existingCore.tasks ?? []);
  const preservedWorkItems = preserveCoreOwnedWorkItems(existingCore.workItems ?? []);
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
    createWorkflowRun(
      channel,
      turn,
      resolveChatChannelContainerId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
    ),
  );
  const workflowMissions = workflowTurns.flatMap(({ channel, turn }) =>
    turn.targetStatuses.map((target) => createWorkflowMission(
      channel,
      turn,
      target,
      resolveChatChannelContainerId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
    )),
  );
  const workflowTraces = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowTrace(
      channel,
      turn,
      event,
      resolveChatChannelContainerId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
    )),
  );
  const workflowCheckpoints = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'checkpoint')
      .map((event) => createWorkflowCheckpoint(
        channel,
        turn,
        event,
        resolveChatChannelContainerId({
          channelId: channel.id,
          parallelChatGroups: chat.parallelChatGroups,
        }),
      )),
  );
  const workflowOutcomes = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'outcome')
      .map((event) => createWorkflowOutcome(
        channel,
        turn,
        event,
        resolveChatChannelContainerId({
          channelId: channel.id,
          parallelChatGroups: chat.parallelChatGroups,
        }),
      )),
  );
  const workflowActivities = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowActivity(
      channel,
      turn,
      event,
      resolveChatChannelContainerId({
        channelId: channel.id,
        parallelChatGroups: chat.parallelChatGroups,
      }),
    )),
  );
  const botBindings = syncBotBindings(chat, existingCore.botBindings ?? []);
  const transportBindings = [
    ...createDirectLaneTransportBindings(chat),
    ...createBotTransportBindings(botBindings),
    ...preservedTransportBindings,
  ];

  const nextCore = projectChatInteractionRecordsToCore({
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
    workItems: [...workItems, ...preservedWorkItems],
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
  }, chat, new Date(updatedAt));

  return nextCore;
}
