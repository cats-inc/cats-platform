import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  assertDesktopCandidateActionAllowed,
  assertDesktopCandidatePaths,
  assertDesktopCandidatePortsAvailable,
  createDesktopCandidateEnv,
  initializeDesktopLaunch,
  resolveDesktopCandidateProfile,
} from '../build/desktop/candidateProfile.js';
import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { buildManagedServiceSpecs, ManagedServiceSupervisor } from '../build/desktop/processSupervisor.js';
import { loadDesktopEnvFiles } from '../build/desktop/env.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-candidate-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const normal = path.join(root, 'normal');
  const candidateRoot = path.join(root, 'candidate');
  const env = {
    CATS_DESKTOP_CANDIDATE_ROOT: candidateRoot,
    CATS_DESKTOP_APP_HOST: '127.0.0.1',
    CATS_DESKTOP_RUNTIME_HOST: '127.0.0.1',
    CATS_DESKTOP_APP_PORT: '43120',
    CATS_DESKTOP_RUNTIME_PORT: '43110',
  };
  const input = { env, normalCatsHomeDir: path.join(normal, '.cats'),
    normalElectronDirs: [path.join(normal, 'appData')] };
  const profile = () => resolveDesktopCandidateProfile(input);
  return { root, normal, candidateRoot, env, input, profile };
}

function fakeApp(normal, trace, locks = new Set()) {
  const paths = { appData: path.join(normal, 'appData'), userData: path.join(normal, 'appData', 'Cats'),
    sessionData: path.join(normal, 'appData', 'Cats') };
  return {
    paths,
    getPath: (name) => paths[name],
    setPath: (name, value) => { trace.push(['path', name, value]); paths[name] = value; },
    setName: (name) => trace.push(['name', name]),
    setAppUserModelId: (name) => trace.push(['identity', name]),
    requestSingleInstanceLock: () => {
      trace.push(['lock', paths.userData]);
      if (locks.has(paths.userData)) return false;
      locks.add(paths.userData);
      return true;
    },
  };
}

function initialize(app, fixture_, extra = {}) {
  return initializeDesktopLaunch(app, {
    env: { ...fixture_.env }, normalCatsHomeDir: fixture_.input.normalCatsHomeDir,
    normalUserDataDir: path.join(fixture_.normal, 'appData', 'Cats'),
    loadNormalEnvFiles: () => assert.fail('Candidate must never read normal dotenv.'),
    changeCwd: () => {}, ...extra,
  });
}

test('candidate validates absolute non-root storage and both directions of normal-data overlap', async (t) => {
  const f = await fixture(t);
  for (const value of ['', '.', path.parse(f.root).root, f.normal, f.input.normalCatsHomeDir,
    path.join(f.input.normalCatsHomeDir, 'acceptance'), f.input.normalElectronDirs[0],
    path.join(f.input.normalElectronDirs[0], 'acceptance')]) {
    assert.throws(() => resolveDesktopCandidateProfile({ ...f.input,
      env: { ...f.env, CATS_DESKTOP_CANDIDATE_ROOT: value } }), /Candidate root/u);
  }
  assert.equal(resolveDesktopCandidateProfile({ ...f.input, env: {} }), null);
  const regularFile = path.join(f.root, 'file');
  await writeFile(regularFile, 'not a directory');
  assert.throws(() => resolveDesktopCandidateProfile({ ...f.input,
    env: { ...f.env, CATS_DESKTOP_CANDIDATE_ROOT: regularFile } }), /directory/u);
});

test('candidate canonicalizes missing symlink ancestors and refuses nested directory escapes', async (t) => {
  const f = await fixture(t);
  await mkdir(f.input.normalCatsHomeDir, { recursive: true });
  const alias = path.join(f.root, 'alias');
  await symlink(f.input.normalCatsHomeDir, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => resolveDesktopCandidateProfile({ ...f.input,
    env: { ...f.env, CATS_DESKTOP_CANDIDATE_ROOT: path.join(alias, 'missing', 'child') } }), /overlaps/u);
  const profile = f.profile();
  await mkdir(profile.root, { recursive: true });
  await symlink(f.input.normalCatsHomeDir, profile.homeDir, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertDesktopCandidatePaths(profile), /escapes/u);
});

