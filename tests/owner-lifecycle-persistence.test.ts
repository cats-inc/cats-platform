import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { emptyOwnerLifecycle, normalizeOwnerLifecycle, OwnerLifecycleFormatError, setOwnerEntry } from '../src/core/ownerLifecycle.ts';
import { FileChatStore } from '../src/products/chat/state/store.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { buildPersistedChatSnapshot } from '../src/products/chat/state/core-snapshot/index.ts';

async function profile(t: test.TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-owner-lifecycle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const snapshot = buildPersistedChatSnapshot(createDefaultChatState(), createDefaultCoreState());
  const raw = JSON.stringify(snapshot, null, 2) + '\n';
  await writeFile(file, raw);
  return { dir, file, raw, snapshot };
}

test('old profile loads without writes, first intent has a backup and survives restart/Chat save', async t => {
  const { file, raw } = await profile(t);
  const store = new FileChatStore(file);
  assert.equal((await store.readCore()).ownerLifecycle, undefined);
  assert.equal(await readFile(file, 'utf8'), raw);
  await store.updateCore(core => setOwnerEntry(core, 'codespace', 'codespace-example', { listing: 'removed', path: 'C:/project' }));
  assert.equal(await readFile(`${file}.bak`, 'utf8'), raw);
  const restarted = new FileChatStore(file);
  await restarted.write(await restarted.read());
  assert.equal((await restarted.readCore()).ownerLifecycle?.entries['codespace:codespace-example'].listing, 'removed');
});

test('future and malformed lifecycle data preserve primary bytes even with a valid backup', async t => {
  const { file, raw, snapshot } = await profile(t);
  await writeFile(`${file}.bak`, raw);
  for (const invalid of [{ ...emptyOwnerLifecycle(), version: 2 }, { ...emptyOwnerLifecycle(), entries: { 'run:r': {} } }]) {
    const bytes = JSON.stringify({ ...snapshot, ownerLifecycle: invalid });
    await writeFile(file, bytes);
    const store = new FileChatStore(file);
    await assert.rejects(store.readCore(), OwnerLifecycleFormatError);
    await assert.rejects(store.updateCore(core => core), OwnerLifecycleFormatError);
    assert.equal(await readFile(file, 'utf8'), bytes);
    assert.equal(await readFile(`${file}.bak`, 'utf8'), raw);
  }
});

test('failed backup leaves original state intact and no temporary file, retry recovers', async t => {
  const { file, raw, dir } = await profile(t);
  await mkdir(`${file}.bak`);
  const store = new FileChatStore(file);
  await assert.rejects(store.updateCore(core => setOwnerEntry(core, 'run', 'r', { listing: 'archived' })));
  assert.equal(await readFile(file, 'utf8'), raw);
  assert.deepEqual((await readdir(dir)).sort(), ['state.json', 'state.json.bak']);
  await rm(`${file}.bak`, { recursive: true });
  await store.updateCore(core => setOwnerEntry(core, 'run', 'r', { listing: 'archived' }));
  assert.equal((await new FileChatStore(file).readCore()).ownerLifecycle?.revision, 1);
});

test('future profile versions preserve original bytes instead of restoring an older backup', async t => {
  const { file, raw, snapshot } = await profile(t);
  const future = JSON.stringify({ ...snapshot, version: 999, futureData: { keep: true } });
  await writeFile(file, future); await writeFile(`${file}.bak`, raw);
  await assert.rejects(new FileChatStore(file).readCore(), OwnerLifecycleFormatError);
  assert.equal(await readFile(file, 'utf8'), future);
  assert.equal(await readFile(`${file}.bak`, 'utf8'), raw);
});

test('concurrent owner mutations serialize without lost entries and failed mutations release the lock', async () => {
  const store = new MemoryCoreStore();
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.updateCore(async core => {
    await Promise.resolve();
    return setOwnerEntry(core, 'run', String(i), { listing: 'archived' });
  })));
  assert.equal(Object.keys((await store.readCore()).ownerLifecycle!.entries).length, 20);
  await assert.rejects(store.updateCore(() => { throw new Error('interrupted'); }));
  await store.updateCore(core => setOwnerEntry(core, 'run', 'last', { listing: 'visible' }));
  assert.equal((await store.readCore()).ownerLifecycle!.revision, 21);
  assert.equal(normalizeOwnerLifecycle(undefined), undefined);
});
