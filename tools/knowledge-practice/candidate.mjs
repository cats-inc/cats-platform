import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProductKnowledge } from '../../build/server/platform/knowledge/productKnowledge.js';
import { canonical, digest, evidenceIds, fields, id, readJson, safeText, writeNew } from './artifacts.mjs';

export function validateDraft(draft) {
  fields(draft, ['schemaVersion', 'id', 'authorId', 'evidenceRefs', 'counterexamples', 'knowledge']);
  assert.equal(draft.schemaVersion, 1);
  id(draft.id); id(draft.authorId); evidenceIds(draft.evidenceRefs);
  assert.ok(Array.isArray(draft.counterexamples) && draft.counterexamples.length > 0 && draft.counterexamples.length <= 16);
  draft.counterexamples.forEach((text) => safeText(text, 1_000));
  fields(draft.knowledge, ['revision', 'platformRange', 'requiredCapabilities', 'entries']);
  assert.ok(Array.isArray(draft.knowledge.entries) && draft.knowledge.entries.length > 0 && draft.knowledge.entries.length <= 32);
  for (const entry of draft.knowledge.entries) {
    fields(entry, ['id', 'revision', 'roles', 'kind', 'surfaces', 'topics', 'requiredOperations', 'content']);
    fields(entry.content, ['en', 'zh-TW']);
    safeText(entry.content.en); safeText(entry.content['zh-TW']);
  }
  assert.ok(Buffer.byteLength(canonical(draft)) <= 128 * 1024, 'Candidate exceeds 128 KiB.');
  return draft;
}

export function candidateBundle(candidate, verifiedAt) {
  validateDraft(candidate.draft);
  assert.equal(digest(candidate.draft), candidate.digest, 'Candidate digest mismatch.');
  return { schemaVersion: 2, ...candidate.draft.knowledge,
    entries: candidate.draft.knowledge.entries.map((entry) => ({ ...entry, verifiedAt,
      sources: [`candidate:${candidate.digest}`, ...candidate.draft.evidenceRefs.slice(0, 7)] })) };
}

export async function validateBundle(bundle, platformVersion) {
  const root = await mkdtemp(join(tmpdir(), 'cats-knowledge-validation-'));
  try {
    const filePath = join(root, 'bundle.json'); await writeNew(filePath, bundle);
    const results = {};
    for (const locale of ['en', 'zh-TW']) {
      results[locale] = await loadProductKnowledge({ filePath, platformVersion,
        capabilities: bundle.requiredCapabilities, locale });
      assert.equal(results[locale].status, 'ready', 'Knowledge fails the production loader.');
    }
    return results;
  } finally { await rm(root, { recursive: true, force: true }); }
}

export async function createCandidate({ draftFile, outputFile, platformVersion }) {
  const draft = validateDraft(await readJson(draftFile, 128 * 1024));
  const candidate = { schemaVersion: 1, state: 'unverified', draft, digest: digest(draft) };
  assert.ok(Buffer.byteLength(canonical(candidate)) + 1 <= 128 * 1024, 'Candidate envelope exceeds 128 KiB.');
  // This sentinel is only for schema validation; the proposal has no verifiedAt.
  await validateBundle(candidateBundle(candidate, '1970-01-01'), platformVersion);
  await writeNew(outputFile, candidate);
  return candidate;
}

export async function readCandidate(file) {
  const candidate = await readJson(file, 128 * 1024);
  fields(candidate, ['schemaVersion', 'state', 'draft', 'digest']);
  assert.equal(candidate.schemaVersion, 1); assert.equal(candidate.state, 'unverified');
  validateDraft(candidate.draft);
  assert.equal(candidate.digest, digest(candidate.draft), 'Candidate digest mismatch.');
  return candidate;
}
