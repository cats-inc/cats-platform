import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolvePlatformStorageLayout } from './platformPaths.js';

export type PlatformResetCoordinator = (operation: (clearCaches: () => Promise<void>) => Promise<void>) => Promise<void>;
export class PlatformResetBusyError extends Error {
  constructor() { super('Stop active conversations and tasks, then retry resetting Platform data.'); }
}
const RESET_JOURNAL = 'platform-data-reset.pending.json';
interface ResetDirectories { attachmentDirectories?: string[]; evidenceDirectories?: string[] }

async function readPendingDirectories(root: string, stateDir: string): Promise<Required<ResetDirectories>> {
  let value: unknown;
  const journal = path.join(stateDir, RESET_JOURNAL);
  const stat = await statOrMissing(journal);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error('Reset journal must be a regular file');
  try { value = JSON.parse(await readFile(journal, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { attachmentDirectories: [], evidenceDirectories: [] };
    throw error;
  }
  const record = value as { schemaVersion?: unknown; directories?: unknown } | null;
  if (record?.schemaVersion !== 1 || !Array.isArray(record.directories)) throw new Error('Invalid pending Platform reset journal');
  const result: Required<ResetDirectories> = { attachmentDirectories: [], evidenceDirectories: [] };
  for (const relative of record.directories) {
    if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Invalid pending Platform reset target');
    const target = path.resolve(root, relative);
    if (!inside(root, target)) throw new Error('Pending reset target is outside Platform storage');
    const basename = path.basename(target);
    if (basename === '.cats-attachments') result.attachmentDirectories.push(target);
    else if (basename === 'evidence') result.evidenceDirectories.push(target);
    else throw new Error('Unowned pending Platform reset target');
  }
  return result;
}

/** Retain discovered targets across a crash or failed purge after chats are blanked. */
export async function preparePlatformOwnedDataReset(chatStatePath: string, options: ResetDirectories): Promise<void> {
  await removePlatformOwnedData(chatStatePath, { ...options, validateOnly: true });
  const { platformDir: root, stateDir } = resolvePlatformStorageLayout(chatStatePath);
  const pending = await readPendingDirectories(root, stateDir);
  const directories = new Set<string>();
  for (const [kind, basename] of [['attachmentDirectories', '.cats-attachments'], ['evidenceDirectories', 'evidence']] as const) {
    for (const directory of [...pending[kind], ...(options[kind] ?? [])]) {
      const target = path.resolve(directory);
      if (inside(root, target) && path.basename(target) === basename) directories.add(path.relative(root, target).split(path.sep).join('/'));
    }
  }
  const journal = path.join(stateDir, RESET_JOURNAL);
  await mkdir(stateDir, { recursive: true });
  // A failed replacement keeps the previous journal, which is still sufficient
  // for retry. No erasure begins until the current target list is durable.
  const temporary = `${journal}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, directories: [...directories].sort() })}\n`, { mode: 0o600, flag: 'wx', flush: true });
    await rename(temporary, journal);
  } finally { await rm(temporary, { force: true }); }
}

