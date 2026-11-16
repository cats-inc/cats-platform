// Feature pack contract: the lock, the manifest and the archive (SPEC-145 FR-A1-FR-A4).
//
// Cats Bot vendors this directory verbatim and runs it through Node's type
// stripping (Bot SPEC-016 FR-A2). Files here import only `node:` built-ins, take
// sibling types through `import type` alone, and use erasable syntax only.
// tests/desktop-feature-pack-boundary.test.js enforces all three.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, stat, type FileHandle } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';

export const FEATURE_PACK_LOCK_SCHEMA_VERSION = 1;
export const FEATURE_PACK_MANIFEST_SCHEMA_VERSION = 1;
export const FEATURE_PACK_MANIFEST_PATH = 'feature-pack.json';
export const FEATURE_PACK_ARCHIVE_EXTENSION = '.catspack';
/** Helper protocol versions this host implements (FR-A4). */
export const FEATURE_PACK_HELPER_PROTOCOLS: readonly number[] = [1];
export const FEATURE_PACK_OPERATING_SYSTEMS = ['linux'] as const;
export const FEATURE_PACK_ARCHITECTURES = ['x64', 'arm64'] as const;

export type FeaturePackOs = (typeof FEATURE_PACK_OPERATING_SYSTEMS)[number];
export type FeaturePackArch = (typeof FEATURE_PACK_ARCHITECTURES)[number];

/** Stages named in the host log (FR-B10). */
export type FeaturePackStage =
  | 'space'
  | 'download'
  | 'resume'
  | 'hash'
  | 'extract'
  | 'manifest'
  | 'activate';

export interface FeaturePackLicense {
  name: string;
  component: string;
}

export interface FeaturePackLockEntry {
  id: string;
  version: string;
  minUsableVersion: string;
  os: FeaturePackOs;
  arch: FeaturePackArch;
  url: string;
  size: number;
  sha256: string;
  unpackedSize: number;
  helperProtocol: number;
  minGlibc: string;
  prerequisites: string[];
  licenses: FeaturePackLicense[];
}

export interface FeaturePackLock {
  schemaVersion: 1;
  packs: FeaturePackLockEntry[];
}

export interface FeaturePackLockReadResult {
  lock: FeaturePackLock;
  /** Why the lock yielded no entries; null when it was read as written. */
  problem: string | null;
}

export interface FeaturePackManifestFile {
  path: string;
  size: number;
  sha256: string;
  executable: boolean;
}

export interface FeaturePackUpstream {
  name: string;
  repository: string;
  commit: string;
}

export interface FeaturePackModel {
  name: string;
  path: string;
  sha256: string;
}

export interface FeaturePackManifestLicense extends FeaturePackLicense {
  path: string;
}

export interface FeaturePackVerifyOptions {
  /**
   * Extracts every verified file under this directory, which must not exist
   * yet (FR-B4). On failure the caller removes it.
   */
  extractTo?: string;
  /** Aborting rejects with the signal's reason, not a `FeaturePackError`. */
  signal?: AbortSignal;
}

export interface FeaturePackManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  os: FeaturePackOs;
  arch: FeaturePackArch;
  helperProtocol: number;
  entry: string;
  files: FeaturePackManifestFile[];
  upstream: FeaturePackUpstream[];
  model: FeaturePackModel;
  prerequisites: string[];
  minGlibc: string;
  licenses: FeaturePackManifestLicense[];
  languages: string[];
}

/**
 * A rejected pack. Code outside this file reads `stage` and `code`, not the
 * class: the manager receives these functions by injection (FR-B9).
 */
export class FeaturePackError extends Error {
  readonly stage: FeaturePackStage;
  readonly code: string;

  constructor(stage: FeaturePackStage, code: string, message: string) {
    super(message);
    this.name = 'FeaturePackError';
    this.stage = stage;
    this.code = code;
  }
}

const PACK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GLIBC_PATTERN = /^\d+\.\d+$/u;
const LIBRARY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;
const LANGUAGE_PATTERN = /^[a-z]{2,3}$/u;
const COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const RESERVED_SEGMENT_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const MAX_PATH_LENGTH = 240;
const MAX_TEXT_LENGTH = 200;

type JsonRecord = Record<string, unknown>;
type Fail = (message: string) => never;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failLock(message: string): never {
  throw new Error(`Invalid feature pack lock: ${message}`);
}

