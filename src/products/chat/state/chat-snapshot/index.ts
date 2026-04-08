import type {
  ChatCat,
  ChatChannelState,
  ChatState,
} from '../../api/contracts.js';
import type {
  AssistantPresetRecord,
  ArchiveMetadataRecord,
  BotBindingRecord,
  CoreActivityRecord,
  CoreActorRecord,
  CoreApprovalBindingRecord,
  CoreArtifactRecord,
  CoreCheckpointRecord,
  CoreConversationRecord,
  CoreOrchestrationOutcomeRecord,
  CoreProjectRecord,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkItemRecord,
  DurableMemoryRecord,
} from '../../../../core/types.js';
import {
  createDefaultChatState,
} from '../defaults.js';
import type { PersistedChatSnapshot } from '../core-snapshot/index.js';
import {
  buildPersistedChatSnapshot,
  normalizeAssistantPresetRecord,
  normalizeArchiveMetadata,
  normalizeBotBinding,
  normalizeCoreActivity,
  normalizeCoreActor,
  normalizeCoreApprovalBinding,
  normalizeCoreArtifact,
  normalizeCoreCheckpoint,
  normalizeCoreConversation,
  normalizeCoreOutcome,
  normalizeCoreProject,
  normalizeCoreRun,
  normalizeCoreTask,
  normalizeCoreTrace,
  normalizeCoreWorkItem,
  normalizeDurableMemoryRecord,
  normalizeGuideCatRecord,
  normalizeOwnerProfile,
} from '../core-snapshot/index.js';
import {
  looksLikeChatState,
  normalizeCapabilities,
  normalizeChannel,
  normalizeChatCat,
  normalizeParallelChatGroup,
  normalizeGlobalOrchestrator,
  normalizeNewChatDefaults,
} from './entities.js';
import {
  asRecord,
  readBoolean,
  readNullableString,
  readString,
} from './shared.js';
import { createDefaultCoreState } from '../../../../core/model/index.js';
import { syncCoreStateWithChatState } from '../core-projection/index.js';

export function normalizeChatState(rawState: unknown): ChatState {
  const fallback = createDefaultChatState();
  const stateRecord = asRecord(rawState);
  if (!stateRecord) {
    return fallback;
  }

  const normalizedCats = Array.isArray(stateRecord.cats)
    ? stateRecord.cats
        .map((cat) => normalizeChatCat(cat))
        .filter((cat): cat is ChatCat => cat !== null)
    : [];
  const catsById = new Map(normalizedCats.map((cat) => [cat.id, cat]));
  const normalizedChannels = Array.isArray(stateRecord.channels)
    ? stateRecord.channels
        .map((channel) => normalizeChannel(channel, catsById))
        .filter((channel): channel is ChatChannelState => channel !== null)
    : fallback.channels;
  const rawParallelChatGroups = Array.isArray(stateRecord.parallelChatGroups)
    ? stateRecord.parallelChatGroups
    : Array.isArray((stateRecord as Record<string, unknown>).concurrentGroups)
      ? (stateRecord as Record<string, unknown>).concurrentGroups as unknown[]
      : null;
  const normalizedParallelChatGroups = rawParallelChatGroups
    ? rawParallelChatGroups
        .map((group) => normalizeParallelChatGroup(group))
        .filter((group): group is NonNullable<typeof group> => group !== null)
        .map((group) => ({
          ...group,
          memberChannelIds: group.memberChannelIds.filter((channelId) =>
            normalizedChannels.some((channel) => channel.id === channelId),
          ),
        }))
        .filter((group) => group.memberChannelIds.length > 1)
    : [];
  const rawSelectedChannelId = readString(
    stateRecord.selectedChannelId,
    normalizedChannels[0]?.id ?? fallback.selectedChannelId,
  );

  return {
    id: readString(stateRecord.id, fallback.id),
    name: readString(stateRecord.name, fallback.name),
    selectedChannelId: normalizedChannels.some((channel) => channel.id === rawSelectedChannelId)
      ? rawSelectedChannelId
      : normalizedChannels[0]?.id ?? fallback.selectedChannelId,
    bossCatId: readNullableString(stateRecord.bossCatId),
    cats: Array.from(catsById.values()),
    channels: normalizedChannels.length > 0 ? normalizedChannels : fallback.channels,
    parallelChatGroups: normalizedParallelChatGroups,
    globalOrchestrator: normalizeGlobalOrchestrator(stateRecord.globalOrchestrator),
    newChatDefaults: normalizeNewChatDefaults(stateRecord.newChatDefaults),
    capabilities: normalizeCapabilities(stateRecord.capabilities),
    showVerboseMessages: readBoolean(stateRecord.showVerboseMessages, false),
  };
}

