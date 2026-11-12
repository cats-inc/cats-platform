import { createHash } from 'node:crypto';
import {
  closeSync, fstatSync, fsyncSync, lstatSync, openSync, readSync, unlinkSync, writeSync,
  type Stats,
} from 'node:fs';
import path from 'node:path';
import { lstat, open } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { ChatMessage } from '../../api/contracts.js';
import { CanonicalArrayDigest } from '../../../../platform/persistence/state-db/canonicalJson.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MANIFEST_LIMIT = 16 * 1024 * 1024;
const BLOCK_LIMIT = 64 * 1024 * 1024;
const BLOCK_TARGET = 512 * 1024;
const BLOCK_RECORDS = 200;
const utf8 = new TextDecoder('utf-8', { fatal: true });
type BlockKind = 'header' | 'context' | 'message';
type JsonObject = Record<string, unknown>;

export class ColdArchiveError extends Error {
  constructor(readonly code: 'invalid_input' | 'invalid_archive' | 'capacity_exceeded' | 'io_error' | 'closed') {
    super(`Cold archive: ${code}`);
    this.name = 'ColdArchiveError';
  }
}

export interface ColdArchiveHeader {
  kind: 'header';
  format: 1;
  archiveId: string;
  installationId: string;
  channelId: string;
  createdAt: string;
  sourceRevision: string;
  channelRevision: string;
  orderRevision: string;
  messageCount: number;
  /** Complete original channel header, including product extensions; no transcript. */
  channel: JsonObject;
}

export interface ColdArchiveContext {
  family: string;
  value: JsonObject;
}

export interface ColdArchiveBlock {
  kind: BlockKind;
  first: number;
  count: number;
  offset: number;
  bytes: number;
  decodedBytes: number;
  sha256: string;
}

export interface ColdArchiveManifest {
  format: 1;
  codec: 'gzip-jsonl-members';
  archiveId: string;
  installationId: string;
  channelId: string;
  file: string;
  createdAt: string;
  sourceRevision: string;
  channelRevision: string;
  orderRevision: string;
  originalStatus: string;
  bytes: number;
  sha256: string;
  logicalSha256: string;
  messagesDigest: string;
  messageCount: number;
  contextCount: number;
  blocks: ColdArchiveBlock[];
}

function requireValue(ok: unknown, code: ColdArchiveError['code'] = 'invalid_archive'): asserts ok {
  if (!ok) throw new ColdArchiveError(code);
}

function controlled<T>(action: () => T): T {
  try { return action(); }
  catch (error) { throw error instanceof ColdArchiveError ? error : new ColdArchiveError('io_error'); }
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

/** Reject JSON's silent undefined/non-finite/toJSON conversions before exporting evidence. */
function assertJson(value: unknown, ancestors = new Set<object>(), depth = 0): void {
  requireValue(depth <= 128, 'capacity_exceeded');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { requireValue(Number.isFinite(value), 'invalid_input'); return; }
  requireValue(typeof value === 'object', 'invalid_input');
  requireValue(!ancestors.has(value), 'invalid_input');
  requireValue(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null, 'invalid_input');
  requireValue(Object.getOwnPropertySymbols(value).length === 0, 'invalid_input');
  requireValue(Object.getOwnPropertyNames(value).length === Object.keys(value).length + (Array.isArray(value) ? 1 : 0), 'invalid_input');
  ancestors.add(value);
  if (Array.isArray(value)) {
    requireValue(Object.keys(value).length === value.length, 'invalid_input');
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      requireValue(descriptor && 'value' in descriptor, 'invalid_input');
      assertJson(descriptor.value, ancestors, depth + 1);
    }
  } else for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireValue(descriptor && 'value' in descriptor, 'invalid_input');
    assertJson(descriptor.value, ancestors, depth + 1);
  }
  ancestors.delete(value);
}

function jsonBytes(value: unknown, maximum: number): Buffer {
  assertJson(value);
  const text = JSON.stringify(value);
  requireValue(Buffer.byteLength(text) <= maximum, 'capacity_exceeded');
  return Buffer.from(text);
}

function validateHeader(value: unknown): asserts value is ColdArchiveHeader {
  requireValue(object(value) && value.kind === 'header' && value.format === 1
    && typeof value.archiveId === 'string' && UUID.test(value.archiveId)
    && typeof value.installationId === 'string' && UUID.test(value.installationId)
    && identifier(value.channelId) && identifier(value.sourceRevision)
    && identifier(value.channelRevision) && identifier(value.orderRevision)
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && integer(value.messageCount) && object(value.channel)
    && value.channel.id === value.channelId && typeof value.channel.status === 'string'
    && ['planned', 'configured', 'active', 'watching', 'archived'].includes(value.channel.status)
    && !Object.hasOwn(value.channel, 'messages'));
}

