import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';
import { settleDesktopCandidateStartup, startDesktopCandidateControl } from '../build/desktop/candidateControl.js';
import { resolveDesktopCandidateProfile } from '../build/desktop/candidateProfile.js';
import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { ManagedServiceSupervisor } from '../build/desktop/processSupervisor.js';
import {
  candidateEnvironment, operateCandidate, parseCandidateArgs, readCandidateControl,
  resolveCandidateWorkspace, snapshotCandidateSource, startCandidate,
} from '../scripts/desktop-candidate.mjs';

const exec = promisify(execFile);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-candidate-command-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('candidate command validates options and strips inherited controller/credential settings', () => {
  assert.equal(parseCandidateArgs(['start', '--root', 'new', '--plugin-policy', 'internal-experiment'])['plugin-policy'], 'internal-experiment');
  assert.throws(() => parseCandidateArgs(['start', '--root', 'new', '--plugin-policy', 'public']));
  assert.equal(parseCandidateArgs(['start', '--root', 'new', '--workspace', '..']).workspace, '..');
  assert.equal(parseCandidateArgs(['start', '--root', 'new', '--platform-dependencies', '../base'])['platform-dependencies'], '../base');
  assert.equal(parseCandidateArgs(['input', '--root', 'new', '--action', 'action.json']).action, 'action.json');
  for (const args of [[], ['start'], ['stop', '--root', 'x', '--workspace', 'y'],
    ['start', '--root', 'x', '--root', 'y'], ['start', '--root', '--workspace'], ['input', '--root', 'x']]) {
    assert.throws(() => parseCandidateArgs(args));
  }
  assert.deepEqual(candidateEnvironment({ PATH: '/bin', HOME: '/home/user', DISPLAY: ':1',
    CATS_RUNTIME_BASE_URL: 'http://remote', CATS_PLATFORM_DIR: '/real', OPENAI_API_KEY: 'secret',
    ANTHROPIC_API_KEY: 'secret', NODE_OPTIONS: '--require unsafe', ELECTRON_RUN_AS_NODE: '1',
    CODEX_HOME: '/real/provider' }), { PATH: '/bin', HOME: '/home/user', DISPLAY: ':1' });
});

test('source snapshot accepts a non-Git parent, includes edits and excludes ignored/private state', async (t) => {
  const root = await temporary(t);
  const platform = path.join(root, 'cats-platform');
  const runtime = path.join(root, 'cats-runtime');
  for (const [directory, name] of [[platform, 'platform'], [runtime, 'runtime']]) {
    await mkdir(path.join(directory, 'src'), { recursive: true });
    await mkdir(path.join(directory, 'node_modules'));
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: `@cats-inc/cats-${name}` }));
    await writeFile(path.join(directory, 'package-lock.json'), '{}');
    await writeFile(path.join(directory, '.gitignore'), 'node_modules\n.env\nbuild\n');
    await writeFile(path.join(directory, 'src', 'edited.ts'), 'original');
    await exec('git', ['init', '--quiet'], { cwd: directory, windowsHide: true });
    await exec('git', ['add', '.'], { cwd: directory, windowsHide: true });
    await exec('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture'], { cwd: directory, windowsHide: true });
  }
  await writeFile(path.join(platform, 'src', 'edited.ts'), 'changed');
  await writeFile(path.join(platform, 'src', 'new.ts'), 'new source');
  await writeFile(path.join(platform, 'src', '.env'), 'secret');
  await writeFile(path.join(platform, '.env'), 'secret');
  await writeFile(path.join(platform, 'notes.txt'), 'private notes');
  assert.deepEqual(await resolveCandidateWorkspace(root), { platformRoot: platform, runtimeRoot: runtime });
  assert.deepEqual(await resolveCandidateWorkspace(platform), { platformRoot: platform, runtimeRoot: runtime });
  const target = path.join(root, 'snapshot');
  const first = await snapshotCandidateSource(platform, target);
  assert.equal(first.dirty, true);
  assert.equal(await readFile(path.join(target, 'src', 'edited.ts'), 'utf8'), 'changed');
  assert.equal(await readFile(path.join(target, 'src', 'new.ts'), 'utf8'), 'new source');
  for (const filename of ['.env', 'notes.txt', 'src/.env', '.git/config']) {
    await assert.rejects(readFile(path.join(target, filename)), { code: 'ENOENT' });
  }
  await writeFile(path.join(platform, 'src', 'edited.ts'), 'next edit');
  const second = await snapshotCandidateSource(platform, path.join(root, 'snapshot-2'));
  assert.notEqual(second.sourceDigest, first.sourceDigest);
  await assert.rejects(startCandidate({ workspace: root, root: path.join(platform, 'candidate') }), /outside both/u);
  await assert.rejects(startCandidate({ workspace: root, root: target }), { code: 'EEXIST' });
  const linked = path.join(platform, 'src', 'linked');
  await symlink(path.join(runtime, 'src'), linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(snapshotCandidateSource(platform, path.join(root, 'snapshot-linked')), /Linked source input/u);
});