test('candidate refuses shared listeners and conflicting inherited storage or Runtime endpoint', async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { CATS_DESKTOP_APP_HOST: '0.0.0.0' }, { CATS_HOST: '0.0.0.0' },
    { CATS_DESKTOP_APP_PORT: undefined }, { CATS_DESKTOP_APP_PORT: '8181' },
    { CATS_DESKTOP_RUNTIME_PORT: '3110' }, { CATS_DESKTOP_APP_PORT: '43110' },
    { CATS_DESKTOP_APP_PORT: '43120extra' }, { CATS_DESKTOP_APP_PORT: '65536' },
    { CATS_PORT: '8181' }, { CATS_PLATFORM_DIR: f.normal }, { CATS_RUNTIME_DIR: f.normal },
    { CATS_DESKTOP_DIR: f.normal }, { CATS_DESKTOP_PACKAGING_OUTPUT_ROOT: f.normal },
    { CATS_RUNTIME_BASE_URL: 'http://127.0.0.1:3110' }, { CATS_RUNTIME_ENV_FILE: path.join(f.normal, '.env') },
    { CATS_RUNTIME_CATALOG_CONFIG_PATH: path.join(f.normal, 'providers.yaml') },
  ]) assert.throws(() => resolveDesktopCandidateProfile({ ...f.input, env: { ...f.env, ...patch } }));
});

test('candidate sets its identity and every Electron path before lock and ignores normal dotenv', async (t) => {
  const f = await fixture(t);
  const trace = [];
  const app = fakeApp(f.normal, trace);
  const env = { ...f.env, HOME: f.normal, USERPROFILE: f.normal,
    APPDATA: path.join(f.normal, 'appData'), CATS_AUTH_SESSION_SECRET: 'normal-profile-secret' };
  const launch = initialize(app, f, { env, changeCwd: (cwd) => trace.push(['cwd', cwd]) });
  assert.equal(launch.gotLock, true);
  assert.deepEqual(trace.at(-1), ['lock', launch.candidate.userDataDir]);
  assert.equal(app.paths.appData, launch.candidate.appDataDir);
  assert.equal(app.paths.sessionData, launch.candidate.userDataDir);
  assert.equal(app.paths.home, launch.candidate.homeDir);
  assert.equal(env.CATS_AUTH_SESSION_SECRET, undefined);
  assert.equal(env.HOME, f.normal);
  assert.equal(env.USERPROFILE, f.normal);
  assert.equal(env.APPDATA, path.join(f.normal, 'appData'));
  assert.equal(env.CATS_RUNTIME_DIR, path.join(launch.candidate.catsHomeDir, 'runtime'));
  assert.deepEqual(trace.at(-2), ['cwd', launch.candidate.hostCwd]);
  const relaunched = initialize(fakeApp(f.normal, []), f, { env });
  assert.equal(relaunched.candidate.identity, launch.candidate.identity);
});

test('the same candidate shares its own lock while other candidates and normal launch remain separate', async (t) => {
  const f = await fixture(t);
  const locks = new Set();
  const first = initialize(fakeApp(f.normal, [], locks), f);
  const second = initialize(fakeApp(f.normal, [], locks), f);
  assert.equal(first.gotLock, true);
  assert.equal(second.gotLock, false);
  assert.equal(first.candidate.identity, second.candidate.identity);
  const other = initialize(fakeApp(f.normal, [], locks), f,
    { env: { ...f.env, CATS_DESKTOP_CANDIDATE_ROOT: path.join(f.root, 'other') } });
  assert.equal(other.gotLock, true);
  assert.notEqual(other.candidate.identity, first.candidate.identity);
  const trace = [];
  const normal = initialize(fakeApp(f.normal, trace, locks), f, { env: {},
    loadNormalEnvFiles: () => trace.push(['dotenv']), changeCwd: () => assert.fail('Normal cwd changed.') });
  assert.equal(normal.candidate, null);
  assert.equal(normal.gotLock, true);
  assert.deepEqual(trace.map((entry) => entry[0]), ['dotenv', 'lock', 'path']);
});

