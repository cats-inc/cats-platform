import { isDirectCliEntrypoint } from '../../../../shared/cliEntrypoint.js';
import { lstatSync, readFileSync } from 'node:fs';
import { link, lstat, mkdir, readdir, rmdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { assertNoLiveConversationOperations } from './conversationOperations.js';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { withProfileLock } from '../../../../platform/persistence/state-db/profileLock.js';
import { openStateDatabase, type StateDatabase } from '../../../../platform/persistence/state-db/stateDatabase.js';
import { STATE_SCHEMA_VERSION } from '../../../../platform/persistence/state-db/stateSchema.js';
import { syncDirectory, writeDurableFile } from '../../../../platform/persistence/state-db/atomicFile.js';
import { fileDigest, fileDigestAsync } from '../../../../platform/persistence/state-db/fileDigest.js';
import { CanonicalArrayDigest } from '../../../../platform/persistence/state-db/canonicalJson.js';
import { conversationTerm, indexText, INDEX_FORM } from '../../../../platform/persistence/state-db/searchText.js';
import type { StateMaintenanceJob } from '../../../../platform/persistence/state-db/stateMaintenance.js';
import type { ChatChannelState, ChatMessage } from '../../api/contracts.js';
import { MetadataCommit } from './metadataCommit.js';
import { writeColdArchive, readColdArchiveManifest, type ColdArchiveContext } from './coldArchive.js';
import { archiveDirectory, conversationArchive, openConversationArchive } from './archiveAssets.js';
import { createProfileLease, profileLeaseAlive, type ProfileLease } from './profileLease.js';
import { bytesDigest, databasePath, envelopeCore, parseEnvelope, readOptionalFile, storageNameIdentity } from './profileFormat.js';
import { archiveJobDirectory, archiveJobLock, assertArchiveIdle, assertArchiveJob, ConversationArchiveError,
  jobFromRow, validateArchiveJob, validatePreparedArchive, type ArchiveWorkerPayload,
  type ConversationArchiveJob, type PreparedConversationArchive } from './archiveJobs.js';
import { buildChatConversationId } from '../../../../shared/chatCoreIds.js';
import type { ArchivePageRequest, ArchivePageResult } from './archiveRead.js';
import { prepareArchivePlacements } from './archivePlacement.js';

const samePath = (a: string, b: string) => storageNameIdentity(path.resolve(a)) === storageNameIdentity(path.resolve(b));
const changed = () => new ConversationArchiveError('archive_changed');
let observe = false;
async function checkpoint(phase: string): Promise<void> {
  if (!observe) return;
  await report(phase);
}
async function report(value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const listener = (message: unknown) => {
      if ((message as { type?: unknown })?.type === 'continue') { process.removeListener('message', listener); resolve(); }
    };
    process.on('message', listener);
    process.send?.({ progress: value }, error => {
      if (error) { process.removeListener('message', listener); reject(new ConversationArchiveError('archive_failed')); }
    });
  });
}
function sameProof(stat: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number },
  proof: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }): boolean {
  return stat.dev === proof.dev && stat.ino === proof.ino && stat.size === proof.size
    && stat.mtimeMs === proof.mtimeMs && stat.ctimeMs === proof.ctimeMs;
}

function sourceEnvelope(profile: string, database: StateDatabase) {
  if (database.get('select revision from metadata_handoff where singleton = 1')) throw changed();
  const stat = lstatSync(profile);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new ConversationArchiveError('archive_invalid');
  const bytes = readFileSync(profile), envelope = parseEnvelope(bytes.toString('utf8'), profile);
  if (database.meta('installation_id') !== envelope.storage.installationId || database.meta('revision') !== envelope.storage.revision
    || database.meta('metadata_digest') !== bytesDigest(bytes)) throw changed();
  return envelope;
}
function* hotMessages(database: StateDatabase, channelId: string): Generator<ChatMessage> {
  for (let after = -1; ;) {
    const rows = database.all('select position, json from messages where channel_id = ? and position > ? order by position limit 200', channelId, after);
    if (!rows.length) return;
    for (const row of rows) yield JSON.parse(String(row.json)) as ChatMessage;
    after = Number(rows.at(-1)!.position);
  }
}
function* contexts(database: StateDatabase, envelope: ReturnType<typeof sourceEnvelope>, job: ConversationArchiveJob): Generator<ColdArchiveContext> {
  const conversationId = buildChatConversationId(job.channelId);
  for (const row of database.all('select json from parallel_groups order by position')) {
    const group = JSON.parse(String(row.json));
    if (group.memberChannelIds?.includes(job.channelId)) yield { family: 'chat.parallelChatGroups', value: group };
  }
  // Core remains complete in the current JSON envelope. These records retain the
  // directly related source context; unarchive never overwrites newer Core with it.
  for (const [family, values] of Object.entries(envelopeCore(envelope))) if (Array.isArray(values)) {
    for (const value of values) if (value && typeof value === 'object'
      && (value.conversationId === conversationId || value.sourceConversationId === conversationId
        || value.channelId === job.channelId || value.sourceChannelId === job.channelId
        || value.metadata?.channelId === job.channelId)) yield { family: `core.${family}`, value };
  }
}