function failManifest(code: string, message: string): never {
  throw new FeaturePackError('manifest', code, message);
}

function failExtract(code: string, message: string): never {
  throw new FeaturePackError('extract', code, message);
}

function invalidManifest(message: string): never {
  return failManifest('manifest_invalid', message);
}

/**
 * The archive path rule shared with the producer's `safePath`: `/`-separated
 * segments of ASCII letters, digits, `.`, `_` and `-`, each starting with a
 * letter or digit and not ending in `.`, and no Windows device names.
 */
export function isSafeFeaturePackPath(value: string): boolean {
  return value.length > 0
    && value.length <= MAX_PATH_LENGTH
    && value.split('/').every((segment) => (
      PATH_SEGMENT_PATTERN.test(segment)
      && !segment.endsWith('.')
      && !RESERVED_SEGMENT_PATTERN.test(segment)
    ));
}

/**
 * Returns the first path that collides with an earlier one after normalization:
 * the same path ignoring ASCII case, or a file that another path uses as a
 * directory. Safe paths are ASCII, so lower-casing is the whole normalization.
 */
export function findFeaturePackPathCollision(paths: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const path of paths) {
    const folded = path.toLowerCase();
    if (seen.has(folded)) {
      return path;
    }
    seen.add(folded);
  }
  for (const path of paths) {
    const segments = path.toLowerCase().split('/');
    for (let length = 1; length < segments.length; length += 1) {
      if (seen.has(segments.slice(0, length).join('/'))) {
        return path;
      }
    }
  }
  return null;
}

export function compareFeaturePackVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }
  return 0;
}

/** The archive file name, `<id>-<version>-<os>-<arch>.catspack` (FR-A2). */
export function featurePackArchiveName(
  entry: Pick<FeaturePackLockEntry, 'id' | 'version' | 'os' | 'arch'>,
): string {
  return `${entry.id}-${entry.version}-${entry.os}-${entry.arch}${FEATURE_PACK_ARCHIVE_EXTENSION}`;
}

function readRecord(value: unknown, where: string, fail: Fail): JsonRecord {
  return isRecord(value) ? value : fail(`${where} must be an object`);
}

function readPattern(
  record: JsonRecord,
  key: string,
  pattern: RegExp,
  where: string,
  fail: Fail,
): string {
  const value = record[key];
  return typeof value === 'string' && pattern.test(value)
    ? value
    : fail(`${where}.${key} is missing or malformed`);
}

function readText(record: JsonRecord, key: string, where: string, fail: Fail): string {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT_LENGTH
    ? value
    : fail(`${where}.${key} must be non-empty text`);
}

function readSafePath(record: JsonRecord, key: string, where: string, fail: Fail): string {
  const value = record[key];
  return typeof value === 'string' && isSafeFeaturePackPath(value)
    ? value
    : fail(`${where}.${key} is not a safe archive path`);
}

