import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readGuideCatAssistConfig, readGuideCatAssistCache, resolveGuideCatAssistConfigPath,
  resolveGuideCatAssistCachePath, migrateGuideCatAssistConfig, writeGuideCatAssistConfig,
  emptyGuideCatAssistConfig } from '../build/server/shared/guideCatAssistStore.js';
import { resolveGuideCatAssistBaseline } from '../build/server/shared/guideCatAssistBaselines.js';
import { buildGuideCatAssistRefreshContextHash, parseGuideCatAssistScopeKey } from '../build/server/shared/guideCatAssist.js';

async function profile(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-assist-upgrade-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const state = path.join(root, 'platform', 'state', 'chat-state.local.json');
  const file = resolveGuideCatAssistConfigPath(state);
  await mkdir(path.dirname(file), { recursive: true });
  return { root, state, file };
}
function oldConfig(extra = {}) { return { schemaVersion: 1, updatedAt: '2026-10-01T00:00:00Z',
  disabledSurfaceKeys: ['code:new:default:default'], deterministicSeed: 'keep-seed', curatedOverrides: {},
  refreshPreferences: { runtimeRefreshEnabled: false, defaultTtlMs: 9000 }, ...extra }; }

test('config migrates populated owner values, explicit empty chips and seeded selection with a verified backup', async t => {
  const p = await profile(t);
  const previous = oldConfig({ curatedOverrides: {
    'chat:new:default:default': { greeting: 'Owner greeting', entryChips: [{ id: 'cross:work:start', prompt: 'Owner prompt' }] },
    'code:new:default:default': { greeting: null, entryChips: [] },
  } });
  const raw = JSON.stringify(previous, null, 3);
  await writeFile(p.file, raw);
  const next = await readGuideCatAssistConfig(p.state);
  assert.equal(next.schemaVersion, 2);
  assert.equal(next.ownerOverrides['chat:new:default:default'].greetings[0].text, 'Owner greeting');
  assert.deepEqual(next.ownerOverrides['code:new:default:default'].entryChips, []);
  assert.deepEqual(next.ownerOverrides['chat:new:default:default'].entryChips[0], {
    id: 'cross:work:start', action: 'prefill', surface: 'work', label: 'Owner prompt', prompt: 'Owner prompt',
  });
  const scope = 'lobby:default:default';
  const pool = resolveGuideCatAssistBaseline('lobby').content.greetings;
  const index = createHash('sha256').update(`keep-seed:${scope}`).digest()[0] % pool.length;
  assert.deepEqual(next.ownerOverrides[scope].greetings, [pool[index]]);
  assert.deepEqual(next.disabledSurfaceKeys, previous.disabledSurfaceKeys);
  assert.deepEqual(next.refreshPreferences, previous.refreshPreferences);
  const backups = (await readdir(path.dirname(p.file))).filter(name => name.endsWith('.bak'));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(path.dirname(p.file), backups[0]), 'utf8'), raw);
  assert.deepEqual(await readGuideCatAssistConfig(p.state), next, 'restart is idempotent');
  assert.equal((await readdir(path.dirname(p.file))).filter(name => name.endsWith('.bak')).length, 1);
});

test('empty old profiles upgrade and a previously created backup or temporary file does not break restart', async t => {
  const p = await profile(t);
  const previous = oldConfig({ deterministicSeed: null, curatedOverrides: {} });
  const raw = JSON.stringify(previous);
  await writeFile(p.file, raw);
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  await writeFile(`${p.file}.v1-${hash}.bak`, raw);
  await writeFile(`${p.file}.interrupted.tmp`, 'incomplete');
  const next = await readGuideCatAssistConfig(p.state);
  assert.deepEqual(next.ownerOverrides, {});
  assert.equal(next.refreshPreferences.runtimeRefreshEnabled, false);
  assert.deepEqual(await readGuideCatAssistConfig(p.state), next);
});

test('unsupported or invalid config preserves the exact original and cannot be replaced by a normalizer', async t => {
  const p = await profile(t);
  for (const previous of [oldConfig({ curatedOverrides: { 'unknown:scope:default': { greeting: 'keep', entryChips: [] } } }),
    oldConfig({ curatedOverrides: { 'chat:new:default:default': { greeting: 'keep', entryChips: [{ id: 'x' }] } } }),
    { ...emptyGuideCatAssistConfig(), schemaVersion: 99 }, { ...oldConfig(), unexpected: 'retain' }]) {
    const raw = JSON.stringify(previous);
    await writeFile(p.file, raw);
    await assert.rejects(readGuideCatAssistConfig(p.state), /Unsupported or invalid/);
    await assert.rejects(writeGuideCatAssistConfig(p.state, emptyGuideCatAssistConfig()));
    assert.equal(await readFile(p.file, 'utf8'), raw);
  }
});

