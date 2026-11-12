import { lstat, mkdir, readdir, rmdir, unlink, open, link } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { StateDatabase, StateRow } from '../../../../platform/persistence/state-db/stateDatabase.js';
import { syncDirectory } from '../../../../platform/persistence/state-db/atomicFile.js';
import { fileDigestAsync } from '../../../../platform/persistence/state-db/fileDigest.js';
import { ColdArchiveReader, readColdArchiveManifest, readColdArchiveManifestAsync, type ColdArchiveManifest } from './coldArchive.js';
import { ProfileStorageError, storageNameIdentity } from './profileFormat.js';

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const ID = new RegExp(`^${UUID}$`, 'u');
const ASSET = new RegExp(`^${UUID}\\.(?:jsonl\\.gz|manifest\\.json)$`, 'u');
const TEMPORARY = new RegExp(`^${UUID}\\.(?:jsonl\\.gz|manifest\\.json)\\.(?:[0-9]+\\.)?${UUID}\\.unfinished$`, 'u');
const DIGEST = /^[a-f0-9]{64}$/u;

export interface ConversationArchive {
  archiveId: string;
  channelId: string;
  manifestDigest: string;
  messagesDigest: string;
  messageCount: number;
  createdAt: string;
  originalStatus: string;
  sourceRevision: string;
  channelRevision: string;
}
export interface ArchiveAssetProof { name: string; sha256: string; }

/** Derive from the database sibling, never from a persisted arbitrary root/path. */
export const archiveDirectory = (databaseFile: string): string => `${path.resolve(databaseFile)}.archives`;
export const isArchiveAssetName = (name: string): boolean => ASSET.test(storageNameIdentity(name));

function invalid(): ProfileStorageError {
  return new ProfileStorageError('archive_invalid', 'A conversation archive did not verify. Preserve its files and restore a complete state backup.');
}

function record(row: StateRow): ConversationArchive {
  const result = { archiveId: row.archive_id, channelId: row.channel_id, manifestDigest: row.manifest_digest,
    messagesDigest: row.messages_digest, messageCount: row.message_count, createdAt: row.created_at,
    originalStatus: row.original_status, sourceRevision: row.source_revision, channelRevision: row.channel_revision };
  if (typeof result.archiveId !== 'string' || !ID.test(result.archiveId)
    || typeof result.channelId !== 'string' || !result.channelId
    || typeof result.manifestDigest !== 'string' || !DIGEST.test(result.manifestDigest)
    || typeof result.messagesDigest !== 'string' || !DIGEST.test(result.messagesDigest)
    || !Number.isSafeInteger(result.messageCount) || Number(result.messageCount) < 0
    || typeof result.createdAt !== 'string' || !Number.isFinite(Date.parse(result.createdAt))
    || typeof result.originalStatus !== 'string' || !['planned', 'configured', 'active', 'watching', 'archived'].includes(result.originalStatus)
    || typeof result.sourceRevision !== 'string' || !result.sourceRevision
    || typeof result.channelRevision !== 'string' || !result.channelRevision) throw invalid();
  return result as ConversationArchive;
}

export function conversationArchive(database: StateDatabase, channelId: string): ConversationArchive | null {
  if (Number(database.meta('schema_version')) < 4) return null;
  const row = database.get("select * from conversation_archives where channel_id = ? and state = 'active'", channelId);
  return row ? record(row) : null;
}

export function conversationArchives(database: StateDatabase): ConversationArchive[] {
  if (Number(database.meta('schema_version')) < 4) return [];
  return database.all("select * from conversation_archives where state = 'active' order by archive_id").map(record);
}

export function openConversationArchive(database: StateDatabase, archive: ConversationArchive): ColdArchiveReader {
  try {
    const root = archiveDirectory(database.file);
    assertDirectorySync(root);
    const manifest = readColdArchiveManifest(root, archive.archiveId, archive.manifestDigest);
    bindManifest(database, archive, manifest);
    const reader = new ColdArchiveReader(root, manifest);
    try {
      const header = reader.header();
      if (header.sourceRevision !== archive.sourceRevision || header.channelRevision !== archive.channelRevision
        || header.channel.status !== archive.originalStatus) throw invalid();
      return reader;
    } catch (error) { reader.close(); throw error; }
  } catch { throw invalid(); }
}

