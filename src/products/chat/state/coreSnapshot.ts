import { randomUUID } from 'node:crypto';

import type { ChatState } from '../api/contracts.js';
import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  CatsCoreState,
  CoreActivityRecord,
  CoreActorRecord,
  CoreApprovalBindingRecord,
  CoreArtifactRecord,
  CoreCheckpointRecord,
  CoreConversationRecord,
  CoreOrchestrationOutcomeRecord,
  CoreProjectRecord,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkItemRecord,
  DurableMemoryRecord,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
  OwnerProfileRecord,
} from '../../../core/types.js';
import {
  createCatActorId,
  createDefaultCoreState,
  createEmptyMemoryCheckpoint,
} from '../../../core/model.js';

export interface PersistedChatSnapshot extends CatsCoreState {
  chat: ChatState;
}

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

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeMetadata(value: unknown): CoreRecordMetadata {
  return asRecord(value) ?? {};
}

function normalizeExecutionTarget(
  rawTarget: unknown,
  fallbackTarget: ExecutionTargetSummary,
): ExecutionTargetSummary {
  const targetRecord = asRecord(rawTarget);
  const provider =
    readString(targetRecord?.provider, fallbackTarget.provider).trim()
    || fallbackTarget.provider;

  return {
    provider,
    instance: readNullableString(targetRecord?.instance) ?? fallbackTarget.instance,
    model: readNullableString(targetRecord?.model) ?? fallbackTarget.model,
  };
}

function normalizeMemoryCheckpoint(rawMemory: unknown): MemoryCheckpointSummary {
  const memoryRecord = asRecord(rawMemory);
  return {
    summary: readNullableString(memoryRecord?.summary),
    facts: readStringArray(memoryRecord?.facts),
    openLoops: readStringArray(memoryRecord?.openLoops),
    updatedAt: readNullableString(memoryRecord?.updatedAt),
  };
}

export function normalizeOwnerProfile(rawOwnerProfile: unknown): OwnerProfileRecord {
  const fallback = createDefaultCoreState().ownerProfile;
  const ownerProfileRecord = asRecord(rawOwnerProfile);

  return {
    actorId: readString(ownerProfileRecord?.actorId, fallback.actorId),
    displayName: readString(ownerProfileRecord?.displayName, fallback.displayName),
    avatarColor: readNullableString(ownerProfileRecord?.avatarColor),
    summary: readNullableString(ownerProfileRecord?.summary),
    communicationPreferences: readStringArray(ownerProfileRecord?.communicationPreferences),
    decisionPreferences: readStringArray(ownerProfileRecord?.decisionPreferences),
    escalationPreferences: readStringArray(ownerProfileRecord?.escalationPreferences),
    updatedAt: readString(ownerProfileRecord?.updatedAt, fallback.updatedAt),
  };
}

