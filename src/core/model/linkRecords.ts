import { randomUUID } from 'node:crypto';

import { CoreValidationError } from '../errors.js';
import type {
  CatsCoreState,
  CoreWorkGraphLinkEndpointKind,
  CoreWorkGraphLinkKind,
  CoreWorkGraphLinkRecord,
} from '../types.js';
import type { CoreWorkGraphLinkWriteInput } from './inputs.js';
import { normalizeMetadata, normalizeNullableString, touchCoreState } from './shared.js';

const LINK_NOTE_MAX_LENGTH = 280;

const STORED_KINDS: ReadonlyArray<CoreWorkGraphLinkKind> = [
  'blocks',
  'related_to',
  'duplicate_of',
  'follows',
];

/**
 * Insert (or no-op upsert by canonical form) a SPEC-090 WorkGraphLink
 * row. Canonicalization rules per SPEC-090 §4:
 *   - `blocked_by` → swap source / target, kind = `blocks`
 *   - `related_to` → lex-sort `(family, id)` tuples; smaller as source
 *   - `duplicate_of` / `follows` → stored as written
 *
 * Throws CoreValidationError when:
 *   - source and target resolve to the same Core record (self-link)
 *   - either endpoint does not resolve to an existing project /
 *     work_item / task in `core`
 *   - note exceeds 280 chars
 *
 * Idempotent on the canonical form: if a row already exists with the
 * same `(kind, source, target)`, returns the existing row.
 */
export function upsertCoreWorkGraphLink(
  core: CatsCoreState,
  input: CoreWorkGraphLinkWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; link: CoreWorkGraphLinkRecord; created: boolean } {
  const nowIso = now.toISOString();
  const canonical = canonicalizeLinkInput(input);

  if (
    canonical.sourceRecordFamily === canonical.targetRecordFamily &&
    canonical.sourceRecordId === canonical.targetRecordId
  ) {
    throw new CoreValidationError(
      'WorkGraphLink endpoints must differ — self-links are not allowed.',
      'work_graph_link_self_link',
    );
  }

  assertEndpointResolves(core, canonical.sourceRecordFamily, canonical.sourceRecordId, 'source');
  assertEndpointResolves(core, canonical.targetRecordFamily, canonical.targetRecordId, 'target');

  const note =
    input.note === undefined ? null : normalizeNullableString(input.note);
  if (note && note.length > LINK_NOTE_MAX_LENGTH) {
    throw new CoreValidationError(
      `WorkGraphLink note exceeds ${LINK_NOTE_MAX_LENGTH} characters.`,
      'work_graph_link_note_too_long',
    );
  }

  const existing = findCanonicalDuplicate(core.workGraphLinks, canonical);
  if (existing) {
    return { core, link: existing, created: false };
  }

  const linkId = normalizeNullableString(input.id) ?? `link-${randomUUID()}`;
  const link: CoreWorkGraphLinkRecord = {
    id: linkId,
    kind: canonical.kind,
    sourceRecordFamily: canonical.sourceRecordFamily,
    sourceRecordId: canonical.sourceRecordId,
    targetRecordFamily: canonical.targetRecordFamily,
    targetRecordId: canonical.targetRecordId,
    createdAt: input.createdAt ?? nowIso,
    updatedAt: nowIso,
    createdByActorId:
      input.createdByActorId === undefined
        ? null
        : normalizeNullableString(input.createdByActorId),
    note,
    metadata: normalizeMetadata(input.metadata),
  };

  return {
    core: touchCoreState(
      {
        ...core,
        workGraphLinks: [...core.workGraphLinks, link],
      },
      nowIso,
    ),
    link,
    created: true,
  };
}

export function removeCoreWorkGraphLink(
  core: CatsCoreState,
  linkId: string,
  now: Date = new Date(),
): { core: CatsCoreState; removed: boolean } {
  const nowIso = now.toISOString();
  const next = core.workGraphLinks.filter((link) => link.id !== linkId);
  if (next.length === core.workGraphLinks.length) {
    return { core, removed: false };
  }
  return {
    core: touchCoreState({ ...core, workGraphLinks: next }, nowIso),
    removed: true,
  };
}