test('two member worktrees use explicit matching dependency checkouts without changing source work', async t => {
  const root = await temporary(t);
  for (const member of ['platform', 'runtime']) {
    const source = path.join(root, `cats-${member}`), worktree = path.join(root, `work-${member}`);
    await mkdir(path.join(source, 'src'), { recursive: true }); await mkdir(path.join(source, 'node_modules'));
    await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: `@cats-inc/cats-${member}` }));
    await writeFile(path.join(source, 'package-lock.json'), '{}');
    await writeFile(path.join(source, '.gitignore'), 'node_modules\n');
    await writeFile(path.join(source, 'src', 'input.ts'), 'baseline');
    const git = async (...args) => (await exec('git', args, { cwd: source, windowsHide: true })).stdout.trim();
    await git('init', '--quiet'); await git('add', '.');
    await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
    const base = await git('rev-parse', 'HEAD');
    await git('worktree', 'add', '--detach', worktree, base);
    await writeFile(path.join(source, 'src', 'input.ts'), 'unrelated source edit');
    await writeFile(path.join(worktree, 'src', 'input.ts'), 'candidate edit');
    await assert.rejects(snapshotCandidateSource(worktree, path.join(root, `missing-${member}`)), { code: 'ENOENT' });
    const target = path.join(root, `snapshot-${member}`);
    const receipt = await snapshotCandidateSource(worktree, target, source);
    assert.equal(receipt.head, base); assert.equal(receipt.dirty, true);
    assert.equal(receipt.gitCommonDirectory, path.join(source, '.git'));
    assert.equal(receipt.dependencyRoot, source);
    assert.equal(await readFile(path.join(target, 'src', 'input.ts'), 'utf8'), 'candidate edit');
    assert.equal(await readFile(path.join(source, 'src', 'input.ts'), 'utf8'), 'unrelated source edit');
    await writeFile(path.join(source, 'package-lock.json'), '{"changed":true}');
    await assert.rejects(snapshotCandidateSource(worktree, path.join(root, `mismatch-${member}`), source), /Dependency checkout package\/lock differs/u);
    await writeFile(path.join(source, 'package-lock.json'), '{}');
    await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: `@cats-inc/cats-${member}`, version: 'different' }));
    await assert.rejects(snapshotCandidateSource(worktree, path.join(root, `manifest-mismatch-${member}`), source), /Dependency checkout package\/lock differs/u);
  }
});