function readCount(
  record: JsonRecord,
  key: string,
  minimum: number,
  where: string,
  fail: Fail,
): number {
  const value = record[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
    ? value
    : fail(`${where}.${key} must be an integer of at least ${minimum}`);
}

function readChoice<T extends string>(
  record: JsonRecord,
  key: string,
  choices: readonly T[],
  where: string,
  fail: Fail,
): T {
  const value = record[key];
  return choices.find((choice) => choice === value)
    ?? fail(`${where}.${key} must be one of ${choices.join(', ')}`);
}

function readList<T>(
  record: JsonRecord,
  key: string,
  minimum: number,
  where: string,
  fail: Fail,
  readItem: (item: unknown, itemWhere: string) => T,
): T[] {
  const value = record[key];
  if (!Array.isArray(value) || value.length < minimum) {
    return fail(`${where}.${key} must be a list of at least ${minimum}`);
  }
  return value.map((item, index) => readItem(item, `${where}.${key}[${index}]`));
}

function readDistinctStrings(
  record: JsonRecord,
  key: string,
  pattern: RegExp,
  minimum: number,
  where: string,
  fail: Fail,
): string[] {
  const values = readList(record, key, minimum, where, fail, (item, itemWhere) => (
    typeof item === 'string' && pattern.test(item) ? item : fail(`${itemWhere} is malformed`)
  ));
  return new Set(values).size === values.length
    ? values
    : fail(`${where}.${key} must not repeat a value`);
}

function readHttpsUrl(record: JsonRecord, key: string, where: string, fail: Fail): string {
  const value = record[key];
  if (typeof value !== 'string') {
    return fail(`${where}.${key} must be an HTTPS URL`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(`${where}.${key} must be an HTTPS URL`);
  }
  return url.protocol === 'https:' && url.username === '' && url.password === ''
    ? value
    : fail(`${where}.${key} must be an HTTPS URL without credentials`);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.length === right.length && left.every((value) => rightSet.has(value));
}

function parseLockEntry(value: unknown, where: string): FeaturePackLockEntry {
  const record = readRecord(value, where, failLock);
  const helperProtocol = readCount(record, 'helperProtocol', 1, where, failLock);
  if (!FEATURE_PACK_HELPER_PROTOCOLS.includes(helperProtocol)) {
    return failLock(`${where}.helperProtocol ${helperProtocol} is not implemented by this host`);
  }
  const entry: FeaturePackLockEntry = {
    id: readPattern(record, 'id', PACK_ID_PATTERN, where, failLock),
    version: readPattern(record, 'version', VERSION_PATTERN, where, failLock),
    minUsableVersion: readPattern(record, 'minUsableVersion', VERSION_PATTERN, where, failLock),
    os: readChoice(record, 'os', FEATURE_PACK_OPERATING_SYSTEMS, where, failLock),
    arch: readChoice(record, 'arch', FEATURE_PACK_ARCHITECTURES, where, failLock),
    url: readHttpsUrl(record, 'url', where, failLock),
    size: readCount(record, 'size', 1, where, failLock),
    sha256: readPattern(record, 'sha256', SHA256_PATTERN, where, failLock),
    unpackedSize: readCount(record, 'unpackedSize', 1, where, failLock),
    helperProtocol,
    minGlibc: readPattern(record, 'minGlibc', GLIBC_PATTERN, where, failLock),
    prerequisites: readDistinctStrings(
      record,
      'prerequisites',
      LIBRARY_PATTERN,
      0,
      where,
      failLock,
    ),
    licenses: readList(record, 'licenses', 1, where, failLock, (item, itemWhere) => {
      const license = readRecord(item, itemWhere, failLock);
      return {
        name: readText(license, 'name', itemWhere, failLock),
        component: readText(license, 'component', itemWhere, failLock),
      };
    }),
  };
  if (compareFeaturePackVersions(entry.minUsableVersion, entry.version) > 0) {
    return failLock(`${where}.minUsableVersion is newer than version`);
  }
  return entry;
}

/**
 * Parses `config/desktop-feature-packs.lock.json` (FR-A1). Throws on anything
 * but a valid schema 1 lock, so one bad entry rejects the whole lock.
 */
export function parseFeaturePackLock(value: unknown): FeaturePackLock {
  const record = readRecord(value, 'lock', failLock);
  if (record.schemaVersion !== FEATURE_PACK_LOCK_SCHEMA_VERSION) {
    return failLock(`unsupported schemaVersion ${JSON.stringify(record.schemaVersion)}`);
  }
  const packs = readList(record, 'packs', 0, 'lock', failLock, parseLockEntry);
  const keys = new Set<string>();
  for (const pack of packs) {
    const key = `${pack.id} ${pack.os} ${pack.arch}`;
    if (keys.has(key)) {
      return failLock(`more than one entry for ${key}`);
    }
    keys.add(key);
  }
  return { schemaVersion: 1, packs };
}

/**
 * Reads the lock and fails closed: a missing, malformed or unknown-schema lock
 * yields no entries, and `problem` says why so the caller can log it (FR-A1).
 */
export async function readFeaturePackLock(filePath: string): Promise<FeaturePackLockReadResult> {
  const empty: FeaturePackLock = { schemaVersion: 1, packs: [] };
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    return { lock: empty, problem: `Feature pack lock could not be read: ${describeError(error)}` };
  }
  try {
    return { lock: parseFeaturePackLock(JSON.parse(text)), problem: null };
  } catch (error) {
    return { lock: empty, problem: describeError(error) };
  }
}

/** The lock entries for this machine; none means the machine has no pack (FR-D1). */
export function selectFeaturePackLockEntries(
  lock: FeaturePackLock,
  platform: string,
  arch: string,
): FeaturePackLockEntry[] {
  return lock.packs.filter((pack) => pack.os === platform && pack.arch === arch);
}

export function findFeaturePackLockEntry(
  lock: FeaturePackLock,
  id: string,
  platform: string,
  arch: string,
): FeaturePackLockEntry | null {
  return selectFeaturePackLockEntries(lock, platform, arch).find((pack) => pack.id === id) ?? null;
}

/**
 * Parses `feature-pack.json` and checks it against itself (FR-A3). The checks
 * against the lock are `checkFeaturePackManifestAgainstLock`.
 */
export function parseFeaturePackManifest(value: unknown): FeaturePackManifest {
  const where = 'manifest';
  const fail = invalidManifest;
  const record = readRecord(value, where, fail);
  if (record.schemaVersion !== FEATURE_PACK_MANIFEST_SCHEMA_VERSION) {
    return fail(`unsupported schemaVersion ${JSON.stringify(record.schemaVersion)}`);
  }
  const files = readList(record, 'files', 1, where, fail, (item, itemWhere) => {
    const file = readRecord(item, itemWhere, fail);
    const executable = file.executable;
    return {
      path: readSafePath(file, 'path', itemWhere, fail),
      size: readCount(file, 'size', 0, itemWhere, fail),
      sha256: readPattern(file, 'sha256', SHA256_PATTERN, itemWhere, fail),
      executable: typeof executable === 'boolean'
        ? executable
        : fail(`${itemWhere}.executable must be true or false`),
    };
  });
  const modelRecord = readRecord(record.model, `${where}.model`, fail);
  const manifest: FeaturePackManifest = {
    schemaVersion: 1,
    id: readPattern(record, 'id', PACK_ID_PATTERN, where, fail),
    version: readPattern(record, 'version', VERSION_PATTERN, where, fail),
    os: readChoice(record, 'os', FEATURE_PACK_OPERATING_SYSTEMS, where, fail),
    arch: readChoice(record, 'arch', FEATURE_PACK_ARCHITECTURES, where, fail),
    helperProtocol: readCount(record, 'helperProtocol', 1, where, fail),
    entry: readSafePath(record, 'entry', where, fail),
    files,
    upstream: readList(record, 'upstream', 1, where, fail, (item, itemWhere) => {
      const upstream = readRecord(item, itemWhere, fail);
      return {
        name: readText(upstream, 'name', itemWhere, fail),
        repository: readText(upstream, 'repository', itemWhere, fail),
        commit: readPattern(upstream, 'commit', COMMIT_PATTERN, itemWhere, fail),
      };
    }),
    model: {
      name: readText(modelRecord, 'name', `${where}.model`, fail),
      path: readSafePath(modelRecord, 'path', `${where}.model`, fail),
      sha256: readPattern(modelRecord, 'sha256', SHA256_PATTERN, `${where}.model`, fail),
    },
    prerequisites: readDistinctStrings(record, 'prerequisites', LIBRARY_PATTERN, 0, where, fail),
    minGlibc: readPattern(record, 'minGlibc', GLIBC_PATTERN, where, fail),
    licenses: readList(record, 'licenses', 1, where, fail, (item, itemWhere) => {
      const license = readRecord(item, itemWhere, fail);
      return {
        name: readText(license, 'name', itemWhere, fail),
        component: readText(license, 'component', itemWhere, fail),
        path: readSafePath(license, 'path', itemWhere, fail),
      };
    }),
    languages: readDistinctStrings(record, 'languages', LANGUAGE_PATTERN, 1, where, fail),
  };

  const paths = files.map((file) => file.path);
  const collision = findFeaturePackPathCollision([FEATURE_PACK_MANIFEST_PATH, ...paths]);
  if (collision !== null) {
    return fail(`files lists ${collision} more than once or over another path`);
  }
  const byPath = new Map(files.map((file) => [file.path, file]));
  const entryFile = byPath.get(manifest.entry);
  if (!entryFile) {
    return fail(`entry ${manifest.entry} is not in files`);
  }
  if (!entryFile.executable) {
    return failManifest('entry_not_executable', `entry ${manifest.entry} is not executable`);
  }
  if (byPath.get(manifest.model.path)?.sha256 !== manifest.model.sha256) {
    return fail(`model ${manifest.model.path} is not in files with the same sha256`);
  }
  for (const license of manifest.licenses) {
    if (!byPath.has(license.path)) {
      return fail(`license ${license.path} is not in files`);
    }
  }
  return manifest;
}

/** The manifest fields that must equal the lock entry (FR-A3, FR-A4). */
export function checkFeaturePackManifestAgainstLock(
  manifest: FeaturePackManifest,
  entry: FeaturePackLockEntry,
): void {
  if (!FEATURE_PACK_HELPER_PROTOCOLS.includes(manifest.helperProtocol)) {
    failManifest(
      'unsupported_helper_protocol',
      `helperProtocol ${manifest.helperProtocol} is not implemented by this host`,
    );
  }
  const scalarFields = ['id', 'version', 'os', 'arch', 'helperProtocol', 'minGlibc'] as const;
  for (const field of scalarFields) {
    if (manifest[field] !== entry[field]) {
      failManifest('manifest_lock_mismatch', `manifest ${field} does not match the lock`);
    }
  }
  if (!sameMembers(manifest.prerequisites, entry.prerequisites)) {
    failManifest('manifest_lock_mismatch', 'manifest prerequisites do not match the lock');
  }
}

// ZIP reading. The archive is read from its central directory with positional
// reads, and each entry is streamed through node:zlib, so no archive is held in
// memory (FR-B4). Only the FR-A2 subset is accepted.

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const ZIP64_LOCATOR_SIZE = 20;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_COMMENT_SIZE = 0xffff;
const MAX_CENTRAL_DIRECTORY_SIZE = 1024 * 1024;
const MAX_ENTRIES = 4096;
const MAX_MANIFEST_SIZE = 1024 * 1024;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const DOS_DIRECTORY_ATTRIBUTE = 0x10;
const UNIX_FILE_TYPE_MASK = 0o170000;
const UNIX_REGULAR_FILE = 0o100000;
const UNIX_SYMBOLIC_LINK = 0o120000;
const ZIP32_LIMIT = 0xffffffff;

interface ZipEntry {
  name: string;
  nameBytes: Buffer;
  flags: number;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
  dataOffset: number;
}

async function readAt(handle: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return bytesRead === length
    ? buffer
    : failExtract('malformed_archive', 'the archive ends inside a record');
}

function checkCentralEntry(entry: ZipEntry, externalAttributes: number): void {
  const fileType = (externalAttributes >>> 16) & UNIX_FILE_TYPE_MASK;
  if (fileType === UNIX_SYMBOLIC_LINK) {
    failExtract('symbolic_link', `${entry.name} is a symbolic link`);
  }
  if (
    entry.name.endsWith('/')
    || (externalAttributes & DOS_DIRECTORY_ATTRIBUTE) !== 0
    || (fileType !== 0 && fileType !== UNIX_REGULAR_FILE)
  ) {
    failExtract('not_a_regular_file', `${entry.name} is not a regular file`);
  }
  if (!isSafeFeaturePackPath(entry.name)) {
    failExtract('unsafe_path', `${JSON.stringify(entry.name)} is not a safe archive path`);
  }
  if ((entry.flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) !== 0) {
    failExtract('encrypted_entry', `${entry.name} is encrypted`);
  }
  if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATED) {
    failExtract('unsupported_method', `${entry.name} uses compression method ${entry.method}`);
  }
  if (entry.method === METHOD_STORED && entry.compressedSize !== entry.size) {
    failExtract('malformed_archive', `${entry.name} is stored with two different sizes`);
  }
}