// This is an ownership allowlist, not permission to remove the Platform root or
// a user-selected working directory. Keep the UI's reset disclosure in sync.
export const PLATFORM_RESET_FILES = [
  'chat-state.local.json', 'chat-state.local.memory.json',
  'chat-state.local.companion-boxes.json', 'companion-activity.json',
  'chat-state.local.telegram-relay.json', 'chat-state.local.line-relay.json',
  'transport-work-delivery.json', 'scheduler-state.local.json',
  'platform-onboarding-history.json', 'guide-cat-assist-cache.local.json',
  'provider-snapshot.local.json', 'auth-state.local.json', 'auth-recovery-token.local.txt',
  'runtime-client-diagnostics.local.json', 'provider-capability-bootstrap-diagnostics.local.json',
] as const;
export const PLATFORM_RESET_DIRECTORIES = [
  'state/companion-boxes', 'state/memory', 'state/evidence',
  'state/telegram', 'state/line', 'state/work-delivery',
  'state/attachments', 'state/runtime-history', 'state/runtime-history-cache',
  'memory', 'evidence', 'telegram', 'line', 'work-delivery', 'attachments',
  'runtime-history', 'runtime-history-cache', 'cache/runtime-history', 'knowledge',
] as const;
export const PLATFORM_RESET_RETAINED = [
  'host preferences, configuration and installation identity', 'installed Apps/plugins and their data',
  'Desktop and Runtime data', 'provider CLI logins and native transcripts',
  'files in external workspaces',
] as const;

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function statOrMissing(file: string) {
  try { return await lstat(file); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
}

// Do not traverse a redirected state/cache root (including Windows junctions).
// rm itself removes a final symlink without following it.
async function assertParents(root: string, target: string): Promise<void> {
  if (!inside(root, target)) throw new Error('Reset target is outside Platform storage');
  let parent = path.dirname(target);
  while (parent !== root) {
    const stat = await statOrMissing(parent);
    if (stat?.isSymbolicLink()) throw new Error('Reset refuses a redirected Platform storage directory');
    parent = path.dirname(parent);
  }
  if ((await statOrMissing(root))?.isSymbolicLink()) throw new Error('Reset refuses a redirected Platform root');
}

export async function removePlatformOwnedData(chatStatePath: string, options: {
  attachmentDirectories?: string[];
  evidenceDirectories?: string[];
  validateOnly?: boolean;
  report?: (line: string) => void;
  remove?: typeof rm;
} = {}): Promise<string[]> {
  const { platformDir, stateDir } = resolvePlatformStorageLayout(chatStatePath);
  const root = path.resolve(platformDir);
  await assertParents(root, path.join(stateDir, RESET_JOURNAL));
  const pending = await readPendingDirectories(root, stateDir);
  const targets = new Set([
    path.resolve(chatStatePath),
    ...PLATFORM_RESET_FILES.map(file => path.join(stateDir, file)),
    ...PLATFORM_RESET_DIRECTORIES.map(directory => path.join(root, directory)),
  ]);
  // Support a configured state basename as well as the default layout.
  const parsed = path.parse(chatStatePath);
  for (const suffix of ['memory', 'companion-boxes', 'telegram-relay', 'line-relay']) {
    targets.add(path.join(stateDir, `${parsed.name}.${suffix}${parsed.ext || '.json'}`));
  }
  await assertParents(root, path.join(stateDir, 'placeholder'));
  const entries = await readdir(stateDir, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  for (const entry of entries) {
    // Includes rotating and one-time migration backups, even an invalid backup
    // directory. All are Platform-owned, directly beneath its state directory.
    if (entry.name.endsWith('.bak')) targets.add(path.join(stateDir, entry.name));
    if (entry.name.endsWith('.tmp') && PLATFORM_RESET_FILES.some(file =>
      entry.name.startsWith(`.${file}.`) || entry.name.startsWith(`${file}.`))) {
      targets.add(path.join(stateDir, entry.name));
    }
    if (entry.name.startsWith(`${RESET_JOURNAL}.`) && entry.name.endsWith('.tmp')) targets.add(path.join(stateDir, entry.name));
  }
  for (const directory of [...pending.attachmentDirectories, ...(options.attachmentDirectories ?? [])]) {
    const target = path.resolve(directory);
    if (inside(root, target) && path.basename(target) === '.cats-attachments') targets.add(target);
  }
  for (const directory of [...pending.evidenceDirectories, ...(options.evidenceDirectories ?? [])]) {
    const target = path.resolve(directory);
    if (inside(root, target) && path.basename(target) === 'evidence') targets.add(target);
  }
  // Validate every target before any deletion; a bad layout must not partially
  // erase a profile. No filename/content from the old records enters the log.
  for (const target of targets) await assertParents(root, target);
  if (options.validateOnly) return [];
  const deleted: string[] = [];
  const report = options.report ?? (line => process.stderr.write(`${line}\n`));
  // The route writes a clean primary before erasure. Keep it until every backup
  // is gone, so a crash midway cannot recover an old chat from a remaining .bak.
  const primary = path.resolve(chatStatePath);
  const ordered = [...targets].filter(target => target !== primary);
  ordered.push(primary);
  for (const target of ordered) {
    const relative = path.relative(root, target).split(path.sep).join('/');
    const stat = await statOrMissing(target);
    if (stat) {
      await (options.remove ?? rm)(target, { recursive: stat.isDirectory() && !stat.isSymbolicLink(), force: true });
      deleted.push(relative);
    }
    report(`[cats-platform-reset] ${stat ? 'removed' : 'absent'} ${JSON.stringify(relative)}`);
  }
  // The journal is the final deletion. A retry never relies on erased channels
  // to rediscover attachment paths or externally configured evidence roots.
  await rm(path.join(stateDir, `${RESET_JOURNAL}.tmp`), { force: true });
  const journal = path.join(stateDir, RESET_JOURNAL);
  const journalExists = await statOrMissing(journal);
  await rm(journal, { force: true });
  report(`[cats-platform-reset] ${journalExists ? 'removed' : 'absent'} ${JSON.stringify(path.relative(root, journal).split(path.sep).join('/'))}`);
  return deleted;
}
