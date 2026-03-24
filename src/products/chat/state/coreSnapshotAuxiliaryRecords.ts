import { randomUUID } from 'node:crypto';

import type { ChatState } from '../api/contracts.js';
import type {
  ArchiveMetadataRecord,
  BotBindingRecord,
  DurableMemoryRecord,
} from '../../../core/types.js';
import { createCatActorId } from '../../../core/actors.js';
import {
  asRecord,
  readNullableString,
  readNumber,
  readString,
  readStringArray,
} from './coreSnapshotShared.js';

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

  const confidence = readNumber(record.confidence, Number.NaN);

  return {
    id: readString(record.id, randomUUID()),
    subjectType: rawSubjectType,
    subjectId: readString(record.subjectId),
    category: rawCategory,
    content: readString(record.content),
    confidence: Number.isNaN(confidence) ? null : confidence,
    sourceRefs: readStringArray(record.sourceRefs),
    createdAt: readString(record.createdAt, new Date().toISOString()),
    updatedAt: readString(record.updatedAt, new Date().toISOString()),
  };
}