async function readCentralDirectory(handle: FileHandle, archiveSize: number): Promise<{
  entries: ZipEntry[];
  centralDirectoryOffset: number;
}> {
  const tailLength = Math.min(archiveSize, EOCD_SIZE + MAX_COMMENT_SIZE);
  const tailStart = archiveSize - tailLength;
  const tail = await readAt(handle, tailStart, tailLength);
  let eocd = -1;
  for (let index = tail.length - EOCD_SIZE; index >= 0; index -= 1) {
    if (
      tail.readUInt32LE(index) === EOCD_SIGNATURE
      && index + EOCD_SIZE + tail.readUInt16LE(index + 20) === tail.length
    ) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    return failExtract('malformed_archive', 'the archive is not a ZIP file');
  }
  if (
    eocd >= ZIP64_LOCATOR_SIZE
    && tail.readUInt32LE(eocd - ZIP64_LOCATOR_SIZE) === ZIP64_LOCATOR_SIGNATURE
  ) {
    return failExtract('zip64_unsupported', 'ZIP64 archives are not accepted');
  }
  const diskNumber = tail.readUInt16LE(eocd + 4);
  const centralDisk = tail.readUInt16LE(eocd + 6);
  const diskEntries = tail.readUInt16LE(eocd + 8);
  const totalEntries = tail.readUInt16LE(eocd + 10);
  const centralSize = tail.readUInt32LE(eocd + 12);
  const centralOffset = tail.readUInt32LE(eocd + 16);
  if (totalEntries === 0xffff || centralSize === ZIP32_LIMIT || centralOffset === ZIP32_LIMIT) {
    return failExtract('zip64_unsupported', 'ZIP64 archives are not accepted');
  }
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    return failExtract('multi_disk_unsupported', 'split archives are not accepted');
  }
  if (totalEntries > MAX_ENTRIES || centralSize > MAX_CENTRAL_DIRECTORY_SIZE) {
    return failExtract('too_many_entries', 'the archive has too many entries');
  }
  if (centralOffset + centralSize > tailStart + eocd) {
    return failExtract('malformed_archive', 'the central directory overlaps its end record');
  }

  const directory = await readAt(handle, centralOffset, centralSize);
  const entries: ZipEntry[] = [];
  let cursor = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (
      cursor + CENTRAL_HEADER_SIZE > directory.length
      || directory.readUInt32LE(cursor) !== CENTRAL_SIGNATURE
    ) {
      return failExtract('malformed_archive', 'the central directory is malformed');
    }
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const nameStart = cursor + CENTRAL_HEADER_SIZE;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > directory.length) {
      return failExtract('malformed_archive', 'the central directory is malformed');
    }
    const nameBytes = Buffer.from(directory.subarray(nameStart, nameStart + nameLength));
    const entry: ZipEntry = {
      // Safe paths are ASCII, so any other byte fails the path check below.
      name: nameBytes.toString('latin1'),
      nameBytes,
      flags: directory.readUInt16LE(cursor + 8),
      method: directory.readUInt16LE(cursor + 10),
      compressedSize: directory.readUInt32LE(cursor + 20),
      size: directory.readUInt32LE(cursor + 24),
      localHeaderOffset: directory.readUInt32LE(cursor + 42),
      dataOffset: 0,
    };
    if (
      entry.compressedSize === ZIP32_LIMIT
      || entry.size === ZIP32_LIMIT
      || entry.localHeaderOffset === ZIP32_LIMIT
    ) {
      return failExtract('zip64_unsupported', 'ZIP64 archives are not accepted');
    }
    if (directory.readUInt16LE(cursor + 34) !== 0) {
      return failExtract('multi_disk_unsupported', 'split archives are not accepted');
    }
    checkCentralEntry(entry, directory.readUInt32LE(cursor + 38));
    entries.push(entry);
    cursor = next;
  }
  if (cursor !== directory.length) {
    return failExtract('malformed_archive', 'the central directory has trailing bytes');
  }
  return { entries, centralDirectoryOffset: centralOffset };
}

