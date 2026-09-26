import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { canonical, digest, readJson } from '../tools/knowledge-practice/artifacts.mjs';
import { createCatlasEffectClient } from '../tools/knowledge-practice/catlasEffectClient.mjs';
import { createCatlasEffectSupervisor } from '../tools/knowledge-practice/catlasEffects.mjs';
import { inspectCatlasEffects } from '../tools/knowledge-practice/inspectEffects.mjs';
import { main } from '../tools/knowledge-practice/cli.mjs';

const target = { provider: 'fixture', instance: 'cli/public', model: 'public-model' };
const project = fileURLToPath(new URL('../', import.meta.url));
const moduleUrl = name => JSON.stringify(pathToFileURL(join(project, 'tools/knowledge-practice', name)).href);
const put = (file, value) => writeFile(file, `${canonical(value)}\n`);
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'cats-effect-inspection-'));
  const leases = [], children = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve)); child.kill(); await stopped;
    }
    for (const lease of leases) { await lease.seal('test_cleanup'); lease.port.close(); await lease.drain(1000); }
    assert.ok(root.startsWith(join(tmpdir(), 'cats-effect-inspection-')));
    await rm(root, { recursive: true, force: true });
  });
  const resetId = randomUUID(), fixtureRoot = join(root, 'resets', resetId), directory = join(fixtureRoot, 'effects');
  await mkdir(fixtureRoot, { recursive: true });
  const input = { resetId, fixtureRoot, remainingTokens: 1000,
    context: { bundle: { digest: digest('knowledge') } }, fixture: { question: 'Public question', observation: {} } };
  const create = { ...target, workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default',
    sharingMode: 'isolated', skills: { requestedSkills: [], strict: true }, context: { metadata: {
      requestId: randomUUID(), knowledgeDigest: input.context.bundle.digest, observationDigest: digest('{}') } } };
  const session = { id: 'public-session', provider: target.provider, model: target.model };
  const options = { evaluationRoot: root, target, runtimeClient: {
    async createSession() { return session; }, async sendMessage() { return { tokensUsed: 42, segments: [] }; },
    async closeSession() {},
  }, async judge() { return { usageTokens: 7 }; },
  async confirmCleanup() { return { status: 'complete', evidenceRefs: ['fixture:cleanup'] }; },
  async reconcile() { return { status: 'complete', evidenceRefs: ['fixture:reconciled'] }; } };
  async function open() {
    const lease = await createCatlasEffectSupervisor(options).open(input); leases.push(lease);
    return { lease, client: createCatlasEffectClient({ port: lease.port, resetId }) };
  }
  const inspect = () => inspectCatlasEffects({ evaluationRoot: root, resetId });
  const send = client => client.runtimeClient.sendMessage(session.id, JSON.stringify({ ...input.fixture, knowledge: [] }), {});
  const inventory = async () => Promise.all((await readdir(directory)).sort().map(async name => [name, digest(await readFile(join(directory, name)))]));
  return { root, resetId, input, create, session, options, directory, fixtureRoot, leases, children, open, inspect, send, inventory };
}

