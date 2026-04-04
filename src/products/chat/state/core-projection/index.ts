import type { CatsCoreState, CoreTaskRecord } from '../../../../core/types.js';
import { CATS_CORE_STATE_VERSION } from '../../../../core/types.js';
import { createDefaultCoreState } from '../../../../core/model/index.js';
import {
  createDefaultOwnerProfile,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
} from '../../../../core/actors.js';
import type { ChatState } from '../../api/contracts.js';
import {
  createArchiveMetadata,
  createCatActor,
  createConversationFromChannel,
  createOrchestratorActor,
  createOwnerActor,
  createTaskFromChannel,
  preserveCoreOwnedActors,
  preserveCoreOwnedArchives,
  preserveCoreOwnedConversations,
  preserveCoreOwnedTasks,
  syncBotBindings,
} from './entities.js';
import {
  collectWorkflowTurns,
  createWorkflowActivity,
  createWorkflowCheckpoint,
  createWorkflowOutcome,
  createWorkflowRun,
  createWorkflowTrace,
  preserveCoreOwnedActivities,
  preserveCoreOwnedCheckpoints,
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
  const preservedActors = preserveCoreOwnedActors(existingCore.actors ?? []);
  const existingTasks = new Map((existingCore.tasks ?? []).map((task) => [task.id, task]));
  const existingArchives = new Map((existingCore.archives ?? []).map((archive) => [archive.id, archive]));
  const preservedConversations = preserveCoreOwnedConversations(
    existingCore.conversations ?? [],
  );
  const conversations = chat.channels.map((channel) =>
    createConversationFromChannel(
      channel,
      [
        ownerProfile.actorId,
        GLOBAL_ORCHESTRATOR_ACTOR_ID,
        ...channel.catAssignments.map((assignment) => `actor-cat-${assignment.catId}`),
      ],
    ),
  );
  const tasks = chat.channels.map((channel) =>
    createTaskFromChannel(
      channel,
      ownerProfile.actorId,
      `conversation-channel-${channel.id}`,
      existingTasks.get(`task-channel-${channel.id}`) as CoreTaskRecord | null ?? null,
    ),
  );
  const preservedTasks = preserveCoreOwnedTasks(existingCore.tasks ?? []);
  const preservedRuns = preserveCoreOwnedRuns(existingCore.runs ?? []);
  const preservedTraces = preserveCoreOwnedTraces(existingCore.traces ?? []);
  const preservedCheckpoints = preserveCoreOwnedCheckpoints(existingCore.checkpoints ?? []);
  const preservedOutcomes = preserveCoreOwnedOutcomes(existingCore.outcomes ?? []);
  const preservedActivities = preserveCoreOwnedActivities(existingCore.activities ?? []);
  const preservedArchives = preserveCoreOwnedArchives(existingCore.archives ?? []);
  const archives = chat.channels.map((channel) =>
    createArchiveMetadata(
      channel,
      `conversation-channel-${channel.id}`,
      existingArchives.get(`archive-channel-${channel.id}`) ?? null,
    ),
  );
  const workflowTurns = chat.channels.flatMap((channel) =>
    collectWorkflowTurns(channel).map((turn) => ({ channel, turn })),
  );
  const workflowRuns = workflowTurns.map(({ channel, turn }) =>
    createWorkflowRun(channel, turn),
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

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: existingCore.setupCompleteAt ?? null,
    ownerProfile: {
      ...ownerProfile,
      updatedAt: ownerProfile.updatedAt || updatedAt,
    },
    guideCat: existingCore.guideCat ? structuredClone(existingCore.guideCat) : null,
    actors: [ownerActor, orchestratorActor, ...catActors, ...preservedActors],
    conversations: [...conversations, ...preservedConversations],
    projects: structuredClone(existingCore.projects ?? []),
    workItems: structuredClone(existingCore.workItems ?? []),
    tasks: [...tasks, ...preservedTasks],
    runs: [...workflowRuns, ...preservedRuns],
    traces: [...workflowTraces, ...preservedTraces],
    checkpoints: [...workflowCheckpoints, ...preservedCheckpoints],
    outcomes: [...workflowOutcomes, ...preservedOutcomes],
    artifacts: structuredClone(existingCore.artifacts ?? []),
    activities: [...workflowActivities, ...preservedActivities],
    approvalBindings: structuredClone(existingCore.approvalBindings ?? []),
    botBindings: syncBotBindings(chat, existingCore.botBindings ?? []),
    archives: [...archives, ...preservedArchives],
    durableMemory: structuredClone(existingCore.durableMemory ?? []),
  };
}
