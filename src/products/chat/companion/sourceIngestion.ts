import { randomUUID } from 'node:crypto';

import type {
  CompanionBox,
  CompanionDerivedKind,
  CompanionDerivedRecord,
  CompanionMemoryRecord,
  CompanionResponseProfile,
  CompanionSourceRecord,
  CreateCompanionMemoryInput,
  CreateCompanionSourceInput,
  UpdateCompanionSourceInput,
  UpdateCompanionResponseProfileInput,
} from './contracts.js';

function trimOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function clampExcerpt(value: string | null, limit = 240): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  return normalized.length > limit
    ? `${normalized.slice(0, limit - 1)}…`
    : normalized;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return structuredClone(value as Record<string, unknown>);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeWhitespace(item))
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
}

function resolveSourceExcerpt(input: CreateCompanionSourceInput): string | null {
  const candidates = [
    trimOptionalText(input.textContent),
    trimOptionalText(input.ownerNote),
    trimOptionalText(String(asRecord(input.metadata).description ?? '')),
    trimOptionalText(String(asRecord(input.metadata).caption ?? '')),
    trimOptionalText(String(asRecord(input.metadata).transcript ?? '')),
  ].filter((value): value is string => value !== null);

  return clampExcerpt(candidates[0] ?? null);
}

function createDerivedRecord(
  box: CompanionBox,
  source: CompanionSourceRecord,
  kind: CompanionDerivedKind,
  content: string,
  nowIso: string,
  options: {
    title?: string | null;
    tags?: string[];
    metadata?: Record<string, unknown>;
  } = {},
): CompanionDerivedRecord {
  return {
    id: `companion-derived-${randomUUID()}`,
    boxId: box.id,
    catId: box.catId,
    kind,
    sourceIds: [source.id],
    title: options.title ?? null,
    content,
    tags: options.tags ? structuredClone(options.tags) : [],
    metadata: options.metadata ? structuredClone(options.metadata) : {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function createDefaultCompanionResponseProfile(nowIso: string): CompanionResponseProfile {
  return {
    expressionMode: 'mixed',
    outputMode: 'text',
    voiceProfileId: null,
    notes: null,
    updatedAt: nowIso,
  };
}

export function createCompanionBox(catId: string, nowIso: string): CompanionBox {
  return {
    id: `companion-box-${catId}`,
    catId,
    sourceIds: [],
    derivedIds: [],
    memoryIds: [],
    responseProfile: createDefaultCompanionResponseProfile(nowIso),
    createdAt: nowIso,
    updatedAt: nowIso,
    lastIngestedAt: null,
  };
}

export function createCompanionSourceRecord(
  box: CompanionBox,
  input: CreateCompanionSourceInput,
  nowIso: string,
  storedPath: string | null,
): CompanionSourceRecord {
  return {
    id: `companion-source-${randomUUID()}`,
    boxId: box.id,
    catId: box.catId,
    kind: input.kind,
    storageMode: input.storageMode,
    title: trimOptionalText(input.title),
    ownerNote: trimOptionalText(input.ownerNote),
    sourceText: trimOptionalText(input.textContent),
    textExcerpt: resolveSourceExcerpt(input),
    linkedPath: trimOptionalText(input.linkedPath),
    storedPath,
    sourceUrl: trimOptionalText(input.sourceUrl),
    mimeType: trimOptionalText(input.mimeType),
    originalFileName: trimOptionalText(input.originalFileName),
    metadata: asRecord(input.metadata),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function applyCompanionSourceUpdate(
  source: CompanionSourceRecord,
  update: UpdateCompanionSourceInput,
  nowIso: string,
): CompanionSourceRecord {
  const nextSource: CompanionSourceRecord = {
    ...source,
    title: update.title === undefined ? source.title : trimOptionalText(update.title),
    ownerNote: update.ownerNote === undefined ? source.ownerNote : trimOptionalText(update.ownerNote),
    sourceText: update.textContent === undefined ? source.sourceText : trimOptionalText(update.textContent),
    linkedPath: update.linkedPath === undefined ? source.linkedPath : trimOptionalText(update.linkedPath),
    sourceUrl: update.sourceUrl === undefined ? source.sourceUrl : trimOptionalText(update.sourceUrl),
    mimeType: update.mimeType === undefined ? source.mimeType : trimOptionalText(update.mimeType),
    originalFileName: update.originalFileName === undefined
      ? source.originalFileName
      : trimOptionalText(update.originalFileName),
    metadata: update.metadata === undefined ? asRecord(source.metadata) : asRecord(update.metadata),
    updatedAt: nowIso,
  };

  nextSource.textExcerpt = resolveSourceExcerpt({
    kind: nextSource.kind,
    storageMode: nextSource.storageMode,
    title: nextSource.title,
    ownerNote: nextSource.ownerNote,
    textContent: nextSource.sourceText,
    linkedPath: nextSource.linkedPath,
    sourceUrl: nextSource.sourceUrl,
    mimeType: nextSource.mimeType,
    originalFileName: nextSource.originalFileName,
    metadata: nextSource.metadata,
  });

  return nextSource;
}

export function createDerivedRecordsForSource(
  box: CompanionBox,
  source: CompanionSourceRecord,
  nowIso: string,
): CompanionDerivedRecord[] {
  const records: CompanionDerivedRecord[] = [];
  const transcript = trimOptionalText(String(source.metadata.transcript ?? ''));
  const description = trimOptionalText(String(source.metadata.description ?? ''));
  const caption = trimOptionalText(String(source.metadata.caption ?? ''));
  const tags = readStringArray(source.metadata.tags);
  const traits = readStringArray(source.metadata.traits);
  const events = readStringArray(source.metadata.events);
  const relationshipNotes = readStringArray(source.metadata.relationshipNotes);

  if (source.textExcerpt) {
    records.push(
      createDerivedRecord(
        box,
        source,
        'summary',
        source.textExcerpt,
        nowIso,
        {
          title: source.title ?? 'Companion summary',
        },
      ),
    );
  }

  if (source.kind === 'conversation_log' || source.kind === 'audio') {
    const transcriptContent = transcript ?? source.sourceText ?? source.textExcerpt;
    if (transcriptContent) {
      records.push(
        createDerivedRecord(
          box,
          source,
          'transcript',
          transcriptContent,
          nowIso,
          {
            title: source.title ?? 'Transcript',
          },
        ),
      );
    }
  }

  if (source.kind === 'image' || source.kind === 'video') {
    const mediaDescription = caption ?? description ?? source.textExcerpt;
    if (mediaDescription) {
      records.push(
        createDerivedRecord(
          box,
          source,
          'caption',
          mediaDescription,
          nowIso,
          {
            title: source.title ?? 'Media caption',
          },
        ),
      );
    }
  }

  if (source.kind === 'note' || source.kind === 'article' || source.kind === 'path_ref') {
    const normalizedNote = source.sourceText ?? source.ownerNote ?? source.textExcerpt;
    if (normalizedNote) {
      records.push(
        createDerivedRecord(
          box,
          source,
          'normalized_note',
          normalizedNote,
          nowIso,
          {
            title: source.title ?? 'Normalized note',
          },
        ),
      );
    }
  }

  if (tags.length > 0) {
    records.push(
      createDerivedRecord(
        box,
        source,
        'tags',
        tags.join(', '),
        nowIso,
        {
          title: source.title ?? 'Tags',
          tags,
        },
      ),
    );
  }

  if (traits.length > 0) {
    records.push(
      createDerivedRecord(
        box,
        source,
        'traits',
        traits.join('\n'),
        nowIso,
        {
          title: source.title ?? 'Traits',
          tags: traits,
        },
      ),
    );
  }

  for (const event of events) {
    records.push(
      createDerivedRecord(
        box,
        source,
        'event',
        event,
        nowIso,
        {
          title: source.title ?? 'Event',
        },
      ),
    );
  }

  for (const note of relationshipNotes) {
    records.push(
      createDerivedRecord(
        box,
        source,
        'relationship_note',
        note,
        nowIso,
        {
          title: source.title ?? 'Relationship note',
        },
      ),
    );
  }

  if (
    source.kind === 'path_ref'
    && source.linkedPath
    && records.every((record) => record.kind !== 'metadata')
  ) {
    records.push(
      createDerivedRecord(
        box,
        source,
        'metadata',
        `Linked path: ${source.linkedPath}`,
        nowIso,
        {
          title: source.title ?? 'Path reference',
          metadata: {
            linkedPath: source.linkedPath,
            storageMode: source.storageMode,
          },
        },
      ),
    );
  }

  return records;
}

export function createCompanionMemoryRecord(
  box: CompanionBox,
  input: CreateCompanionMemoryInput,
  nowIso: string,
): CompanionMemoryRecord {
  return {
    id: `companion-memory-${randomUUID()}`,
    boxId: box.id,
    catId: box.catId,
    category: input.category,
    sourceIds: Array.isArray(input.sourceIds) ? structuredClone(input.sourceIds) : [],
    content: normalizeWhitespace(input.content),
    summary: trimOptionalText(input.summary),
    status: 'active',
    curatedBy: 'owner',
    replacedById: null,
    metadata: asRecord(input.metadata),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function applyCompanionResponseProfileUpdate(
  current: CompanionResponseProfile,
  update: UpdateCompanionResponseProfileInput,
  nowIso: string,
): CompanionResponseProfile {
  return {
    expressionMode: update.expressionMode ?? current.expressionMode,
    outputMode: update.outputMode ?? current.outputMode,
    voiceProfileId: update.voiceProfileId === undefined
      ? current.voiceProfileId
      : trimOptionalText(update.voiceProfileId),
    notes: update.notes === undefined ? current.notes : trimOptionalText(update.notes),
    updatedAt: nowIso,
  };
}
