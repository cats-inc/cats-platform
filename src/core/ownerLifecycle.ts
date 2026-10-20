/** Browser-safe owner intent; execution and filesystem authority stay with their producers. */
export const OWNER_SUBJECT_FAMILIES = ['codespace', 'project', 'work_item', 'task', 'run', 'mission', 'artifact'] as const;
export type OwnerSubjectFamily = typeof OWNER_SUBJECT_FAMILIES[number];
export type OwnerListingState = 'visible' | 'archived' | 'removed';

export interface OwnerLifecycleEntry {
  listing: OwnerListingState;
  pinned: boolean;
  label: string | null;
  updatedAt: string;
  path?: string;
  previousStatus?: string;
  logsClearedAt?: string;
  deleted?: boolean;
  overrides?: Record<string, unknown>;
}

export interface OwnerCleanupReceipt {
  id: string;
  scope: 'logs' | 'history';
  subjectKeys: string[];
  completedAt: string;
  results: Array<{ key: string; status: 'compacted' | 'removed' | 'retained' | 'blocked' | 'failed'; reason?: string }>;
}

export interface OwnerLifecycleState {
  version: 1;
  revision: number;
  entries: Record<string, OwnerLifecycleEntry>;
  receipts: OwnerCleanupReceipt[];
  retention: { enabled: boolean; days: number; lastCleanupAt: string | null; lastError: string | null };
}

export class OwnerLifecycleFormatError extends Error {
  constructor() {
    super('Owner management data is unsupported or damaged. The original profile is preserved; restore a compatible backup or use a compatible Cats version.');
    this.name = 'OwnerLifecycleFormatError';
  }
}

export function emptyOwnerLifecycle(): OwnerLifecycleState {
  return { version: 1, revision: 0, entries: {}, receipts: [], retention: { enabled: false, days: 30, lastCleanupAt: null, lastError: null } };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function ownerSubjectKey(family: OwnerSubjectFamily, id: string): string {
  if (!OWNER_SUBJECT_FAMILIES.includes(family) || !id.trim()) throw new Error('Invalid management subject');
  return `${family}:${id}`;
}

export function ownerEntry(state: { ownerLifecycle?: OwnerLifecycleState }, family: OwnerSubjectFamily, id: string): OwnerLifecycleEntry | undefined {
  return state.ownerLifecycle?.entries[ownerSubjectKey(family, id)];
}

/** Absent is the lossless old-profile upgrade; unknown data is never normalized away. */
export function normalizeOwnerLifecycle(value: unknown): OwnerLifecycleState | undefined {
  if (value === undefined) return undefined;
  const fail = (): never => { throw new OwnerLifecycleFormatError(); };
  if (!record(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !record(value.entries) || !Array.isArray(value.receipts) || !record(value.retention)) return fail();
  for (const [key, entry] of Object.entries(value.entries)) {
    const split = key.indexOf(':');
    if (split < 1 || !OWNER_SUBJECT_FAMILIES.includes(key.slice(0, split) as OwnerSubjectFamily) || !key.slice(split + 1)
      || !record(entry) || !['visible', 'archived', 'removed'].includes(String(entry.listing))
      || typeof entry.pinned !== 'boolean' || !(entry.label === null || typeof entry.label === 'string')
      || !timestamp(entry.updatedAt) || (entry.path !== undefined && typeof entry.path !== 'string')
      || (entry.previousStatus !== undefined && typeof entry.previousStatus !== 'string')
      || (entry.logsClearedAt !== undefined && !timestamp(entry.logsClearedAt))
      || (entry.deleted !== undefined && typeof entry.deleted !== 'boolean')
      || (entry.overrides !== undefined && !record(entry.overrides))) return fail();
  }
  const policy = value.retention;
  if (typeof policy.enabled !== 'boolean' || !Number.isInteger(policy.days) || Number(policy.days) < 1 || Number(policy.days) > 3650
    || !(policy.lastCleanupAt === null || timestamp(policy.lastCleanupAt))
    || !(policy.lastError === null || typeof policy.lastError === 'string')) return fail();
  for (const receipt of value.receipts) {
    if (!record(receipt) || typeof receipt.id !== 'string' || !['logs', 'history'].includes(String(receipt.scope))
      || !timestamp(receipt.completedAt) || !Array.isArray(receipt.subjectKeys) || !receipt.subjectKeys.every(key => typeof key === 'string')
      || !Array.isArray(receipt.results) || !receipt.results.every(result => record(result) && typeof result.key === 'string'
        && ['compacted', 'removed', 'retained', 'blocked', 'failed'].includes(String(result.status))
        && (result.reason === undefined || typeof result.reason === 'string'))) return fail();
  }
  return structuredClone(value) as unknown as OwnerLifecycleState;
}

export function setOwnerEntry<T extends { ownerLifecycle?: OwnerLifecycleState }>(
  state: T, family: OwnerSubjectFamily, id: string, patch: Partial<OwnerLifecycleEntry>, now = new Date().toISOString(),
): T {
  const lifecycle = structuredClone(state.ownerLifecycle ?? emptyOwnerLifecycle());
  const key = ownerSubjectKey(family, id);
  const current: OwnerLifecycleEntry | undefined = lifecycle.entries[key];
  lifecycle.entries[key] = { ...(current ?? { listing: 'visible', pinned: false, label: null }), ...patch, updatedAt: now };
  lifecycle.revision += 1;
  normalizeOwnerLifecycle(lifecycle);
  return { ...state, ownerLifecycle: lifecycle };
}
