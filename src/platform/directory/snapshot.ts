import path from 'node:path';

import {
  DIRECTORY_SCHEMA_VERSION,
  type CatteryMembershipRecord,
  type CatteryRecord,
  type ClowderMembershipRecord,
  type ClowderRecord,
  type DirectorySnapshot,
} from './contracts.js';

/**
 * The file could not be read as a directory this build understands. Its bytes
 * are left alone: a write after a lenient read would replace the owner's
 * groups with whatever the reader managed to keep.
 */
export class DirectoryFormatError extends Error {
  readonly code: 'directory_unreadable' | 'directory_newer';

  constructor(code: 'directory_unreadable' | 'directory_newer', message: string) {
    super(message);
    this.name = 'DirectoryFormatError';
    this.code = code;
  }
}

export function deriveDirectoryStatePath(chatStatePath: string): string {
  const parsed = path.parse(chatStatePath);
  return path.join(parsed.dir, `${parsed.name}.directory${parsed.ext || '.json'}`);
}

export function createEmptyDirectorySnapshot(nowIso: string): DirectorySnapshot {
  return {
    schemaVersion: DIRECTORY_SCHEMA_VERSION,
    updatedAt: nowIso,
    clowders: [],
    catteries: [],
    clowderMemberships: [],
    catteryMemberships: [],
  };
}

export function serializeDirectorySnapshot(snapshot: DirectorySnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function unreadable(detail: string): DirectoryFormatError {
  return new DirectoryFormatError(
    'directory_unreadable',
    `The Clowder and Cattery file is invalid (${detail}); it was left unchanged.`,
  );
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unreadable(`${where} is not an object`);
  return value as Record<string, unknown>;
}

function text(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw unreadable(`${where}.${key} is missing`);
  return value;
}

function nullableText(record: Record<string, unknown>, key: string, where: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) throw unreadable(`${where}.${key} is invalid`);
  return value;
}

function oneOf<T extends string>(record: Record<string, unknown>, key: string, allowed: readonly T[], where: string): T {
  const value = record[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw unreadable(`${where}.${key} is invalid`);
  }
  return value as T;
}

function list(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw unreadable(`${key} is not a list`);
  return value;
}

function parseClowder(value: unknown, index: number): ClowderRecord {
  const where = `clowders[${index}]`;
  const record = asRecord(value, where);
  return {
    id: text(record, 'id', where),
    name: text(record, 'name', where),
    description: nullableText(record, 'description', where),
    parentCatteryId: nullableText(record, 'parentCatteryId', where),
    createdAt: text(record, 'createdAt', where),
    updatedAt: text(record, 'updatedAt', where),
  };
}

function parseCattery(value: unknown, index: number): CatteryRecord {
  const where = `catteries[${index}]`;
  const record = asRecord(value, where);
  return {
    id: text(record, 'id', where),
    name: text(record, 'name', where),
    description: nullableText(record, 'description', where),
    domain: nullableText(record, 'domain', where),
    createdAt: text(record, 'createdAt', where),
    updatedAt: text(record, 'updatedAt', where),
  };
}

function parseClowderMembership(value: unknown, index: number): ClowderMembershipRecord {
  const where = `clowderMemberships[${index}]`;
  const record = asRecord(value, where);
  const status = oneOf(record, 'status', ['formal', 'temp', 'external'] as const, where);
  const expiresAt = nullableText(record, 'expiresAt', where);
  if (expiresAt !== null && status !== 'temp') throw unreadable(`${where}.expiresAt is set on a ${status} membership`);
  return {
    clowderId: text(record, 'clowderId', where),
    catId: text(record, 'catId', where),
    role: oneOf(record, 'role', ['lead', 'member'] as const, where),
    status,
    expiresAt,
    joinedAt: text(record, 'joinedAt', where),
    updatedAt: text(record, 'updatedAt', where),
  };
}

function parseCatteryMembership(value: unknown, index: number): CatteryMembershipRecord {
  const where = `catteryMemberships[${index}]`;
  const record = asRecord(value, where);
  return {
    catteryId: text(record, 'catteryId', where),
    catId: text(record, 'catId', where),
    role: oneOf(record, 'role', ['owner', 'admin', 'member'] as const, where),
    status: oneOf(record, 'status', ['formal', 'external'] as const, where),
    joinedAt: text(record, 'joinedAt', where),
    updatedAt: text(record, 'updatedAt', where),
  };
}

function assertUnique(keys: string[], what: string): void {
  if (new Set(keys).size !== keys.length) throw unreadable(`${what} repeats`);
}

/**
 * Reads the file strictly: every record must be whole and every reference must
 * resolve inside the file. Cat ids are not checked here, since Cats live in the
 * chat state; a list hides a membership whose Cat is gone.
 */
export function parseDirectorySnapshot(raw: string): DirectorySnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw unreadable('not JSON');
  }
  const record = asRecord(parsed, 'file');
  const version = record.schemaVersion;
  if (typeof version === 'number' && Number.isInteger(version) && version > DIRECTORY_SCHEMA_VERSION) {
    throw new DirectoryFormatError(
      'directory_newer',
      'The Clowder and Cattery file was written by a newer version of Cats; it was left unchanged.',
    );
  }
  if (version !== DIRECTORY_SCHEMA_VERSION) throw unreadable('unknown schemaVersion');

  const clowders = list(record, 'clowders').map(parseClowder);
  const catteries = list(record, 'catteries').map(parseCattery);
  const clowderMemberships = list(record, 'clowderMemberships').map(parseClowderMembership);
  const catteryMemberships = list(record, 'catteryMemberships').map(parseCatteryMembership);

  assertUnique(clowders.map((clowder) => clowder.id), 'a Clowder id');
  assertUnique(catteries.map((cattery) => cattery.id), 'a Cattery id');
  assertUnique(clowderMemberships.map((member) => `${member.clowderId}\u0000${member.catId}`), 'a Clowder membership');
  assertUnique(catteryMemberships.map((member) => `${member.catteryId}\u0000${member.catId}`), 'a Cattery membership');

  const catteryIds = new Set(catteries.map((cattery) => cattery.id));
  const clowderIds = new Set(clowders.map((clowder) => clowder.id));
  for (const clowder of clowders) {
    if (clowder.parentCatteryId !== null && !catteryIds.has(clowder.parentCatteryId)) {
      throw unreadable(`Clowder ${clowder.id} names a missing Cattery`);
    }
  }
  if (clowderMemberships.some((member) => !clowderIds.has(member.clowderId))) {
    throw unreadable('a Clowder membership names a missing Clowder');
  }
  if (catteryMemberships.some((member) => !catteryIds.has(member.catteryId))) {
    throw unreadable('a Cattery membership names a missing Cattery');
  }

  return {
    schemaVersion: DIRECTORY_SCHEMA_VERSION,
    updatedAt: text(record, 'updatedAt', 'file'),
    clowders,
    catteries,
    clowderMemberships,
    catteryMemberships,
  };
}
