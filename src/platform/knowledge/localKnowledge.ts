import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { resolveBundledPlatformConfigDir, resolveDefaultPlatformDir } from '../../shared/platformPaths.js';
import { knowledgeDigest, loadProductKnowledge, type ProductKnowledgeResult } from './productKnowledge.js';
import type { LocalKnowledgeDraft, LocalKnowledgeTarget, LocalKnowledgeText,
  LocalKnowledgeWorkspace } from './localKnowledgeContracts.js';

interface State { schemaVersion: 1; drafts: LocalKnowledgeDraft[]; active: Record<string, string> }
interface Options { platformDir?: string; bundleDir?: string }
const targets = ['catlas', 'orchestrator'] as const;
const capabilities = { catlas: ['code-entry-v1'], orchestrator: ['orchestrator-context-v1'] };
const queues = new Map<string, Promise<unknown>>();
const MAX_STORE_BYTES = 2 * 1024 * 1024;
export class LocalKnowledgeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function check(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new LocalKnowledgeError(message, status);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): LocalKnowledgeText {
  check(record(value), 'Both English and Traditional Chinese text are required.');
  for (const locale of ['en', 'zh-TW']) check(typeof value[locale] === 'string'
    && value[locale].trim().length > 0 && value[locale].length <= 4_000,
  'Each language must contain 1–4,000 characters.');
  return { en: (value.en as string).trim(), 'zh-TW': (value['zh-TW'] as string).trim() };
}
const key = (target: string, id: string) => `${target}:${id}`;
const revision = (state: State, bundles: { digest: string }[]) =>
  knowledgeDigest(JSON.stringify({ state, bundles: bundles.map(bundle => bundle.digest) }));