async function locateEntryData(
  handle: FileHandle,
  entries: ZipEntry[],
  centralDirectoryOffset: number,
): Promise<void> {
  for (const entry of entries) {
    const header = await readAt(handle, entry.localHeaderOffset, LOCAL_HEADER_SIZE);
    if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      failExtract('malformed_archive', `${entry.name} has no local header`);
    }
    const flags = header.readUInt16LE(6);
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const localName = await readAt(handle, entry.localHeaderOffset + LOCAL_HEADER_SIZE, nameLength);
    // Sizes come from the central directory, so a data descriptor (bit 3) is
    // allowed; without one, the local sizes must agree with it.
    if (
      !localName.equals(entry.nameBytes)
      || header.readUInt16LE(8) !== entry.method
      || (flags & FLAG_ENCRYPTED) !== (entry.flags & FLAG_ENCRYPTED)
      || ((flags & FLAG_DATA_DESCRIPTOR) === 0 && (
        header.readUInt32LE(18) !== entry.compressedSize || header.readUInt32LE(22) !== entry.size
      ))
    ) {
      failExtract('entry_mismatch', `${entry.name} has a local header unlike its central record`);
    }
    entry.dataOffset = entry.localHeaderOffset + LOCAL_HEADER_SIZE + nameLength + extraLength;
    if (entry.dataOffset + entry.compressedSize > centralDirectoryOffset) {
      failExtract('malformed_archive', `${entry.name} runs into the central directory`);
    }
  }
  const ordered = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (
      previous
      && current
      && previous.dataOffset + previous.compressedSize > current.localHeaderOffset
    ) {
      failExtract('overlapping_entries', `${previous.name} overlaps ${current.name}`);
    }
  }
}