test('candidate-only control authenticates, captures only its window and confirms graceful drain', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-candidate-control-'));
  const candidateRoot = path.join(root, 'candidate');
  await mkdir(candidateRoot);
  const profile = resolveDesktopCandidateProfile({
    env: { CATS_DESKTOP_CANDIDATE_ROOT: candidateRoot, CATS_DESKTOP_APP_HOST: '127.0.0.1',
      CATS_DESKTOP_RUNTIME_HOST: '127.0.0.1', CATS_DESKTOP_APP_PORT: '43121', CATS_DESKTOP_RUNTIME_PORT: '43122' },
    normalCatsHomeDir: path.join(root, 'normal'), normalElectronDirs: [],
  });
  const token = randomBytes(32).toString('hex');
  const launchId = createHash('sha256').update(token).digest('hex');
  await writeFile(path.join(candidateRoot, 'launch.json'), JSON.stringify({ launchId }));
  let stopped = 0;
  let captured = 0;
  let applied = 0;
  let invalidated = 0;
  let replacement;
  let releaseDrain;
  const drain = new Promise((resolve) => { releaseDrain = resolve; });
  const png = Buffer.from('candidate image');
  const image = { png, frameId: randomBytes(16).toString('hex'), width: 800, height: 600 };
  const controller = await startDesktopCandidateControl({ profile, token,
    status: () => ({ services: [{ ready: stopped === 0, pid: stopped === 0 ? 42 : null }] }),
    screenshot: async () => { captured += 1; return image; },
    input: async () => { applied += 1; },
    invalidate: () => { invalidated += 1; },
    stop: () => { stopped += 1; void drain.then(() => controller.close(0)); },
  });
  t.after(async () => {
    try {
      if (!stopped) await controller.close(1);
      await replacement?.close(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  const { control } = await readCandidateControl(candidateRoot);
  const auth = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${control.url}/status`)).status, 403);
  assert.equal((await fetch(`${control.url}/stop`, { method: 'POST', headers: { ...auth, Origin: 'http://website' } })).status, 403);
  assert.equal(stopped, 0);
  const status = await operateCandidate('status', candidateRoot);
  assert.equal(status.launchId, launchId);
  assert.equal(status.services[0].ready, true);
  const descriptor = await operateCandidate('evidence', candidateRoot);
  assert.deepEqual(await json(descriptor.filename), { root: candidateRoot, launchId, instanceId: control.instanceId });
  assert.equal((await readFile(descriptor.filename, 'utf8')).includes(token), false);
  const shot = await operateCandidate('screenshot', candidateRoot);
  assert.deepEqual(await readFile(shot.filename), png);
  assert.equal(captured, 1);
  assert.equal(shot.frameId, image.frameId);
  assert.equal(shot.width, 800);
  assert.equal(shot.instanceId, control.instanceId);
  const actionFile = path.join(root, 'action.json');
  const action = { instanceId: control.instanceId, frameId: shot.frameId, kind: 'text', text: 'private sentinel' };
  await writeFile(actionFile, JSON.stringify({ ...action, instanceId: 'wrong-host' }));
  await assert.rejects(operateCandidate('input', candidateRoot, actionFile), /this candidate instanceId/u);
  const post = (body, headers = { 'Content-Type': 'application/json' }) => fetch(`${control.url}/input`, {
    method: 'POST', headers: { ...auth, ...headers }, body,
  });
  assert.equal((await post(JSON.stringify({ ...action, instanceId: 'wrong-host' }))).status, 409);
  assert.equal((await post('bad json')).status, 400);
  assert.equal((await post('x'.repeat(33 * 1024))).status, 413);
  assert.equal((await post('{}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal(applied, 0);
  await writeFile(actionFile, JSON.stringify(action));
  const receipt = await operateCandidate('input', candidateRoot, actionFile);
  assert.equal(receipt.input, 'applied');
  assert.equal(JSON.stringify(receipt).includes('private sentinel'), false);
  assert.equal(applied, 1);
  await assert.rejects(operateCandidate('invalid', candidateRoot), /Invalid candidate operation/u);
  assert.equal(JSON.stringify(status).includes(token), false);
  const body = JSON.stringify(action);
  let partial;
  let accepted;
  const headersAccepted = new Promise((resolve) => { accepted = resolve; });
  const pendingInput = new Promise((resolve, reject) => {
    partial = httpRequest(`${control.url}/input`, { method: 'POST', headers: { ...auth,
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Expect: '100-continue' } },
    (response) => { response.resume(); resolve(response.statusCode); });
    partial.once('continue', accepted);
    partial.once('error', reject);
    partial.flushHeaders();
  });
  await headersAccepted;
  partial.write(body.slice(0, 10));
  await fetch(`${control.url}/stop`, { method: 'POST', headers: auth });
  partial.end(body.slice(10));
  assert.equal(await pendingInput, 409, 'stop must fence an input whose body is still arriving');
  await fetch(`${control.url}/stop`, { method: 'POST', headers: auth });
  assert.equal(stopped, 1);
  assert.equal(invalidated, 1);
  assert.equal((await post(JSON.stringify(action))).status, 404);
  assert.equal(applied, 1);
  const exitFile = path.join(candidateRoot, `exit-${control.instanceId}.json`);
  await assert.rejects(readFile(exitFile), { code: 'ENOENT' });
  releaseDrain();
  const terminal = await operateCandidate('stop', candidateRoot);
  assert.equal(terminal.state, 'drained');
  assert.equal(terminal.services[0].pid, null);
  assert.deepEqual(await json((await operateCandidate('evidence', candidateRoot)).filename),
    { root: candidateRoot, launchId, instanceId: control.instanceId });
  await assert.rejects(operateCandidate('screenshot', candidateRoot), /has stopped/u);
  await assert.rejects(operateCandidate('input', candidateRoot, actionFile), /has stopped/u);
  replacement = await startDesktopCandidateControl({ profile, token,
    status: () => ({ services: [] }), screenshot: async () => image, input: async () => {}, invalidate() {}, stop() {} });
  const current = await operateCandidate('status', candidateRoot);
  assert.equal(current.state, 'running', 'an old exit receipt cannot describe a replacement host');
  assert.notEqual(current.instanceId, control.instanceId);
  const replacementControl = await json(path.join(candidateRoot, 'control.json'));
  await writeFile(path.join(candidateRoot, 'control.json'), JSON.stringify({ ...replacementControl, url: 'https://example.com' }));
  await assert.rejects(readCandidateControl(candidateRoot), /does not match/u);
  assert.equal((await json(exitFile)).launchId, launchId);
});

test('candidate stop settles real supervisor startup before draining, including startup rejection', async (t) => {
  const root = await temporary(t);
  for (const fails of [false, true]) {
    const directory = path.join(root, String(fails));
    await mkdir(directory);
    const config = resolveDesktopHostConfig({ env: {}, userDataDir: path.join(directory, 'electron'),
      catsHomeDir: path.join(directory, 'cats') });
    for (const key of ['appEntryScript', 'runtimeEntryScript', 'preloadScript']) {
      config.paths[key] = path.join(directory, `${key}.js`);
      await writeFile(config.paths[key], '// synthetic source');
    }
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    let entered;
    const starting = new Promise((resolve) => { entered = resolve; });
    const children = [];
    const supervisor = new ManagedServiceSupervisor(config, { env: {},
      spawn: () => {
        const child = new EventEmitter();
        Object.assign(child, { pid: 100 + children.length, exitCode: null, signalCode: null,
          stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() });
        child.stdin.on('finish', () => setImmediate(() => { child.exitCode = 0; child.emit('exit', 0, null); }));
        children.push(child);
        return child;
      },
      waitForServiceReadiness: async () => {
        entered();
        await pending;
        if (fails) children[0].stderr.write(`${JSON.stringify({ event: 'runtime.startup_error',
          service: 'cats-runtime', phase: 'failed', error: 'fixture startup failure' })}\n`);
        return { ok: true };
      },
    });
    const startup = supervisor.startAll();
    await starting;
    let drained = false;
    const shutdown = (async () => {
      await settleDesktopCandidateStartup(startup);
      await supervisor.stopAll();
      drained = true;
    })();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drained, false);
    release();
    await shutdown;
    assert.equal(children.length, fails ? 1 : 2);
    assert.ok(children.every((child) => child.exitCode === 0), 'late startup must not leave a child after drain');
    assert.ok(supervisor.getSnapshots().every((service) => service.pid === null && !service.ready));
  }
});