/** This list is derived from the captured DB, including installation/channel/count binding. */
export function archiveAssetProofs(database: StateDatabase, root = archiveDirectory(database.file)): ArchiveAssetProof[] {
  try {
    const archives = conversationArchives(database);
    if (archives.length) assertDirectorySync(root);
    return archives.flatMap(archive => {
      const manifest = readColdArchiveManifest(root, archive.archiveId, archive.manifestDigest);
      bindManifest(database, archive, manifest);
      return [{ name: `${archive.archiveId}.manifest.json`, sha256: archive.manifestDigest },
        { name: manifest.file, sha256: manifest.sha256 }];
    });
  } catch { throw invalid(); }
}

export async function archiveAssetProofsAsync(database: StateDatabase, root = archiveDirectory(database.file),
  signal?: AbortSignal): Promise<ArchiveAssetProof[]> {
  try {
    const archives = conversationArchives(database), proofs: ArchiveAssetProof[] = [];
    if (archives.length) await assertDirectory(root);
    for (const archive of archives) {
      signal?.throwIfAborted();
      const manifest = await readColdArchiveManifestAsync(root, archive.archiveId, archive.manifestDigest, signal);
      bindManifest(database, archive, manifest);
      proofs.push({ name: `${archive.archiveId}.manifest.json`, sha256: archive.manifestDigest },
        { name: manifest.file, sha256: manifest.sha256 });
    }
    return proofs;
  } catch { signal?.throwIfAborted(); throw invalid(); }
}

/** Existing destinations are admitted only if already exact; no archive is overwritten. */
export async function copyArchiveAssets(sourceRoot: string, targetRoot: string, proofs: ArchiveAssetProof[], signal?: AbortSignal,
  /** Private cancellation/fault seam; never selected by a product request. */
  checkpoint?: () => void | Promise<void>): Promise<void> {
  try {
    validateProofs(proofs);
    if (!proofs.length) return;
    await assertDirectory(sourceRoot);
    await mkdir(targetRoot, { recursive: true, mode: 0o700 });
    await assertDirectory(targetRoot);
    for (const proof of proofs) {
      signal?.throwIfAborted();
      const source = path.join(sourceRoot, proof.name), target = path.join(targetRoot, proof.name);
      const present = await lstat(target).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
      if (!present) await copyAsset(source, target, proof.sha256, signal, checkpoint);
      else if (await fileDigestAsync(source, signal) !== proof.sha256) throw invalid();
      if (await fileDigestAsync(target, signal) !== proof.sha256) throw invalid();
    }
    await syncDirectory(targetRoot);
  } catch { signal?.throwIfAborted(); throw invalid(); }
}

export async function verifyArchiveAssets(database: StateDatabase, expected?: ArchiveAssetProof[], signal?: AbortSignal,
  exactDirectory = false): Promise<ArchiveAssetProof[]> {
  try {
    const proofs = await archiveAssetProofsAsync(database, archiveDirectory(database.file), signal), root = archiveDirectory(database.file);
    if (expected !== undefined) {
      validateProofs(expected);
      if (expected.length !== proofs.length || proofs.some(proof => !expected.some(item => storageNameIdentity(item.name) === storageNameIdentity(proof.name) && item.sha256 === proof.sha256))) throw invalid();
    }
    if (proofs.length || await lstat(root).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; })) {
      await assertDirectory(root);
      const names = await readdir(root);
      if (new Set(names.map(storageNameIdentity)).size !== names.length
        || exactDirectory && names.some(name => !proofs.some(proof => storageNameIdentity(proof.name) === storageNameIdentity(name)))) throw invalid();
    }
    for (const proof of proofs) if (await fileDigestAsync(path.join(root, proof.name), signal) !== proof.sha256) throw invalid();
    return proofs;
  } catch { signal?.throwIfAborted(); throw invalid(); }
}

/** Preserve raw immutable assets for rollback even when the active database is damaged. */
export async function rawArchiveAssetProofs(root: string, signal?: AbortSignal): Promise<ArchiveAssetProof[]> {
  try {
    const present = await lstat(root).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
    if (!present) return [];
    await assertDirectory(root);
    const proofs: ArchiveAssetProof[] = [];
    for (const name of (await readdir(root)).sort()) {
      signal?.throwIfAborted();
      // Unpublished job stages/unknown files remain in place; they are never removed by restore.
      if (isArchiveAssetName(name)) proofs.push({ name, sha256: await fileDigestAsync(path.join(root, name), signal) });
    }
    validateProofs(proofs);
    return proofs;
  } catch { signal?.throwIfAborted(); throw invalid(); }
}

