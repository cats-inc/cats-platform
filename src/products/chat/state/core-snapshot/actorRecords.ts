import { randomUUID } from 'node:crypto';

import type {
  CoreActorRecord,
  CoreConversationRecord,
  CoreProjectRecord,
  CoreWorkItemRecord,
  OwnerProfileRecord,
} from '../../../../core/types.js';
import { createDefaultCoreState } from '../../../../core/model.js';
import {
  createEmptyMemoryCheckpoint,
} from '../../../../core/actors.js';
import {
  asRecord,
  normalizeExecutionTarget,
  normalizeMemoryCheckpoint,
  normalizeMetadata,
  readNullableString,
  readString,
  readStringArray,
} from './shared.js';

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