test('migration failure before atomic replace leaves the original and cache upgrade waits for valid owner config', async t => {
  const p = await profile(t);
  const raw = JSON.stringify(oldConfig());
  await writeFile(p.file, raw);
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  await mkdir(`${p.file}.v1-${hash}.bak`); // Fault the backup step without depending on OS permission behavior.
  const cache = resolveGuideCatAssistCachePath(p.state);
  await mkdir(path.dirname(cache), { recursive: true });
  const oldCache = '{"schemaVersion":1,"bundles":{"old":"generated"}}';
  await writeFile(cache, oldCache);
  await assert.rejects(readGuideCatAssistCache(p.state));
  assert.equal(await readFile(p.file, 'utf8'), raw);
  assert.equal(await readFile(cache, 'utf8'), oldCache);
  await rm(`${p.file}.v1-${hash}.bak`, { recursive: true });
  assert.equal((await readGuideCatAssistCache(p.state)).schemaVersion, 2);
  assert.deepEqual((await readGuideCatAssistCache(p.state)).bundles, {});
});

test('unknown cache versions stay intact; corrupt generated cache is quarantined', async t => {
  const p = await profile(t);
  const file = resolveGuideCatAssistCachePath(p.state);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '{"schemaVersion":99,"keep":true}');
  await assert.rejects(readGuideCatAssistCache(p.state), /Unsupported or invalid/);
  assert.equal(await readFile(file, 'utf8'), '{"schemaVersion":99,"keep":true}');
  await writeFile(file, 'broken json');
  assert.deepEqual((await readGuideCatAssistCache(p.state)).bundles, {});
  assert.ok((await readdir(path.dirname(file))).some(name => name.includes('.corrupt-')));
});

test('scope parsing and context hashes are stable, locale-sensitive and exclude attention data', () => {
  assert.equal(parseGuideCatAssistScopeKey('chat:new:default:default').surfaceId, 'chat:new');
  const input = { scope: { surfaceId: 'chat:new', surfaceMode: 'default', audienceState: 'default' },
    guideCat: { id: 'catlas' }, locale: 'en' };
  assert.equal(buildGuideCatAssistRefreshContextHash(input), buildGuideCatAssistRefreshContextHash({ ...input, snapshot: { title: 'changes' } }));
  assert.notEqual(buildGuideCatAssistRefreshContextHash(input), buildGuideCatAssistRefreshContextHash({ ...input, locale: 'zh-TW' }));
});

test('atomic replacement failure retains the exact owner config and its recovery backup', async t => {
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const { mock } = await import('node:test');
  const p = await profile(t);
  const raw = JSON.stringify(oldConfig(), null, 3);
  await writeFile(p.file, raw);
  const originalRename = fs.rename;
  const fault = mock.method(fs, 'rename', async (source, target) => {
    if (target === p.file) throw Object.assign(new Error('Simulated atomic replace failure'), { code: 'EIO' });
    return originalRename(source, target);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(readGuideCatAssistConfig(p.state), /Simulated atomic replace failure/); }
  finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(await readFile(p.file, 'utf8'), raw);
  assert.ok((await readdir(path.dirname(p.file))).some(name => name.endsWith('.bak')));
  assert.equal((await readGuideCatAssistConfig(p.state)).schemaVersion, 2, 'retry recovers after the fault');
});

test('post-replacement verification failure restores original bytes before reporting failure', async t => {
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const { mock } = await import('node:test');
  const p = await profile(t), raw = JSON.stringify(oldConfig(), null, 3);
  await writeFile(p.file, raw);
  const originalRead = fs.readFile, originalRename = fs.rename;
  let replaced = false, injected = false;
  const renameFault = mock.method(fs, 'rename', async (source, target) => {
    await originalRename(source, target);
    if (target === p.file) replaced = true;
  });
  const readFault = mock.method(fs, 'readFile', async (file, ...args) => {
    if (file === p.file && replaced && !injected) { injected = true; return '{"schemaVersion":2}'; }
    return originalRead(file, ...args);
  });
  syncBuiltinESMExports();
  try { await assert.rejects(readGuideCatAssistConfig(p.state)); }
  finally { renameFault.mock.restore(); readFault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(injected, true);
  assert.equal(await readFile(p.file, 'utf8'), raw);
  assert.equal((await readGuideCatAssistConfig(p.state)).schemaVersion, 2);
});

test('recognized v1 scope whitespace and non-expiring TTL retain their previous effective behavior', () => {
  const next = migrateGuideCatAssistConfig(oldConfig({ deterministicSeed: null, disabledSurfaceKeys: [' code:new:default:default '],
    refreshPreferences: { runtimeRefreshEnabled: true, defaultTtlMs: -1 },
    curatedOverrides: { ' chat:new:default:default ': { greeting: ' Kept ',
      entryChips: [{ id: ' cross:code:fixture ', label: ' Code ', prompt: ' Code prompt ' }] } } }));
  assert.deepEqual(next.disabledSurfaceKeys, ['code:new:default:default']);
  assert.equal(next.refreshPreferences.defaultTtlMs, -1);
  assert.equal(next.ownerOverrides['chat:new:default:default'].greetings[0].text, 'Kept');
  assert.deepEqual(next.ownerOverrides['chat:new:default:default'].entryChips[0], {
    id: 'cross:code:fixture', action: 'prefill', surface: 'code', label: 'Code', prompt: 'Code prompt',
  });
});