export function normalizeCoreActor(rawActor: unknown): CoreActorRecord | null {
  const actorRecord = asRecord(rawActor);
  if (!actorRecord) {
    return null;
  }

  const rawKind = readString(actorRecord.kind, 'worker');
  const kind = (
    rawKind === 'owner'
    || rawKind === 'orchestrator'
    || rawKind === 'worker'
    || rawKind === 'stakeholder'
    || rawKind === 'bot'
    || rawKind === 'resource'
  )
    ? rawKind
    : 'worker';
  const rawStatus = readString(actorRecord.status, 'active');
  const status = rawStatus === 'archived' ? 'archived' : 'active';
  const rawSource = readString(actorRecord.source, 'core_record');
  const source = (
    rawSource === 'owner_profile'
    || rawSource === 'global_orchestrator'
    || rawSource === 'chat_cat'
    || rawSource === 'core_record'
  )
    ? rawSource
    : 'core_record';

  return {
    id: readString(actorRecord.id, randomUUID()),
    name: readString(actorRecord.name, 'Actor'),
    kind,
    status,
    roles: readStringArray(actorRecord.roles),
    skillProfile: readNullableString(actorRecord.skillProfile),
    mcpProfile: readNullableString(actorRecord.mcpProfile),
    defaultExecutionTarget: actorRecord.defaultExecutionTarget === null
      ? null
      : asRecord(actorRecord.defaultExecutionTarget)
        ? normalizeExecutionTarget(actorRecord.defaultExecutionTarget, {
            provider: 'claude',
            instance: null,
            model: null,
          })
        : null,
    memory: asRecord(actorRecord.memory)
      ? normalizeMemoryCheckpoint(actorRecord.memory)
      : createEmptyMemoryCheckpoint(),
    source,
    sourceId: readNullableString(actorRecord.sourceId),
    createdAt: readString(actorRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(actorRecord.updatedAt, new Date().toISOString()),
    archivedAt: readNullableString(actorRecord.archivedAt),
  };
}

export function normalizeCoreConversation(rawConversation: unknown): CoreConversationRecord | null {
  const conversationRecord = asRecord(rawConversation);
  if (!conversationRecord) {
    return null;
  }

  const rawKind = readString(conversationRecord.kind, 'work_thread');
  const kind = (
    rawKind === 'chat_channel'
    || rawKind === 'direct_message'
    || rawKind === 'external_transport'
    || rawKind === 'private_escalation'
    || rawKind === 'work_thread'
    || rawKind === 'code_thread'
  )
    ? rawKind
    : 'work_thread';
  const rawStatus = readString(conversationRecord.status, 'planned');
  const status = (
    rawStatus === 'planned'
    || rawStatus === 'active'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'planned';

  return {
    id: readString(conversationRecord.id, randomUUID()),
    title: readString(conversationRecord.title, 'Untitled conversation'),
    kind,
    status,
    participantActorIds: readStringArray(conversationRecord.participantActorIds),
    sourceChannelId: readNullableString(conversationRecord.sourceChannelId),
    repoPath: readNullableString(conversationRecord.repoPath),
    responseLanguage: readString(conversationRecord.responseLanguage, 'en'),
    createdAt: readString(conversationRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(conversationRecord.updatedAt, new Date().toISOString()),
    lastMessageAt: readNullableString(conversationRecord.lastMessageAt),
  };
}

export function normalizeCoreProject(rawProject: unknown): CoreProjectRecord | null {
  const projectRecord = asRecord(rawProject);
  if (!projectRecord) {
    return null;
  }

  const rawStatus = readString(projectRecord.status, 'planned');
  const status = (
    rawStatus === 'planned'
    || rawStatus === 'active'
    || rawStatus === 'paused'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'planned';

  return {
    id: readString(projectRecord.id, randomUUID()),
    title: readString(projectRecord.title, 'Untitled project'),
    status,
    ownerActorId: readString(projectRecord.ownerActorId),
    summary: readNullableString(projectRecord.summary),
    repoPath: readNullableString(projectRecord.repoPath),
    primaryConversationId: readNullableString(projectRecord.primaryConversationId),
    createdAt: readString(projectRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(projectRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(projectRecord.metadata),
  };
}

export function normalizeCoreWorkItem(rawWorkItem: unknown): CoreWorkItemRecord | null {
  const workItemRecord = asRecord(rawWorkItem);
  if (!workItemRecord) {
    return null;
  }

  const rawStatus = readString(workItemRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'planned'
    || rawStatus === 'ready'
    || rawStatus === 'in_progress'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';

  return {
    id: readString(workItemRecord.id, randomUUID()),
    title: readString(workItemRecord.title, 'Untitled work item'),
    status,
    projectId: readNullableString(workItemRecord.projectId),
    conversationId: readNullableString(workItemRecord.conversationId),
    taskId: readNullableString(workItemRecord.taskId),
    parentWorkItemId: readNullableString(workItemRecord.parentWorkItemId),
    ownerActorId: readString(workItemRecord.ownerActorId),
    assignedActorIds: readStringArray(workItemRecord.assignedActorIds),
    summary: readNullableString(workItemRecord.summary),
    createdAt: readString(workItemRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(workItemRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(workItemRecord.metadata),
  };
}

export function normalizeCoreTask(rawTask: unknown): CoreTaskRecord | null {
  const taskRecord = asRecord(rawTask);
  if (!taskRecord) {
    return null;
  }

  const approvalRecord = asRecord(taskRecord.approval);
  const rawStatus = readString(taskRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'pending_approval'
    || rawStatus === 'approved'
    || rawStatus === 'in_progress'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';
  const rawApprovalStatus = readString(approvalRecord?.status, 'not_requested');
  const approvalStatus = (
    rawApprovalStatus === 'not_requested'
    || rawApprovalStatus === 'pending'
    || rawApprovalStatus === 'approved'
    || rawApprovalStatus === 'rejected'
  )
    ? rawApprovalStatus
    : 'not_requested';
  const rawDecisionAction = readString(approvalRecord?.decisionAction);
  const decisionAction = (
    rawDecisionAction === 'approve'
    || rawDecisionAction === 'reroute'
    || rawDecisionAction === 'reject'
  )
    ? rawDecisionAction
    : null;

  return {
    id: readString(taskRecord.id, randomUUID()),
    title: readString(taskRecord.title, 'Untitled task'),
    status,
    conversationId: readNullableString(taskRecord.conversationId),
    parentTaskId: readNullableString(taskRecord.parentTaskId),
    ownerActorId: readString(taskRecord.ownerActorId),
    orchestratorActorId: readNullableString(taskRecord.orchestratorActorId),
    assignedActorIds: readStringArray(taskRecord.assignedActorIds),
    summary: readNullableString(taskRecord.summary),
    approval: {
      status: approvalStatus,
      requestedAt: readNullableString(approvalRecord?.requestedAt),
      decidedAt: readNullableString(approvalRecord?.decidedAt),
      decidedByActorId: readNullableString(approvalRecord?.decidedByActorId),
      decisionAction,
      notes: readNullableString(approvalRecord?.notes),
    },
    createdAt: readString(taskRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(taskRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(taskRecord.metadata),
  };
}

export function normalizeCoreRun(rawRun: unknown): CoreRunRecord | null {
  const runRecord = asRecord(rawRun);
  if (!runRecord) {
    return null;
  }

  const rawStatus = readString(runRecord.status, 'queued');
  const status = (
    rawStatus === 'queued'
    || rawStatus === 'running'
    || rawStatus === 'blocked'
    || rawStatus === 'completed'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'queued';

  return {
    id: readString(runRecord.id, randomUUID()),
    title: readString(runRecord.title, 'Untitled run'),
    status,
    conversationId: readNullableString(runRecord.conversationId),
    taskId: readNullableString(runRecord.taskId),
    parentRunId: readNullableString(runRecord.parentRunId),
    orchestratorActorId: readNullableString(runRecord.orchestratorActorId),
    traceId: readNullableString(runRecord.traceId),
    summary: readNullableString(runRecord.summary),
    createdAt: readString(runRecord.createdAt, new Date().toISOString()),
    startedAt: readNullableString(runRecord.startedAt),
    completedAt: readNullableString(runRecord.completedAt),
    updatedAt: readString(runRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(runRecord.metadata),
  };
}

export function normalizeCoreTrace(rawTrace: unknown): CoreTraceRecord | null {
  const traceRecord = asRecord(rawTrace);
  if (!traceRecord) {
    return null;
  }

  const rawKind = readString(traceRecord.kind, 'note');
  const kind = (
    rawKind === 'note'
    || rawKind === 'status'
    || rawKind === 'dispatch'
    || rawKind === 'approval'
    || rawKind === 'checkpoint'
    || rawKind === 'outcome'
    || rawKind === 'error'
  )
    ? rawKind
    : 'note';

  return {
    id: readString(traceRecord.id, randomUUID()),
    traceId: readString(traceRecord.traceId),
    kind,
    conversationId: readNullableString(traceRecord.conversationId),
    runId: readNullableString(traceRecord.runId),
    taskId: readNullableString(traceRecord.taskId),
    actorId: readNullableString(traceRecord.actorId),
    message: readString(traceRecord.message),
    createdAt: readString(traceRecord.createdAt, new Date().toISOString()),
    metadata: normalizeMetadata(traceRecord.metadata),
  };
}

export function normalizeCoreCheckpoint(rawCheckpoint: unknown): CoreCheckpointRecord | null {
  const checkpointRecord = asRecord(rawCheckpoint);
  if (!checkpointRecord) {
    return null;
  }

  const rawStatus = readString(checkpointRecord.status, 'open');
  const status = (
    rawStatus === 'open'
    || rawStatus === 'completed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'open';

  return {
    id: readString(checkpointRecord.id, randomUUID()),
    label: readString(checkpointRecord.label, 'Checkpoint'),
    status,
    conversationId: readNullableString(checkpointRecord.conversationId),
    runId: readNullableString(checkpointRecord.runId),
    taskId: readNullableString(checkpointRecord.taskId),
    sourceTraceId: readNullableString(checkpointRecord.sourceTraceId),
    summary: readNullableString(checkpointRecord.summary),
    createdAt: readString(checkpointRecord.createdAt, new Date().toISOString()),
    completedAt: readNullableString(checkpointRecord.completedAt),
    updatedAt: readString(checkpointRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(checkpointRecord.metadata),
  };
}

export function normalizeCoreOutcome(rawOutcome: unknown): CoreOrchestrationOutcomeRecord | null {
  const outcomeRecord = asRecord(rawOutcome);
  if (!outcomeRecord) {
    return null;
  }

  const rawStatus = readString(outcomeRecord.status, 'succeeded');
  const status = (
    rawStatus === 'succeeded'
    || rawStatus === 'blocked'
    || rawStatus === 'failed'
    || rawStatus === 'cancelled'
  )
    ? rawStatus
    : 'succeeded';

  return {
    id: readString(outcomeRecord.id, randomUUID()),
    title: readString(outcomeRecord.title, 'Outcome'),
    status,
    conversationId: readNullableString(outcomeRecord.conversationId),
    runId: readNullableString(outcomeRecord.runId),
    taskId: readNullableString(outcomeRecord.taskId),
    summary: readNullableString(outcomeRecord.summary),
    recordedAt: readString(outcomeRecord.recordedAt, new Date().toISOString()),
    updatedAt: readString(outcomeRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(outcomeRecord.metadata),
  };
}

export function normalizeCoreArtifact(rawArtifact: unknown): CoreArtifactRecord | null {
  const artifactRecord = asRecord(rawArtifact);
  if (!artifactRecord) {
    return null;
  }

  const rawKind = readString(artifactRecord.kind, 'document');
  const kind = (
    rawKind === 'document'
    || rawKind === 'report'
    || rawKind === 'build'
    || rawKind === 'preview'
    || rawKind === 'attachment'
    || rawKind === 'transcript_export'
    || rawKind === 'dataset'
  )
    ? rawKind
    : 'document';
  const rawStatus = readString(artifactRecord.status, 'draft');
  const status = (
    rawStatus === 'draft'
    || rawStatus === 'ready'
    || rawStatus === 'published'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'draft';

  return {
    id: readString(artifactRecord.id, randomUUID()),
    title: readString(artifactRecord.title, 'Untitled artifact'),
    kind,
    status,
    projectId: readNullableString(artifactRecord.projectId),
    workItemId: readNullableString(artifactRecord.workItemId),
    conversationId: readNullableString(artifactRecord.conversationId),
    taskId: readNullableString(artifactRecord.taskId),
    runId: readNullableString(artifactRecord.runId),
    path: readNullableString(artifactRecord.path),
    mimeType: readNullableString(artifactRecord.mimeType),
    sizeBytes: typeof artifactRecord.sizeBytes === 'number'
      && Number.isFinite(artifactRecord.sizeBytes)
      ? artifactRecord.sizeBytes
      : null,
    summary: readNullableString(artifactRecord.summary),
    createdAt: readString(artifactRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(artifactRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(artifactRecord.metadata),
  };
}

export function normalizeCoreActivity(rawActivity: unknown): CoreActivityRecord | null {
  const activityRecord = asRecord(rawActivity);
  if (!activityRecord) {
    return null;
  }

  const rawKind = readString(activityRecord.kind, 'note');
  const kind = (
    rawKind === 'note'
    || rawKind === 'status_change'
    || rawKind === 'approval_requested'
    || rawKind === 'approval_decided'
    || rawKind === 'operator_action'
    || rawKind === 'artifact_recorded'
    || rawKind === 'checkpoint_recorded'
    || rawKind === 'work_item_updated'
  )
    ? rawKind
    : 'note';

  return {
    id: readString(activityRecord.id, randomUUID()),
    kind,
    actorId: readNullableString(activityRecord.actorId),
    projectId: readNullableString(activityRecord.projectId),
    workItemId: readNullableString(activityRecord.workItemId),
    conversationId: readNullableString(activityRecord.conversationId),
    taskId: readNullableString(activityRecord.taskId),
    runId: readNullableString(activityRecord.runId),
    artifactId: readNullableString(activityRecord.artifactId),
    message: readString(activityRecord.message),
    createdAt: readString(activityRecord.createdAt, new Date().toISOString()),
    metadata: normalizeMetadata(activityRecord.metadata),
  };
}

export function normalizeCoreApprovalBinding(
  rawApprovalBinding: unknown,
): CoreApprovalBindingRecord | null {
  const approvalBindingRecord = asRecord(rawApprovalBinding);
  if (!approvalBindingRecord) {
    return null;
  }

  const rawKind = readString(approvalBindingRecord.kind, 'owner_decision');
  const kind = (
    rawKind === 'owner_decision'
    || rawKind === 'review_gate'
    || rawKind === 'release_gate'
  )
    ? rawKind
    : 'owner_decision';
  const rawSubjectKind = readString(approvalBindingRecord.subjectKind, 'task');
  const subjectKind = (
    rawSubjectKind === 'project'
    || rawSubjectKind === 'work_item'
    || rawSubjectKind === 'task'
    || rawSubjectKind === 'run'
    || rawSubjectKind === 'artifact'
    || rawSubjectKind === 'conversation'
  )
    ? rawSubjectKind
    : 'task';

  return {
    id: readString(approvalBindingRecord.id, randomUUID()),
    kind,
    approvalTaskId: readString(approvalBindingRecord.approvalTaskId),
    subjectKind,
    subjectId: readString(approvalBindingRecord.subjectId),
    projectId: readNullableString(approvalBindingRecord.projectId),
    workItemId: readNullableString(approvalBindingRecord.workItemId),
    conversationId: readNullableString(approvalBindingRecord.conversationId),
    requestedByActorId: readNullableString(approvalBindingRecord.requestedByActorId),
    requestedForActorId: readString(approvalBindingRecord.requestedForActorId),
    createdAt: readString(approvalBindingRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(approvalBindingRecord.updatedAt, new Date().toISOString()),
    metadata: normalizeMetadata(approvalBindingRecord.metadata),
  };
}

export function normalizeBotBinding(
  rawBinding: unknown,
  chat: ChatState,
): BotBindingRecord | null {
  const bindingRecord = asRecord(rawBinding);
  if (!bindingRecord) {
    return null;
  }

  const platform = readString(bindingRecord.platform);
  if (platform !== 'telegram' && platform !== 'line') {
    return null;
  }

  const rawStatus = readString(bindingRecord.status, 'active');
  const rawRoomMode = readString(bindingRecord.roomMode ?? bindingRecord.defaultRoomMode, 'boss_chat');
  const roomMode: BotBindingRecord['roomMode'] =
    rawRoomMode === 'direct_cat_chat' ? 'direct_cat_chat' : 'boss_chat';
  const rawInboundMode = readString(bindingRecord.inboundMode);
  const inboundMode: BotBindingRecord['inboundMode'] =
    rawInboundMode === 'polling' || rawInboundMode === 'webhook'
      ? rawInboundMode
      : readNullableString(bindingRecord.webhookSecret) ? 'webhook' : 'polling';

  return {
    id: readString(bindingRecord.id, randomUUID()),
    platform,
    botName: readString(bindingRecord.botName),
    orchestratorActorId: readString(bindingRecord.orchestratorActorId),
    catActorId:
      readNullableString(bindingRecord.catActorId)
      ?? readNullableString(bindingRecord.boundCatActorId)
      ?? (chat.bossCatId ? createCatActorId(chat.bossCatId) : null),
    bossCatActorId:
      readNullableString(bindingRecord.bossCatActorId)
      ?? (chat.bossCatId ? createCatActorId(chat.bossCatId) : null),
    botToken: readNullableString(bindingRecord.botToken),
    webhookSecret: readNullableString(bindingRecord.webhookSecret),
    inboundMode,
    roomMode,
    status: rawStatus === 'disabled' ? 'disabled' : 'active',
    createdAt: readString(bindingRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(bindingRecord.updatedAt, new Date().toISOString()),
  };
}

export function normalizeArchiveMetadata(rawArchive: unknown): ArchiveMetadataRecord | null {
  const archiveRecord = asRecord(rawArchive);
  if (!archiveRecord) {
    return null;
  }

  const rawStatus = readString(archiveRecord.status, 'not_ready');
  const status = (
    rawStatus === 'not_ready'
    || rawStatus === 'ready_for_archive'
    || rawStatus === 'archived'
  )
    ? rawStatus
    : 'not_ready';

  return {
    id: readString(archiveRecord.id, randomUUID()),
    sourceConversationId: readString(archiveRecord.sourceConversationId),
    sourceChannelId: readNullableString(archiveRecord.sourceChannelId),
    exportFormat: 'chat-channel-json',
    status,
    lastExportedAt: readNullableString(archiveRecord.lastExportedAt),
    updatedAt: readString(archiveRecord.updatedAt, new Date().toISOString()),
  };
}

export function normalizeDurableMemoryRecord(rawRecord: unknown): DurableMemoryRecord | null {
  const record = asRecord(rawRecord);
  if (!record) {
    return null;
  }

  const rawSubjectType = readString(record.subjectType);
  if (
    rawSubjectType !== 'cat'
    && rawSubjectType !== 'owner'
    && rawSubjectType !== 'relationship'
    && rawSubjectType !== 'project'
  ) {
    return null;
  }

  const rawCategory = readString(record.category);
  if (
    rawCategory !== 'preference'
    && rawCategory !== 'fact'
    && rawCategory !== 'policy'
    && rawCategory !== 'style'
    && rawCategory !== 'relationship'
    && rawCategory !== 'lesson'
  ) {
    return null;
  }

  return {
    id: readString(record.id, randomUUID()),
    subjectType: rawSubjectType,
    subjectId: readString(record.subjectId),
    category: rawCategory,
    content: readString(record.content),
    confidence: typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? record.confidence
      : null,
    sourceRefs: readStringArray(record.sourceRefs),
    createdAt: readString(record.createdAt, new Date().toISOString()),
    updatedAt: readString(record.updatedAt, new Date().toISOString()),
  };
}

export function extractCoreState(snapshot: PersistedChatSnapshot): CatsCoreState {
  const { chat: _chat, ...core } = snapshot;
  return core;
}

export function buildPersistedChatSnapshot(
  chat: ChatState,
  core: CatsCoreState,
): PersistedChatSnapshot {
  return {
    ...structuredClone(core),
    chat: structuredClone(chat),
  };
}
