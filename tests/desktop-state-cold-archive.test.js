import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  ColdArchiveError, ColdArchiveReader, readColdArchiveManifest, writeColdArchive,
} from '../build/server/products/chat/state/database/coldArchive.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safeFailure = code => error => error instanceof ColdArchiveError
  && error.code === code && !/private|secret|\.jsonl|cats archive/.test(error.message);

async function fixture(t, count = 401) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats archive 資料 '));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10 }));
  const channelId = 'channel-雪';
  const header = { kind: 'header', format: 1, archiveId: randomUUID(), installationId: randomUUID(),
    channelId, createdAt: '2026-11-12T00:00:00.000Z', sourceRevision: randomUUID(),
    channelRevision: randomUUID(), orderRevision: randomUUID(), messageCount: count,
    channel: { id: channelId, title: '秘密 🐈', status: 'active', extension: { rich: ['雪', null, true] } } };
  const messages = Array.from({ length: count }, (_, i) => ({ id: `message-${i}`, channelId,
    senderKind: 'user', senderName: 'Owner', body: `訊息 ${i} 😀\u0000\nline`, mentions: [],
    metadata: { choice: ['a', 'b'], unknown: JSON.parse('{"__proto__":{"preserved":true}}') },
    usage: null, createdAt: '2026-11-12T00:00:00.000Z' }));
  const contexts = Array.from({ length: 201 }, (_, i) => ({ family: i ? 'core.segments' : 'chat.parallelChatGroups',
    value: { id: `context-${i}`, memberChannelIds: [channelId, 'sibling'], opaque: { number: i } } }));
  const input = { header, messages, contexts };
  const write = () => writeColdArchive(root, input);
  return { root, header, messages, contexts, input, write };
}

test('verified gzip JSONL retains rich messages, group/Core records and exclusive cold pages', async t => {
  const { root, header, messages, contexts, write } = await fixture(t);
  const result = write();
  const manifest = readColdArchiveManifest(root, header.archiveId, result.manifestDigest);
  assert.deepEqual(manifest, result.manifest);
  const raw = await readFile(path.join(root, manifest.file));
  assert.equal(sha256(raw), manifest.sha256);
  const jsonl = gunzipSync(raw);
  assert.equal(sha256(jsonl), manifest.logicalSha256);
  const records = jsonl.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(records[0], header);
  assert.equal(records.length, 1 + contexts.length + messages.length);
  const reader = new ColdArchiveReader(root, manifest);
  try {
    reader.verify();
    assert.deepEqual(reader.header(), header);
    assert.deepEqual([...reader.contexts()], contexts);
    let before = messages.length, all = [];
    do {
      const page = reader.readPage(137, before);
      assert.equal(page.total, messages.length);
      assert.ok(page.messages.length <= 137);
      all = [...page.messages, ...all];
      before = page.nextPosition;
    } while (before !== null);
    assert.deepEqual(all, messages);
    assert.equal(new Set(all.map(message => message.id)).size, messages.length);
    assert.deepEqual(reader.readPage(1, 200).messages, [messages[199]]);
    assert.deepEqual(reader.readPage(200, 0), { messages: [], total: 401, nextPosition: null });
    assert.equal(Object.getPrototypeOf(all[0].metadata.unknown), Object.prototype);
    assert.equal(Object.hasOwn(all[0].metadata.unknown, '__proto__'), true);
  } finally { reader.close(); }
});

test('latest cold page reads only its own members, while full verification detects damaged old evidence', async t => {
  const { root, write, messages } = await fixture(t);
  const { manifest } = write();
  const first = manifest.blocks.find(block => block.kind === 'message');
  const file = path.join(root, manifest.file), bytes = await readFile(file);
  bytes[first.offset] ^= 0xff; await writeFile(file, bytes);
  const reader = new ColdArchiveReader(root, manifest);
  try {
    assert.deepEqual(reader.readPage(1).messages, messages.slice(-1));
    assert.throws(() => reader.readPage(1, 1), safeFailure('invalid_archive'));
    assert.throws(() => reader.verify(), safeFailure('invalid_archive'));
  } finally { reader.close(); }
});

test('manifest identity is pinned, detached from caller mutation and immutable during readback', async t => {
  const { root, header, write } = await fixture(t);
  const { manifest, manifestDigest, manifestFile } = write();
  const supplied = structuredClone(manifest), reader = new ColdArchiveReader(root, supplied);
  try {
    supplied.blocks[0].sha256 = '0'.repeat(64);
    supplied.channelId = 'another';
    assert.equal(reader.header().channelId, header.channelId);
    assert.throws(() => { reader.manifest.blocks[0].offset = 9; }, TypeError);
    assert.throws(() => readColdArchiveManifest(root, header.archiveId, '0'.repeat(64)), safeFailure('invalid_archive'));
    const bytes = await readFile(manifestFile);
    await writeFile(manifestFile, Buffer.concat([bytes, Buffer.from(' ')]));
    assert.throws(() => readColdArchiveManifest(root, header.archiveId, manifestDigest), safeFailure('invalid_archive'));
    assert.throws(() => readColdArchiveManifest(root, '../private', manifestDigest), safeFailure('invalid_input'));
  } finally { reader.close(); }
});