test('candidate sidecars isolate home, state, logs, cwd and cookie secrets without changing artifact inputs', async (t) => {
  const f = await fixture(t);
  const profile = f.profile();
  const config = resolveDesktopHostConfig({ candidateProfile: profile, env: f.env,
    userDataDir: f.normal, packaged: true, resourcesPath: path.join(f.root, 'resources') });
  const [runtime, platform] = buildManagedServiceSpecs(config, {
    HOME: f.normal, USERPROFILE: f.normal, CODEX_HOME: path.join(f.normal, '.codex'),
    CLAUDE_PROJECTS_DIR: path.join(f.normal, '.claude', 'projects'),
    CATS_AUTH_SESSION_SECRET: 'shared-cookie-secret', CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP: 'true',
  });
  assert.equal(runtime.cwd, profile.runtimeCwd);
  assert.equal(platform.cwd, profile.appCwd);
  assert.equal(runtime.args[0], config.paths.runtimeEntryScript);
  assert.equal(platform.args[0], config.paths.appEntryScript);
  for (const spec of [runtime, platform]) {
    assert.equal(spec.env.HOME, profile.homeDir);
    assert.equal(spec.env.USERPROFILE, profile.homeDir);
    assert.equal(spec.env.CODEX_HOME, path.join(profile.homeDir, '.codex'));
    assert.equal(spec.env.CLAUDE_PROJECTS_DIR, path.join(profile.homeDir, '.claude', 'projects'));
    assert.equal(spec.env.CATS_AUTH_SESSION_SECRET, undefined);
    assert.equal(spec.env.CATS_DESKTOP_MOBILE_PAIRING_ENABLED, 'false');
    assert.equal(spec.env.CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP, 'false');
    assert.equal(spec.env.CATS_RUNTIME_BASE_URL, `http://127.0.0.1:${profile.runtimePort}`);
    assert.ok(spec.logPath.startsWith(profile.root + path.sep));
  }
  assert.equal(config.background.closeBehavior, 'quit');
  assert.equal(config.update.checkOnStartup, false);
  assert.throws(() => resolveDesktopHostConfig({ env: f.env, userDataDir: f.normal }), /before resolving/u);
});

test('candidate host dotenv is skipped and sidecars do not inherit checkout cwd dotenv', async (t) => {
  const f = await fixture(t);
  const checkout = path.join(f.root, 'checkout');
  const normalDesktop = path.join(f.normal, '.cats', 'desktop');
  await mkdir(checkout, { recursive: true });
  await mkdir(normalDesktop, { recursive: true });
  await writeFile(path.join(checkout, '.env'), 'CANDIDATE_CONTAMINATION=checkout\n');
  await writeFile(path.join(normalDesktop, '.env'), 'CANDIDATE_CONTAMINATION=desktop\n');
  const env = { ...f.env };
  const { candidate } = initialize(fakeApp(f.normal, []), f, { env,
    loadNormalEnvFiles: () => loadDesktopEnvFiles({ cwd: checkout, desktopDir: normalDesktop, env }) });
  assert.equal(env.CANDIDATE_CONTAMINATION, undefined);
  const config = resolveDesktopHostConfig({ candidateProfile: candidate, env,
    userDataDir: candidate.userDataDir });
  for (const spec of buildManagedServiceSpecs(config, env)) {
    const childEnv = { ...spec.env };
    assert.deepEqual(loadDesktopEnvFiles({ cwd: spec.cwd, desktopDir: childEnv.CATS_DESKTOP_DIR, env: childEnv }), []);
    assert.equal(childEnv.CANDIDATE_CONTAMINATION, undefined);
  }
});

async function listeningServer(t) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.listening ? server.close(resolve) : resolve()));
  return server;
}

