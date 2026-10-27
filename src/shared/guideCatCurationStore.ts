import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFile, rename } from 'node:fs/promises';
import type { GuideCatAssistEntryChip } from './guideCatAssist.js';
import type { GuideCatCatalog } from './guideCatAssistCatalog.js';
import { createBuiltinGuideCatCatalog } from './guideCatAssistCatalog.js';
import { isAssistRecord, withGuideCatFileLock, writeAssistAtomicJson,
  GuideCatAssistFormatError } from './guideCatAssistStore.js';
import { resolveGuideCatAssistCachePathFromChatState } from './platformPaths.js';

export type CatlasCallKind = 'title' | 'refresh_prompt' | 'refresh_navigation';
export interface CatlasRecommendationPartition {
  recommendations: GuideCatAssistEntryChip[];
  refreshContextHash: string;
  refreshedAt: string;
  expiresAt: string | null;
  attentionHash: string;
}
export interface CatlasSurfaceState {
  catalog: GuideCatCatalog;
  attemptedAt?: Partial<Record<'prompt' | 'navigation', { at: string; contextHash: string }>>;
  prompt?: CatlasRecommendationPartition;
  navigation?: CatlasRecommendationPartition;
}
export interface CatlasCatalogFile {
  schemaVersion: 1;
  surfaces: Record<string, CatlasSurfaceState>;
}
export interface CatlasSignal {
  id: string;
  event: 'accepted' | 'dismissed';
  timestamp: string;
}
export interface CatlasReceipt {
  requestId: string;
  kind: CatlasCallKind;
  provider: string;
  model: string | null;
  inputDigest: string;
  timestamp: string;
  units: Array<{ id: string; outcome: 'applied' | 'rejected'; reasons: string[]; operations?: unknown[] }>;
}
export function catlasStatePath(statePath: string, kind: 'catalog' | 'signals' | 'receipts'): string {
  return path.join(path.dirname(resolveGuideCatAssistCachePathFromChatState(statePath)),
    kind === 'receipts' ? 'catlas-receipts.local.json' : `guide-cat-assist-${kind}.local.json`);
}
function validRecommendations(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => isAssistRecord(item)
    && typeof item.id === 'string' && Array.isArray(item.basis) && item.basis.length > 0
    && item.basis.every(id => typeof id === 'string') && typeof item.label === 'string'
    && (item.action === 'prefill' && typeof item.prompt === 'string'
      && ['chat', 'code', 'work'].includes(String(item.surface))
      || item.action === 'open' && isAssistRecord(item.target) && typeof item.target.id === 'string'
        && ['conversation', 'project', 'task', 'work_item'].includes(String(item.target.kind))));
}
function validPartition(value: unknown): boolean {
  return value === undefined || isAssistRecord(value) && validRecommendations(value.recommendations)
    && typeof value.refreshContextHash === 'string' && typeof value.refreshedAt === 'string'
    && typeof value.attentionHash === 'string' && (value.expiresAt === null || typeof value.expiresAt === 'string');
}
function validCatalogItems(value: unknown, surfaceId: string): boolean {
  if (!isAssistRecord(value) || !Array.isArray(value.greetings) || !Array.isArray(value.chips)) return false;
  const builtin = createBuiltinGuideCatCatalog(surfaceId);
  const validItems = (items: unknown[], originals: Array<{ id: string }>, greeting: boolean) => {
    const ids = new Set<string>();
    if (originals.some(original => !items.some(item => isAssistRecord(item) && item.id === original.id))) return false;
    return items.every(item => {
      if (!isAssistRecord(item) || typeof item.id !== 'string' || typeof item.enabled !== 'boolean' || ids.has(item.id)) return false;
      ids.add(item.id);
      if (item.origin === 'builtin') {
        const original = originals.find(candidate => candidate.id === item.id);
        return !!original && Object.entries(original).every(([key, value]) => key === 'enabled' || item[key] === value);
      }
      return item.origin === 'catlas' && item.id.startsWith('catlas:') && typeof item.locale === 'string'
        && (greeting ? typeof item.text === 'string' : typeof item.label === 'string' && typeof item.prompt === 'string'
          && ['chat', 'code', 'work'].includes(String(item.surface)));
    });
  };
  return validItems(value.greetings, builtin.greetings, true) && validItems(value.chips, builtin.chips, false)
    && value.greetings.some(item => isAssistRecord(item) && item.enabled === true);
}
async function readGenerated<T>(file: string, empty: T, validate: (value: unknown) => boolean): Promise<T> {
  let raw: string;
  try { raw = await readFile(file, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(empty); throw error; }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { value = null; }
  if (isAssistRecord(value) && typeof value.schemaVersion === 'number' && value.schemaVersion !== 1) throw new GuideCatAssistFormatError(file);
  if (validate(value)) return value as T;
  await rename(file, `${file}.corrupt-${Date.now()}-${randomUUID()}`);
  return structuredClone(empty);
}
const validCatalog = (value: unknown) => isAssistRecord(value) && value.schemaVersion === 1
  && isAssistRecord(value.surfaces) && Object.entries(value.surfaces).every(([key, surface]) =>
    ['lobby:default:default', 'chat:new:default:default', 'code:new:default:default', 'work:new:default:default'].includes(key)
    && isAssistRecord(surface) && validCatalogItems(surface.catalog, key.slice(0, -':default:default'.length))
    && validPartition(surface.prompt) && validPartition(surface.navigation)
    && (surface.attemptedAt === undefined || isAssistRecord(surface.attemptedAt)
      && Object.values(surface.attemptedAt).every(attempt => isAssistRecord(attempt) && typeof attempt.at === 'string'
        && Number.isFinite(Date.parse(attempt.at)) && typeof attempt.contextHash === 'string')));
export function readCatlasCatalog(statePath: string): Promise<CatlasCatalogFile> {
  const file = catlasStatePath(statePath, 'catalog');
  return withGuideCatFileLock(file, () => readGenerated(file, { schemaVersion: 1, surfaces: {} }, validCatalog));
}
export function updateCatlasCatalog(statePath: string, mutate: (file: CatlasCatalogFile) => void): Promise<void> {
  const file = catlasStatePath(statePath, 'catalog');
  return withGuideCatFileLock(file, async () => {
    const current = await readGenerated<CatlasCatalogFile>(file, { schemaVersion: 1, surfaces: {} }, validCatalog);
    mutate(current);
    await writeAssistAtomicJson(file, current);
  });
}
export function newCatlasSurfaceState(surfaceId: string): CatlasSurfaceState {
  return { catalog: createBuiltinGuideCatCatalog(surfaceId) };
}
export async function readCatlasSignals(statePath: string, now = new Date()): Promise<CatlasSignal[]> {
  const file = catlasStatePath(statePath, 'signals');
  return withGuideCatFileLock(file, async () => {
    const current = await readGenerated<{ schemaVersion: 1; events: CatlasSignal[] }>(file,
      { schemaVersion: 1, events: [] }, value => isAssistRecord(value) && value.schemaVersion === 1
        && Array.isArray(value.events) && value.events.every(event => isAssistRecord(event)
          && typeof event.id === 'string' && ['accepted', 'dismissed'].includes(String(event.event))
          && typeof event.timestamp === 'string' && Number.isFinite(Date.parse(event.timestamp))));
    const events = current.events.filter(event => Date.parse(event.timestamp) >= now.getTime() - 30 * 86_400_000);
    if (events.length !== current.events.length) await writeAssistAtomicJson(file, { schemaVersion: 1, events });
    return events;
  });
}
export async function recordCatlasSignals(statePath: string, ids: string[], event: CatlasSignal['event'], now = new Date()): Promise<void> {
  // Read outside the mutation lock, then re-read under it so concurrent feedback is never lost.
  await readCatlasSignals(statePath, now);
  const file = catlasStatePath(statePath, 'signals');
  await withGuideCatFileLock(file, async () => {
    const current = JSON.parse(await readFile(file, 'utf8').catch(() => '{"schemaVersion":1,"events":[]}')) as { events: CatlasSignal[] };
    const events = current.events.filter(item => Date.parse(item.timestamp) >= now.getTime() - 30 * 86_400_000);
    events.push(...[...new Set(ids)].map(id => ({ id, event, timestamp: now.toISOString() })));
    await writeAssistAtomicJson(file, { schemaVersion: 1, events });
  });
}
export function catlasCooldownIds(events: CatlasSignal[], now: Date): Set<string> {
  return new Set(events.filter(event => event.event === 'dismissed'
    && Date.parse(event.timestamp) > now.getTime() - 7 * 86_400_000).map(event => event.id));
}
export async function appendCatlasReceipt(statePath: string, receipt: CatlasReceipt): Promise<void> {
  const file = catlasStatePath(statePath, 'receipts');
  await withGuideCatFileLock(file, async () => {
    const current = await readGenerated<{ schemaVersion: 1; receipts: CatlasReceipt[] }>(file,
      { schemaVersion: 1, receipts: [] }, value => isAssistRecord(value) && value.schemaVersion === 1
        && Array.isArray(value.receipts));
    await writeAssistAtomicJson(file, { schemaVersion: 1, receipts: [...current.receipts, receipt].slice(-100) });
  });
}
