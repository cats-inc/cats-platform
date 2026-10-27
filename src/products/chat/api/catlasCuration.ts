import { randomUUID } from 'node:crypto';
import type { GuideCatAssistEntryChip, GuideCatAssistProduct } from '../../../shared/guideCatAssist.js';
import type { GuideCatCatalog } from '../../../shared/guideCatAssistCatalog.js';
import type { CatlasCallKind } from '../../../shared/guideCatCurationStore.js';
import { catlasSnapshotEntries, type CatlasSnapshot } from './catlasSnapshot.js';

function isAssistRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export const CATLAS_LIMITS = { greetings: 10, chips: 8, greetingLength: 60, labelLength: 16,
  promptLength: 200, recommendations: 3, row: 5 } as const;
export class CatlasUnitError extends Error {
  constructor(readonly code: string) { super(code); }
}
function requireValid(condition: unknown, code: string): asserts condition {
  if (!condition) throw new CatlasUnitError(code);
}
export function exactCatlasObject(value: unknown, keys: string[]): Record<string, unknown> {
  requireValid(isAssistRecord(value) && Object.keys(value).every(key => keys.includes(key)), 'unknown_field');
  return value;
}
function text(value: unknown, max: number): string {
  requireValid(typeof value === 'string' && !!value.trim() && [...value].length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value), 'invalid_text');
  return value.trim();
}
function product(value: unknown): GuideCatAssistProduct {
  requireValid(value === 'chat' || value === 'code' || value === 'work', 'invalid_surface');
  return value;
}
export function applyCatlasCatalogOperations(catalog: GuideCatCatalog, value: unknown,
  locale: string, lobby: boolean): { catalog: GuideCatCatalog; operations: unknown[] } {
  requireValid(Array.isArray(value) && value.length <= 40, 'invalid_operations');
  const next = structuredClone(catalog);
  // Only IDs supplied before this call can be referenced, never model-assigned IDs.
  const supplied = new Set([...catalog.greetings, ...catalog.chips].map(item => item.id));
  const applied: unknown[] = [];
  for (const raw of value) {
    requireValid(isAssistRecord(raw) && (raw.kind === 'greeting' || raw.kind === 'chip'), 'invalid_kind');
    requireValid(!lobby || raw.kind === 'greeting', 'lobby_chip');
    if (raw.op === 'add') {
      const fields = raw.kind === 'greeting' ? ['op', 'kind', 'text', 'locale']
        : ['op', 'kind', 'label', 'prompt', 'surface', 'locale'];
      exactCatlasObject(raw, fields);
      requireValid(raw.locale === locale, 'invalid_locale');
      const common = { id: `catlas:${randomUUID()}`, origin: 'catlas' as const, enabled: true, locale };
      if (raw.kind === 'greeting') next.greetings.push({ ...common, text: text(raw.text, CATLAS_LIMITS.greetingLength) });
      else next.chips.push({ ...common, label: text(raw.label, CATLAS_LIMITS.labelLength),
        prompt: text(raw.prompt, CATLAS_LIMITS.promptLength), surface: product(raw.surface) });
      applied.push({ ...raw, id: common.id });
    } else {
      exactCatlasObject(raw, ['op', 'kind', 'id']);
      requireValid(typeof raw.id === 'string' && supplied.has(raw.id), 'unknown_item');
      const items = raw.kind === 'greeting' ? next.greetings : next.chips;
      const index = items.findIndex(item => item.id === raw.id);
      requireValid(index >= 0, 'unknown_item');
      if (raw.op === 'remove') {
        requireValid(items[index].origin === 'catlas', 'builtin_removal');
        items.splice(index, 1);
      } else {
        requireValid(raw.op === 'enable' || raw.op === 'disable', 'invalid_operation');
        items[index].enabled = raw.op === 'enable';
      }
      applied.push(raw);
    }
  }
  requireValid(next.greetings.filter(item => item.origin === 'catlas').length <= CATLAS_LIMITS.greetings
    && next.chips.filter(item => item.origin === 'catlas').length <= CATLAS_LIMITS.chips, 'catalog_cap');
  requireValid(next.greetings.some(item => item.enabled), 'empty_greetings');
  return { catalog: next, operations: applied };
}
export function validateCatlasRecommendations(value: unknown, kind: CatlasCallKind,
  snapshot: CatlasSnapshot, lobby: boolean): GuideCatAssistEntryChip[] {
  requireValid(Array.isArray(value) && value.length <= 10, 'invalid_recommendations');
  const entries = catlasSnapshotEntries(snapshot);
  const allowed = new Map(entries.map(item => [item.id, item]));
  const seen = new Set<string>();
  const result: GuideCatAssistEntryChip[] = [];
  for (const raw of value) {
    requireValid(isAssistRecord(raw), 'invalid_recommendation');
    requireValid(Array.isArray(raw.basis) && raw.basis.length > 0 && raw.basis.length <= entries.length
      && raw.basis.every(id => typeof id === 'string' && allowed.has(id)), 'invalid_basis');
    const basis = [...new Set(raw.basis as string[])];
    if (raw.action === 'open') {
      requireValid(kind === 'refresh_navigation', 'wrong_call_kind');
      exactCatlasObject(raw, ['basis', 'action', 'target']);
      const target = exactCatlasObject(raw.target, ['kind', 'id']);
      requireValid(typeof target.id === 'string' && basis.includes(target.id)
        && allowed.get(target.id)?.kind === target.kind, 'invalid_target');
      const key = `${target.kind}:${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ id: `recommendation:${randomUUID()}`, basis, action: 'open', label: '',
        target: { kind: allowed.get(target.id)!.kind, id: target.id } });
    } else {
      requireValid(kind === 'refresh_prompt' && raw.action === 'prefill' && !lobby, 'wrong_call_kind');
      exactCatlasObject(raw, ['basis', 'action', 'surface', 'label', 'prompt']);
      requireValid(basis.every(id => allowed.get(id)?.external === false), 'external_prefill');
      result.push({ id: `recommendation:${randomUUID()}`, basis, action: 'prefill',
        surface: product(raw.surface), label: text(raw.label, CATLAS_LIMITS.labelLength),
        prompt: text(raw.prompt, CATLAS_LIMITS.promptLength) });
    }
  }
  return result;
}
export function validateCatlasTitle(value: unknown): string {
  const object = exactCatlasObject(value, ['title']);
  requireValid(typeof object.title === 'string', 'invalid_title');
  const title = object.title.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
  requireValid(!!title, 'invalid_title');
  return [...title].slice(0, 48).join('');
}
