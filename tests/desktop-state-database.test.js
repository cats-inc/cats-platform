import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  existingDatabaseUri, openStateDatabase, StateDatabaseError,
  checkDatabaseFile, snapshotDatabaseFile,
} from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { sqliteDriver } from '../build/server/platform/persistence/state-db/sqliteDriver.js';
import { STATE_APPLICATION_ID } from '../build/server/platform/persistence/state-db/stateSchema.js';
import { buildSearchQuery, conversationTerm, indexText } from '../build/server/platform/persistence/state-db/searchText.js';
import { ConversationDatabase, MessageCursorExpiredError } from '../build/server/products/chat/state/database/conversationStore.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel } from '../build/server/products/chat/state/model/index.js';

async function fresh(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-desktop-資料庫 '));
  const file = path.join(dir, 'state.sqlite');
  const location = { dir, file, beforeCleanup: () => {} };
  t.after(() => { location.beforeCleanup(); return rm(dir, { recursive: true, force: true, maxRetries: 10 }); });
  return location;
}

async function writer(t) {
  const location = await fresh(t);
  const database = openStateDatabase({ file: location.file, mode: 'writer' });
  location.beforeCleanup = () => database.close();
  return { ...location, database, store: new ConversationDatabase(database) };
}

function channel(id, texts = ['first', 'second']) {
  const state = createChannel(createDefaultChatState(), {
    originSurface: 'chat', title: id, topic: 'Isolated test', cats: [],
  });
  return { ...state.channels.find(item => item.id === state.selectedChannelId), id,
    messages: texts.map((body, position) => ({
      id: `${id}-${position}`, channelId: id, senderKind: 'user', senderName: 'Owner',
      body, mentions: [], metadata: { opaque: { nested: ['kept', '\u0000'] } }, usage: null,
      createdAt: new Date(1700000000000 + position * 1000).toISOString(),
    })) };
}

test('driver accepts FTS5 contentless deletion, WAL, big integers, and Unicode paths', async t => {
  const { file } = await fresh(t);
  const { DatabaseSync } = sqliteDriver();
  const db = new DatabaseSync(file);
  try {
    assert.equal(db.prepare('pragma journal_mode=wal').get().journal_mode, 'wal');
    db.exec("create virtual table terms using fts5(body, content='', contentless_delete=1)");
    db.prepare('insert into terms(rowid, body) values (?, ?)').run(1, 'hello');
    assert.equal(db.prepare("select count(*) as n from terms where terms match 'hello'").get().n, 1);
    db.prepare('delete from terms where rowid = ?').run(1);
    assert.equal(db.prepare("select count(*) as n from terms where terms match 'hello'").get().n, 0);
    const statement = db.prepare('select 9223372036854775807 as n');
    statement.setReadBigInts(true);
    assert.equal(statement.get().n, 9223372036854775807n);
    db.exec('begin immediate');
    assert.equal(db.isTransaction, true);
    db.exec('rollback');
    assert.equal(db.isTransaction, false);
  } finally { db.close(); }
});

test('reader never creates a missing database', async t => {
  const { dir, file } = await fresh(t);
  assert.throws(() => openStateDatabase({ file, mode: 'reader' }), { code: 'missing' });
  assert.deepEqual(await readdir(dir), []);
});

test('adapter refuses foreign and newer databases without changing their bytes', async t => {
  const { file } = await fresh(t);
  const raw = new (sqliteDriver().DatabaseSync)(file);
  raw.exec('create table foreign_record(id text)');
  raw.close();
  const digest = async () => createHash('sha256').update(await readFile(file)).digest('hex');
  const before = await digest();
  for (const mode of ['reader', 'writer']) {
    assert.throws(() => openStateDatabase({ file, mode }), { code: 'not_a_platform_database' });
    assert.equal(await digest(), before);
  }
  const newer = path.join(path.dirname(file), 'newer.sqlite');
  const db = openStateDatabase({ file: newer, mode: 'writer' });
  db.setMeta('schema_version', '999'); db.close();
  const nextBefore = await readFile(newer);
  assert.throws(() => openStateDatabase({ file: newer, mode: 'writer' }), { code: 'newer_schema' });
  assert.deepEqual(await readFile(newer), nextBefore);
});

test('malformed database is refused rather than reset', async t => {
  const { file } = await fresh(t);
  const bytes = Buffer.from('damaged user data; do not replace');
  await writeFile(file, bytes);
  assert.throws(() => openStateDatabase({ file, mode: 'writer' }), StateDatabaseError);
  assert.deepEqual(await readFile(file), bytes);
  assert.ok(checkDatabaseFile(file).length);
});