/** Streams one entry's uncompressed bytes into `onChunk`, refusing more than its size. */
async function streamEntry(
  archivePath: string,
  entry: ZipEntry,
  onChunk: (chunk: Buffer) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  let received = 0;
  if (entry.compressedSize > 0) {
    const source = createReadStream(archivePath, {
      start: entry.dataOffset,
      end: entry.dataOffset + entry.compressedSize - 1,
    });
    // Awaiting each chunk applies backpressure, so an extracted model never
    // buffers in memory.
    const sink = async (chunks: AsyncIterable<Buffer>): Promise<void> => {
      for await (const chunk of chunks) {
        received += chunk.length;
        if (received > entry.size) {
          failExtract('file_size_mismatch', `${entry.name} is larger than its recorded size`);
        }
        await onChunk(chunk);
      }
    };
    try {
      if (entry.method === METHOD_DEFLATED) {
        await pipeline(source, createInflateRaw(), sink, { signal });
      } else {
        await pipeline(source, sink, { signal });
      }
    } catch (error) {
      if (error instanceof FeaturePackError || signal?.aborted) {
        throw error;
      }
      failExtract('inflate_failed', `${entry.name} could not be read: ${describeError(error)}`);
    }
  } else if (entry.method === METHOD_DEFLATED) {
    failExtract('inflate_failed', `${entry.name} has no deflate data`);
  }
  if (received !== entry.size) {
    failExtract('file_size_mismatch', `${entry.name} is smaller than its recorded size`);
  }
}

