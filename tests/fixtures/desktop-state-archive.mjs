import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseChatStore } from '../../build/server/products/chat/state/databaseStore.js';
import { MetadataCommit } from '../../build/server/products/chat/state/database/metadataCommit.js';
import { ConversationDatabase } from '../../build/server/products/chat/state/database/conversationStore.js';
import { writeColdArchive } from '../../build/server/products/chat/state/database/coldArchive.js';
import { archiveDirectory } from '../../build/server/products/chat/state/database/archiveAssets.js';
import { databasePath, bytesDigest } from '../../build/server/products/chat/state/database/profileFormat.js';
import { openStateDatabase } from '../../build/server/platform/persistence/state-db/stateDatabase.js';
import { withProfileLock } from '../../build/server/platform/persistence/state-db/profileLock.js';
import { canonicalDigest } from '../../build/server/platform/persistence/state-db/canonicalJson.js';
import { snapshot } from './desktop-state-snapshot.mjs';

/** Private cold-state fixture. Production archive preparation/actions are a separate gate. */
export async function archivedProfile(t, basename = 'profile.json', customize) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats cold profile 資料 '));
  const file = path.join(root, 'platform', 'state', basename), stores = [];
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  const source = snapshot(), channel = source.chat.channels[0];
  channel.messages = Array.from({ length: 401 }, (_, i) => ({ ...channel.messages[0], id: `cold-${i}`,
    body: `冷資料 ${i} archiveuniqueterm 🐈\u0000`, metadata: { opaque: JSON.parse('{"__proto__":{"keep":true},"rich":[1,"雪",null]}') } }));
  customize?.(source);
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(source));
  const create = () => { const store = new DatabaseChatStore(file); stores.push(store); return store; };
  const store = create(); await store.initialize();
  const chat = await store.read(), core = await store.readCore(); await store.close();
  const target = chat.channels[0], siblingId = chat.channels[1].id;
  const archiveId = randomUUID(), rootAssets = archiveDirectory(databasePath(file));
  await mkdir(rootAssets, { mode: 0o700 });
  let result;
  await withProfileLock(file, async () => {
    const database = openStateDatabase({ file: databasePath(file), mode: 'writer' });
    try {
      const metadata = new MetadataCommit(file, database), envelope = await metadata.readCommitted();
      const row = database.get('select position, order_revision, content_revision from channels where id = ?', target.id);
      const { messages, ...header } = target;
      result = writeColdArchive(rootAssets, { header: { kind: 'header', format: 1, archiveId,
        installationId: envelope.storage.installationId, channelId: target.id,
        createdAt: '2026-11-12T00:00:00.000Z', sourceRevision: envelope.storage.revision,
        channelRevision: row.content_revision, orderRevision: String(row.order_revision), messageCount: messages.length, channel: header },
      contexts: [{ family: 'chat.parallelChatGroups', value: chat.parallelChatGroups[0] },
        { family: 'core.ownerProfile', value: core.ownerProfile }], messages });
      const previous = bytesDigest(await readFile(file));
      database.transaction(() => {
        new ConversationDatabase(database).putChannel({ ...target, status: 'archived', messages: [] }, Number(row.position));
        database.run(`insert into conversation_archives(archive_id, channel_id, state, manifest_digest, messages_digest,
          message_count, created_at, original_status, source_revision, channel_revision) values (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
        archiveId, target.id, result.manifestDigest, canonicalDigest(messages), messages.length,
        '2026-11-12T00:00:00.000Z', target.status, envelope.storage.revision, row.content_revision);
        envelope.storage.revision = randomUUID(); metadata.stage(envelope, previous);
      }, { durable: true });
      await metadata.recover();
    } finally { database.close(); }
  });
  const expected = { ...chat, channels: chat.channels.map(item => item.id === target.id ? { ...item, status: 'archived' } : item) };
  return { root, file, create, chat: expected, core, channelId: target.id, siblingId, archiveId,
    assets: rootAssets, manifest: result.manifest, manifestDigest: result.manifestDigest };
}