function validMessage(value: unknown, channelId: string): value is ChatMessage {
  return object(value) && identifier(value.id) && value.channelId === channelId && typeof value.body === 'string';
}

function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

function sameFile(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function unchanged(a: Stats, b: Stats): boolean {
  return sameFile(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function readExact(fd: number, length: number, offset: number): Buffer {
  const bytes = Buffer.allocUnsafe(length);
  let read = 0;
  while (read < length) {
    const count = readSync(fd, bytes, read, length - read, offset + read);
    requireValue(count > 0);
    read += count;
  }
  return bytes;
}

function writeAll(fd: number, bytes: Buffer): void {
  let written = 0;
  while (written < bytes.length) {
    const count = writeSync(fd, bytes, written, bytes.length - written);
    requireValue(count > 0, 'io_error');
    written += count;
  }
}

/** Immutable manifests carry byte ranges, so a cold page need not inflate older history. */
function copyManifest(input: unknown): ColdArchiveManifest {
  let value: unknown;
  try { value = JSON.parse(utf8.decode(jsonBytes(input, MANIFEST_LIMIT))); }
  catch (error) {
    if (error instanceof ColdArchiveError && error.code === 'capacity_exceeded') throw error;
    throw new ColdArchiveError('invalid_archive');
  }
  requireValue(object(value) && value.format === 1 && value.codec === 'gzip-jsonl-members'
    && typeof value.archiveId === 'string' && UUID.test(value.archiveId)
    && typeof value.installationId === 'string' && UUID.test(value.installationId)
    && identifier(value.channelId) && value.file === `${value.archiveId}.jsonl.gz`
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && identifier(value.sourceRevision) && identifier(value.channelRevision) && identifier(value.orderRevision)
    && typeof value.originalStatus === 'string' && ['planned', 'configured', 'active', 'watching', 'archived'].includes(value.originalStatus)
    && integer(value.bytes, 1) && typeof value.sha256 === 'string' && SHA256.test(value.sha256)
    && typeof value.logicalSha256 === 'string' && SHA256.test(value.logicalSha256)
    && typeof value.messagesDigest === 'string' && SHA256.test(value.messagesDigest)
    && integer(value.messageCount) && integer(value.contextCount) && Array.isArray(value.blocks)
    && value.blocks.length > 0);
  let offset = 0, contexts = 0, messages = 0, phase = 0;
  for (let i = 0; i < value.blocks.length; i++) {
    const block = value.blocks[i];
    requireValue(object(block) && integer(block.offset) && block.offset === offset
      && integer(block.bytes, 1) && block.bytes <= BLOCK_LIMIT + 1024 * 1024
      && integer(block.decodedBytes, 1) && block.decodedBytes <= BLOCK_LIMIT
      && integer(block.first) && integer(block.count, 1) && block.count <= BLOCK_RECORDS
      && typeof block.sha256 === 'string' && SHA256.test(block.sha256));
    if (i === 0) requireValue(block.kind === 'header' && block.first === 0 && block.count === 1);
    else if (block.kind === 'context') {
      requireValue(phase <= 1 && block.first === contexts);
      phase = 1; contexts += block.count;
    } else {
      requireValue(block.kind === 'message' && block.first === messages);
      phase = 2; messages += block.count;
    }
    offset += block.bytes;
    requireValue(integer(offset, 1));
    Object.freeze(block);
  }
  requireValue(offset === value.bytes && contexts === value.contextCount && messages === value.messageCount);
  Object.freeze(value.blocks);
  return Object.freeze(value) as unknown as ColdArchiveManifest;
}

/** Synchronous codec: call on a native maintenance worker or from an offline command. */
export function writeColdArchive(directory: string, input: {
  header: ColdArchiveHeader;
  contexts: Iterable<ColdArchiveContext>;
  messages: Iterable<ChatMessage>;
}): { manifest: ColdArchiveManifest; manifestFile: string; manifestDigest: string } {
  return controlled(() => {
    const header = JSON.parse(utf8.decode(jsonBytes(input.header, BLOCK_LIMIT - 1))) as unknown;
    try { validateHeader(header); } catch { throw new ColdArchiveError('invalid_input'); }
    const channelId = header.channelId;
    const payloadFile = path.join(directory, `${header.archiveId}.jsonl.gz`);
    const manifestFile = path.join(directory, `${header.archiveId}.manifest.json`);
    const owned: { file: string; stat: Stats }[] = [];
    let fd: number | undefined;
    try {
      fd = openSync(payloadFile, 'wx', 0o600);
      owned.push({ file: payloadFile, stat: fstatSync(fd) });
      const compressedHash = createHash('sha256'), logicalHash = createHash('sha256');
      const messagesHash = new CanonicalArrayDigest();
      const blocks: ColdArchiveBlock[] = [];
      let offset = 0, contextCount = 0, messageCount = 0;
      const flush = (kind: BlockKind, first: number, lines: Buffer[]): void => {
        const raw = Buffer.concat(lines);
        const compressed = gzipSync(raw);
        requireValue(raw.length <= BLOCK_LIMIT, 'capacity_exceeded');
        requireValue(offset + compressed.length <= Number.MAX_SAFE_INTEGER, 'capacity_exceeded');
        writeAll(fd!, compressed);
        blocks.push({ kind, first, count: lines.length, offset, bytes: compressed.length,
          decodedBytes: raw.length, sha256: digest(compressed) });
        offset += compressed.length;
        compressedHash.update(compressed); logicalHash.update(raw);
        // Bound the eventual manifest as well as each decompressed block.
        requireValue(blocks.length <= 40_000, 'capacity_exceeded');
      };
      const line = (value: unknown): Buffer => Buffer.concat([jsonBytes(value, BLOCK_LIMIT - 1), Buffer.from('\n')]);
      flush('header', 0, [line(header)]);
      const writeRecords = (kind: 'context' | 'message', records: Iterable<JsonObject>): number => {
        let lines: Buffer[] = [], bytes = 0, count = 0;
        for (const record of records) {
          const encoded = line(record);
          if (kind === 'message') messagesHash.add(record.message);
          if (lines.length && (lines.length === BLOCK_RECORDS || bytes + encoded.length > BLOCK_TARGET)) {
            flush(kind, count - lines.length, lines); lines = []; bytes = 0;
          }
          lines.push(encoded); bytes += encoded.length; count++;
          requireValue(integer(count), 'capacity_exceeded');
        }
        if (lines.length) flush(kind, count - lines.length, lines);
        return count;
      };
      function* contexts(): Generator<JsonObject> {
        for (const context of input.contexts) {
          requireValue(object(context) && identifier(context.family) && object(context.value), 'invalid_input');
          yield { kind: 'context', family: context.family, value: context.value };
        }
      }
      function* messages(): Generator<JsonObject> {
        let position = 0;
        for (const message of input.messages) {
          requireValue(validMessage(message, channelId), 'invalid_input');
          yield { kind: 'message', position: position++, message };
        }
      }
      contextCount = writeRecords('context', contexts());
      messageCount = writeRecords('message', messages());
      requireValue(messageCount === header.messageCount, 'invalid_input');
      fsyncSync(fd); closeSync(fd); fd = undefined;
      const manifest = copyManifest({ format: 1, codec: 'gzip-jsonl-members', archiveId: header.archiveId,
        installationId: header.installationId, channelId: header.channelId,
        createdAt: header.createdAt, sourceRevision: header.sourceRevision, channelRevision: header.channelRevision,
        orderRevision: header.orderRevision, originalStatus: header.channel.status,
        file: path.basename(payloadFile), bytes: offset, sha256: compressedHash.digest('hex'),
        logicalSha256: logicalHash.digest('hex'), messagesDigest: messagesHash.digest(), messageCount, contextCount, blocks });
      const reader = new ColdArchiveReader(directory, manifest);
      try { reader.verify(); } finally { reader.close(); }
      const manifestBytes = jsonBytes(manifest, MANIFEST_LIMIT);
      fd = openSync(manifestFile, 'wx', 0o600);
      owned.push({ file: manifestFile, stat: fstatSync(fd) });
      writeAll(fd, manifestBytes); fsyncSync(fd); closeSync(fd); fd = undefined;
      // Match atomicFile's platform boundary: POSIX also makes new filenames durable.
      // Node on Windows cannot fsync directory handles; both file contents are synced.
      if (process.platform !== 'win32') {
        const directoryFd = openSync(directory, 'r');
        try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
      }
      return { manifest, manifestFile, manifestDigest: digest(manifestBytes) };
    } catch (error) {
      if (fd !== undefined) { try { closeSync(fd); } catch { /* Preserve the original failure. */ } }
      for (const entry of owned.reverse()) {
        try { if (sameFile(entry.stat, lstatSync(entry.file))) unlinkSync(entry.file); } catch { /* Recovery owns orphan cleanup. */ }
      }
      throw error;
    }
  });
}

export class ColdArchiveReader {
  readonly manifest: ColdArchiveManifest;
  private fd: number | undefined;
  private readonly identity: Stats;
  private readonly file: string;
  private readonly messageBlocks: ColdArchiveBlock[];
  private readonly contextBlocks: ColdArchiveBlock[];

  constructor(directory: string, manifest: unknown) {
    this.manifest = copyManifest(manifest);
    this.messageBlocks = this.manifest.blocks.filter(block => block.kind === 'message');
    this.contextBlocks = this.manifest.blocks.filter(block => block.kind === 'context');
    this.file = path.join(directory, this.manifest.file);
    let fd: number | undefined;
    try {
      const before = lstatSync(this.file);
      requireValue(before.isFile() && !before.isSymbolicLink());
      fd = openSync(this.file, 'r');
      this.identity = fstatSync(fd);
      requireValue(unchanged(before, this.identity) && this.identity.size === this.manifest.bytes);
      this.fd = fd;
    } catch (error) {
      if (fd !== undefined) { try { closeSync(fd); } catch { /* Preserve admission failure. */ } }
      throw error instanceof ColdArchiveError ? error : new ColdArchiveError('io_error');
    }
  }

  private admitted(): number {
    requireValue(this.fd !== undefined, 'closed');
    requireValue(unchanged(this.identity, fstatSync(this.fd)) && unchanged(this.identity, lstatSync(this.file)));
    return this.fd;
  }

  private decode(block: ColdArchiveBlock): { compressed: Buffer; raw: Buffer; records: JsonObject[] } {
    const compressed = readExact(this.admitted(), block.bytes, block.offset);
    requireValue(digest(compressed) === block.sha256);
    let raw: Buffer, records: unknown[];
    try {
      raw = gunzipSync(compressed, { maxOutputLength: block.decodedBytes });
      requireValue(raw.length === block.decodedBytes);
      const text = utf8.decode(raw);
      requireValue(text.endsWith('\n'));
      records = text.slice(0, -1).split('\n').map(line => JSON.parse(line));
    } catch { throw new ColdArchiveError('invalid_archive'); }
    requireValue(records.length === block.count);
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      requireValue(object(record) && record.kind === block.kind);
      if (block.kind === 'header') {
        validateHeader(record);
        requireValue(record.archiveId === this.manifest.archiveId && record.installationId === this.manifest.installationId
          && record.channelId === this.manifest.channelId && record.messageCount === this.manifest.messageCount
          && record.createdAt === this.manifest.createdAt && record.sourceRevision === this.manifest.sourceRevision
          && record.channelRevision === this.manifest.channelRevision && record.orderRevision === this.manifest.orderRevision
          && record.channel.status === this.manifest.originalStatus);
      } else if (block.kind === 'context') requireValue(identifier(record.family) && object(record.value));
      else requireValue(record.position === block.first + i && validMessage(record.message, this.manifest.channelId));
    }
    this.admitted();
    return { compressed, raw, records: records as JsonObject[] };
  }

  header(): ColdArchiveHeader {
    return controlled(() => this.decode(this.manifest.blocks[0]).records[0] as unknown as ColdArchiveHeader);
  }

  /** Full readback is mandatory before the caller may remove hot rows. */
  verify(): void {
    for (const _message of this.messages()) { /* Consume the complete bounded stream. */ }
  }

  *contexts(): Generator<ColdArchiveContext> {
    this.header();
    for (const block of this.contextBlocks) {
      const records = controlled(() => this.decode(block).records);
      for (const record of records) yield { family: record.family as string, value: record.value as JsonObject };
    }
  }

  /** Full ordered readback/export also proves context and whole-payload integrity. */
  *messages(): Generator<ChatMessage> {
    const compressed = createHash('sha256'), logical = createHash('sha256');
    const messagesHash = new CanonicalArrayDigest();
    for (const block of this.manifest.blocks) {
      const decoded = controlled(() => this.decode(block));
      compressed.update(decoded.compressed); logical.update(decoded.raw);
      if (block.kind === 'message') for (const record of decoded.records) {
        const message = record.message as unknown as ChatMessage;
        messagesHash.add(message); yield message;
      }
    }
    requireValue(compressed.digest('hex') === this.manifest.sha256 && logical.digest('hex') === this.manifest.logicalSha256
      && messagesHash.digest() === this.manifest.messagesDigest);
  }

  readPage(limit = 50, before = this.manifest.messageCount): {
    messages: ChatMessage[]; total: number; nextPosition: number | null;
  } {
    return controlled(() => {
      requireValue(integer(limit, 1) && limit <= 200 && integer(before) && before <= this.manifest.messageCount, 'invalid_input');
      this.header();
      const first = Math.max(0, before - limit), messages: ChatMessage[] = [];
      let low = 0, high = this.messageBlocks.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2), block = this.messageBlocks[middle];
        if (block.first + block.count <= first) low = middle + 1;
        else high = middle;
      }
      for (let i = low; i < this.messageBlocks.length; i++) {
        const block = this.messageBlocks[i];
        if (block.first >= before) break;
        for (const record of this.decode(block).records) if (Number(record.position) >= first && Number(record.position) < before) {
          messages.push(record.message as unknown as ChatMessage);
        }
      }
      return { messages, total: this.manifest.messageCount, nextPosition: first > 0 ? first : null };
    });
  }

  close(): void {
    if (this.fd !== undefined) {
      const fd = this.fd; this.fd = undefined;
      controlled(() => closeSync(fd));
    }
  }
}

