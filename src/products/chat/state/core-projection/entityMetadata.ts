import type { CoreRecordMetadata } from '../../../../core/types.js';
import type { RoomRoutingParticipantRef } from '../../../../shared/roomRouting.js';

export function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

export function readMetadataRecord(value: unknown): CoreRecordMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as CoreRecordMetadata;
}

export function readMetadataString(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): string | null {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function readMetadataBoolean(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): boolean {
  if (!metadata) {
    return false;
  }

  return metadata[key] === true;
}

export function readMetadataStringArray(
  metadata: CoreRecordMetadata | null | undefined,
  key: string,
): string[] {
  if (!metadata) {
    return [];
  }

  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function readParticipantRef(value: unknown): RoomRoutingParticipantRef | null {
  const record = readMetadataRecord(value);
  if (!record) {
    return null;
  }

  const participantKind = record.participantKind === 'orchestrator' || record.participantKind === 'cat'
    ? record.participantKind
    : null;
  const participantId = readMetadataString(record, 'participantId');
  const participantName = readMetadataString(record, 'participantName');
  if (!participantKind || !participantId || !participantName) {
    return null;
  }

  return {
    participantKind,
    participantId,
    participantName,
  };
}

export function readParticipantRefs(values: unknown[]): RoomRoutingParticipantRef[] {
  return values
    .map((value) => readParticipantRef(value))
    .filter((value): value is RoomRoutingParticipantRef => value !== null);
}

export function sameParticipantRef(
  left: RoomRoutingParticipantRef | null | undefined,
  right: RoomRoutingParticipantRef | null | undefined,
): boolean {
  return Boolean(
    left
    && right
    && left.participantKind === right.participantKind
    && left.participantId === right.participantId
    && left.participantName === right.participantName,
  );
}