async function hashArchive(
  archivePath: string,
  entry: FeaturePackLockEntry,
  signal?: AbortSignal,
): Promise<void> {
  let size: number;
  try {
    size = (await stat(archivePath)).size;
  } catch (error) {
    throw new FeaturePackError('hash', 'archive_missing', describeError(error));
  }
  if (size !== entry.size) {
    throw new FeaturePackError(
      'hash',
      'archive_size_mismatch',
      `the archive has ${size} bytes; the lock says ${entry.size}`,
    );
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archivePath)) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  if (hash.digest('hex') !== entry.sha256) {
    throw new FeaturePackError(
      'hash',
      'archive_hash_mismatch',
      'the archive sha256 differs from the lock',
    );
  }
}

/**
 * Verifies a downloaded archive against its lock entry (FR-A2, FR-A3): the
 * archive's size and SHA-256, the ZIP structure, the manifest and every file's
 * size and SHA-256. Throws a `FeaturePackError` naming the failing stage.
 *
 * With `extractTo`, it also writes each file while hashing it (FR-B4): mode
 * 0755 for executables and 0644 otherwise, whatever the archive stored, and
 * each file fsynced. The manifest is written too, for the start-time check.
 */
export async function verifyFeaturePackArchive(
  archivePath: string,
  entry: FeaturePackLockEntry,
  options: FeaturePackVerifyOptions = {},
): Promise<FeaturePackManifest> {
  const { extractTo, signal } = options;
  await hashArchive(archivePath, entry, signal);

  const handle = await open(archivePath, 'r');
  let entries: ZipEntry[];
  try {
    const directory = await readCentralDirectory(handle, entry.size);
    entries = directory.entries;
    await locateEntryData(handle, entries, directory.centralDirectoryOffset);
  } finally {
    await handle.close();
  }

  const names = entries.map((zipEntry) => zipEntry.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate !== undefined) {
    failExtract('duplicate_path', `${duplicate} appears more than once`);
  }
  const collision = findFeaturePackPathCollision(names);
  if (collision !== null) {
    failExtract('colliding_path', `${collision} collides with another path`);
  }

  const manifestEntry = entries.find((zipEntry) => zipEntry.name === FEATURE_PACK_MANIFEST_PATH);
  if (!manifestEntry) {
    return failManifest('manifest_missing', `${FEATURE_PACK_MANIFEST_PATH} is not in the archive`);
  }
  if (manifestEntry.size > MAX_MANIFEST_SIZE) {
    return failManifest('manifest_invalid', `${FEATURE_PACK_MANIFEST_PATH} is too large`);
  }
  const manifestChunks: Buffer[] = [];
  await streamEntry(archivePath, manifestEntry, (chunk) => {
    manifestChunks.push(chunk);
  }, signal);
  const manifestBytes = Buffer.concat(manifestChunks);
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    return failManifest(
      'manifest_invalid',
      `${FEATURE_PACK_MANIFEST_PATH}: ${describeError(error)}`,
    );
  }
  const manifest = parseFeaturePackManifest(manifestJson);
  checkFeaturePackManifestAgainstLock(manifest, entry);

  const archived = new Map(
    entries
      .filter((zipEntry) => zipEntry !== manifestEntry)
      .map((zipEntry) => [zipEntry.name, zipEntry]),
  );
  for (const name of archived.keys()) {
    if (!manifest.files.some((file) => file.path === name)) {
      failManifest('file_not_in_manifest', `${name} is in the archive but not in the manifest`);
    }
  }
  for (const file of manifest.files) {
    const zipEntry = archived.get(file.path);
    if (!zipEntry) {
      failManifest('file_missing', `${file.path} is in the manifest but not in the archive`);
    }
    if (zipEntry.size !== file.size) {
      failExtract('file_size_mismatch', `${file.path} does not have its manifest size`);
    }
  }
  const unpackedSize = entries.reduce((total, zipEntry) => total + zipEntry.size, 0);
  if (unpackedSize > entry.unpackedSize) {
    failManifest(
      'unpacked_size_exceeded',
      `the archive unpacks to ${unpackedSize} bytes; the lock says ${entry.unpackedSize}`,
    );
  }

  if (extractTo !== undefined) {
    await mkdir(extractTo, { recursive: true, mode: 0o700 });
    await writeExtractedFile(extractTo, FEATURE_PACK_MANIFEST_PATH, 0o644, async (write) => {
      await write(manifestBytes);
    });
  }
  for (const file of manifest.files) {
    const zipEntry = archived.get(file.path);
    if (!zipEntry) {
      continue;
    }
    const hash = createHash('sha256');
    if (extractTo === undefined) {
      await streamEntry(archivePath, zipEntry, (chunk) => {
        hash.update(chunk);
      }, signal);
    } else {
      const mode = file.executable ? 0o755 : 0o644;
      await writeExtractedFile(extractTo, file.path, mode, async (write) => {
        await streamEntry(archivePath, zipEntry, async (chunk) => {
          hash.update(chunk);
          await write(chunk);
        }, signal);
      });
    }
    if (hash.digest('hex') !== file.sha256) {
      failExtract('file_hash_mismatch', `${file.path} does not have its manifest sha256`);
    }
  }
  return manifest;
}

