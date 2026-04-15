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
  buildChatTaskId,
  buildChatWorkItemId,
  resolveChatConversationActorIds,
  resolveChatChannelParallelGroupId,
} from '../../../../shared/chatCoreIds.js';
import { resolveChannelCanonicalIdentity } from '../model/index.js';
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
  const channelCanonicalIdentityById = new Map(
    chat.channels.map((channel) => [
      channel.id,
      resolveChannelCanonicalIdentity(chat, channel.id),
    ]),
  );
  const readChannelCanonicalIdentity = (channelId: string) =>
    channelCanonicalIdentityById.get(channelId)
    ?? resolveChannelCanonicalIdentity(chat, channelId);
  const conversations = chat.channels.map((channel) =>
    createConversationFromChannel(
      channel,
      readChannelCanonicalIdentity(channel.id).containerId,
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
      readChannelCanonicalIdentity(channel.id).conversationId,
      readChannelCanonicalIdentity(channel.id).containerId,
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
      readChannelCanonicalIdentity(channel.id).conversationId,
      readChannelCanonicalIdentity(channel.id).containerId,
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
      readChannelCanonicalIdentity(channel.id).conversationId,
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
      readChannelCanonicalIdentity(channel.id).containerId,
    ),
  );
  const workflowMissions = workflowTurns.flatMap(({ channel, turn }) =>
    turn.targetStatuses.map((target) => createWorkflowMission(
      channel,
      turn,
      target,
      readChannelCanonicalIdentity(channel.id).containerId,
    )),
  );
  const workflowTraces = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowTrace(
      channel,
      turn,
      event,
      readChannelCanonicalIdentity(channel.id).containerId,
    )),
  );
  const workflowCheckpoints = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'checkpoint')
      .map((event) => createWorkflowCheckpoint(
        channel,
        turn,
        event,
        readChannelCanonicalIdentity(channel.id).containerId,
      )),
  );
  const workflowOutcomes = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events
      .filter((event) => event.kind === 'outcome')
      .map((event) => createWorkflowOutcome(
        channel,
        turn,
        event,
        readChannelCanonicalIdentity(channel.id).containerId,
      )),
  );
  const workflowActivities = workflowTurns.flatMap(({ channel, turn }) =>
    turn.events.map((event) => createWorkflowActivity(
      channel,
      turn,
      event,
      readChannelCanonicalIdentity(channel.id).containerId,
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
