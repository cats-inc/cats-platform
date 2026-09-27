import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { readCandidateOwnership, type CandidateOwnership } from './candidateOwnership.js';

const exec = promisify(execFile);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const hex = (value: unknown, length: number): value is string => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value);
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
const within = (root: string, file: string) => { const relative = path.relative(root, file);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_candidate_receipt');
  return value as Record<string, unknown>;
}
async function json(file: string): Promise<Record<string, unknown>> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) throw new Error('invalid_candidate_receipt');
  return record(JSON.parse(await readFile(file, 'utf8')));
}
// Mirrors the source command's deliberate build-input inventory; tests exercise both.
const directories = ['src', 'desktop', 'packages', 'config', 'assets', 'public', 'scripts', 'runtime-skills'];
const rootFile = /^(?:package(?:-lock)?\.json|tsconfig(?:\.[\w-]+)?\.json|vite\.config\.ts|index\.html|tailwind\.runtime\.config\.cjs)$/u;
const included = (file: string) => (directories.includes(file.split('/')[0]!) || rootFile.test(file))
  && !file.split('/').some(part => part === '.env' || part.startsWith('.env.'));

export interface CandidateEvidenceRequest { root: string; launchId: string; instanceId: string }
export interface CandidateMemberEvidence {
  checkout: string; gitCommonDirectory: string; head: string; sourceDigest: string;
  dependencyRoot: string; dependencyLockDigest: string; packageDigest: string;
}
export interface CandidateBuildEvidence extends CandidateEvidenceRequest {
  observedAt: string; state: 'running' | 'drained'; hostPid: number; builtAt: string;
  members: { platform: CandidateMemberEvidence; runtime: CandidateMemberEvidence };
  verification: 'commit_inputs_and_host_receipt';
  ownership?: CandidateOwnership;
}