test('inspection and CLI retain complete measured evidence without writing or certifying live cleanup', async t => {
  const f = await setup(t), { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await f.send(client);
  await client.confirmCleanup({ resetId: f.resetId, stage: 'catlas', sessionId: f.session.id });
  const response = { resetId: f.resetId, advice: 'Public fixture.' };
  await client.judge({ response, responseDigest: digest(response), criteria: [] });
  await client.confirmCleanup({ resetId: f.resetId, stage: 'reviewer', sessionId: f.session.id });
  await lease.seal(); await lease.drain();
  const before = await f.inventory(), report = await main(['inspect-effects', '--run', f.root, '--reset', f.resetId]);
  assert.deepEqual(await f.inventory(), before);
  assert.equal(report.structuralStatus, 'consistent'); assert.equal(report.readStable, true);
  assert.equal(report.recordedKnownTokens, 49); assert.equal(report.usageUncertain, false);
  assert.equal(report.effects.length, 5); assert.equal(report.currentCleanup, 'unobserved');
  assert.equal(report.provenance, 'unauthenticated'); assert.equal(report.replayAllowed, false);
  assert.match(report.journalDigest, /^[a-f0-9]{64}$/u); assert.deepEqual(report.target, target);
});

test('historical cleanup observations and a seal cannot certify current process state', async t => {
  const f = await setup(t), { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await lease.seal(); await lease.drain();
  const report = await f.inspect();
  assert.equal(report.structuralStatus, 'consistent'); assert.equal(report.historicalReconciliations.length, 1);
  assert.equal(report.historicalReconciliations[0].observed.status, 'complete');
  assert.equal(report.currentCleanup, 'unobserved'); assert.equal(report.replayAllowed, false);
});

test('a failed transport result retains recorded usage and a created session identity', async t => {
  const f = await setup(t); f.options.runtimeClient.sendMessage = async () => ({ tokensUsed: 42, segments: [undefined] });
  const { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await assert.rejects(f.send(client)); await lease.seal(); await lease.drain();
  const report = await f.inspect();
  assert.equal(report.structuralStatus, 'consistent'); assert.equal(report.recordedKnownTokens, 42);
  assert.equal(report.usageUncertain, false); assert.equal(report.effects[1].settlement, 'failed');
  assert.equal(report.effects[0].recordedClaims[0].sessionId, f.session.id);
});

test('intent-only, unknown usage and conflicting terminals preserve distinct uncertainty', async t => {
  const f = await setup(t); f.options.runtimeClient.sendMessage = async () => ({ segments: [] });
  const { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await f.send(client); await lease.seal(); await lease.drain();
  let report = await f.inspect();
  assert.equal(report.structuralStatus, 'consistent'); assert.equal(report.usageUncertain, true);
  assert.equal(report.effects[1].invocation, 'recorded_invoked'); assert.equal(report.effects[1].recordedTokens, null);
  const terminalFile = join(f.directory, 'effect-0002-result.json'), result = await readJson(terminalFile);
  await put(terminalFile, { ...result, usageTokens: 42 });
  const { responseDigest, ...failure } = result;
  await put(join(f.directory, 'effect-0002-failure.json'), { ...failure, usageTokens: 63, outcome: 'failed' });
  report = await f.inspect();
  assert.equal(report.structuralStatus, 'invalid'); assert.equal(report.effects[1].settlement, 'unknown');
  assert.equal(report.recordedKnownTokens, 0); assert.equal(report.usageUncertain, true);
  assert.deepEqual(report.effects[1].recordedClaims.map(row => row.usageTokens), [42, 63]);
  await writeFile(join(f.directory, 'effect-0002-failure.json'), '{"partial":');
  report = await f.inspect();
  assert.equal(report.effects[1].settlement, 'unknown'); assert.equal(report.recordedKnownTokens, 0);
  assert.ok(report.diagnostics.some(row => row.code === 'conflicting_terminals'));
});

test('malformed or extra artifacts never reveal file names, parser excerpts or private contents', async t => {
  const f = await setup(t), { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await lease.seal(); await lease.drain();
  const privateText = 'private-marker-do-not-echo';
  await writeFile(join(f.directory, 'effect-0002-intent.json'), `{"secret":"${privateText}`);
  await writeFile(join(f.directory, `${privateText}.json`), privateText);
  const report = await f.inspect();
  assert.equal(report.structuralStatus, 'invalid'); assert.equal(report.usageUncertain, true);
  assert.equal(JSON.stringify(report).includes(privateText), false); assert.equal(report.journalDigest, null);
});

for (const mutation of ['id', 'digest', 'target', 'quota', 'generation', 'generation-before-seal', 'duplicate-json-key']) {
  test(`inconsistent journal ${mutation} is diagnosed without a usage-completeness claim`, async t => {
    const f = await setup(t), { client, lease } = await f.open();
    await client.runtimeClient.createSession(f.create); await f.send(client); await lease.seal(); await lease.drain();
    const intentFile = join(f.directory, 'effect-0002-intent.json'), terminalFile = join(f.directory, 'effect-0002-result.json');
    const intent = await readJson(intentFile), terminal = await readJson(terminalFile);
    if (mutation === 'id') await put(terminalFile, { ...terminal, id: 3 });
    if (mutation === 'digest') await put(terminalFile, { ...terminal, inputDigest: digest('changed') });
    if (mutation === 'target') await put(intentFile, { ...intent, target: { ...target, model: 'foreign' } });
    if (mutation === 'quota') {
      await put(join(f.directory, 'effect-0003-intent.json'), { ...intent, id: 3 });
      await put(join(f.directory, 'effect-0003-result.json'), { ...terminal, id: 3 });
    }
    if (mutation === 'generation') await put(join(f.directory, 'reconcile-0001.json'),
      { generation: 8, currentGeneration: 8, observed: { status: 'complete', evidenceRefs: ['fixture:cleanup'] } });
    if (mutation === 'generation-before-seal') await put(join(f.directory, 'reconcile-0001.json'),
      { generation: 2, currentGeneration: 2, observed: { status: 'complete', evidenceRefs: ['fixture:cleanup'] } });
    if (mutation === 'duplicate-json-key') await writeFile(terminalFile,
      `${canonical(terminal).slice(0, -1)},"usageTokens":42}\n`);
    const report = await f.inspect();
    assert.equal(report.structuralStatus, 'invalid'); assert.equal(report.usageUncertain, true);
    assert.equal(report.journalDigest, null); assert.equal(report.currentCleanup, 'unobserved');
  });
}

test('missing evidence does not become a zero-usage or replay permission claim', async t => {
  const f = await setup(t), report = await f.inspect();
  assert.equal(report.structuralStatus, 'missing'); assert.equal(report.usageUncertain, true);
  assert.equal(report.currentCleanup, 'unobserved'); assert.equal(report.replayAllowed, false);
  await assert.rejects(inspectCatlasEffects({ evaluationRoot: f.root, resetId: '../escape' }));
  await assert.rejects(main(['inspect-effects', '--run', f.root]));
});

test('aliased directories and hard-linked records are rejected before their data is trusted', async t => {
  const f = await setup(t), { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await lease.seal(); await lease.drain();
  const terminalFile = join(f.directory, 'effect-0001-result.json');
  await link(terminalFile, join(f.root, 'linked.json'));
  const report = await f.inspect(); assert.equal(report.structuralStatus, 'invalid'); assert.equal(report.usageUncertain, true);
  const secondId = randomUUID(), secondRoot = join(f.root, 'resets', secondId);
  await symlink(f.fixtureRoot, secondRoot, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(inspectCatlasEffects({ evaluationRoot: f.root, resetId: secondId }), /aliases/u);
});

test('file count and record size are bounded before parsing', async t => {
  const f = await setup(t); await mkdir(f.directory);
  await writeFile(join(f.directory, 'effect-0001-intent.json'), 'x'.repeat(16 * 1024 + 1));
  assert.equal((await f.inspect()).structuralStatus, 'invalid');
  for (let index = 0; index < 128; index++) await writeFile(join(f.directory, `extra-${index}.json`), '{}');
  await assert.rejects(f.inspect(), /file count/u);
});

for (const stage of ['create', 'send', 'completed-create']) test(`actual parent process exit at ${stage} retains open evidence without replay`, { timeout: 15_000 }, async t => {
  const f = await setup(t), script = join(f.root, 'parent.mjs');
  await writeFile(script, `import { createCatlasEffectSupervisor } from ${moduleUrl('catlasEffects.mjs')};
    import { createCatlasEffectClient } from ${moduleUrl('catlasEffectClient.mjs')};
    let ready; const started = new Promise(resolve => { ready = resolve; });
    const hang = () => { ready(); return new Promise(() => {}); };
    const supervisor = createCatlasEffectSupervisor({ evaluationRoot: ${JSON.stringify(f.root)},
      target: ${JSON.stringify(target)}, runtimeClient: {
        createSession: ${stage === 'create' ? 'hang' : `async () => (${JSON.stringify(f.session)})`}, sendMessage: hang },
      judge: async () => { throw new Error('No judge allowed'); },
      confirmCleanup: async () => { throw new Error('No cleanup allowed'); },
      reconcile: async () => { throw new Error('No replay allowed'); } });
    const lease = await supervisor.open(${JSON.stringify(f.input)});
    const client = createCatlasEffectClient({ port: lease.port, resetId: ${JSON.stringify(f.resetId)} });
    const creating = client.runtimeClient.createSession(${JSON.stringify(f.create)}); creating.catch(() => {});
    ${stage === 'send' ? `await creating; client.runtimeClient.sendMessage('public-session',
      ${JSON.stringify(JSON.stringify({ ...f.input.fixture, knowledge: [] }))}, {}).catch(() => {});` : ''}
    ${stage === 'completed-create' ? 'await creating; ready();' : ''}
    await started;
    process.send({ stage: ${JSON.stringify(stage)} }, () => process.exit(23));`);
  const child = spawn(process.execPath, [script], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { SystemRoot: process.env.SystemRoot ?? '', TEMP: f.root, TMP: f.root } }); f.children.push(child);
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => resolve(code));
  });
  assert.equal(exited, 23, stderr);
  const before = await f.inventory(), report = await f.inspect();
  assert.equal(report.structuralStatus, 'consistent'); assert.equal(report.sealed, null);
  assert.equal(report.effects.at(-1).invocation, stage === 'completed-create' ? 'recorded_invoked' : 'unknown');
  assert.equal(report.effects.at(-1).settlement, stage === 'completed-create' ? 'returned' : 'unknown');
  assert.equal(report.recordedKnownTokens, 0); assert.equal(report.usageUncertain, true);
  if (stage !== 'create') assert.equal(report.effects[0].recordedClaims[0].sessionId, f.session.id);
  assert.equal(report.replayAllowed, false); assert.deepEqual(await f.inventory(), before);
});