async function readPage(request: ArchivePageRequest): Promise<ArchivePageResult> {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 200
    || !Number.isSafeInteger(request.before) || request.before < 0) throw new ConversationArchiveError('archive_invalid');
  const database = openStateDatabase({ file: databasePath(request.profile), mode: 'reader' });
  try {
    const archive = conversationArchive(database, request.channelId);
    const row = database.get('select order_revision from channels where id = ?', request.channelId);
    if (!archive || archive.archiveId !== request.archiveId || archive.manifestDigest !== request.manifestDigest
      || String(row?.order_revision) !== request.orderRevision) throw changed();
    const reader = openConversationArchive(database, archive);
    try {
      await checkpoint('read_opened');
      const placements = request.basis?.length ? prepareArchivePlacements(reader.messages(), request.basis) : [];
      return { ...reader.readPage(request.limit, request.before), placements };
    } finally { reader.close(); }
  } finally { database.close(); }
}
async function assertDirectory(directory: string): Promise<void> {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ConversationArchiveError('archive_invalid');
}
async function openWriter(profile: string, acquireLock = false, timeoutMs?: number): Promise<StateDatabase> {
  if (acquireLock) return withProfileLock(profile, () => openWriter(profile), { timeoutMs });
  const reader = openStateDatabase({ file: databasePath(profile), mode: 'reader' });
  let admission;
  try {
    if (Number(reader.meta('schema_version')) !== STATE_SCHEMA_VERSION) throw new ConversationArchiveError('archive_invalid');
    const envelope = await new MetadataCommit(profile, reader).readCommitted();
    admission = { schemaVersion: STATE_SCHEMA_VERSION, installationId: envelope.storage.installationId,
      revision: envelope.storage.revision, metadataDigest: reader.meta('metadata_digest')! };
  } finally { reader.close(); }
  return openStateDatabase({ file: databasePath(profile), mode: 'writer', upgradeAdmission: admission });
}
async function prepare(profile: string, job: ConversationArchiveJob): Promise<void> {
  if (!await profileLeaseAlive(profile, job.leaseToken)) throw changed();
  const file = databasePath(profile), directory = archiveJobDirectory(file, job.token);
  await withProfileLock(archiveJobLock(file, job.token), async () => {
    await assertDirectory(archiveDirectory(file));
    await mkdir(directory, { mode: 0o700 });
    await writeDurableFile(path.join(directory, 'job.json'), `${JSON.stringify(job)}\n`);
    let result: PreparedConversationArchive;
    let preparedMarker: string | undefined;
    if (job.kind === 'archive') {
      const database = openStateDatabase({ file, mode: 'reader' });
      try {
        await assertNoLiveConversationOperations(profile, database, job.channelId, false);
        let captured: PreparedConversationArchive | undefined;
        for (let attempt = 0; attempt < 20; attempt++) {
          try {
            captured = database.snapshot(() => {
              assertArchiveJob(database, job);
              const envelope = sourceEnvelope(profile, database);
              const row = database.get('select json, message_count, order_revision from channels where id = ?', job.channelId)!;
              const channel = JSON.parse(String(row.json)) as Omit<ChatChannelState, 'messages'>;
              assertArchiveIdle(channel, envelopeCore(envelope));
              const written = writeColdArchive(directory, { header: { kind: 'header', format: 1,
                archiveId: job.archiveId, installationId: envelope.storage.installationId, channelId: job.channelId,
                createdAt: job.createdAt, sourceRevision: envelope.storage.revision, channelRevision: job.channelRevision,
                orderRevision: String(row.order_revision), messageCount: Number(row.message_count), channel },
              contexts: contexts(database, envelope, job), messages: hotMessages(database, job.channelId) });
              return { format: 1, token: job.token, channelId: job.channelId, archiveId: job.archiveId, kind: job.kind,
                manifestDigest: written.manifestDigest, messagesDigest: written.manifest.messagesDigest,
                messageCount: written.manifest.messageCount, sourceRevision: written.manifest.sourceRevision,
                originalStatus: written.manifest.originalStatus, createdAt: written.manifest.createdAt, files: [] };
            });
            break;
          } catch (error) {
            if (!(error instanceof ConversationArchiveError) || error.code !== 'archive_changed' || attempt === 19) throw error;
            await delay(5);
          }
        }
        if (!captured) throw changed(); result = captured;
      } finally { database.close(); }
    } else {
      const database = await openWriter(profile, true);
      try {
        assertArchiveJob(database, job);
        const archive = conversationArchive(database, job.channelId);
        if (!archive || archive.archiveId !== job.archiveId) throw changed();
        if (database.meta('index_form') !== String(INDEX_FORM) || database.meta('index_unicode') !== (process.versions.unicode ?? 'unknown')) throw changed();
        const reader = openConversationArchive(database, archive);
        try {
          let position = 0, batch: Array<{ message: ChatMessage; position: number }> = [];
          const flush = () => database.transaction(() => {
            assertArchiveJob(database, job);
            for (const { message, position } of batch) database.run(`insert into conversation_archive_stage
              (token, channel_id, message_id, position, created_at, json, terms) values (?, ?, ?, ?, ?, ?, ?)`,
            job.token, job.channelId, message.id, position, message.createdAt, JSON.stringify(message),
            `${indexText(message.body)} ${conversationTerm(job.channelId)}`);
          });
          for (const message of reader.messages()) {
            batch.push({ message, position: position++ });
            if (batch.length === 200) { flush(); batch = []; await checkpoint('restore_staged_batch'); await delay(0); }
          }
          if (batch.length) flush();
          if (position !== archive.messageCount) throw new ConversationArchiveError('archive_invalid');
          preparedMarker = randomUUID();
          database.transaction(() => {
            assertArchiveJob(database, job);
            database.run('update conversation_archive_jobs set prepared_digest = ? where token = ?', preparedMarker!, job.token);
          });
          // Read back the staged bytes and derived terms before they can replace
          // cold storage. Later edits invalidate the marker through SQL triggers.
          database.snapshot(() => {
            const hash = new CanonicalArrayDigest(); let count = 0;
            for (let after = -1; ;) {
              const rows = database.all('select * from conversation_archive_stage where token = ? and position > ? order by position limit 200', job.token, after);
              if (!rows.length) break;
              for (const row of rows) {
                const message = JSON.parse(String(row.json)) as ChatMessage;
                if (row.position !== count++ || row.channel_id !== job.channelId || message.channelId !== job.channelId
                  || message.id !== row.message_id || message.createdAt !== row.created_at
                  || row.terms !== `${indexText(message.body)} ${conversationTerm(job.channelId)}`) throw new ConversationArchiveError('archive_invalid');
                hash.add(message);
              }
              after = Number(rows.at(-1)!.position);
            }
            if (count !== archive.messageCount || hash.digest() !== archive.messagesDigest) throw new ConversationArchiveError('archive_invalid');
          });
          result = { format: 1, token: job.token, channelId: job.channelId, archiveId: job.archiveId, kind: job.kind,
            manifestDigest: archive.manifestDigest, messagesDigest: archive.messagesDigest, messageCount: archive.messageCount,
            sourceRevision: archive.sourceRevision, originalStatus: archive.originalStatus, createdAt: archive.createdAt, files: [] };
        } finally { reader.close(); }
      } finally { database.close(); }
    }
    const source = job.kind === 'archive' ? directory : archiveDirectory(file);
    const manifest = readColdArchiveManifest(source, job.archiveId, result.manifestDigest);
    for (const [name, sha256] of [[manifest.file, manifest.sha256], [`${job.archiveId}.manifest.json`, result.manifestDigest]]) {
      const target = path.join(source, name!), before = await lstat(target);
      if (await fileDigestAsync(target) !== sha256) throw changed();
      const after = await lstat(target);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw changed();
      result.files.push({ name: name!, sha256: sha256!, dev: after.dev, ino: after.ino, size: after.size,
        mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs });
    }
    // Keep a recovery intent before publishing any unreferenced cold file. The
    // parent still owns all hot history until the later compare-and-switch.
    if (job.kind === 'archive') {
      await writeDurableFile(path.join(directory, 'prepared.json'), `${JSON.stringify(result)}\n`);
      await publishArchiveFiles(file, job, result);
    }
    const bytes = `${JSON.stringify(result)}\n`;
    await writeDurableFile(path.join(directory, 'prepared.json'), bytes);
    const database = await openWriter(profile, true);
    try {
      database.transaction(() => {
        const current = assertArchiveJob(database, job);
        if (preparedMarker !== undefined && current.prepared_digest !== preparedMarker) throw changed();
        database.run('update conversation_archive_jobs set prepared_digest = ? where token = ?', bytesDigest(bytes), job.token);
      }, { durable: true });
    } finally { database.close(); }
  });
}