for (const [name, change] of [
  ['path injection', manifest => { manifest.file = '../private-secret'; }],
  ['noncontiguous ranges', manifest => { manifest.blocks[1].offset++; }],
  ['wrong message count', manifest => { manifest.messageCount++; }],
  ['oversized decode', manifest => { manifest.blocks[0].decodedBytes = 65 * 1024 * 1024; }],
  ['invalid first position', manifest => { manifest.blocks.find(block => block.kind === 'message').first++; }],
  ['repeated header', manifest => { manifest.blocks[1].kind = 'header'; }],
  ['missing blocks', manifest => { manifest.blocks = []; }],
  ['unsafe byte total', manifest => { manifest.bytes = Number.MAX_SAFE_INTEGER + 1; }],
]) test(`untrusted manifest rejects ${name} before payload access`, async t => {
  const { root, write } = await fixture(t);
  const manifest = structuredClone(write().manifest); change(manifest);
  assert.throws(() => new ColdArchiveReader(root, manifest), safeFailure('invalid_archive'));
});

test('truncated and subsequently modified payloads fail without exposing body or filesystem diagnostics', async t => {
  const { root, write } = await fixture(t), { manifest } = write();
  const file = path.join(root, manifest.file), original = await readFile(file);
  await writeFile(file, original.subarray(0, -1));
  assert.throws(() => new ColdArchiveReader(root, manifest), safeFailure('invalid_archive'));
  await writeFile(file, original);
  const reader = new ColdArchiveReader(root, manifest);
  try {
    const changed = Buffer.from(original); changed[0] ^= 1; await writeFile(file, changed);
    assert.throws(() => reader.readPage(1), safeFailure('invalid_archive'));
  } finally { reader.close(); }
});

test('full verification checks both whole-file and logical digests independently of member proofs', async t => {
  const { root, write } = await fixture(t), { manifest } = write();
  for (const field of ['sha256', 'logicalSha256', 'messagesDigest']) {
    const changed = structuredClone(manifest); changed[field] = '0'.repeat(64);
    const reader = new ColdArchiveReader(root, changed);
    try { assert.throws(() => reader.verify(), safeFailure('invalid_archive')); }
    finally { reader.close(); }
  }
});

test('member proof does not admit invalid JSONL, wrong positions or decompression expansion', async t => {
  const { root, write, messages } = await fixture(t, 1), { manifest } = write();
  const first = manifest.blocks.find(block => block.kind === 'message');
  const original = await readFile(path.join(root, manifest.file));
  for (const raw of [
    Buffer.from('private secret\n'),
    Buffer.from(JSON.stringify({ kind: 'message', position: 3, message: messages[0] }) + '\n'),
    Buffer.from(JSON.stringify({ kind: 'message', position: 0, message: { ...messages[0], channelId: 'another' } }) + '\n'),
    Buffer.from(JSON.stringify({ kind: 'message', position: 0, message: messages[0] })),
    Buffer.from([0xff, 0x0a]),
  ]) {
    const compressed = gzipSync(raw), changed = structuredClone(manifest);
    const block = changed.blocks.find(block => block.kind === 'message');
    Object.assign(block, { bytes: compressed.length, decodedBytes: raw.length, sha256: sha256(compressed) });
    changed.bytes = first.offset + compressed.length;
    await writeFile(path.join(root, manifest.file), Buffer.concat([original.subarray(0, first.offset), compressed]));
    const reader = new ColdArchiveReader(root, changed);
    try { assert.throws(() => reader.readPage(1), safeFailure('invalid_archive')); }
    finally { reader.close(); }
    block.decodedBytes = 1;
    const bounded = new ColdArchiveReader(root, changed);
    try { assert.throws(() => bounded.verify(), safeFailure('invalid_archive')); }
    finally { bounded.close(); }
  }
});

test('writer rejects mismatched source counts, channel identity and non-JSON records without leaving a pair', async t => {
  const { root, input, write } = await fixture(t, 1);
  const cases = [
    () => { input.header.messageCount = 2; },
    () => { input.header.messageCount = 1; input.messages[0].channelId = 'another'; },
    () => { input.messages[0].channelId = input.header.channelId; input.contexts[0].value.bad = undefined; },
    () => { delete input.contexts[0].value.bad; input.contexts[0].value.bad = Infinity; },
    () => { delete input.contexts[0].value.bad; input.contexts[0].value.bad = input.contexts[0].value; },
    () => { delete input.contexts[0].value.bad; input.messages[0].metadata.cyclic = input.messages[0]; },
  ];
  for (const change of cases) {
    change(); assert.throws(write, safeFailure('invalid_input'));
    assert.deepEqual(await readdir(root), []);
  }
});