function statePath(options: Options): string {
  return join(resolve(options.platformDir ?? process.env.CATS_PLATFORM_DIR?.trim()
    ?? resolveDefaultPlatformDir()), 'knowledge', 'contributions.json');
}
async function readState(options: Options): Promise<State> {
  let bytes: Buffer;
  try {
    check((await stat(statePath(options))).size <= MAX_STORE_BYTES, 'Knowledge store is too large.', 409);
    bytes = await readFile(statePath(options));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, drafts: [], active: {} };
    throw error;
  }
  check(bytes.length <= MAX_STORE_BYTES, 'Knowledge store is too large.', 409);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new LocalKnowledgeError('Knowledge store is damaged; restore its backup before editing.', 409); }
  check(record(value) && value.schemaVersion === 1 && Array.isArray(value.drafts)
    && value.drafts.length <= 100 && record(value.active), 'Unsupported knowledge store.', 409);
  const ids = new Set<string>();
  for (const draft of value.drafts) {
    check(record(draft) && typeof draft.id === 'string' && /^[a-f0-9-]{36}$/u.test(draft.id)
      && !ids.has(draft.id) && targets.includes(draft.target as LocalKnowledgeTarget)
      && typeof draft.entryId === 'string' && /^[a-z][a-z0-9.-]{0,79}$/u.test(draft.entryId)
      && typeof draft.bundleDigest === 'string' && /^[a-f0-9]{64}$/u.test(draft.bundleDigest)
      && typeof draft.note === 'string' && draft.note.length <= 1_000
      && typeof draft.createdAt === 'string' && Number.isFinite(Date.parse(draft.createdAt))
      && (draft.adoptedAt === undefined || (typeof draft.adoptedAt === 'string'
        && Number.isFinite(Date.parse(draft.adoptedAt)))), 'Invalid knowledge draft.', 409);
    text(draft.before); text(draft.content); ids.add(draft.id);
  }
  for (const [entry, id] of Object.entries(value.active)) {
    check(value.drafts.some(draft => draft.id === id && draft.adoptedAt
      && entry === key(draft.target, draft.entryId)), 'Invalid active knowledge reference.', 409);
  }
  return value as unknown as State;
}
async function atomicWrite(path: string, bytes: string): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
}
async function save(options: Options, previous: State, next: State): Promise<void> {
  const bytes = JSON.stringify(next, null, 2) + '\n';
  check(Buffer.byteLength(bytes) <= MAX_STORE_BYTES, 'The local knowledge storage limit has been reached.', 409);
  const path = statePath(options);
  await mkdir(dirname(path), { recursive: true });
  await atomicWrite(`${path}.bak`, JSON.stringify(previous, null, 2) + '\n');
  await atomicWrite(path, bytes);
}
async function bundled(target: LocalKnowledgeTarget, options: Options) {
  const filePath = join(options.bundleDir ?? resolveBundledPlatformConfigDir(), `${target}-knowledge.json`);
  const [en, zh] = await Promise.all(['en', 'zh-TW'].map(locale => loadProductKnowledge({
    filePath, capabilities: capabilities[target], locale: locale as 'en' | 'zh-TW',
  })));
  check(en?.status === 'ready' && zh?.status === 'ready' && en.bundle.digest === zh.bundle.digest,
    'Bundled knowledge is unavailable or changed during loading.', 409);
  return { digest: en.bundle.digest, entries: en.bundle.entries.map(entry => ({
    id: entry.id, content: { en: entry.content, 'zh-TW': zh.bundle.entries.find(row => row.id === entry.id)!.content },
  })) };
}
function effective(state: State, target: LocalKnowledgeTarget, bundle: Awaited<ReturnType<typeof bundled>>) {
  return bundle.entries.map(entry => {
    const draft = state.drafts.find(row => row.id === state.active[key(target, entry.id)]);
    const active = draft?.bundleDigest === bundle.digest ? draft : undefined;
    return { id: entry.id, content: active?.content ?? entry.content, activeId: active?.id ?? null };
  });
}
export async function inspectLocalKnowledge(options: Options = {}): Promise<LocalKnowledgeWorkspace> {
  const state = await readState(options);
  const bundles = await Promise.all(targets.map(target => bundled(target, options)));
  return { revision: revision(state, bundles), targets: targets.map((target, index) => ({
    target, entries: effective(state, target, bundles[index]!),
  })), drafts: state.drafts.map(draft => ({ ...draft,
    active: state.active[key(draft.target, draft.entryId)] === draft.id
      && draft.bundleDigest === bundles[targets.indexOf(draft.target)]!.digest,
    stale: draft.bundleDigest !== bundles[targets.indexOf(draft.target)]!.digest,
  })).reverse() };
}
export async function mutateLocalKnowledge(input: unknown, options: Options = {}): Promise<LocalKnowledgeWorkspace> {
  const path = statePath(options), previous = queues.get(path) ?? Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    check(record(input), 'Invalid knowledge request.');
    const state = await readState(options), next = structuredClone(state);
    const bundles = await Promise.all(targets.map(target => bundled(target, options)));
    check(input.revision === revision(state, bundles), 'Knowledge changed. Reload and review the current text.', 409);
    if (input.action === 'submit') {
      check(targets.includes(input.target as LocalKnowledgeTarget), 'Choose Catlas or Orchestrator.');
      check(next.drafts.length < 100, 'The local draft limit (100) has been reached.', 409);
      const target = input.target as LocalKnowledgeTarget, bundle = await bundled(target, options);
      const entry = effective(state, target, bundle).find(row => row.id === input.entryId);
      check(entry, 'Choose an existing knowledge entry.');
      const content = text(input.content);
      check(JSON.stringify(content) !== JSON.stringify(entry.content), 'The draft has no changes.');
      check(input.note === undefined || (typeof input.note === 'string' && input.note.length <= 1_000), 'Source note is too long.');
      next.drafts.push({ id: randomUUID(), target, entryId: entry.id, bundleDigest: bundle.digest,
        before: entry.content, content, note: (input.note as string | undefined)?.trim() ?? '', createdAt: new Date().toISOString() });
    } else {
      check(input.action === 'adopt' || input.action === 'revoke', 'Unknown knowledge action.');
      const draft = next.drafts.find(row => row.id === input.id);
      check(draft, 'Knowledge draft not found.', 404);
      const entryKey = key(draft.target, draft.entryId);
      if (input.action === 'revoke') {
        check(next.active[entryKey] === draft.id, 'This draft is no longer active.', 409);
        delete next.active[entryKey];
      } else {
        check(input.confirm === 'manual-local-unverified', 'Review the draft before adopting it.');
        const bundle = await bundled(draft.target, options);
        check(bundle.digest === draft.bundleDigest, 'Bundled knowledge changed. Submit a fresh draft.', 409);
        const current = effective(state, draft.target, bundle).find(row => row.id === draft.entryId);
        check(current, 'Knowledge entry no longer exists.', 409);
        check(current.activeId === draft.id || JSON.stringify(current.content) === JSON.stringify(draft.before),
          'The entry changed. Submit a fresh draft against the current text.', 409);
        draft.adoptedAt = new Date().toISOString(); next.active[entryKey] = draft.id;
      }
    }
    await save(options, state, next);
    return inspectLocalKnowledge(options);
  });
  queues.set(path, task);
  try { return await task; } finally { if (queues.get(path) === task) queues.delete(path); }
}

/** Only production default loaders opt in; explicit evaluator files stay isolated. */
export async function applyLocalKnowledge(result: ProductKnowledgeResult, target: LocalKnowledgeTarget,
  options: Options = {}): Promise<ProductKnowledgeResult> {
  if (result.status !== 'ready') return result;
  let state: State;
  try { state = await readState(options); } catch { return result; }
  let changed = false;
  const entries = result.bundle.entries.map(entry => {
    const draft = state.drafts.find(row => row.id === state.active[key(target, entry.id)]);
    if (!draft || draft.bundleDigest !== result.bundle.digest) return entry;
    changed = true;
    const content = draft.content[result.bundle.locale];
    return { ...entry, content, digest: knowledgeDigest(content), revision: entry.revision + 1,
      verifiedAt: '', sources: [`manual-local-unverified:${draft.id}`],
      adoption: { kind: 'manual-local-unverified' as const, id: draft.id, at: draft.adoptedAt! } };
  });
  if (!changed) return result;
  const digest = knowledgeDigest(JSON.stringify({ base: result.bundle.digest,
    drafts: state.drafts.filter(draft => draft.target === target
      && state.active[key(target, draft.entryId)] === draft.id && draft.bundleDigest === result.bundle.digest) }));
  return { status: 'ready', bundle: { ...result.bundle, entries, digest, revision: `local.${digest.slice(0, 24)}` } };
}