test('adapter makes durable transactions atomic and taints failed nested writes', async t => {
  const { database } = await writer(t);
  assert.throws(() => database.transaction(() => {
    database.setMeta('lost', 'yes'); throw new Error('abort');
  }, { durable: true }), /abort/);
  assert.equal(database.meta('lost'), undefined);
  assert.throws(() => database.transaction(() => {
    try { database.transaction(() => { database.setMeta('nested', 'no'); throw new Error('nested abort'); }); }
    catch { /* The outer transaction is poisoned even when work catches this. */ }
    database.setMeta('outer', 'no');
  }));
  assert.equal(database.meta('nested'), undefined);
  assert.equal(database.meta('outer'), undefined);
  database.transaction(() => database.setMeta('kept', 'yes'), { durable: true });
  assert.equal(database.meta('kept'), 'yes');
});

test('reader and snapshot reject writes hidden behind query methods', async t => {
  const { file, database } = await writer(t);
  const reader = openStateDatabase({ file, mode: 'reader' });
  try {
    assert.throws(() => reader.setMeta('bad', 'x'), { code: 'read_only' });
    assert.throws(() => reader.get("delete from meta returning key"));
    assert.throws(() => database.get("with value as (select 1) delete from meta returning key"));
    assert.throws(() => database.snapshot(() => database.setMeta('bad', 'x')));
    assert.throws(() => database.get('pragma wal_checkpoint'));
    assert.throws(() => database.all('select 1; delete from meta'));
    assert.equal(database.meta('bad'), undefined);
  } finally { reader.close(); }
});

test('adapter rejects asynchronous transaction callbacks before a durable commit', async t => {
  const { database } = await writer(t);
  assert.throws(() => database.transaction(() => {
    database.setMeta('async', 'no'); return Promise.resolve('illegal');
  }), /synchronous/);
  assert.equal(database.meta('async'), undefined);
});

test('database and JSON entity records round-trip NUL and unknown nested metadata', async t => {
  const { store, database } = await writer(t);
  const input = channel('alpha', ['hello\u0000world', '中文日本語한글']);
  input.extraFutureField = { preserve: true };
  database.transaction(() => store.importChannels([input]), { durable: true });
  assert.deepEqual(store.channel('alpha'), input);
  assert.equal(database.get('pragma application_id').application_id, STATE_APPLICATION_ID);
});

test('message page uses an exclusive indexed position and maintains chronological presentation', async t => {
  const { store, database } = await writer(t);
  database.transaction(() => store.importChannels([channel('alpha', ['0', '1', '2', '3', '4']), channel('unrelated')]));
  const first = store.page('alpha', 2);
  assert.deepEqual(first.messages.map(message => message.body), ['3', '4']);
  assert.equal(first.total, 5); assert.equal(typeof first.nextCursor, 'string');
  const second = store.page('alpha', 2, first.nextCursor);
  assert.deepEqual(second.messages.map(message => message.body), ['1', '2']);
  assert.equal(typeof second.nextCursor, 'string');
  const last = store.page('alpha', 2, second.nextCursor);
  assert.deepEqual(last.messages.map(message => message.body), ['0']);
  assert.equal(last.nextCursor, null);
  assert.throws(() => store.page('missing'), /Channel not found:/);
  assert.throws(() => store.page('alpha', 201), RangeError);
  assert.throws(() => store.page('alpha', 2, 'bad'), RangeError);
  assert.throws(() => store.page('unrelated', 2, first.nextCursor), RangeError);
});

test('paging survives tail append and body edit, but rejects deleted/reordered generations', async t => {
  const { store, database } = await writer(t);
  const input = channel('alpha', ['0', '1', '2', '3', '4']);
  database.transaction(() => store.importChannels([input]));
  const page = store.page('alpha', 2);
  input.messages[0].body = 'edited';
  input.messages.push({ ...input.messages.at(-1), id: 'tail', body: 'new' });
  database.transaction(() => store.putChannel(input, 0));
  assert.deepEqual(store.page('alpha', 2, page.nextCursor).messages.map(item => item.body), ['1', '2']);
  input.messages.shift();
  database.transaction(() => store.putChannel(input, 0));
  assert.throws(() => store.page('alpha', 2, page.nextCursor), MessageCursorExpiredError);
  const fresh = store.page('alpha', 2);
  input.messages.reverse();
  database.transaction(() => store.putChannel(input, 0));
  assert.throws(() => store.page('alpha', 2, fresh.nextCursor), MessageCursorExpiredError);
});

