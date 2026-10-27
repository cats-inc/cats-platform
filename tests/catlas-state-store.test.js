import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { catlasFixture, fixedNow } from './fixtures/catlasAssist.js';
import { appendCatlasReceipt, catlasCooldownIds, catlasStatePath, readCatlasCatalog,
  readCatlasSignals, recordCatlasSignals } from '../build/server/shared/guideCatCurationStore.js';

test('signals preserve concurrent events, retain only 30 days, and cool dismissed IDs for seven days', async t => {
  const f = await catlasFixture(t);
  await Promise.all(Array.from({ length: 12 }, (_, index) => recordCatlasSignals(f.chatStatePath, [`basis-${index}`],
    index % 2 ? 'accepted' : 'dismissed', fixedNow)));
  let events = await readCatlasSignals(f.chatStatePath, fixedNow);
  assert.equal(events.length, 12);
  assert.equal(catlasCooldownIds(events, fixedNow).size, 6);
  assert.equal(catlasCooldownIds(events, new Date(fixedNow.getTime() + 8 * 86400000)).size, 0);
  events = await readCatlasSignals(f.chatStatePath, new Date(fixedNow.getTime() + 31 * 86400000));
  assert.deepEqual(events, []);
  assert.deepEqual(JSON.parse(await readFile(catlasStatePath(f.chatStatePath, 'signals'), 'utf8')).events, []);
});

test('receipt storage keeps the last 100 calls without losing concurrent appends', async t => {
  const f = await catlasFixture(t);
  await Promise.all(Array.from({ length: 105 }, (_, index) => appendCatlasReceipt(f.chatStatePath, {
    requestId: `request-${index}`, kind: 'title', provider: 'fixture', model: null, inputDigest: 'digest',
    timestamp: fixedNow.toISOString(), units: [{ id: 'conversation', outcome: 'rejected', reasons: ['fixture'] }],
  })));
  const receipts = JSON.parse(await readFile(catlasStatePath(f.chatStatePath, 'receipts'), 'utf8')).receipts;
  assert.equal(receipts.length, 100);
  assert.equal(receipts[0].requestId, 'request-5'); assert.equal(receipts.at(-1).requestId, 'request-104');
});

test('corrupt generated catalogs are quarantined; unknown versions remain available for recovery', async t => {
  const f = await catlasFixture(t);
  const file = catlasStatePath(f.chatStatePath, 'catalog');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '{"schemaVersion":1,"surfaces":{"chat:new:default:default":{"catalog":{"greetings":[],"chips":[]}}}}');
  assert.deepEqual((await readCatlasCatalog(f.chatStatePath)).surfaces, {});
  assert.ok((await readdir(path.dirname(file))).some(name => name.includes('.corrupt-')));
  const unknown = '{"schemaVersion":99,"future":true}'; await writeFile(file, unknown);
  await assert.rejects(readCatlasCatalog(f.chatStatePath), /Unsupported or invalid/);
  assert.equal(await readFile(file, 'utf8'), unknown);
});
