import type { CoreRecordMetadata } from './types.js';

/**
 * Who an artifact belongs to and which agent produced it (SPEC-125 FR-21).
 * It lives in the artifact's metadata because `CoreArtifactRecord` is a
 * frozen contract.
 */
export interface CoreArtifactProvenance {
  /** The person the artifact belongs to: the platform owner. */
  ownerActorId: string;
  /** The agent that produced it when its producer says so, otherwise null. */
  producerActorId: string | null;
}

export const ARTIFACT_PROVENANCE_METADATA_KEY = 'provenance';

function readActorId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readProvenanceRecord(metadata: CoreRecordMetadata | null | undefined): Record<string, unknown> | null {
  const value = metadata?.[ARTIFACT_PROVENANCE_METADATA_KEY];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readCoreArtifactProvenance(
  metadata: CoreRecordMetadata | null | undefined,
): CoreArtifactProvenance | null {
  const record = readProvenanceRecord(metadata);
  const ownerActorId = readActorId(record?.ownerActorId);
  return ownerActorId
    ? { ownerActorId, producerActorId: readActorId(record?.producerActorId) }
    : null;
}

/** Metadata that names the agent producing an artifact, for `upsertCoreArtifact` to record. */
export function withCoreArtifactProducer(
  metadata: CoreRecordMetadata,
  producerActorId: string | null,
): CoreRecordMetadata {
  return producerActorId
    ? { ...metadata, [ARTIFACT_PROVENANCE_METADATA_KEY]: { producerActorId } }
    : metadata;
}

/**
 * The metadata an artifact keeps: a new artifact belongs to the owner and
 * names its producer when the writer does; an update keeps both unless the
 * writer names another producer.
 */
export function resolveCoreArtifactProvenanceMetadata(input: {
  metadata: CoreRecordMetadata;
  existingMetadata: CoreRecordMetadata | null;
  ownerActorId: string;
}): CoreRecordMetadata {
  const existing = readCoreArtifactProvenance(input.existingMetadata);
  const named = readProvenanceRecord(input.metadata);
  const provenance: CoreArtifactProvenance = {
    ownerActorId: existing?.ownerActorId ?? input.ownerActorId,
    producerActorId: readActorId(named?.producerActorId) ?? existing?.producerActorId ?? null,
  };
  return { ...input.metadata, [ARTIFACT_PROVENANCE_METADATA_KEY]: provenance };
}