/** The catalog/backup pins this digest; a manifest alone is not a trusted import. */
export function readColdArchiveManifest(directory: string, archiveId: string, expectedDigest: string): ColdArchiveManifest {
  return controlled(() => {
    requireValue(UUID.test(archiveId) && SHA256.test(expectedDigest), 'invalid_input');
    const file = path.join(directory, `${archiveId}.manifest.json`);
    const before = lstatSync(file);
    requireValue(before.isFile() && !before.isSymbolicLink() && before.size > 0 && before.size <= MANIFEST_LIMIT);
    const fd = openSync(file, 'r');
    try {
      requireValue(unchanged(before, fstatSync(fd)));
      const bytes = readExact(fd, before.size, 0);
      requireValue(unchanged(before, fstatSync(fd)) && unchanged(before, lstatSync(file)) && digest(bytes) === expectedDigest);
      let parsed: unknown;
      try { parsed = JSON.parse(utf8.decode(bytes)); } catch { throw new ColdArchiveError('invalid_archive'); }
      const manifest = copyManifest(parsed);
      requireValue(manifest.archiveId === archiveId);
      return manifest;
    } finally { closeSync(fd); }
  });
}

/** Background admission yields on bounded reads; no synchronous all-archive scan. */
export async function readColdArchiveManifestAsync(directory: string, archiveId: string, expectedDigest: string,
  signal?: AbortSignal): Promise<ColdArchiveManifest> {
  try {
    requireValue(UUID.test(archiveId) && SHA256.test(expectedDigest), 'invalid_input');
    signal?.throwIfAborted();
    const file = path.join(directory, `${archiveId}.manifest.json`), before = await lstat(file);
    requireValue(before.isFile() && !before.isSymbolicLink() && before.size > 0 && before.size <= MANIFEST_LIMIT);
    const fd = await open(file, 'r');
    let bytes: Buffer;
    try {
      requireValue(unchanged(before, await fd.stat()));
      bytes = Buffer.allocUnsafe(before.size);
      for (let offset = 0; offset < bytes.length;) {
        signal?.throwIfAborted();
        const { bytesRead } = await fd.read(bytes, offset, Math.min(128 * 1024, bytes.length - offset), offset);
        requireValue(bytesRead > 0); offset += bytesRead;
      }
      requireValue(unchanged(before, await fd.stat()) && unchanged(before, await lstat(file)) && digest(bytes) === expectedDigest);
    } finally { await fd.close(); }
    signal?.throwIfAborted();
    let parsed: unknown;
    try { parsed = JSON.parse(utf8.decode(bytes)); } catch { throw new ColdArchiveError('invalid_archive'); }
    const manifest = copyManifest(parsed);
    requireValue(manifest.archiveId === archiveId);
    return manifest;
  } catch (error) {
    signal?.throwIfAborted();
    throw error instanceof ColdArchiveError ? error : new ColdArchiveError('io_error');
  }
}
