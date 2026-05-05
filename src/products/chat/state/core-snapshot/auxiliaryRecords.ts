import { randomUUID } from 'node:crypto';

import type { ChatState } from '../../api/contracts.js';
import type {
  AssistantPresetRecord,
  ArchiveMetadataRecord,
  BotBindingRecord,
  DurableMemoryRecord,
  GuideCatRecord,
} from '../../../../core/types.js';
import { createCatActorId } from '../../../../core/actors.js';
import { parseProviderModelSelection } from '../../../../shared/providerSelection.js';
import { GUIDE_CAT_SYSTEM_NAME } from '../../../../shared/guideCatIdentity.js';
import {
  asRecord,
  normalizeExecutionTarget,
  readNullableString,
  readNumber,
  readString,
  readStringArray,
} from './shared.js';

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
  const rawRoomMode = readString(bindingRecord.roomMode ?? bindingRecord.defaultRoomMode, 'chat_channel');
  const roomMode: BotBindingRecord['roomMode'] =
    rawRoomMode === 'direct_message' ? 'direct_message' : 'chat_channel';
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
    outboundFanoutEnabled: bindingRecord.outboundFanoutEnabled !== false,
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

export function normalizeGuideCatRecord(rawGuideCat: unknown): GuideCatRecord | null {
  const guideCatRecord = asRecord(rawGuideCat);
  if (!guideCatRecord) {
    return null;
  }

  const rawStatus = readString(guideCatRecord.status, 'active');
  const status: GuideCatRecord['status'] =
    rawStatus === 'dismissed' ? 'dismissed' : 'active';

  return {
    id: readString(guideCatRecord.id, 'guide-cat-primary'),
    name: readString(guideCatRecord.name, GUIDE_CAT_SYSTEM_NAME),
    status,
    executionTarget: normalizeExecutionTarget(
      guideCatRecord.executionTarget,
      {
        provider: 'claude',
        instance: null,
        model: null,
      },
    ),
    modelSelection: parseProviderModelSelection(guideCatRecord.modelSelection),
    createdAt: readString(guideCatRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(guideCatRecord.updatedAt, new Date().toISOString()),
  };
}

export function normalizeAssistantPresetRecord(
  rawAssistantPreset: unknown,
): AssistantPresetRecord | null {
  const assistantPresetRecord = asRecord(rawAssistantPreset);
  if (!assistantPresetRecord) {
    return null;
  }

  return {
    id: readString(assistantPresetRecord.id, randomUUID()),
    name: readString(assistantPresetRecord.name, 'Assistant'),
    executionTarget: normalizeExecutionTarget(
      assistantPresetRecord.executionTarget,
      {
        provider: 'claude',
        instance: null,
        model: null,
      },
    ),
    modelSelection: parseProviderModelSelection(assistantPresetRecord.modelSelection),
    roleHint: readNullableString(assistantPresetRecord.roleHint),
    createdAt: readString(assistantPresetRecord.createdAt, new Date().toISOString()),
    updatedAt: readString(assistantPresetRecord.updatedAt, new Date().toISOString()),
  };
}