export interface CoreWorkGraphLinkListQuery {
  recordFamily?: CoreWorkGraphLinkEndpointKind;
  recordId?: string;
  kind?: CoreWorkGraphLinkKind;
}

export function listCoreWorkGraphLinks(
  core: CatsCoreState,
  query: CoreWorkGraphLinkListQuery = {},
): CoreWorkGraphLinkRecord[] {
  return core.workGraphLinks.filter((link) => {
    if (query.kind && link.kind !== query.kind) return false;
    if (query.recordFamily || query.recordId) {
      const matchesEndpoint = (family: CoreWorkGraphLinkEndpointKind, id: string): boolean => {
        if (query.recordFamily && query.recordFamily !== family) return false;
        if (query.recordId && query.recordId !== id) return false;
        return true;
      };
      const matchesSource = matchesEndpoint(link.sourceRecordFamily, link.sourceRecordId);
      const matchesTarget = matchesEndpoint(link.targetRecordFamily, link.targetRecordId);
      if (!matchesSource && !matchesTarget) return false;
    }
    return true;
  });
}

interface CanonicalLink {
  kind: CoreWorkGraphLinkKind;
  sourceRecordFamily: CoreWorkGraphLinkEndpointKind;
  sourceRecordId: string;
  targetRecordFamily: CoreWorkGraphLinkEndpointKind;
  targetRecordId: string;
}

function canonicalizeLinkInput(input: CoreWorkGraphLinkWriteInput): CanonicalLink {
  if (input.kind === 'blocked_by') {
    return {
      kind: 'blocks',
      sourceRecordFamily: input.targetRecordFamily,
      sourceRecordId: input.targetRecordId,
      targetRecordFamily: input.sourceRecordFamily,
      targetRecordId: input.sourceRecordId,
    };
  }
  if (!STORED_KINDS.includes(input.kind)) {
    throw new CoreValidationError(
      `Unknown WorkGraphLink kind '${input.kind}'.`,
      'work_graph_link_invalid_kind',
    );
  }
  if (input.kind === 'related_to') {
    const sourceTuple = `${input.sourceRecordFamily}:${input.sourceRecordId}`;
    const targetTuple = `${input.targetRecordFamily}:${input.targetRecordId}`;
    if (sourceTuple <= targetTuple) {
      return {
        kind: 'related_to',
        sourceRecordFamily: input.sourceRecordFamily,
        sourceRecordId: input.sourceRecordId,
        targetRecordFamily: input.targetRecordFamily,
        targetRecordId: input.targetRecordId,
      };
    }
    return {
      kind: 'related_to',
      sourceRecordFamily: input.targetRecordFamily,
      sourceRecordId: input.targetRecordId,
      targetRecordFamily: input.sourceRecordFamily,
      targetRecordId: input.sourceRecordId,
    };
  }
  return {
    kind: input.kind,
    sourceRecordFamily: input.sourceRecordFamily,
    sourceRecordId: input.sourceRecordId,
    targetRecordFamily: input.targetRecordFamily,
    targetRecordId: input.targetRecordId,
  };
}

function assertEndpointResolves(
  core: CatsCoreState,
  family: CoreWorkGraphLinkEndpointKind,
  id: string,
  side: 'source' | 'target',
): void {
  const exists = (() => {
    switch (family) {
      case 'project':
        return core.projects.some((p) => p.id === id);
      case 'work_item':
        return core.workItems.some((w) => w.id === id);
      case 'task':
        return core.tasks.some((t) => t.id === id);
    }
  })();
  if (!exists) {
    throw new CoreValidationError(
      `WorkGraphLink ${side} endpoint ${family}:${id} does not resolve to an existing Core record.`,
      'work_graph_link_endpoint_unresolved',
    );
  }
}

function findCanonicalDuplicate(
  links: CoreWorkGraphLinkRecord[],
  canonical: CanonicalLink,
): CoreWorkGraphLinkRecord | null {
  return (
    links.find(
      (link) =>
        link.kind === canonical.kind &&
        link.sourceRecordFamily === canonical.sourceRecordFamily &&
        link.sourceRecordId === canonical.sourceRecordId &&
        link.targetRecordFamily === canonical.targetRecordFamily &&
        link.targetRecordId === canonical.targetRecordId,
    ) ?? null
  );
}