/**
 * Creates one extracted file, lets `fill` write it, then sets its mode and
 * fsyncs it. The archive's stored modes are never used (FR-A2).
 */
async function writeExtractedFile(
  root: string,
  relativePath: string,
  mode: number,
  fill: (write: (chunk: Uint8Array) => Promise<void>) => Promise<void>,
): Promise<void> {
  const target = join(root, ...relativePath.split('/'));
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(target, 'wx', mode);
  try {
    await fill(async (chunk) => {
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset, null);
        offset += bytesWritten;
      }
    });
    await handle.chmod(mode);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * The contract functions the pack manager uses. Desktop and Bot pass this
 * object in, because the manager may not import this file by value (FR-B9).
 */
export interface FeaturePackContract {
  verifyArchive(
    archivePath: string,
    entry: FeaturePackLockEntry,
    options?: FeaturePackVerifyOptions,
  ): Promise<FeaturePackManifest>;
  parseManifest(value: unknown): FeaturePackManifest;
  compareVersions(left: string, right: string): number;
  archiveName(entry: Pick<FeaturePackLockEntry, 'id' | 'version' | 'os' | 'arch'>): string;
  isSafePath(value: string): boolean;
  isVersion(value: string): boolean;
}

export const featurePackContract: FeaturePackContract = {
  verifyArchive: verifyFeaturePackArchive,
  parseManifest: parseFeaturePackManifest,
  compareVersions: compareFeaturePackVersions,
  archiveName: featurePackArchiveName,
  isSafePath: isSafeFeaturePackPath,
  isVersion: (value) => VERSION_PATTERN.test(value),
};