async function publishArchiveFiles(file: string, job: ConversationArchiveJob, prepared: PreparedConversationArchive): Promise<void> {
  const directory = archiveJobDirectory(file, job.token), root = archiveDirectory(file);
  for (const proof of prepared.files) {
    const source = path.join(directory, proof.name), destination = path.join(root, proof.name);
    const payload = proof.name.endsWith('.jsonl.gz');
    await checkpoint(payload ? 'archive_before_publish_payload' : 'archive_before_publish_manifest');
    const before = await lstat(source);
    if (!before.isFile() || before.isSymbolicLink() || !sameProof(before, proof)) throw changed();
    try { await link(source, destination); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || fileDigest(destination) !== proof.sha256) throw error; }
    await checkpoint(payload ? 'archive_payload_linked' : 'archive_manifest_linked');
    const linked = await lstat(destination);
    if (!linked.isFile() || linked.isSymbolicLink() || linked.dev !== proof.dev || linked.ino !== proof.ino
      || linked.size !== proof.size || linked.mtimeMs !== proof.mtimeMs || fileDigest(destination) !== proof.sha256) throw changed();
    const verified = await lstat(destination), staged = await lstat(source);
    if (!sameProof(linked, verified) || !sameProof(staged, verified)) throw changed();
    await unlink(source);
    const published = await lstat(destination);
    if (published.dev !== verified.dev || published.ino !== verified.ino || published.size !== verified.size
      || published.mtimeMs !== verified.mtimeMs) throw changed();
    // Unlinking the private hardlink changes ctime. Final CAS admits the published
    // inode after this operation, while all expensive proofs are outside the serving lock.
    Object.assign(proof, { ctimeMs: published.ctimeMs });
  }
  await syncDirectory(directory); await syncDirectory(root); await syncDirectory(path.dirname(file));
}

