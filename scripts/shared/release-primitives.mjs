/** Policy-free release primitives. Product adapters retain signing, repositories, formats and publication authority. */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const git = (root, ...args) => execute('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000 });
// Never shipped, so a release that leaves them out has nothing to declare.
const UNSHIPPED_PATH = /^(?:docs|\.github)\//u;
export const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
export function stableReleaseVersion(tag, { trim = false, allowLeadingZeros = false } = {}) {
  const value = typeof tag === 'string' ? (trim ? tag.trim() : tag) : '';
  const pattern = allowLeadingZeros ? /^v\d+\.\d+\.\d+$/u : /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
  if (!pattern.test(value) || !value.slice(1).split('.').map(Number).every(Number.isSafeInteger)) throw new Error('Use an exact vX.Y.Z release tag.');
  return value.slice(1);
}
/** Commits on `main` that `commit` lacks and that change more than docs/ and .github/. Refuses a commit that is not on `main`. */
export async function missingSourceChanges(root, commit, main = 'origin/main') {
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error('Expected a full source commit SHA.');
  if ((await git(root, 'rev-parse', '--is-shallow-repository')).stdout.trim() === 'true') throw new Error(`The checkout at ${root} is shallow; comparing a source with ${main} needs its full history.`);
  await git(root, 'rev-parse', '--verify', '--quiet', `${main}^{commit}`).catch(() => { throw new Error(`The checkout at ${root} has no ${main}.`); });
  await git(root, 'merge-base', '--is-ancestor', commit, main).catch(() => { throw new Error(`Source ${commit} is not on ${main}. Select a commit that landed there, not a pull request's branch head.`); });
  const { stdout } = await git(root, '-c', 'core.quotepath=off', 'log', '--no-merges', '--name-only', '--format=%x00%H%x00%s', `${commit}..${main}`);
  const [, ...fields] = stdout.split('\0');
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    const [subject, ...paths] = fields[index + 1].split('\n');
    if (paths.filter(Boolean).every(path => UNSHIPPED_PATH.test(path))) continue;
    changes.push({ sha: fields[index], subject, pull: /\(#(\d+)\)$/u.exec(subject)?.[1] ?? null });
  }
  return changes;
}
/**
 * Refuses a selected source that is off `main`, or that lacks changes on `main` the release notes do not name.
 * Notes name a change as `<repository>#<pull>` or by its first 8 SHA characters. A bare #N does not count, because
 * pull request numbers collide between repositories and a false match would hide exactly what this check is for.
 */
export async function assertSelectedSource({ root, commit, notes, repository, main = 'origin/main' }) {
  const missing = await missingSourceChanges(root, commit, main);
  const named = ({ sha, pull }) => notes.includes(sha.slice(0, 8)) || (pull !== null && new RegExp(`\\b${repository}#${pull}(?!\\d)`, 'u').test(notes));
  const unnamed = missing.filter(change => !named(change));
  if (unnamed.length) {
    throw new Error([`${repository} ${commit.slice(0, 8)} lacks changes on ${main} that the release notes do not name:`,
      ...unnamed.map(({ sha, subject, pull }) => `  ${pull === null ? sha.slice(0, 8) : `${repository}#${pull}`} ${subject}`),
      `Select a newer ${repository} commit, or name each of these in the notes with why this release leaves it out.`].join('\n'));
  }
  return missing;
}