export function normalizePersistedChatSnapshot(rawState: unknown): PersistedChatSnapshot {
  const fallback = createDefaultCoreState();
  const stateRecord = asRecord(rawState);
  if (!stateRecord) {
    const chat = createDefaultChatState();
    return buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat, fallback));
  }

  const chatRecord = asRecord(stateRecord.chat);
  if (!chatRecord) {
    if (looksLikeChatState(stateRecord)) {
      const chat = normalizeChatState(stateRecord);
      return buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat, fallback));
    }

    const chat = createDefaultChatState();
    return buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat, fallback));
  }

  const chat = normalizeChatState(chatRecord);
  const actors = Array.isArray(stateRecord.actors)
    ? stateRecord.actors
        .map((actor) => normalizeCoreActor(actor))
        .filter((actor): actor is CoreActorRecord => actor !== null)
    : [];
  const conversations = Array.isArray(stateRecord.conversations)
    ? stateRecord.conversations
        .map((conversation) => normalizeCoreConversation(conversation))
        .filter((conversation): conversation is CoreConversationRecord => conversation !== null)
    : [];
  const projects = Array.isArray(stateRecord.projects)
    ? stateRecord.projects
        .map((project) => normalizeCoreProject(project))
        .filter((project): project is CoreProjectRecord => project !== null)
    : [];
  const workItems = Array.isArray(stateRecord.workItems)
    ? stateRecord.workItems
        .map((workItem) => normalizeCoreWorkItem(workItem))
        .filter((workItem): workItem is CoreWorkItemRecord => workItem !== null)
    : [];
  const tasks = Array.isArray(stateRecord.tasks)
    ? stateRecord.tasks
        .map((task) => normalizeCoreTask(task))
        .filter((task): task is CoreTaskRecord => task !== null)
    : [];
  const runs = Array.isArray(stateRecord.runs)
    ? stateRecord.runs
        .map((run) => normalizeCoreRun(run))
        .filter((run): run is CoreRunRecord => run !== null)
    : [];
  const traces = Array.isArray(stateRecord.traces)
    ? stateRecord.traces
        .map((trace) => normalizeCoreTrace(trace))
        .filter((trace): trace is CoreTraceRecord => trace !== null)
    : [];
  const checkpoints = Array.isArray(stateRecord.checkpoints)
    ? stateRecord.checkpoints
        .map((checkpoint) => normalizeCoreCheckpoint(checkpoint))
        .filter((checkpoint): checkpoint is CoreCheckpointRecord => checkpoint !== null)
    : [];
  const outcomes = Array.isArray(stateRecord.outcomes)
    ? stateRecord.outcomes
        .map((outcome) => normalizeCoreOutcome(outcome))
        .filter((outcome): outcome is CoreOrchestrationOutcomeRecord => outcome !== null)
    : [];
  const artifacts = Array.isArray(stateRecord.artifacts)
    ? stateRecord.artifacts
        .map((artifact) => normalizeCoreArtifact(artifact))
        .filter((artifact): artifact is CoreArtifactRecord => artifact !== null)
    : [];
  const activities = Array.isArray(stateRecord.activities)
    ? stateRecord.activities
        .map((activity) => normalizeCoreActivity(activity))
        .filter((activity): activity is CoreActivityRecord => activity !== null)
    : [];
  const approvalBindings = Array.isArray(stateRecord.approvalBindings)
    ? stateRecord.approvalBindings
        .map((approvalBinding) => normalizeCoreApprovalBinding(approvalBinding))
        .filter(
          (approvalBinding): approvalBinding is CoreApprovalBindingRecord =>
            approvalBinding !== null,
        )
    : [];
  const botBindings = Array.isArray(stateRecord.botBindings)
    ? stateRecord.botBindings
        .map((binding) => normalizeBotBinding(binding, chat))
        .filter((binding): binding is BotBindingRecord => binding !== null)
    : [];
  const archives = Array.isArray(stateRecord.archives)
    ? stateRecord.archives
        .map((archive) => normalizeArchiveMetadata(archive))
        .filter((archive): archive is ArchiveMetadataRecord => archive !== null)
    : [];
  const durableMemory = Array.isArray(stateRecord.durableMemory)
    ? stateRecord.durableMemory
        .map((record) => normalizeDurableMemoryRecord(record))
        .filter((record): record is DurableMemoryRecord => record !== null)
    : [];
  const assistantPresets = Array.isArray(stateRecord.assistantPresets)
    ? stateRecord.assistantPresets
        .map((record) => normalizeAssistantPresetRecord(record))
        .filter((record): record is AssistantPresetRecord => record !== null)
    : [];
  const normalized = syncCoreStateWithChatState(chat, {
    setupCompleteAt: readNullableString(stateRecord.setupCompleteAt),
    ownerProfile: normalizeOwnerProfile(stateRecord.ownerProfile),
    guideCat: normalizeGuideCatRecord(stateRecord.guideCat),
    assistantPresets,
    actors,
    conversations,
    projects,
    workItems,
    tasks,
    runs,
    traces,
    checkpoints,
    outcomes,
    artifacts,
    activities,
    approvalBindings,
    botBindings,
    archives,
    durableMemory,
  });

  return buildPersistedChatSnapshot(chat, {
    ...normalized,
    setupCompleteAt: readNullableString(stateRecord.setupCompleteAt),
    updatedAt: readString(stateRecord.updatedAt, normalized.updatedAt),
    ownerProfile: {
      ...normalized.ownerProfile,
      updatedAt: readString(
        asRecord(stateRecord.ownerProfile)?.updatedAt,
        normalized.ownerProfile.updatedAt,
      ),
    },
  });
}
