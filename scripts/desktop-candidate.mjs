#!/usr/bin/env node
import { candidateEnvironment, snapshotCandidateSource, within } from './shared/source-candidate.mjs';
export { candidateEnvironment, snapshotCandidateSource } from './shared/source-candidate.mjs';
import { readCandidateControl, operateCandidate, liveStatus } from './shared/candidate-control.mjs';
export { readCandidateControl, operateCandidate } from './shared/candidate-control.mjs';
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
    if (!['--root', ...(command === 'start' ? ['--workspace', '--runtime-root', '--platform-dependencies', '--runtime-dependencies', '--ownership', '--plugin-policy', '--electron'] : []),
      ...(command === 'input' ? ['--action'] : [])].includes(key)
      || !value || value.startsWith('--') || options[key.slice(2)] !== undefined) {
      throw new Error(`Invalid or repeated option: ${key}`);
    }
    options[key.slice(2)] = value;
  }
  if (!options.root) throw new Error('--root is required; start requires a new directory.');
  if (options['plugin-policy'] && options['plugin-policy'] !== 'internal-experiment') throw new Error('Only internal-experiment Plugin policy is supported.');
  if (command === 'input' && !options.action) throw new Error('input requires --action <json-file>.');
  options.root = path.resolve(options.root);
  return options;
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
  const ownership = options.ownership ? await readCandidateOwnershipFile(options.ownership, root, workspace) : undefined;
  await mkdir(root, { mode: 0o700 });
  const token = randomBytes(32).toString('hex');
  const launch = { schemaVersion: 1, launchId: sha256(token), root,
    startedAt: new Date().toISOString(), stage: 'building', sources: {}, ...(ownership ? { ownership } : {}) };
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
    if (ownership) verifyCandidateOwnershipSources(ownership, launch.sources);
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
      child = spawn(options.electron ?? require('electron'), [path.join(platform, 'build', 'desktop', 'main.js')], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
        env: { ...buildEnv, CATS_DESKTOP_CANDIDATE_ROOT: root,
          ...(options['plugin-policy'] ? { CATS_PLUGIN_POLICY: 'internal-experiment', CATS_PLUGIN_MANAGEMENT_KEY: randomBytes(32).toString('hex') } : {}),
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

/** Credential-free association only; Work validates it against its saved artifact. */
export async function readCandidateOwnershipFile(file, root, workspace) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new Error('Invalid candidate ownership file.');
  const value = await readJson(file);
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1
    || value.kind !== 'cats-desktop-candidate'
    || Object.keys(value).filter(key => key !== 'revisionSet').sort().join(',') !== 'artifactId,checkout,commitId,kind,member,preparedAt,revisionArtifactId,root,runId,schemaVersion,taskId'
    || !['platform', 'runtime'].includes(value.member)
    || ['artifactId', 'taskId', 'runId', 'revisionArtifactId', 'root', 'checkout', 'commitId', 'preparedAt'].some(key =>
      typeof value[key] !== 'string' || !value[key] || value[key].length > 4096)
    || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value.commitId) || !Number.isFinite(Date.parse(value.preparedAt))
    || value.root !== root || value.checkout !== workspace[`${value.member}Root`]) throw new Error('Candidate ownership does not match the selected workspace/root.');
  for (const ref of candidateOwnershipRevisions(value)) {
    const source = workspace[`${ref.member}Root`];
    if (source !== ref.checkout) throw new Error('Candidate ownership does not match the selected workspace/root.');
    const git = async (...args) => (await exec('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd: source, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
      env: { ...candidateEnvironment(process.env), GIT_OPTIONAL_LOCKS: '0' },
    })).stdout.trim();
    if (await git('status', '--porcelain') || await git('rev-parse', 'HEAD') !== ref.commitId) {
      throw new Error('Candidate ownership requires the recorded clean revision.');
    }
  }
  return value;
}

function candidateOwnershipRevisions(ownership) {
  if (!Object.hasOwn(ownership, 'revisionSet')) return [ownership];
  const set = ownership.revisionSet;
  if (!set || typeof set !== 'object' || Object.keys(set).sort().join(',') !== 'members,sha256'
    || !Array.isArray(set.members) || set.members.length !== 2
    || set.members.some((ref, index) => !ref || typeof ref !== 'object' || Array.isArray(ref)
      || Object.keys(ref).sort().join(',') !== 'checkout,commitId,member,revisionArtifactId,runId,taskId'
      || ref.member !== (index === 0 ? 'platform' : 'runtime')
      || ['taskId', 'runId', 'revisionArtifactId', 'checkout', 'commitId'].some(key =>
        typeof ref[key] !== 'string' || !ref[key] || ref[key].length > 4096)
      || !path.isAbsolute(ref.checkout) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(ref.commitId))
    || ['taskId', 'runId', 'revisionArtifactId'].some(key => set.members[0][key] === set.members[1][key])) {
    throw new Error('Invalid candidate revision set; use the matching current candidate command.');
  }
  const canonical = ref => ({ member: ref.member, taskId: ref.taskId, runId: ref.runId,
    revisionArtifactId: ref.revisionArtifactId, checkout: ref.checkout, commitId: ref.commitId });
  const members = set.members.map(canonical);
  if (set.sha256 !== sha256(JSON.stringify(members))
    || !members.some(ref => JSON.stringify(ref) === JSON.stringify(canonical(ownership)))) {
    throw new Error('Invalid candidate revision set; use the matching current candidate command.');
  }
  return members;
}

export function verifyCandidateOwnershipSources(ownership, sources) {
  if (sources.platform.dirty !== false || sources.runtime.dirty !== false
    || candidateOwnershipRevisions(ownership).some(ref => sources[ref.member].head !== ref.commitId
      || sources[ref.member].checkout !== ref.checkout)) throw new Error('Candidate ownership requires the recorded clean revision.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCandidateArgs(process.argv.slice(2));
    if (options.command === 'help') {
      console.log('For a prepared Work revision, add --ownership <candidate-ownership.json> to start with the same root and member checkout.');
      console.log('Usage: desktop-candidate.mjs start --workspace <cats-inc|cats-platform> --root <new-directory> [--runtime-root <checkout>] [--platform-dependencies <checkout>] [--runtime-dependencies <checkout>] [--plugin-policy internal-experiment]\n       desktop-candidate.mjs <status|screenshot|stop|evidence> --root <directory>\n       desktop-candidate.mjs input --root <directory> --action <json-file>\nRequires existing development dependencies with identical package.json and package-lock.json. Dependency options support separate worktrees. Input requires a recent screenshot; inspect the next screenshot to check the result. No installs or release.');
    } else {
      console.log(JSON.stringify(options.command === 'start' ? await startCandidate(options)
        : await operateCandidate(options.command, options.root, options.action), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