async function commit(profile: string, payload: Extract<ArchiveWorkerPayload, { phase: 'commit' }>): Promise<void> {
  const { job } = payload, file = databasePath(profile), directory = archiveJobDirectory(file, job.token);
  await withProfileLock(archiveJobLock(file, job.token), async () => {
    if (!await profileLeaseAlive(profile, job.leaseToken)) throw changed();
    const bytes = await readOptionalFile(path.join(directory, 'prepared.json'));
    if (!bytes || bytes.length > 64 * 1024 || bytesDigest(bytes) !== payload.preparedDigest) throw changed();
    const prepared = validatePreparedArchive(JSON.parse(bytes.toString('utf8')), job);
    const database = await openWriter(profile);
    try {
      const metadata = new MetadataCommit(profile, database), current = await metadata.readCommitted();
      const next = parseEnvelope(payload.envelope, profile);
      if (bytesDigest((await readOptionalFile(profile))!) !== payload.previousDigest || database.meta('metadata_digest') !== payload.previousDigest
        || next.storage.installationId !== current.storage.installationId || next.storage.revision === current.storage.revision) throw changed();
      const row = assertArchiveJob(database, job);
      if (row.prepared_digest !== payload.preparedDigest) throw changed();
      const channelRow = database.get('select json, position, order_revision from channels where id = ?', job.channelId)!;
      const channel = JSON.parse(String(channelRow.json)) as ChatChannelState;
      await checkpoint('archive_before_operation_admission');
      await assertNoLiveConversationOperations(profile, database, job.channelId);
      assertArchiveIdle(channel, envelopeCore(current));
      for (const proof of prepared.files) {
        const stat = await lstat(path.join(archiveDirectory(file), proof.name));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== proof.dev || stat.ino !== proof.ino
          || stat.size !== proof.size || stat.mtimeMs !== proof.mtimeMs || stat.ctimeMs !== proof.ctimeMs) throw changed();
      }
      database.transaction(() => {
        if (assertArchiveJob(database, job).prepared_digest !== payload.preparedDigest) throw changed();
        // Remove the reservation before bulk rows change: guard triggers protect
        // preparation, and the final transaction already owns the profile lock.
        database.run('delete from conversation_archive_jobs where token = ?', job.token);
        if (job.kind === 'archive') {
          if (conversationArchive(database, job.channelId)) throw changed();
          database.run('delete from message_search where rowid in (select id from messages where channel_id = ?)', job.channelId);
          database.run('delete from messages where channel_id = ?', job.channelId);
          database.run(`insert into conversation_archives(archive_id, channel_id, state, manifest_digest, messages_digest,
            message_count, created_at, original_status, source_revision, channel_revision) values (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
          job.archiveId, job.channelId, prepared.manifestDigest, prepared.messagesDigest, prepared.messageCount,
          prepared.createdAt, prepared.originalStatus, prepared.sourceRevision, job.channelRevision);
          channel.status = 'archived';
        } else {
          if (database.meta('index_form') !== String(INDEX_FORM) || database.meta('index_unicode') !== (process.versions.unicode ?? 'unknown')) throw changed();
          const archive = conversationArchive(database, job.channelId);
          if (!archive || archive.archiveId !== job.archiveId || archive.manifestDigest !== prepared.manifestDigest
            || Number(database.get('select count(*) as n from conversation_archive_stage where token = ?', job.token)!.n) !== prepared.messageCount
            || database.get('select id from messages where channel_id = ? limit 1', job.channelId)) throw changed();
          database.run(`insert into messages(channel_id, message_id, position, created_at, json)
            select channel_id, message_id, position, created_at, json from conversation_archive_stage where token = ? order by position`, job.token);
          database.run(`insert into message_search(rowid, terms) select m.id, s.terms from conversation_archive_stage s
            join messages m on m.channel_id = s.channel_id and m.message_id = s.message_id where s.token = ? order by s.position`, job.token);
          database.run("update conversation_archives set state = 'delete_pending' where archive_id = ?", job.archiveId);
          channel.status = prepared.originalStatus === 'archived' ? 'active' : prepared.originalStatus as ChatChannelState['status'];
        }
        channel.updatedAt = new Date().toISOString();
        database.run('update channels set json = ?, message_count = ?, order_revision = order_revision + 1, content_revision = ? where id = ?',
          JSON.stringify(channel), job.kind === 'archive' ? 0 : prepared.messageCount, randomUUID(), job.channelId);
        database.run('update channel_catalog set updated_at = ? where channel_id = ?', channel.updatedAt, job.channelId);
        database.setMeta(`channel_history:${job.channelId}`, randomUUID());
        // The unchanged transcript keeps its compact choice fact. Presentation
        // hides archived channels and restores this same fact on unarchive.
        metadata.stage(next, payload.previousDigest);
      }, { durable: true });
      await checkpoint('archive_database_committed');
    } finally { database.close(); }
  });
}

async function removeStage(file: string, job: ConversationArchiveJob): Promise<void> {
  const directory = archiveJobDirectory(file, job.token);
  const present = await lstat(directory).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
  if (!present) return;
  await assertDirectory(directory);
  const names = await readdir(directory);
  const allowed = new RegExp(`^(?:job\\.json|prepared\\.json|${job.archiveId}\\.(?:jsonl\\.gz|manifest\\.json))(?:\\.[0-9]+\\.[a-f0-9-]{36}\\.unfinished)?$`, 'u');
  for (const name of names) {
    const stat = await lstat(path.join(directory, name));
    if (!allowed.test(storageNameIdentity(name)) || !stat.isFile() || stat.isSymbolicLink()) return;
  }
  for (const name of names.filter(name => storageNameIdentity(name) !== 'job.json')) await unlink(path.join(directory, name));
  if (names.some(name => storageNameIdentity(name) === 'job.json')) await unlink(path.join(directory, 'job.json'));
  await rmdir(directory); await syncDirectory(archiveDirectory(file));
}

async function cleanup(profile: string, forced?: ConversationArchiveJob): Promise<void> {
  const file = databasePath(profile), root = archiveDirectory(file);
  const reader = openStateDatabase({ file, mode: 'reader' });
  const jobs = reader.all('select * from conversation_archive_jobs').map(jobFromRow); reader.close();
  if (forced && !jobs.some(job => job.token === forced.token)) jobs.push(forced);
  const present = await lstat(root).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
  if (!present) return;
  await assertDirectory(root);
  for (const name of await readdir(root)) if (/^\.unfinished-[a-f0-9-]{36}$/u.test(name)) {
    const stat = await lstat(path.join(root, name));
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    const bytes = await readOptionalFile(path.join(root, name, 'job.json'));
    if (bytes && bytes.length <= 16 * 1024) {
      const job = validateArchiveJob(JSON.parse(bytes.toString('utf8')));
      if (name === `.unfinished-${job.token}` && !jobs.some(candidate => candidate.token === job.token)) jobs.push(job);
    }
  }
  for (const job of jobs) {
    try {
      await withProfileLock(archiveJobLock(file, job.token), async () => {
        const database = await openWriter(profile, true, 0);
        try {
          const mayClean = await withProfileLock(profile, async () => {
            const row = database.get('select * from conversation_archive_jobs where token = ?', job.token);
            if (row && !(forced?.token === job.token && forced.leaseToken === job.leaseToken)
              && await profileLeaseAlive(profile, job.leaseToken)) return false;
            database.transaction(() => database.run('delete from conversation_archive_jobs where token = ?', job.token), { durable: true });
            return true;
          }, { timeoutMs: 0 });
          if (!mayClean) return;
          // Staging is operational and unreferenced after the reservation is gone.
          for (;;) {
            const rows = database.all('select position from conversation_archive_stage where token = ? limit 200', job.token);
            if (!rows.length) break;
            database.transaction(() => { for (const row of rows) database.run('delete from conversation_archive_stage where token = ? and position = ?', job.token, row.position!); });
            await delay(0);
          }
          if (job.kind === 'archive' && !database.get('select archive_id from conversation_archives where archive_id = ?', job.archiveId)) {
            const preparedBytes = await readOptionalFile(path.join(archiveJobDirectory(file, job.token), 'prepared.json'));
            if (preparedBytes && preparedBytes.length <= 64 * 1024) {
              const prepared = validatePreparedArchive(JSON.parse(preparedBytes.toString('utf8')), job);
              for (const asset of prepared.files) {
                const target = path.join(root, asset.name), digest = asset.sha256;
                const exists = await lstat(target).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
                if (exists) {
                  if (await fileDigestAsync(target) !== digest) throw new ConversationArchiveError('archive_invalid');
                  await checkpoint('cleanup_uncommitted_hashed');
                  const proof = await lstat(target);
                  if (!sameProof(exists, proof)) throw changed();
                  await withProfileLock(profile, async () => {
                    const current = await lstat(target);
                  if (!database.get('select archive_id from conversation_archives where archive_id = ?', job.archiveId)
                    && current.dev === proof.dev && current.ino === proof.ino && current.size === proof.size
                    && current.mtimeMs === proof.mtimeMs && current.ctimeMs === proof.ctimeMs) await unlink(target);
                  }, { timeoutMs: 0 });
                }
              }
            }
          }
          await removeStage(file, job);
        } finally { database.close(); }
      }, { timeoutMs: 0 });
    } catch (error) { if ((error as { code?: string }).code !== 'profile_lock_timeout') throw error; }
  }
  const database = await openWriter(profile, true, 0);
  try {
    for (const row of database.all("select archive_id, manifest_digest from conversation_archives where state = 'delete_pending'")) {
      const id = String(row.archive_id);
      if (!/^[a-f0-9-]{36}$/u.test(id) || database.get('select token from conversation_archive_jobs where archive_id = ?', id)) continue;
      const manifestFile = path.join(root, `${id}.manifest.json`);
      const manifestBytes = await readOptionalFile(manifestFile);
      if (!manifestBytes) {
        const payload = await lstat(path.join(root, `${id}.jsonl.gz`)).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
        if (payload) throw new ConversationArchiveError('archive_invalid');
        await withProfileLock(profile, async () => database.transaction(() => {
          if (!database.get('select token from conversation_archive_jobs where archive_id = ?', id)) {
            database.run("delete from conversation_archives where archive_id = ? and state = 'delete_pending'", id);
          }
        }, { durable: true }), { timeoutMs: 0 });
        continue;
      }
      const manifest = readColdArchiveManifest(root, id, String(row.manifest_digest));
      const proofs = [[manifest.file, manifest.sha256], [`${id}.manifest.json`, String(row.manifest_digest)]];
      for (const [name, digest] of proofs) {
        const target = path.join(root, name!);
        const exists = await lstat(target).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
        if (!exists) continue;
        if (await fileDigestAsync(target) !== digest) throw new ConversationArchiveError('archive_invalid');
        await checkpoint('cleanup_pending_hashed');
        const proof = await lstat(target);
        if (!sameProof(exists, proof)) throw changed();
        await withProfileLock(profile, async () => {
          if (database.get('select token from conversation_archive_jobs where archive_id = ?', id)
            || database.get("select archive_id from conversation_archives where archive_id = ? and state = 'active'", id)) throw changed();
          const current = await lstat(target);
          if (current.dev !== proof.dev || current.ino !== proof.ino || current.size !== proof.size
            || current.mtimeMs !== proof.mtimeMs || current.ctimeMs !== proof.ctimeMs) throw changed();
          await unlink(target); await syncDirectory(root);
        }, { timeoutMs: 0 });
      }
      await withProfileLock(profile, async () => database.transaction(() => {
        database.run("delete from conversation_archives where archive_id = ? and state = 'delete_pending'", id);
      }, { durable: true }), { timeoutMs: 0 });
    }
  } finally { database.close(); }
}

if (isDirectCliEntrypoint(import.meta.url, process.argv[1])) {
  process.on('disconnect', () => process.exit(1));
  process.once('message', async (input: unknown) => {
    let response: { ok: boolean; code?: string; productCode?: string };
    let releaseLease: ProfileLease | undefined;
    try {
      const request = input as StateMaintenanceJob;
      if (request?.kind !== 'product') throw new ConversationArchiveError('archive_invalid');
      const payload = request.payload as ArchiveWorkerPayload;
      if (!payload || typeof payload.profile !== 'string' || !samePath(request.file, databasePath(payload.profile))) throw new ConversationArchiveError('archive_invalid');
      observe = payload.observe === true;
      const parentToken = payload.phase === 'cleanup' || payload.phase === 'read' ? payload.ownerLeaseToken : validateArchiveJob(payload.job).leaseToken;
      const admit = async () => {
        if (!await profileLeaseAlive(payload.profile, parentToken)) throw changed();
        return createProfileLease(payload.profile, undefined, parentToken);
      };
      // The commit caller already owns the global lock. Other phases acquire it
      // briefly so offline replacement sees this native connection even if its
      // service dies just before the independent reaper terminates it.
      releaseLease = payload.phase === 'commit' ? await admit()
        : await withProfileLock(payload.profile, admit, { timeoutMs: payload.phase === 'cleanup' ? 0 : undefined });
      if (payload.phase === 'cleanup') await cleanup(payload.profile, payload.job ? validateArchiveJob(payload.job) : undefined);
      else if (payload.phase === 'read') { await checkpoint('read_started'); await report({ page: await readPage(payload) }); }
      else {
        const job = validateArchiveJob(payload.job);
        if (payload.phase === 'prepare') await prepare(payload.profile, job);
        else if (payload.phase === 'commit') await commit(payload.profile, { ...payload, job });
        else throw new ConversationArchiveError('archive_invalid');
      }
      response = { ok: true };
    } catch (error) {
      response = { ok: false, code: 'worker_failed', productCode: error instanceof ConversationArchiveError ? error.code : 'archive_failed' };
    }
    finally { if (releaseLease) await releaseLease().catch(() => {}); }
    process.send?.(response, () => process.exit(response.ok ? 0 : 1));
  });
}
