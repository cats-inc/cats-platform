import { lstat, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import type { DesktopHostConfig } from './config.js';

// On-disk handoff with Platform's platformDataReset.ts. Only the authenticated
// reset route writes this marker, after its purge. Tests cover both sides.
const RESET_JOURNAL = 'platform-data-reset.pending.json';

async function statOrMissing(target: string) {
  try { return await lstat(target); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

async function assertUnredirected(target: string): Promise<void> {
  let current = path.resolve(target);
  for (;;) {
    if ((await statOrMissing(current))?.isSymbolicLink()) throw new Error('Runtime reset refuses redirected storage parents.');
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return !relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function journalPath(config: DesktopHostConfig): string {
  return path.join(path.dirname(config.paths.appStatePath), RESET_JOURNAL);
}

export async function hasPendingRuntimeDataReset(config: DesktopHostConfig): Promise<boolean> {
  const journal = journalPath(config);
  await assertUnredirected(path.dirname(journal));
  const stat = await statOrMissing(journal);
  if (!stat) return false;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Reset journal must be a regular file.');
  const value = JSON.parse(await readFile(journal, 'utf8')) as Record<string, unknown>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.directories)
    || (value.runtimeReset !== undefined && !['pending', 'ready'].includes(String(value.runtimeReset)))) {
    throw new Error('Invalid pending data reset journal.');
  }
  if (value.runtimeReset !== 'ready') return false;
  if (value.directories.length) throw new Error('Platform data reset must finish before Runtime data reset.');
  return true;
}

export async function validateRuntimeDataReset(config: DesktopHostConfig): Promise<string[]> {
  const root = path.resolve(config.paths.runtimeRootDir);
  if (!path.isAbsolute(config.paths.runtimeRootDir) || root === path.parse(root).root
    || root === path.resolve(homedir()) || root === path.resolve(config.catsHomeDir)) {
    throw new Error('Unsafe Runtime reset root.');
  }
  for (const protectedPath of [config.packageRoot, config.runtimePackageRoot,
    config.paths.platformDir, path.dirname(config.paths.hostStatePath), config.userDataDir]) {
    if (contains(root, path.resolve(protectedPath)) || contains(path.resolve(protectedPath), root)) {
      throw new Error('Runtime reset storage overlaps an installation or another profile.');
    }
  }
  await assertUnredirected(root);
  const rootStat = await statOrMissing(root);
  if (rootStat && !rootStat.isDirectory()) throw new Error('Runtime reset root must be a directory.');
  const targets = [config.paths.runtimeConfigDir, config.paths.runtimeDataDir, config.paths.runtimeSessionBaseDir];
  for (const [index, name] of ['config', 'data', 'sessions'].entries()) {
    if (path.resolve(targets[index]!) !== path.join(root, name)) throw new Error('Runtime reset target escapes its owned storage layout.');
  }
  return targets.map(target => path.resolve(target));
}

/** Offline purge of only the Desktop-managed Runtime profile, never software. */
export async function completePendingRuntimeDataReset(config: DesktopHostConfig, options: {
  stopServices: () => Promise<void>;
  remove?: typeof rm;
}): Promise<boolean> {
  if (!await hasPendingRuntimeDataReset(config)) return false;
  await validateRuntimeDataReset(config);
  await options.stopServices();
  const targets = await validateRuntimeDataReset(config);
  if (!await hasPendingRuntimeDataReset(config)) throw new Error('Runtime reset authorization changed.');
  for (const target of targets) {
    const stat = await statOrMissing(target);
    if (stat) await (options.remove ?? rm)(target, { recursive: stat.isDirectory() && !stat.isSymbolicLink(), force: true });
  }
  // Failure leaves this marker and stopped services for Retry or next launch.
  await rm(journalPath(config), { force: true });
  return true;
}