test('CJK and normalized Latin queries use bound FTS phrases and conversation terms', async t => {
  const { store, database } = await writer(t);
  database.transaction(() => store.importChannels([
    channel('alpha', ['今天去公園拍照', '東京カメラ', '한글 검색', 'ＣＡＦＥ́ iPhone™']),
    channel('other', ['公園 東京 한글']),
  ]));
  assert.equal(store.search('公園', { channelId: 'alpha' })[0].message.body, '今天去公園拍照');
  assert.equal(store.search('東京', { channelId: 'alpha' }).length, 1);
  assert.equal(store.search('한글', { channelId: 'alpha' }).length, 1);
  assert.equal(store.search('café', { channelId: 'alpha' }).length, 1);
  assert.equal(store.search('iphone', { channelId: 'alpha' }).length, 1);
  assert.equal(store.search('公園').length, 2);
  assert.equal(store.search('公').length, 2);
  assert.deepEqual(store.search('   '), []);
  assert.equal(store.search('NEAR(*) OR "').length, 0);
  assert.throws(() => store.search('x'.repeat(201)), RangeError);
  assert.throws(() => store.search('hello', { limit: 101 }), RangeError);
  const token = conversationTerm('alpha');
  assert.ok(!indexText(token).includes(token));
  assert.ok(!buildSearchQuery(token).includes(token));
});

test('edits, reorders and deletions retain row identity and update only their own indexes', async t => {
  const { store, database } = await writer(t);
  const alpha = channel('alpha', ['apples', 'bananas']);
  const other = channel('other', ['untouched']);
  database.transaction(() => store.importChannels([alpha, other]));
  const identities = database.all('select id, channel_id, message_id from messages order by id');
  const before = database.get('select id, json from messages where channel_id = ?', 'other');
  alpha.messages.reverse(); alpha.messages[0].body = 'oranges';
  database.transaction(() => store.putChannel(alpha, 0));
  assert.deepEqual(database.all('select id, channel_id, message_id from messages order by id'), identities);
  assert.equal(store.search('bananas').length, 0);
  assert.equal(store.search('oranges').length, 1);
  assert.deepEqual(store.messages('alpha').map(message => message.body), ['oranges', 'apples']);
  assert.deepEqual(database.get('select id, json from messages where channel_id = ?', 'other'), before);
  alpha.messages.splice(0, 1);
  database.transaction(() => store.putChannel(alpha, 0));
  assert.equal(store.search('oranges').length, 0);
  database.transaction(() => store.removeChannel('alpha'));
  assert.equal(store.channel('alpha'), null); assert.equal(store.search('apples').length, 0);
  assert.equal(store.search('untouched').length, 1);
});

test('chronological import and candidate cap prefer the newest 1000 over file order', async t => {
  const { store, database } = await writer(t);
  const newer = channel('file-a-new', Array(1001).fill('common 中文'));
  const older = channel('file-z-old', ['common 中文 older']);
  older.messages[0].createdAt = '2000-01-01T00:00:00.000Z';
  database.transaction(() => store.importChannels([newer, older]));
  assert.equal(database.get('select channel_id from messages order by id limit 1').channel_id, 'file-z-old');
  assert.ok(store.search('common').every(hit => hit.channelId === 'file-a-new'));
  assert.equal(store.search('common', { channelId: 'file-z-old' }).length, 1);
});

test('opaque conversation scope cannot be forged by another conversation body', async t => {
  const { store, database } = await writer(t);
  const target = channel('target', ['findme']);
  const attacker = channel('attacker', Array(1002).fill(`${conversationTerm('target')} findme`));
  database.transaction(() => store.importChannels([target, attacker]));
  const hits = store.search('findme', { channelId: 'target' });
  assert.equal(hits.length, 1); assert.equal(hits[0].channelId, 'target');
});

test('failed synchronization rolls back metadata, removed messages and FTS together', async t => {
  const { store, database } = await writer(t);
  const input = channel('alpha');
  database.transaction(() => store.importChannels([input]));
  const broken = structuredClone(input);
  broken.messages[0].channelId = 'someone-else';
  assert.throws(() => database.transaction(() => store.putChannel(broken, 0)), /another conversation/);
  assert.deepEqual(store.channel('alpha'), input);
  assert.equal(store.search('first').length, 1);
  assert.throws(() => store.putChannel(broken, 0), /another conversation/);
  assert.deepEqual(store.channel('alpha'), input);
});

test('scoped writes cannot mix Unicode identities or mutate records before rebuilding', async t => {
  const { store, database } = await writer(t);
  const original = channel('alpha', ['中文 apple']);
  store.importChannels([original]);
  const rows = database.all('select id, json from messages order by id');
  const changed = structuredClone(original); changed.messages[0].body = '中文 orange';
  database.setMeta('index_unicode', 'other-runtime');
  assert.throws(() => store.putChannel(changed, 0), /rebuilding/);
  assert.throws(() => store.removeChannel('alpha'), /rebuilding/);
  assert.deepEqual(database.all('select id, json from messages order by id'), rows);
  assert.deepEqual(store.channel('alpha'), original);
  assert.equal(database.meta('index_unicode'), 'other-runtime');
  assert.equal(store.rebuildIndex(), 1);
  store.putChannel(changed, 0);
  assert.equal(store.search('orange').length, 1);
  assert.equal(store.search('apple').length, 0);
});

