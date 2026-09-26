import assert from 'node:assert/strict';
import { assembleProductKnowledgeContext, selectProductKnowledge } from '../../build/server/platform/knowledge/productKnowledge.js';
import { canonical, evidenceIds, fields, id } from './artifacts.mjs';

// Operator policy, never inferred from model-authored topics or prose.
export function validateChangeScope(scope, knowledge, evidenceRefs) {
  assert.ok(Array.isArray(scope) && scope.length <= 32, 'Declare a bounded change scope.');
  const seen = new Set();
  for (const change of scope) {
    fields(change, ['entryId', 'evidenceRefs']); id(change.entryId); evidenceIds(change.evidenceRefs);
    assert.ok(!seen.has(change.entryId), 'Duplicate change scope entry.'); seen.add(change.entryId);
    assert.equal(new Set(change.evidenceRefs).size, change.evidenceRefs.length, 'Duplicate supporting evidence.');
    if (knowledge) assert.ok(knowledge.entries.some(entry => entry.id === change.entryId), 'Unknown change scope entry.');
    if (evidenceRefs) assert.ok(change.evidenceRefs.every(ref => evidenceRefs.includes(ref)), 'Change scope evidence was not admitted.');
  }
  return scope;
}

// Match the production loader's v1 defaults; exclude verification/provenance.
export function baselineKnowledge(bundle) {
  return { revision: bundle.revision, platformRange: bundle.platformRange,
    requiredCapabilities: bundle.requiredCapabilities,
    entries: bundle.entries.map(entry => ({ id: entry.id, revision: entry.revision,
      topics: entry.topics, content: entry.content,
      roles: bundle.schemaVersion === 1 ? ['catlas'] : entry.roles,
      kind: bundle.schemaVersion === 1 ? 'concept' : entry.kind,
      surfaces: bundle.schemaVersion === 1 ? ['code-help'] : entry.surfaces,
      requiredOperations: bundle.schemaVersion === 1 ? [] : entry.requiredOperations })) };
}

/** Bounded edits of existing guidance only. New entries/applicability need a separate admission. */
export function assertKnowledgeChanges(baseline, proposed, scope, evidenceRefs) {
  validateChangeScope(scope, baseline, evidenceRefs);
  for (const key of ['platformRange', 'requiredCapabilities']) {
    assert.deepEqual(proposed[key], baseline[key], 'Knowledge applicability changed.');
  }
  assert.deepEqual(proposed.entries.map(entry => entry.id), baseline.entries.map(entry => entry.id),
    'Knowledge must preserve baseline entry IDs and order.');
  const permitted = new Set(scope.map(change => change.entryId));
  let changed = false;
  for (const [index, prior] of baseline.entries.entries()) {
    const next = proposed.entries[index];
    if (!permitted.has(prior.id)) {
      assert.ok(canonical(next) === canonical(prior), `Unrelated knowledge changed: ${prior.id}.`);
      continue;
    }
    for (const key of ['id', 'roles', 'kind', 'surfaces', 'topics', 'requiredOperations']) {
      assert.deepEqual(next[key], prior[key], `Entry applicability changed: ${prior.id}.`);
    }
    if (canonical(next.content) === canonical(prior.content)) {
      assert.equal(next.revision, prior.revision, 'Unchanged guidance must retain its revision.');
    } else {
      assert.ok(Number.isSafeInteger(next.revision) && next.revision > prior.revision,
        'Changed guidance requires a higher revision.');
      changed = true;
    }
  }
  if (changed) assert.notEqual(proposed.revision, baseline.revision, 'Changed guidance requires a new bundle revision.');
}

export const PRESERVATION_CHECK = 'baseline-guidance-preserved';

/** Compare delivered guidance independently of the evaluator's observed/result prose. */
export function preservationCheck(baseline, proposed, input, scope) {
  const permitted = new Set(scope.map(change => change.entryId));
  const semantics = ({ digest, verifiedAt, sources, ...entry }) => {
    if (permitted.has(entry.id)) {
      const { content, revision, ...applicability } = entry;
      return applicability;
    }
    return entry;
  };
  const retained = (before, after) => before.every(prior => {
      const next = after.find(entry => entry.id === prior.id);
      return next !== undefined && canonical(semantics(next)) === canonical(semantics(prior));
    });
  // Catlas directly selects entries; role contexts apply a second envelope budget.
  // Equal assembled contexts can hide an earlier loss in direct selection.
  return { id: PRESERVATION_CHECK, kind: 'correctness', critical: true,
    passed: retained(selectProductKnowledge(baseline.bundle, input), selectProductKnowledge(proposed.bundle, input))
      && retained(assembleProductKnowledgeContext(baseline, input).entries,
        assembleProductKnowledgeContext(proposed, input).entries) };
}