/** Safe cleanup of a private unpublished/completed backup directory, never a live root. */
export async function removeArchiveAssetDirectory(root: string): Promise<boolean> {
  try {
    const present = await lstat(root).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
    if (!present) return true;
    await assertDirectory(root);
    const names = await readdir(root);
    for (const name of names) {
      const stat = await lstat(path.join(root, name));
      if ((!isArchiveAssetName(name) && !TEMPORARY.test(storageNameIdentity(name))) || !stat.isFile() || stat.isSymbolicLink()) return false;
    }
    for (const name of names) await unlink(path.join(root, name));
    await rmdir(root);
    return true;
  } catch { return false; }
}

function validateProofs(proofs: ArchiveAssetProof[]): void {
  if (!Array.isArray(proofs) || new Set(proofs.map(proof => typeof proof?.name === 'string' ? storageNameIdentity(proof.name) : null)).size !== proofs.length
    || proofs.some(proof => !proof || typeof proof.name !== 'string' || !isArchiveAssetName(proof.name)
      || typeof proof.sha256 !== 'string' || !DIGEST.test(proof.sha256))) throw invalid();
}
function bindManifest(database: StateDatabase, archive: ConversationArchive, manifest: ColdArchiveManifest): void {
  if (manifest.installationId !== database.meta('installation_id') || manifest.channelId !== archive.channelId
    || manifest.messageCount !== archive.messageCount || manifest.messagesDigest !== archive.messagesDigest
    || manifest.createdAt !== archive.createdAt || manifest.sourceRevision !== archive.sourceRevision
    || manifest.channelRevision !== archive.channelRevision || manifest.originalStatus !== archive.originalStatus) throw invalid();
}

async function copyAsset(source: string, target: string, expected: string, signal?: AbortSignal,
  checkpoint?: () => void | Promise<void>): Promise<void> {
  const before = await lstat(source);
  if (!before.isFile() || before.isSymbolicLink()) throw invalid();
  const temporary = `${target}.${process.pid}.${randomUUID()}.unfinished`;
  let owned: { dev: number; ino: number } | undefined;
  const input = await open(source, 'r');
  try {
    const opened = await input.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw invalid();
    const output = await open(temporary, 'wx', 0o600);
    try {
      const created = await output.stat(); owned = { dev: created.dev, ino: created.ino };
      const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(128 * 1024);
      for (;;) {
        signal?.throwIfAborted();
        const { bytesRead } = await input.read(buffer);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead));
        for (let offset = 0; offset < bytesRead;) {
          signal?.throwIfAborted();
          const { bytesWritten } = await output.write(buffer, offset, bytesRead - offset);
          if (bytesWritten < 1) throw invalid(); offset += bytesWritten;
        }
        await checkpoint?.();
      }
      const after = await lstat(source);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || hash.digest('hex') !== expected) throw invalid();
      signal?.throwIfAborted(); await output.sync();
    } finally { await output.close(); }
    const publication = await lstat(temporary);
    if (!publication.isFile() || publication.isSymbolicLink() || publication.dev !== owned?.dev || publication.ino !== owned.ino
      || await fileDigestAsync(temporary, signal) !== expected) throw invalid();
    const verified = await lstat(temporary);
    if (verified.dev !== owned.dev || verified.ino !== owned.ino || verified.size !== publication.size
      || verified.mtimeMs !== publication.mtimeMs || verified.ctimeMs !== publication.ctimeMs) throw invalid();
    signal?.throwIfAborted(); await link(temporary, target); await syncDirectory(path.dirname(target));
  } finally {
    try { await input.close(); }
    finally {
      if (owned) {
        const current = await lstat(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
        if (current?.dev === owned.dev && current.ino === owned.ino) await unlink(temporary);
      }
    }
  }
}
async function assertDirectory(root: string): Promise<void> {
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalid();
}
function assertDirectorySync(root: string): void {
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw invalid();
}