/** Reads one selected local candidate. Never starts it or imports its logs/token into Core. */
export async function inspectCandidateBuild(input: CandidateEvidenceRequest): Promise<CandidateBuildEvidence> {
  if (!path.isAbsolute(input.root) || !hex(input.launchId, 64) || !hex(input.instanceId, 32)) throw new Error('invalid_candidate_request');
  const root = await realpath(input.root);
  const launch = await json(path.join(root, 'launch.json'));
  const control = await json(path.join(root, 'control.json'));
  if (launch.schemaVersion !== 1 || launch.root !== root || launch.launchId !== input.launchId
    || control.root !== root || control.launchId !== input.launchId || control.instanceId !== input.instanceId
    || !hex(control.token, 64) || hash(control.token) !== input.launchId
    || !Number.isSafeInteger(control.pid) || Number(control.pid) < 1
    || typeof launch.builtAt !== 'string' || !Number.isFinite(Date.parse(launch.builtAt))
    || !['running', 'launching'].includes(String(launch.stage))) throw new Error('candidate_identity_mismatch');
  const observedHost = async (): Promise<'running' | 'drained'> => {
    let status: Record<string, unknown>;
    try {
      status = await json(path.join(root, `exit-${input.instanceId}.json`));
      if (status.exitCode !== 0) throw new Error('candidate_failed');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (typeof control.url !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u.test(control.url)
        || Number(new URL(control.url).port) > 65535) throw new Error('candidate_endpoint_invalid');
      const response = await fetch(`${control.url}/status`, { headers: { authorization: `Bearer ${control.token}` },
        redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('candidate_unavailable');
      const bytes = await response.text();
      if (bytes.length > 64 * 1024) throw new Error('candidate_status_too_large');
      status = record(JSON.parse(bytes));
      if (!Array.isArray(status.services) || status.services.length !== 2
        || !status.services.every(row => record(row).ready === true)) throw new Error('candidate_not_ready');
    }
    if (status.root !== root || status.launchId !== input.launchId || status.instanceId !== input.instanceId
      || status.pid !== control.pid) throw new Error('candidate_identity_mismatch');
    return status.exitCode === 0 ? 'drained' : 'running';
  };
  await observedHost();
  const sources = record(launch.sources);
  const recheckInputs: Array<() => Promise<void>> = [];
  const inspectMember = async (member: 'platform' | 'runtime'): Promise<CandidateMemberEvidence> => {
    const source = record(sources[member]);
    if (typeof source.checkout !== 'string' || !path.isAbsolute(source.checkout) || source.dirty !== false
      || !(hex(source.head, 40) || hex(source.head, 64)) || !hex(source.sourceDigest, 64)
      || !hex(source.dependencyLockDigest, 64) || !hex(source.packageDigest, 64)
      || typeof source.dependencyRoot !== 'string' || !path.isAbsolute(source.dependencyRoot)) throw new Error('candidate_clean_revision_required');
    const checkout = await realpath(source.checkout);
    const snapshotPath = path.join(root, 'source', `cats-${member}`);
    const snapshot = await realpath(snapshotPath);
    if (!within(root, snapshot) || within(root, checkout) || within(checkout, root)) throw new Error('candidate_source_boundary');
    const gitEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^git_/iu.test(key)));
    const git = async (args: string[], extraEnv: Record<string, string> = {}) => (await exec('git', [
      '-c', 'core.fsmonitor=false', '-c', 'core.splitIndex=false', '-c', 'core.untrackedCache=false', '-c', 'core.sparseCheckout=false', ...args], {
      cwd: checkout, windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...gitEnvironment, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', ...extraEnv },
    })).stdout;
    const common = await realpath((await git(['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim());
    if (typeof source.gitCommonDirectory !== 'string' || !samePath(common, source.gitCommonDirectory)) throw new Error('candidate_repository_changed');
    const files = (await git(['ls-tree', '-r', '--name-only', '-z', source.head])).split('\0').filter(file => file && included(file)).sort();
    if (!files.length || files.length > 20_000 || files.length !== source.files) throw new Error('candidate_input_inventory_mismatch');
    const verifyInputs = async () => {
      for (const directory of [root, path.join(root, 'source'), snapshotPath]) {
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('candidate_source_boundary');
      }
      if (!samePath(await realpath(snapshotPath), snapshot) || !samePath(snapshotPath, snapshot)) throw new Error('candidate_source_boundary');
      const actual: string[] = [];
      const walk = async (relative = ''): Promise<void> => {
        for (const entry of await readdir(path.join(snapshot, relative), { withFileTypes: true })) {
          const file = relative ? `${relative}/${entry.name}` : entry.name;
          if (!included(file)) continue;
          if (entry.isSymbolicLink()) throw new Error('candidate_linked_input');
          if (entry.isDirectory()) await walk(file);
          else if (entry.isFile()) actual.push(file);
          else throw new Error('candidate_invalid_input');
          if (actual.length > 20_000) throw new Error('candidate_input_inventory_mismatch');
        }
      };
      await walk(); actual.sort();
      if (actual.length !== files.length || actual.some((file, index) => file !== files[index])) throw new Error('candidate_extra_inputs');
      const digest = createHash('sha256');
      for (const file of files) {
        const full = path.resolve(snapshot, file);
        const physical = await realpath(full);
        if (!within(snapshot, physical) || !samePath(physical, full)) throw new Error('candidate_source_boundary');
        for (let parent = path.dirname(full); parent !== root; parent = path.dirname(parent)) {
          const info = await lstat(parent);
          if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('candidate_source_boundary');
        }
        const info = await lstat(physical);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) throw new Error('candidate_invalid_input');
        const bytes = await readFile(physical);
        digest.update(file).update('\0').update(hash(bytes)).update('\0');
      }
      if (digest.digest('hex') !== source.sourceDigest
        || hash(await readFile(path.join(snapshot, 'package-lock.json'))) !== source.dependencyLockDigest
        || hash(await readFile(path.join(snapshot, 'package.json'))) !== source.packageDigest) throw new Error('candidate_input_changed');
    };
    await verifyInputs(); recheckInputs.push(verifyInputs);
    // A fresh private index avoids trusting a retained working-tree stat cache,
    // assume-unchanged flags or a dirty live checkout. Git applies its real EOL rules.
    const scratch = await mkdtemp(path.join(tmpdir(), 'cats-candidate-inspect-'));
    try {
      const gitDir = (await git(['rev-parse', '--absolute-git-dir'])).trim();
      const env = { GIT_DIR: gitDir, GIT_WORK_TREE: snapshot, GIT_INDEX_FILE: path.join(scratch, 'index') };
      let filters = '';
      try { filters = await git(['config', '--name-only', '--get-regexp', '^filter\..*\.(clean|smudge|process|required)$']); }
      catch (error) { if ((error as { code?: number }).code !== 1) throw error; }
      // Inspection must not execute hooks, fsmonitor, filters or diff helpers.
      const safeConfig = ['-c', `core.hooksPath=${scratch}`, ...filters.trim().split(/\r?\n/u).filter(Boolean)
        .flatMap(key => ['-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`])];
      const pathspec = [...directories, ...files.filter(file => !file.includes('/'))];
      await git([...safeConfig, 'read-tree', source.head], env);
      const difference = await git([...safeConfig, 'diff', '--name-only', '--no-ext-diff', '--no-textconv', source.head, '--', ...pathspec], env);
      if (difference.trim()) throw new Error('candidate_commit_inputs_mismatch');
    } finally {
      if (!path.isAbsolute(scratch) || !within(tmpdir(), scratch) || !path.basename(scratch).startsWith('cats-candidate-inspect-')) throw new Error('invalid_cleanup_root');
      await rm(scratch, { recursive: true, force: true });
    }
    return { checkout, gitCommonDirectory: common, head: source.head, sourceDigest: source.sourceDigest,
      dependencyRoot: source.dependencyRoot, dependencyLockDigest: source.dependencyLockDigest, packageDigest: source.packageDigest };
  };
  const members = { platform: await inspectMember('platform'), runtime: await inspectMember('runtime') };
  const state = await observedHost();
  await Promise.all(recheckInputs.map(check => check()));
  // Launch replacement during a slow repository check must not bind the old receipt.
  if (JSON.stringify(await json(path.join(root, 'launch.json'))) !== JSON.stringify(launch)
    || JSON.stringify(await json(path.join(root, 'control.json'))) !== JSON.stringify(control)) throw new Error('candidate_changed');
  const ownership = launch.ownership === undefined ? undefined : readCandidateOwnership(launch.ownership);
  if (ownership && (ownership.root !== root || ownership.commitId !== members[ownership.member].head
    || !samePath(ownership.checkout, members[ownership.member].checkout))) throw new Error('candidate_ownership_mismatch');
  return { root, launchId: input.launchId, instanceId: input.instanceId, observedAt: new Date().toISOString(),
    ...(ownership ? { ownership } : {}),
    state, hostPid: Number(control.pid), builtAt: launch.builtAt, members, verification: 'commit_inputs_and_host_receipt' };
}
