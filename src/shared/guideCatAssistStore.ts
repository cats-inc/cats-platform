import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  GUIDE_CAT_ASSIST_SCHEMA_VERSION, GUIDE_CAT_ASSIST_SCOPE_KEYS,
  type GuideCatAssistCacheFile, type GuideCatAssistConfigFile, type GuideCatAssistContent,
} from './guideCatAssist.js';
import { resolveGuideCatAssistBaseline } from './guideCatAssistBaselines.js';
import { resolveGuideCatAssistCachePathFromChatState,
  resolveGuideCatAssistConfigPathFromChatState } from './platformPaths.js';

export const resolveGuideCatAssistConfigPath = resolveGuideCatAssistConfigPathFromChatState;
export const resolveGuideCatAssistCachePath = resolveGuideCatAssistCachePathFromChatState;
const epoch = new Date(0).toISOString();
const queues = new Map<string, Promise<unknown>>();
export async function withGuideCatFileLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  queues.set(file, next);
  try { return await next; } finally { if (queues.get(file) === next) queues.delete(file); }
}
export function isAssistRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function emptyGuideCatAssistConfig(): GuideCatAssistConfigFile {
  return { schemaVersion: 2, updatedAt: epoch, disabledSurfaceKeys: [], ownerOverrides: {},
    refreshPreferences: { runtimeRefreshEnabled: true, defaultTtlMs: null } };
}
function emptyCache(): GuideCatAssistCacheFile {
  return { schemaVersion: 2, updatedAt: epoch, bundles: {}, refreshFailures: {} };
}
export class GuideCatAssistFormatError extends Error {
  constructor(file: string) { super(`Unsupported or invalid Catlas state: ${file}`); }
}
export async function writeAssistAtomicJson(file: string, value: unknown): Promise<void> {
  return writeAssistAtomicText(file, JSON.stringify(value, null, 2) + '\n');
}
async function writeAssistAtomicText(file: string, serialized: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serialized, 'utf8');
    if (await readFile(temporary, 'utf8') !== serialized) throw new Error('Catlas write verification failed.');
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, file); break; }
      catch (error) {
        if (attempt >= 5 || !['EPERM', 'EACCES', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 10));
      }
    }
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}
function supportedScope(key: string): boolean {
  return Object.values(GUIDE_CAT_ASSIST_SCOPE_KEYS).includes(key as typeof GUIDE_CAT_ASSIST_SCOPE_KEYS.lobbyDefault);
}
function assert(condition: unknown, file: string): asserts condition {
  if (!condition) throw new GuideCatAssistFormatError(file);
}
function isContent(value: unknown): value is GuideCatAssistContent {
  return isAssistRecord(value) && Array.isArray(value.greetings)
    && value.greetings.every(item => isAssistRecord(item) && typeof item.id === 'string'
      && typeof item.text === 'string' && (item.messageKey === undefined || typeof item.messageKey === 'string'))
    && Array.isArray(value.entryChips) && value.entryChips.every(item => isAssistRecord(item)
      && typeof item.id === 'string' && typeof item.label === 'string'
      && (item.action === 'prefill' && typeof item.prompt === 'string'
        && ['chat', 'code', 'work'].includes(String(item.surface))
        || item.action === 'open' && isAssistRecord(item.target)
          && ['conversation', 'project', 'task', 'work_item'].includes(String(item.target.kind))
          && typeof item.target.id === 'string'));
}
function validateConfig(value: unknown, file: string): asserts value is GuideCatAssistConfigFile {
  assert(isAssistRecord(value) && value.schemaVersion === 2 && typeof value.updatedAt === 'string'
    && Object.keys(value).every(key => ['schemaVersion', 'updatedAt', 'disabledSurfaceKeys', 'ownerOverrides', 'refreshPreferences'].includes(key))
    && Array.isArray(value.disabledSurfaceKeys) && value.disabledSurfaceKeys.every(key => typeof key === 'string' && supportedScope(key))
    && isAssistRecord(value.ownerOverrides) && isAssistRecord(value.refreshPreferences), file);
  assert(typeof value.refreshPreferences.runtimeRefreshEnabled === 'boolean'
    && (value.refreshPreferences.defaultTtlMs === null || typeof value.refreshPreferences.defaultTtlMs === 'number'
      && Number.isFinite(value.refreshPreferences.defaultTtlMs)), file);
  for (const [key, override] of Object.entries(value.ownerOverrides)) {
    assert(supportedScope(key) && isAssistRecord(override)
      && Object.keys(override).every(field => ['greetings', 'entryChips'].includes(field))
      && isContent({ greetings: override.greetings ?? [], entryChips: override.entryChips ?? [] }), file);
  }
}
export function migrateGuideCatAssistConfig(value: unknown, file = 'config'): GuideCatAssistConfigFile {
  assert(isAssistRecord(value) && value.schemaVersion === 1, file);
  assert(Object.keys(value).every(key => ['schemaVersion', 'updatedAt', 'disabledSurfaceKeys',
    'deterministicSeed', 'curatedOverrides', 'refreshPreferences'].includes(key)), file);
  assert(typeof value.updatedAt === 'string' && Array.isArray(value.disabledSurfaceKeys)
    && isAssistRecord(value.curatedOverrides)
    && (value.deterministicSeed === null || typeof value.deterministicSeed === 'string'), file);
  const next = { ...emptyGuideCatAssistConfig(), updatedAt: value.updatedAt,
    disabledSurfaceKeys: value.disabledSurfaceKeys.map(key => { assert(typeof key === 'string', file); return key.trim(); }), refreshPreferences: value.refreshPreferences } as GuideCatAssistConfigFile;
  for (const [rawKey, old] of Object.entries(value.curatedOverrides)) {
    const key = rawKey.trim();
    assert(supportedScope(key) && isAssistRecord(old)
      && Object.keys(old).every(field => ['greeting', 'entryChips'].includes(field))
      && (old.greeting === null || typeof old.greeting === 'string') && Array.isArray(old.entryChips), file);
    const entryChips = old.entryChips.map(chip => {
      assert(isAssistRecord(chip) && typeof chip.id === 'string' && chip.id.trim()
        && typeof chip.prompt === 'string' && chip.prompt.trim()
        && (chip.label === undefined || chip.label === null || typeof chip.label === 'string')
        && Object.keys(chip).every(field => ['id', 'prompt', 'label'].includes(field)), file);
      const cross = /^cross:(chat|code|work):/u.exec(chip.id.trim());
      const surface = cross?.[1] ?? (key.startsWith('code:') ? 'code' : key.startsWith('work:') ? 'work' : 'chat');
      return { id: chip.id.trim(), action: 'prefill' as const, surface: surface as 'chat' | 'code' | 'work',
        prompt: chip.prompt.trim(), label: typeof chip.label === 'string' && chip.label.trim() ? chip.label.trim() : chip.prompt.trim() };
    });
    next.ownerOverrides[key] = { greetings: old.greeting?.trim()
      ? [{ id: `owner:${key}:greeting`, text: old.greeting.trim() }] : [], entryChips };
  }
  if (typeof value.deterministicSeed === 'string' && value.deterministicSeed.trim()) {
    for (const key of Object.values(GUIDE_CAT_ASSIST_SCOPE_KEYS).filter(key => !key.startsWith('work:'))) {
      if (next.ownerOverrides[key]?.greetings !== undefined) continue;
      const surface = key.slice(0, -':default:default'.length);
      const pool = resolveGuideCatAssistBaseline(surface).content.greetings;
      const index = createHash('sha256').update(`${value.deterministicSeed.trim()}:${key}`).digest()[0] % pool.length;
      next.ownerOverrides[key] = { ...next.ownerOverrides[key], greetings: [pool[index]] };
    }
  }
  validateConfig(next, file);
  return next;
}
export async function readGuideCatAssistConfig(statePath: string): Promise<GuideCatAssistConfigFile> {
  const file = resolveGuideCatAssistConfigPath(statePath);
  return withGuideCatFileLock(file, async () => {
    let raw: string;
    try { raw = await readFile(file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyGuideCatAssistConfig(); throw error; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new GuideCatAssistFormatError(file); }
    if (isAssistRecord(parsed) && parsed.schemaVersion === 1) {
      const next = migrateGuideCatAssistConfig(parsed, file);
      const backup = `${file}.v1-${createHash('sha256').update(raw).digest('hex').slice(0, 12)}.bak`;
      try { await copyFile(file, backup, 1); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(backup, 'utf8') !== raw) throw error; }
      assert(await readFile(backup, 'utf8') === raw, file);
      try {
        await writeAssistAtomicJson(file, next);
        const verified: unknown = JSON.parse(await readFile(file, 'utf8'));
        validateConfig(verified, file);
        if (JSON.stringify(verified) !== JSON.stringify(next)) throw new Error('Catlas migration verification failed.');
      } catch (error) {
        // Restore the exact previous object through the same atomic replacement path.
        await writeAssistAtomicText(file, raw);
        throw error;
      }
      return next;
    }
    validateConfig(parsed, file);
    return parsed;
  });
}
export async function writeGuideCatAssistConfig(statePath: string, config: GuideCatAssistConfigFile) {
  await readGuideCatAssistConfig(statePath); // Preserve/migrate existing owner data before replacement.
  const next = { ...config, updatedAt: new Date().toISOString() };
  validateConfig(next, resolveGuideCatAssistConfigPath(statePath));
  await withGuideCatFileLock(resolveGuideCatAssistConfigPath(statePath), () => writeAssistAtomicJson(resolveGuideCatAssistConfigPath(statePath), next));
  return next;
}
export async function readGuideCatAssistCache(statePath: string): Promise<GuideCatAssistCacheFile> {
  await readGuideCatAssistConfig(statePath);
  const file = resolveGuideCatAssistCachePath(statePath);
  return withGuideCatFileLock(file, async () => {
    let raw: string;
    try { raw = await readFile(file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyCache(); throw error; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (isAssistRecord(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) throw new GuideCatAssistFormatError(file);
    if (isAssistRecord(parsed) && parsed.schemaVersion === 1) {
      const next = emptyCache();
      await writeAssistAtomicJson(file, next);
      return next;
    }
    if (isAssistRecord(parsed) && parsed.schemaVersion === 2 && isAssistRecord(parsed.bundles)
      && isAssistRecord(parsed.refreshFailures) && Object.values(parsed.bundles).every(bundle =>
        isAssistRecord(bundle) && isContent(bundle.content) && isAssistRecord(bundle.scope)
        && isAssistRecord(bundle.freshness) && isAssistRecord(bundle.provenance))) return parsed as unknown as GuideCatAssistCacheFile;
    await rename(file, `${file}.corrupt-${Date.now()}-${randomUUID()}`);
    return emptyCache();
  });
}
async function writeGuideCatAssistCache(statePath: string, cache: GuideCatAssistCacheFile) {
  await readGuideCatAssistCache(statePath);
  const next = { ...cache, schemaVersion: GUIDE_CAT_ASSIST_SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  await withGuideCatFileLock(resolveGuideCatAssistCachePath(statePath), () => writeAssistAtomicJson(resolveGuideCatAssistCachePath(statePath), next));
  return next;
}
export async function clearGuideCatAssistCache(statePath: string, now = new Date()) {
  return writeGuideCatAssistCache(statePath, { ...emptyCache(), updatedAt: now.toISOString() });
}