test('writer refuses existing payload or manifest and preserves existing sentinel bytes', async t => {
  const { root, header, write } = await fixture(t, 1);
  const payload = path.join(root, `${header.archiveId}.jsonl.gz`);
  await writeFile(payload, 'private payload sentinel');
  assert.throws(write, safeFailure('io_error'));
  assert.equal(await readFile(payload, 'utf8'), 'private payload sentinel');
  await rm(payload);
  const manifest = path.join(root, `${header.archiveId}.manifest.json`);
  await writeFile(manifest, 'private manifest sentinel');
  assert.throws(write, safeFailure('io_error'));
  assert.equal(await readFile(manifest, 'utf8'), 'private manifest sentinel');
  assert.deepEqual(await readdir(root), [path.basename(manifest)]);
});

test('failed writer preserves an external replacement of its pathname and sanitizes iterator failures', async t => {
  const { root, header, input, write } = await fixture(t, 1);
  const payload = path.join(root, `${header.archiveId}.jsonl.gz`);
  input.contexts = { *[Symbol.iterator]() {
    renameSync(payload, `${payload}.moved`);
    writeFileSync(payload, 'external replacement');
    throw Error('private secret iterator');
  } };
  assert.throws(write, safeFailure('io_error'));
  assert.equal(readFileSync(payload, 'utf8'), 'external replacement');
  assert.deepEqual((await readdir(root)).sort(), [path.basename(payload), `${path.basename(payload)}.moved`].sort());
});

test('empty conversation, page validation, closed handles and large individual records remain explicit', async t => {
  const { root, input, write } = await fixture(t, 0);
  input.contexts = [];
  const { manifest } = write(), reader = new ColdArchiveReader(root, manifest);
  reader.verify(); assert.deepEqual([...reader.contexts()], []);
  assert.deepEqual(reader.readPage(), { messages: [], total: 0, nextPosition: null });
  for (const [limit, before] of [[0, 0], [201, 0], [1, -1], [1, 1], [1.5, 0]]) {
    assert.throws(() => reader.readPage(limit, before), safeFailure('invalid_input'));
  }
  reader.close(); reader.close();
  for (const read of [() => reader.header(), () => reader.readPage(), () => reader.verify(), () => [...reader.contexts()]]) {
    assert.throws(read, safeFailure('closed'));
  }
  const oversized = { ...input, header: { ...input.header, archiveId: randomUUID(),
    channel: { ...input.header.channel, huge: 'x'.repeat(64 * 1024 * 1024) } } };
  assert.throws(() => writeColdArchive(root, oversized), safeFailure('capacity_exceeded'));
});

test('a record larger than the target chunk is retained in its own bounded member', async t => {
  const { root, input, messages, write } = await fixture(t, 2);
  input.contexts = [];
  messages[0].body = '雪'.repeat(250_000);
  const { manifest } = write();
  assert.ok(manifest.blocks.find(block => block.kind === 'message').decodedBytes > 512 * 1024);
  const reader = new ColdArchiveReader(root, manifest);
  try { reader.verify(); assert.deepEqual(reader.readPage(2).messages, messages); }
  finally { reader.close(); }
});

test('directory durability failure cannot return a successful archive and preserves its source', async t => {
  const { root, input } = await fixture(t, 1);
  input.contexts = [];
  const source = path.join(root, 'source.json');
  const bytes = JSON.stringify(input); await writeFile(source, bytes);
  // Isolate builtin fault injection from other tests. Simulate only the directory handle
  // on Windows; real payload/manifest IO and the codec still run unchanged on both hosts.
  const script = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const root = process.argv[1], source = process.argv[2];
    const input = JSON.parse(fs.readFileSync(source, 'utf8'));
    const originalOpen = fs.openSync, originalSync = fs.fsyncSync, originalClose = fs.closeSync;
    const directoryHandle = 987654321;
    let opened = 0, synced = 0, closed = 0;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    fs.openSync = (file, ...args) => file === root ? (opened++, directoryHandle) : originalOpen(file, ...args);
    fs.fsyncSync = fd => {
      if (fd !== directoryHandle) return originalSync(fd);
      synced++; throw Error('private secret directory sync');
    };
    fs.closeSync = fd => fd === directoryHandle ? closed++ : originalClose(fd);
    syncBuiltinESMExports();
    const { writeColdArchive, ColdArchiveError } = await import(${JSON.stringify(new URL('../build/server/products/chat/state/database/coldArchive.js', import.meta.url).href)});
    assert.throws(() => writeColdArchive(root, input), error => error instanceof ColdArchiveError
      && error.code === 'io_error' && !error.message.includes('private'));
    assert.deepEqual([opened, synced, closed], [1, 1, 1]);
    assert.deepEqual(fs.readdirSync(root), ['source.json']);
  `;
  const child = spawnSync(process.execPath, ['--import', './scripts/testing/isolate-cats-home.mjs', '--input-type=module',
    '-e', script, root, source], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(await readFile(source, 'utf8'), bytes);
});