test('candidate rejects an occupied listener without adopting it, then releases every preflight socket', async (t) => {
  const f = await fixture(t);
  const app = await listeningServer(t);
  const runtime = await listeningServer(t);
  const profile = resolveDesktopCandidateProfile({ ...f.input, env: { ...f.env,
    CATS_DESKTOP_APP_PORT: String(app.address().port), CATS_DESKTOP_RUNTIME_PORT: String(runtime.address().port) } });
  await assert.rejects(assertDesktopCandidatePortsAvailable(profile), /unavailable/u);
  await new Promise((resolve) => app.close(resolve));
  await assert.rejects(assertDesktopCandidatePortsAvailable(profile), /unavailable/u);
  await new Promise((resolve) => runtime.close(resolve));
  await assertDesktopCandidatePortsAvailable(profile);
  await assertDesktopCandidatePortsAvailable(profile);
});

test('candidate mutation gates fail closed while ordinary host actions remain compatible', async (t) => {
  const profile = (await fixture(t)).profile();
  for (const action of ['setup-helper', 'resume_setup', 'provider-install', 'packaging', 'update', 'mobile-pairing']) {
    assert.throws(() => assertDesktopCandidateActionAllowed(profile, action), /unavailable in a candidate/u);
    assert.doesNotThrow(() => assertDesktopCandidateActionAllowed(null, action));
  }
  for (const action of ['retry', 'retry_cli_scan', 'open_chat', 'open_setup', 'quit']) {
    assert.doesNotThrow(() => assertDesktopCandidateActionAllowed(profile, action));
  }
  // These are the production entry points; no tests patch Electron or an updater
  // into enabling installation behind the profile's denied capability.
  const main = await readFile(path.join(process.cwd(), 'desktop', 'host', 'main.ts'), 'utf8');
  assert.equal((main.match(/if \(!candidate\) await syncDesktopStartupPreferences/gu) ?? []).length, 2);
  assert.match(main, /if \(!hostConfig \|\| hostConfig\.candidateProfile\) return;/u);
  assert.match(main, /assertDesktopCandidateActionAllowed\(hostConfig\.candidateProfile, 'setup-helper'\)/u);
  assert.match(main, /assertDesktopCandidateActionAllowed\(hostConfig\?\.candidateProfile, 'provider-install'\)/u);
  assert.match(main, /if \(config\.candidateProfile\) \{\s*return createDesktopUpdateManager\(/u);
});

test('candidate supervisor requires its own lifecycle readiness even when another health endpoint answers', async (t) => {
  const f = await fixture(t);
  const appPort = await listeningServer(t);
  const runtimePort = await listeningServer(t);
  Object.assign(f.env, { CATS_DESKTOP_APP_PORT: String(appPort.address().port),
    CATS_DESKTOP_RUNTIME_PORT: String(runtimePort.address().port) });
  await new Promise((resolve) => appPort.close(resolve));
  await new Promise((resolve) => runtimePort.close(resolve));
  const profile = f.profile();
  const config = resolveDesktopHostConfig({ candidateProfile: profile, env: f.env,
    userDataDir: profile.userDataDir });
  for (const key of ['appEntryScript', 'runtimeEntryScript', 'preloadScript']) {
    config.paths[key] = path.join(f.root, `${key}.js`);
    await writeFile(config.paths[key], '// isolated fixture\n');
  }
  const child = new EventEmitter();
  Object.assign(child, { pid: 123, exitCode: null, signalCode: null,
    stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
    kill: () => { child.exitCode = 1; child.emit('exit', 1, null); return true; } });
  let spawns = 0;
  const supervisor = new ManagedServiceSupervisor(config, {
    env: createDesktopCandidateEnv(profile, {}),
    spawn: () => {
      spawns += 1;
      setTimeout(() => { child.exitCode = 1; child.emit('exit', 1, null); }, 30);
      return child;
    },
    waitForServiceReadiness: async () => ({ ok: true }),
  });
  await assert.rejects(supervisor.startAll(), /exited before readiness/u);
  assert.equal(spawns, 1);
  assert.equal(supervisor.getSnapshots().find((entry) => entry.name === 'cats-runtime').ready, false);
});
