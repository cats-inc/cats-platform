#!/usr/bin/env node
/**
 * Build current Cats sources in a private snapshot and operate its Desktop.
 * Requires installed development dependencies in Platform and Runtime; no installs.
 * Usage: node scripts/desktop-candidate.mjs start --workspace <cats-inc|cats-platform> --root <new-directory>
 *        node scripts/desktop-candidate.mjs <status|screenshot|stop|evidence> --root <directory>
 *        node scripts/desktop-candidate.mjs input --root <directory> --action <json-file>
 * See docs/deployment.md#source-candidate-command. No installs or release.
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { open, readFile, writeFile, mkdir, realpath, lstat, symlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = async (filename) => JSON.parse(await readFile(filename, 'utf8'));

async function writeJson(filename, value) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filename);
}

export function parseCandidateArgs(args) {
  const [command, ...rest] = args;
  if (command === '--help' || command === '-h') return { command: 'help' };
  if (!['start', 'status', 'screenshot', 'input', 'stop', 'evidence'].includes(command)) {
    throw new Error('Expected start, status, screenshot, input, stop or evidence. Use --help.');
  }
  const options = { command };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!['--root', ...(command === 'start' ? ['--workspace', '--runtime-root', '--platform-dependencies', '--runtime-dependencies'] : []),
      ...(command === 'input' ? ['--action'] : [])].includes(key)
      || !value || value.startsWith('--') || options[key.slice(2)] !== undefined) {
      throw new Error(`Invalid or repeated option: ${key}`);
    }
    options[key.slice(2)] = value;
  }
  if (!options.root) throw new Error('--root is required; start requires a new directory.');
  if (command === 'input' && !options.action) throw new Error('input requires --action <json-file>.');
  options.root = path.resolve(options.root);
  return options;
}

export function candidateEnvironment(base) {
  // Keep OS/session essentials, never inherited provider tokens, Node injection,
  // Cats endpoints, config overrides or the controller's selected provider state.
  return Object.fromEntries(Object.entries(base).filter(([key, value]) => value !== undefined
    && /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|SYSTEMDRIVE|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|XDG_(?:RUNTIME_DIR|CONFIG_HOME|DATA_HOME|STATE_HOME|CACHE_HOME)|LANG|LC_.*)$/iu.test(key)));
}

async function packageAt(root, name) {
  const resolved = await realpath(root);
  if ((await readJson(path.join(resolved, 'package.json'))).name !== name) {
    throw new Error(`Expected ${name} checkout at ${resolved}.`);
  }
  return resolved;
}

export async function resolveCandidateWorkspace(workspace, runtimeOverride) {
  let platformRoot;
  try { platformRoot = await packageAt(workspace, '@cats-inc/cats-platform'); }
  catch { platformRoot = await packageAt(path.join(workspace, 'cats-platform'), '@cats-inc/cats-platform'); }
  const runtimeRoot = await packageAt(runtimeOverride ?? path.join(platformRoot, '..', 'cats-runtime'),
    '@cats-inc/cats-runtime');
  return { platformRoot, runtimeRoot };
}

function within(root, child) {
  const relative = path.relative(root, child);
  return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

const sourceDirectories = new Set(['src', 'desktop', 'packages', 'config', 'assets', 'public', 'scripts', 'runtime-skills']);
const sourceFiles = /^(?:package(?:-lock)?\.json|tsconfig(?:\.[\w-]+)?\.json|vite\.config\.ts|index\.html|tailwind\.runtime\.config\.cjs)$/u;

export async function snapshotCandidateSource(source, target, dependencySource = source) {
  const git = async (...args) => (await exec('git', args, { cwd: source, windowsHide: true,
    maxBuffer: 16 * 1024 * 1024 })).stdout;
  const head = (await git('rev-parse', 'HEAD')).trim();
  const gitCommonDirectory = await realpath((await git('rev-parse', '--path-format=absolute', '--git-common-dir')).trim());
  const dirty = Boolean(await git('status', '--porcelain', '-z'));
  const filenames = [...new Set((await git('ls-files', '--cached', '--others', '--exclude-standard', '-z'))
    .split('\0').filter(Boolean))].sort();
  const digest = createHash('sha256');
  let files = 0;
  const checked = new Set();
  for (const filename of filenames) {
    if (!sourceDirectories.has(filename.split('/')[0]) && !sourceFiles.test(filename)) continue;
    if (filename.split('/').some((part) => part === '.env' || part.startsWith('.env.'))) continue;
    const origin = path.resolve(source, filename);
    if (!within(source, origin) || !within(target, path.resolve(target, filename))) throw new Error('Invalid source path.');
    // Git input symlinks/junctions must not pull in another profile. Explicit
    // dependency links below are the only shared filesystem input.
    let missing = false;
    for (let current = origin; current !== source; current = path.dirname(current)) {
      if (checked.has(current)) break;
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error(`Linked source input: ${filename}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        missing = true; // A tracked file deleted in the working tree stays deleted.
        break;
      }
      checked.add(current);
    }
    if (missing) continue;
    const bytes = await readFile(origin);
    const destination = path.join(target, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    digest.update(filename).update('\0').update(sha256(bytes)).update('\0');
    files += 1;
  }
  const dependencyRoot = await realpath(dependencySource);
  const dependencyLockDigest = sha256(await readFile(path.join(target, 'package-lock.json')));
  const packageDigest = sha256(await readFile(path.join(target, 'package.json')));
  if (sha256(await readFile(path.join(dependencyRoot, 'package-lock.json'))) !== dependencyLockDigest
    || sha256(await readFile(path.join(dependencyRoot, 'package.json'))) !== packageDigest) {
    throw new Error('Dependency checkout package/lock differs from candidate inputs; prepare matching dependencies before building.');
  }
  const dependencies = await realpath(path.join(dependencyRoot, 'node_modules'));
  await symlink(dependencies, path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  return { checkout: source, gitCommonDirectory, head, dirty, files, sourceDigest: digest.digest('hex'),
    dependencyRoot, dependencies, dependencyLockDigest, packageDigest };
}

async function runBuild(cwd, args, env) {
  process.stderr.write(`Building ${path.basename(cwd)}: ${args[0]}\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stderr);
    child.stderr.pipe(process.stderr);
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Build failed (${code}).`)));
  });
}

async function availablePort(excluded = []) {
  const { createServer } = await import('node:net');
  for (;;) {
    const port = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const value = server.address().port;
        server.close((error) => error ? reject(error) : resolve(value));
      });
    });
    if (![8181, 3110, ...excluded].includes(port)) return port;
  }
}

export async function readCandidateControl(root) {
  const [launch, control] = await Promise.all([
    readJson(path.join(root, 'launch.json')), readJson(path.join(root, 'control.json')),
  ]);
  if (control.schemaVersion !== 1 || control.root !== root || control.launchId !== launch.launchId
    || !/^[a-f0-9]{32}$/u.test(control.instanceId)
    || !/^[a-f0-9]{64}$/u.test(control.token) || sha256(control.token) !== launch.launchId
    || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(control.url)
    || new URL(control.url).port > 65535 || !Number.isSafeInteger(control.pid) || control.pid < 1) {
    throw new Error('Candidate control receipt does not match this launch.');
  }
  return { launch, control };
}

async function request(control, route, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`${control.url}/${route}`, { method, redirect: 'error',
      headers: { Authorization: `Bearer ${control.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(route === 'input' ? 20_000 : 10_000) });
  } catch (error) {
    if (route === 'input') throw new Error('Candidate input outcome unconfirmed; inspect a new screenshot before deciding whether to retry.');
    throw error;
  }
  if (!response.ok) throw new Error(route === 'input'
    ? `Candidate input outcome unconfirmed (${response.status}); inspect a new screenshot before deciding whether to retry.`
    : `Candidate ${route} failed (${response.status}).`);
  return response;
}

async function liveStatus(control) {
  const status = await (await request(control, 'status')).json();
  if (status.root !== control.root || status.launchId !== control.launchId || status.pid !== control.pid
    || status.instanceId !== control.instanceId) {
    throw new Error('Candidate response identity mismatch.');
  }
  return status;
}

async function exitReceipt(root, control) {
  try {
    const receipt = await readJson(path.join(root, `exit-${control.instanceId}.json`));
    if (receipt.launchId !== control.launchId || receipt.root !== root || receipt.pid !== control.pid
      || receipt.instanceId !== control.instanceId) throw new Error('Candidate exit identity mismatch.');
    return receipt;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function operateCandidate(command, directory, actionFile) {
  if (command === 'evidence') {
    const status = await operateCandidate('status', directory);
    if (!['running', 'drained'].includes(status.state)) throw new Error('Candidate build is unavailable.');
    const receipt = { root: status.root, launchId: status.launchId, instanceId: status.instanceId };
    const filename = path.join(status.root, 'candidate-evidence.json');
    await writeJson(filename, receipt);
    return { ...receipt, filename, purpose: 'Attach to the owning Work task; source/revision verification occurs at attachment.' };
  }
  if (!['status', 'screenshot', 'input', 'stop'].includes(command)) throw new Error('Invalid candidate operation.');
  const root = await realpath(directory);
  const { launch, control } = await readCandidateControl(root);
  const exited = await exitReceipt(root, control);
  if (exited) {
    if (command === 'screenshot' || command === 'input') throw new Error('Candidate has stopped.');
    return { state: exited.exitCode === 0 ? 'drained' : 'failed', launch, ...exited };
  }
  try {
    const status = await liveStatus(control); // Reconcile identity before any action.
    if (command === 'status') return { state: 'running', launch, ...status };
    if (command === 'input') {
      if (!actionFile) throw new Error('input requires an action JSON file.');
      const file = await open(actionFile, 'r');
      let action;
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 32 * 1024) throw new Error('Action must be a JSON file of at most 32 KiB.');
        const { buffer, bytesRead } = await file.read({ buffer: Buffer.alloc(32 * 1024 + 1) });
        if (bytesRead > 32 * 1024) throw new Error('Action file is too large.');
        try { action = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')); }
        catch { throw new Error('Invalid action JSON.'); } // JSON errors can contain private input text.
      } finally { await file.close(); }
      if (!action || action.instanceId !== control.instanceId || !/^[a-f0-9]{32}$/u.test(action.frameId)) {
        throw new Error('Action must include this candidate instanceId and a fresh screenshot frameId.');
      }
      const result = await (await request(control, 'input', 'POST', action)).json();
      if (result.instanceId !== control.instanceId || result.launchId !== control.launchId || result.input !== 'applied') {
        throw new Error('Candidate input response identity mismatch.');
      }
      return { ...result, next: 'Take a new screenshot and inspect the result before another action.' };
    }
    if (command === 'screenshot') {
      const response = await request(control, 'screenshot', 'POST');
      const frameId = response.headers.get('x-cats-frame-id');
      const width = Number(response.headers.get('x-cats-image-width'));
      const height = Number(response.headers.get('x-cats-image-height'));
      if (frameId && (!/^[a-f0-9]{32}$/u.test(frameId)
        || response.headers.get('x-cats-instance-id') !== control.instanceId
        || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)) {
        throw new Error('Candidate screenshot identity or dimensions mismatch.');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const filename = path.join(root, `screenshot-${Date.now()}.png`);
      await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 });
      return { filename, launchId: launch.launchId, ...status, ...(frameId ? { frameId, width, height } : {}) };
    }
    await request(control, 'stop', 'POST');
  } catch (error) {
    // The window may have closed between the file read and the HTTP response.
    const receipt = await exitReceipt(root, control);
    if (!receipt || command === 'screenshot' || command === 'input') throw error;
    return { state: receipt.exitCode === 0 ? 'drained' : 'failed', ...receipt };
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const receipt = await exitReceipt(root, control);
    if (receipt) return { state: receipt.exitCode === 0 ? 'drained' : 'failed', ...receipt };
    await pause(250);
  }
  throw new Error('Shutdown is not confirmed. Inspect candidate logs; no stored PID was killed.');
}

export async function startCandidate(options) {
  const workspace = await resolveCandidateWorkspace(path.resolve(options.workspace ?? process.cwd()), options['runtime-root']);
  const dependencySources = {
    platform: await packageAt(options['platform-dependencies'] ?? workspace.platformRoot, '@cats-inc/cats-platform'),
    runtime: await packageAt(options['runtime-dependencies'] ?? workspace.runtimeRoot, '@cats-inc/cats-runtime'),
  };
  // Require a new sibling/outside directory; never write build output into the
  // selected checkout or recursively delete/reuse an earlier candidate.
  const parent = await realpath(path.dirname(options.root));
  const root = path.join(parent, path.basename(options.root));
  for (const source of [...Object.values(workspace), ...Object.values(dependencySources)]) {
    if (within(source, root) || within(root, source)) throw new Error('Candidate root must be outside both source checkouts.');
  }
  await mkdir(root, { mode: 0o700 });
  const token = randomBytes(32).toString('hex');
  const launch = { schemaVersion: 1, launchId: sha256(token), root,
    startedAt: new Date().toISOString(), stage: 'building', sources: {} };
  const manifest = path.join(root, 'launch.json');
  await writeJson(manifest, launch);
  const environment = candidateEnvironment(process.env);
  await mkdir(path.join(root, 'tmp'));
  const buildEnv = { ...environment, TEMP: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TMPDIR: path.join(root, 'tmp') };
  try {
    const platform = path.join(root, 'source', 'cats-platform');
    const runtime = path.join(root, 'source', 'cats-runtime');
    launch.sources.platform = await snapshotCandidateSource(workspace.platformRoot, platform, dependencySources.platform);
    launch.sources.runtime = await snapshotCandidateSource(workspace.runtimeRoot, runtime, dependencySources.runtime);
    await writeJson(manifest, launch);
    await runBuild(runtime, ['scripts/build-runtime-ui-css.mjs'], buildEnv);
    await runBuild(runtime, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], buildEnv);
    await runBuild(platform, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], buildEnv);
    await runBuild(platform, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.desktop.json'], buildEnv);
    await runBuild(platform, ['node_modules/vite/bin/vite.js', 'build'], buildEnv);
    const appPort = await availablePort();
    const runtimePort = await availablePort([appPort]);
    launch.stage = 'launching';
    launch.builtAt = new Date().toISOString();
    await writeJson(manifest, launch);
    const log = await open(path.join(root, 'desktop.log'), 'a', 0o600);
    const require = createRequire(path.join(platform, 'package.json'));
    let child;
    try {
      child = spawn(require('electron'), [path.join(platform, 'build', 'desktop', 'main.js')], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
        env: { ...buildEnv, CATS_DESKTOP_CANDIDATE_ROOT: root,
          CATS_DESKTOP_CANDIDATE_CONTROL_TOKEN: token,
          CATS_DESKTOP_APP_HOST: '127.0.0.1', CATS_DESKTOP_APP_PORT: String(appPort),
          CATS_DESKTOP_RUNTIME_HOST: '127.0.0.1', CATS_DESKTOP_RUNTIME_PORT: String(runtimePort),
          CATS_DESKTOP_APP_ROOT: platform, CATS_DESKTOP_RUNTIME_ROOT: runtime },
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
    } finally { await log.close(); }
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Candidate exited (${child.exitCode}); see desktop.log.`);
      try {
        const { control } = await readCandidateControl(root);
        const status = await liveStatus(control);
        if (status.services?.length === 2 && status.services.every((service) => service.ready)
          && status.window && !status.window.loading
          && (status.window.url?.startsWith(`${status.appUrl}/`)
            || (status.window.url === 'bootstrap' && status.phase === 'ready_for_setup'))) {
          launch.stage = 'running';
          await writeJson(manifest, launch);
          return { state: 'running', launch, ...status };
        }
        if (status.services?.some((service) => service.status === 'failed')) break;
      } catch (error) {
        if (error.code !== 'ENOENT' && !['fetch failed', 'The operation was aborted due to timeout'].includes(error.message)) throw error;
      }
      await pause(250);
    }
    await operateCandidate('stop', root);
    throw new Error('Candidate did not become ready and was stopped. Inspect desktop.log.');
  } catch (error) {
    // Reconcile only this root's authenticated host. Never recover by killing a
    // PID loaded from disk (the process may have exited and its PID been reused).
    if (launch.stage === 'launching') {
      try { await operateCandidate('stop', root); }
      catch (cleanupError) { process.stderr.write(`Candidate cleanup unconfirmed: ${cleanupError.message}\n`); }
    }
    launch.stage = 'failed';
    launch.error = error.message;
    await writeJson(manifest, launch);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCandidateArgs(process.argv.slice(2));
    if (options.command === 'help') {
      console.log('Usage: desktop-candidate.mjs start --workspace <cats-inc|cats-platform> --root <new-directory> [--runtime-root <checkout>] [--platform-dependencies <checkout>] [--runtime-dependencies <checkout>]\n       desktop-candidate.mjs <status|screenshot|stop|evidence> --root <directory>\n       desktop-candidate.mjs input --root <directory> --action <json-file>\nRequires existing development dependencies with identical package.json and package-lock.json. Dependency options support separate worktrees. Input requires a recent screenshot; inspect the next screenshot to check the result. No installs or release.');
    } else {
      console.log(JSON.stringify(options.command === 'start' ? await startCandidate(options)
        : await operateCandidate(options.command, options.root, options.action), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
