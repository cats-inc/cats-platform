import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, existsSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManagedPluginManager, inspectAgencyPackage, type PluginRuntimePort } from '../src/platform/plugins/manager.js';
import { AGENCY_PLUGIN, type PluginIdentity, type PluginObservation } from '../src/shared/managedPlugins.js';
import { resolveSkillProfileManifest } from '../src/shared/skillProfiles.js';
import type { RuntimeClient, RuntimeSessionCreateInput } from '../src/runtime/client.js';

const archive = readFileSync(join(process.cwd(), 'tests/fixtures/managed-plugins/agency-agents-0.1.0.catsplugin'));
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'cats-plugin-platform-'));
  let offline = false; let stopCalls = 0;
  const calls: string[] = [];
  const observed: PluginObservation = { protocol: 1, runtimeId: 'test-runtime', plugin: null, affectedSessions: [], pendingRuns: [] };
  const port: PluginRuntimePort = { async request(method, path, body) {
    calls.push(`${method} ${path}`);
    if (offline) throw new Error('offline');
    const input = body as PluginIdentity & { enabled: boolean };
    if (method === 'PUT') observed.plugin = { ...input, leaseUntil: Date.now() + 30_000 };
    if (path === '/renew' && !observed.plugin?.enabled) throw new Error('lease unavailable');
    if (path === '/restore') { observed.restorable = false; observed.plugin!.enabled = true; observed.plugin!.leaseUntil = Date.now() + 30_000; }
    if (path === '/stop') stopCalls += 1;
    return structuredClone(observed);
  } };
  const manager = new ManagedPluginManager(root, true, port);
  return { root, port, observed, manager, calls, offline: (value: boolean) => { offline = value; }, stops: () => stopCalls,
    archivePath: join(root, 'plugins', 'packages', `${AGENCY_PLUGIN.digest}.catsplugin`), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
test('startup leaves Agency uninstalled even when the experiment policy is enabled', async () => {
  const f = fixture();
  try {
    await f.manager.tick();
    assert.equal(f.manager.inventory().installed, false);
    assert.equal(f.manager.inventory().phase, 'absent');
    assert.deepEqual(f.manager.inventory().availableSkills, []);
    assert.equal(f.observed.plugin, null);
    assert.equal(existsSync(join(f.root, 'plugins')), false);
  } finally { f.cleanup(); }
});
test('a bundled preview stays absent until Install, then preserves the generation across a clean restart', async () => {
  const f = fixture();
  try {
    const bundle = join(f.root, 'bundled.catsplugin'); writeFileSync(bundle, archive);
    const manager = new ManagedPluginManager(f.root, true, f.port, bundle);
    await manager.tick();
    assert.equal(manager.inventory().bundledInstallAvailable, true);
    assert.equal(manager.inventory().installed, false);
    assert.deepEqual(f.calls, []);
    const installed = await manager.installBundled(0);
    assert.equal(installed.phase, 'enabled');
    assert.equal(installed.availableSkills.length, 2);
    assert.deepEqual(JSON.parse(readFileSync(join(f.root, 'plugins/state.json'), 'utf8')).managedSessions, {});
    const generation = installed.observation!.plugin!.generation;
    f.observed.plugin!.enabled = false; f.observed.restorable = true;
    const restarted = new ManagedPluginManager(f.root, true, f.port, bundle);
    assert.deepEqual(restarted.inventory().availableSkills, []);
    await restarted.tick();
    assert.equal(restarted.inventory().availableSkills.length, 2);
    assert.equal(restarted.inventory().observation!.plugin!.generation, generation);
    assert.equal(f.calls.at(-1), 'POST /restore');
    const revision = restarted.inventory().revision;
    await restarted.disable({ revision, remove: false, confirmedSessions: [], confirmedRuns: [] });
    f.calls.length = 0; await new ManagedPluginManager(f.root, true, f.port, bundle).tick();
    assert.deepEqual(f.calls, []);
  } finally { f.cleanup(); }
});

for (const agencyFirst of [true, false]) {
  test(`mixed group admits ordinary members without adding skill requests (Agency first: ${agencyFirst})`, async () => {
    const f = fixture();
    try {
      let state = await f.manager.install(archive, 0); await f.manager.enable(state.revision);
      const received: RuntimeSessionCreateInput[] = [];
      const client = f.manager.wrapClient({
        createSession: async (input: RuntimeSessionCreateInput) => { received.push(input); return { id: `s-${received.length}` }; },
        sendMessage: async () => ({}),
      } as unknown as RuntimeClient);
      const common = { cwd: f.root, context: { metadata: { channelId: 'mixed-group' } } };
      const agency = { ...common, provider: 'codex', skills: resolveSkillProfileManifest({ profileId: AGENCY_PLUGIN.skills[0].id }) };
      const ordinary = { ...common, provider: 'gemini' };
      for (const input of agencyFirst ? [agency, ordinary] : [ordinary, agency]) await client.createSession(input);
      await client.sendMessage('s-1', 'continue'); await client.sendMessage('s-2', 'continue');
      assert.equal(received.find(input => input.provider === 'gemini')!.skills, undefined);
      assert.deepEqual(received.find(input => input.provider === 'codex')!.skills?.requestedSkills, [AGENCY_PLUGIN.skills[0].id]);
      for (const name of ['.agents', '.agent', '.claude', '.codex']) assert.equal(existsSync(join(f.root, name)), false);
      state = f.manager.inventory();
      await f.manager.disable({ revision: state.revision, remove: false, confirmedSessions: [], confirmedRuns: [] });
      await assert.rejects(client.sendMessage('s-1', 'continue'), /new conversation/);
      await assert.rejects(client.sendMessage('s-2', 'continue'), /new conversation/);
    } finally { f.cleanup(); }
  });
}
test('pinned archive validation, policy and separate install/enable/selection', async () => {
  const f = fixture();
  try {
    assert.equal(inspectAgencyPackage(archive).length, 2);
    const bad = Buffer.from(archive); bad[100] ^= 1; assert.throws(() => inspectAgencyPackage(bad));
    await assert.rejects(new ManagedPluginManager(f.root, false, f.port).install(archive, 0));
    let state = await f.manager.install(archive, 0);
    assert.equal(state.phase, 'installed'); assert.equal(state.availableSkills.length, 0);
    assert.equal(f.observed.plugin, null);
    state = await f.manager.enable(state.revision);
    assert.equal(state.availableSkills.length, 2);
    assert.deepEqual(resolveSkillProfileManifest({ profileId: AGENCY_PLUGIN.skills[0].id })?.requestedSkills, [AGENCY_PLUGIN.skills[0].id]);
    await assert.rejects(f.manager.enable(0), /Refresh/);
  } finally { f.cleanup(); }
});

test('unused policy-off hosts preserve ordinary profiles behind a directory link', async () => {
  const f = fixture();
  try {
    const target = join(f.root, 'target'); const linked = join(f.root, 'linked');
    mkdirSync(target); symlinkSync(target, linked, process.platform === 'win32' ? 'junction' : 'dir');
    const manager = new ManagedPluginManager(linked, false, f.port);
    const client = manager.wrapClient({ createSession: async () => ({ id: 'ordinary' }) } as unknown as RuntimeClient);
    assert.equal((await client.createSession({ provider: 'codex' })).id, 'ordinary');
    assert.equal(manager.inventory().phase, 'absent');
    assert.equal(existsSync(join(target, 'plugins')), false);
  } finally { f.cleanup(); }
});

test('in-memory hosts without a platform directory cannot activate Plugin storage', async () => {
  const port: PluginRuntimePort = { request: async () => { throw new Error('must not contact Runtime'); } };
  const manager = new ManagedPluginManager(undefined, true, port);
  assert.equal(manager.inventory().policyEnabled, false);
  assert.equal(manager.inventory().phase, 'absent');
  await manager.tick();
  await assert.rejects(manager.install(archive, 0), /isolated internal experiment/);
  const client = manager.wrapClient({ createSession: async () => ({ id: 'ordinary' }) } as unknown as RuntimeClient);
  assert.equal((await client.createSession({ provider: 'codex' })).id, 'ordinary');
});
test('offline removal persists intent; changed impact requires confirmation, real stop retains bytes', async () => {
  const f = fixture();
  try {
    let state = await f.manager.install(archive, 0); state = await f.manager.enable(state.revision);
    f.offline(true);
    state = await f.manager.disable({ revision: state.revision, remove: true, confirmedSessions: [], confirmedRuns: [] });
    assert.equal(state.phase, 'fencing'); assert.ok(existsSync(f.archivePath));
    f.offline(false); f.observed.affectedSessions = ['session-a']; f.observed.pendingRuns = [{ sessionId: 'session-a', runId: 'execution-a', orphaned: false }];
    // Recreate the host to exercise persisted intent recovery.
    const restarted = new ManagedPluginManager(f.root, true, f.port);
    await restarted.tick(); state = restarted.inventory();
    assert.equal(state.phase, 'confirmation-required'); assert.equal(f.stops(), 0); assert.equal(f.observed.plugin?.enabled, false);
    state = await restarted.disable({ revision: state.revision, remove: true, confirmedSessions: ['session-a'], confirmedRuns: ['execution-a'] });
    assert.equal(state.phase, 'stop-pending'); assert.ok(existsSync(f.archivePath));
    f.observed.pendingRuns = []; await restarted.tick();
    assert.equal(restarted.inventory().phase, 'absent'); assert.equal(existsSync(f.archivePath), false);
    assert.ok(existsSync(join(f.root, 'plugins', 'state.json')));
  } finally { f.cleanup(); }
});
test('revoked conversations cannot be replayed through a fresh Runtime UUID or cleared skill selection', async () => {
  const f = fixture();
  try {
    let state = await f.manager.install(archive, 0); state = await f.manager.enable(state.revision);
    let creates = 0;
    const client = f.manager.wrapClient({ createSession: async () => ({ id: `s-${++creates}` }), sendMessage: async () => ({}) } as unknown as RuntimeClient);
    const input = { provider: 'codex', context: { metadata: { channelId: 'conversation-a' } }, skills: resolveSkillProfileManifest({ profileId: AGENCY_PLUGIN.skills[0].id }) } as RuntimeSessionCreateInput;
    await client.createSession(input);
    const ordinary = await client.createSession({ ...input, skills: undefined });
    state = f.manager.inventory();
    await f.manager.disable({ revision: state.revision, remove: false, confirmedSessions: [], confirmedRuns: [] });
    await assert.rejects(client.createSession({ ...input, skills: undefined }), /new conversation/);
    await assert.rejects(client.sendMessage('s-1', 'continue'), /new conversation/);
    await assert.rejects(client.sendMessage(ordinary.id, 'continue'), /new conversation/);
    await client.createSession({ ...input, skills: undefined, context: { metadata: { channelId: 'fresh-conversation' } } });
    assert.equal(creates, 3);
  } finally { f.cleanup(); }
});
test('does not delete unexpected bytes, user files, or accept a different Runtime identity', async () => {
  const f = fixture();
  try {
    let state = await f.manager.install(archive, 0); state = await f.manager.enable(state.revision);
    writeFileSync(join(f.root, 'manual-skill.md'), 'user-owned');
    f.observed.runtimeId = 'different-runtime';
    state = await f.manager.disable({ revision: state.revision, remove: true, confirmedSessions: [], confirmedRuns: [] });
    assert.equal(state.phase, 'fencing'); assert.ok(existsSync(f.archivePath));
    assert.match(state.error ?? '', /identity changed/);
    f.observed.runtimeId = 'test-runtime'; writeFileSync(f.archivePath, 'unexpected bytes'); await f.manager.tick();
    assert.ok(existsSync(f.archivePath)); assert.equal(readFileSync(join(f.root, 'manual-skill.md'), 'utf8'), 'user-owned');
  } finally { f.cleanup(); }
});
