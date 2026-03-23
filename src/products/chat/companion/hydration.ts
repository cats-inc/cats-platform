import type { ChatCat, ChatChannelView } from '../../../shared/app-shell.js';
import type {
  CompanionBox,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionSessionContext,
  CompanionSourceRecord,
} from './contracts.js';
import type { MemoryRetrievalContext } from '../../../platform/memory/contracts.js';
import { uniqueStrings } from '../../../platform/memory/utils.js';

function sortNewestFirst<T extends { updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortNewestCreatedFirst<T extends { createdAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function shouldHydrateCompanionSession(
  cat: ChatCat,
  box: CompanionBox,
  channel: { roomRouting?: ChatChannelView['roomRouting'] },
): boolean {
  if (channel.roomRouting?.mode === 'direct_cat_chat') {
    return true;
  }

  if (cat.skillProfile === 'companion' || cat.roles.includes('companion')) {
    return true;
  }

  return box.sourceIds.length > 0
    || box.derivedIds.length > 0
    || box.memoryIds.length > 0
    || Boolean(box.responseProfile.notes);
}

export function buildCompanionSessionContext(input: {
  cat: ChatCat;
  box: CompanionBox;
  sources: CompanionSourceRecord[];
  derived: CompanionDerivedRecord[];
  memory: CompanionMemoryRecord[];
  requestedSkills: string[];
  channel: {
    id: string | null;
    title: string;
    topic: string;
    workingMemory?: ChatChannelView['workingMemory'];
    roomRouting?: ChatChannelView['roomRouting'];
  };
  transport: 'telegram' | 'line' | 'web' | null;
  hydratedAt: string;
  retrieval?: MemoryRetrievalContext | null;
}): CompanionSessionContext {
  const sources = sortNewestFirst(input.sources).slice(0, 5);
  const derived = sortNewestFirst(input.derived).slice(0, 6);
  const memory = sortNewestCreatedFirst(
    input.memory.filter((record) => record.status === 'active'),
  ).slice(0, 8);
  const ownerNotes = uniqueStrings([
    input.box.responseProfile.notes,
    ...sources.map((record) => record.ownerNote),
  ]).slice(0, 6);
  const constraints = uniqueStrings([
    `channel:${input.channel.title}`,
    input.channel.topic ? `topic:${input.channel.topic}` : null,
    input.channel.workingMemory?.summary
      ? `working-memory:${input.channel.workingMemory.summary}`
      : null,
  ]).slice(0, 6);

  return {
    catId: input.cat.id,
    boxId: input.box.id,
    hydratedAt: input.hydratedAt,
    requestedSkills: structuredClone(input.requestedSkills),
    sourceIds: sources.map((record) => record.id),
    derivedIds: derived.map((record) => record.id),
    memoryIds: memory.map((record) => record.id),
    responseProfile: structuredClone(input.box.responseProfile),
    sources: sources.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      excerpt: record.textExcerpt,
      linkedPath: record.linkedPath,
      storedPath: record.storedPath,
      sourceUrl: record.sourceUrl,
      mimeType: record.mimeType,
      metadata: structuredClone(record.metadata),
    })),
    derived: derived.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      content: record.content,
      tags: structuredClone(record.tags),
      metadata: structuredClone(record.metadata),
    })),
    memory: memory.map((record) => ({
      id: record.id,
      category: record.category,
      content: record.content,
      summary: record.summary,
      status: record.status,
    })),
    ownerNotes,
    constraints,
    retrieval: input.retrieval ?? null,
    channelContext: {
      channelId: input.channel.id,
      roomMode: input.channel.roomRouting?.mode ?? null,
      transport: input.transport,
    },
  };
}