test('search identity and candidates share one snapshot across a concurrent index rebuild', async t => {
  const { store, database, file } = await writer(t);
  store.importChannels([channel('alpha', ['oldword'])]);
  const other = openStateDatabase({ file, mode: 'writer' });
  try {
    const otherStore = new ConversationDatabase(other);
    let depth = 0; let identityRead = false; let published = false;
    const publish = () => {
      if (published) return;
      published = true;
      other.transaction(() => {
        const changed = otherStore.channel('alpha'); changed.messages[0].body = 'newword';
        otherStore.putChannel(changed, 0);
        other.setMeta('index_unicode', 'another-runtime');
      });
    };
    const observing = new Proxy(database, { get(target, name) {
      if (name === 'snapshot') return work => {
        // A separate identity snapshot followed by a search snapshot exposes this gap.
        if (identityRead && depth === 0) publish();
        return target.snapshot(() => { depth++; try { return work(); } finally { depth--; } });
      };
      if (name === 'meta') return key => {
        const value = target.meta(key);
        if (key === 'index_unicode') identityRead = true;
        return value;
      };
      if (name === 'all') return (sql, ...parameters) => {
        // With the fixed single snapshot, WAL lets another writer commit here while
        // this query must still observe the same index as its identity check.
        if (sql.includes('message_search match')) publish();
        return target.all(sql, ...parameters);
      };
      const value = Reflect.get(target, name, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    const hits = new ConversationDatabase(observing).search('oldword');
    assert.equal(published, true);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].message.body, 'oldword');
    assert.throws(() => store.search('newword'), /rebuilding/);
  } finally { other.close(); }
});

test('parallel groups and message order round-trip without rewriting unchanged messages', async t => {
  const { store, database } = await writer(t);
  const state = createDefaultChatState();
  state.channels = [channel('a'), channel('b')];
  state.parallelChatGroups = [{ id: 'group', memberChannelIds: ['b', 'a'], title: 'Parallel',
    mode: 'parallel', status: 'active', createdAt: '2026-01-01', updatedAt: '2026-01-01', lastMessageAt: null }];
  database.transaction(() => store.synchronize(state));
  const rows = database.all('select id, json from messages order by id');
  database.transaction(() => store.synchronize(state));
  assert.deepEqual(database.all('select id, json from messages order by id'), rows);
  assert.deepEqual(store.groups(), state.parallelChatGroups);
  assert.deepEqual(store.channels(), state.channels);
});

test('index rebuild preserves message identity and restores queries', async t => {
  const { store, database } = await writer(t);
  database.transaction(() => store.importChannels([channel('a', ['中文 apple'])]));
  database.run('delete from message_search');
  database.setMeta('index_form', '0');
  assert.throws(() => store.search('apple'), /rebuilding/);
  const state = createDefaultChatState(); state.channels = store.channels();
  assert.throws(() => database.transaction(() => store.synchronize(state)), /rebuilding/);
  assert.equal(database.meta('index_form'), '0');
  assert.equal(store.rebuildIndex(), 1);
  assert.equal(store.search('中文').length, 1);
  database.setMeta('index_unicode', 'another-runtime');
  assert.equal(store.indexCurrent, false);
  assert.throws(() => store.search('apple'), /rebuilding/);
  assert.equal(store.rebuildIndex(), 1);
  assert.equal(store.indexCurrent, true);
});

test('quick check and VACUUM snapshot produce a consistent reopenable database', async t => {
  const { file, dir, database, store } = await writer(t);
  database.transaction(() => store.importChannels([channel('a')]), { durable: true });
  assert.deepEqual(checkDatabaseFile(file), []);
  const snapshot = path.join(dir, 'snapshot.sqlite');
  snapshotDatabaseFile(file, snapshot);
  const reader = openStateDatabase({ file: snapshot, mode: 'reader' });
  try { assert.deepEqual(new ConversationDatabase(reader).channels(), store.channels()); }
  finally { reader.close(); }
});

test('existing URI builder handles Unicode, Windows drive and UNC without creating', () => {
  assert.match(existingDatabaseUri('C:\\資料\\state db.sqlite', true), /^file:\/\/\/C:\/%E8/);
  assert.match(existingDatabaseUri('C:\\資料\\state db.sqlite', true), /\?mode=rw$/);
  assert.equal(existingDatabaseUri('\\\\server\\share\\state db.sqlite', true),
    'file:////server/share/state%20db.sqlite?mode=rw');
});
