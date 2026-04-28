import assert from 'node:assert/strict';
import test from 'node:test';

import { MOCK_WORK_GRAPH } from '../src/products/work/renderer/components/topdown/mock.ts';
import {
  buildIndexes,
  endpointKey,
  projectLinks,
} from '../src/products/work/renderer/components/topdown/shared.ts';
import type {
  WorkGraphLink,
  WorkGraphLinkOrphanDiagnostic,
  WorkGraphLinkCycleDiagnostic,
  WorkGraphLinkView,
  WorkGraphObjectSummary,
} from '../src/products/work/renderer/components/topdown/types.ts';

test('storage holds only the four canonical stored kinds — no blocked_by rows', () => {
  const stored = new Set(MOCK_WORK_GRAPH.links.map((l) => l.kind));
  assert.deepEqual([...stored].sort(), ['blocks', 'duplicate_of', 'follows', 'related_to']);
  for (const link of MOCK_WORK_GRAPH.links) {
    assert.notEqual((link as WorkGraphLink).kind, 'blocked_by');
  }
});

test('projection emits a blocked_by view on the inverse endpoint of every well-resolved blocks row', () => {
  const indexes = buildIndexes(MOCK_WORK_GRAPH);
  const wellResolvedBlocks = MOCK_WORK_GRAPH.links.filter((l) => {
    if (l.kind !== 'blocks') return false;
    const sourceKey = `${l.sourceRecordFamily}:${l.sourceRecordId}`;
    const targetKey = `${l.targetRecordFamily}:${l.targetRecordId}`;
    return (
      indexes.objectsByCoreRef.has(sourceKey) &&
      indexes.objectsByCoreRef.has(targetKey)
    );
  });
  assert.ok(wellResolvedBlocks.length > 0, 'fixture should seed at least one well-resolved blocks row');

  for (const link of wellResolvedBlocks) {
    const targetKey = endpointKey({
      recordFamily: link.targetRecordFamily,
      recordId: link.targetRecordId,
    });
    const targetViews: WorkGraphLinkView[] =
      MOCK_WORK_GRAPH.linksByEndpoint[targetKey] ?? [];
    const blockedByView = targetViews.find(
      (v) => v.linkId === link.id && v.kind === 'blocked_by',
    );
    assert.ok(
      blockedByView,
      `expected blocked_by view for link ${link.id} on ${targetKey}`,
    );
    assert.equal(blockedByView.otherEndpoint.recordFamily, link.sourceRecordFamily);
    assert.equal(blockedByView.otherEndpoint.recordId, link.sourceRecordId);
  }
});

test('related_to canonical row produces views on both endpoints', () => {
  const related = MOCK_WORK_GRAPH.links.find((l) => l.kind === 'related_to');
  assert.ok(related, 'fixture should seed at least one related_to row');
  const sourceKey = endpointKey({
    recordFamily: related.sourceRecordFamily,
    recordId: related.sourceRecordId,
  });
  const targetKey = endpointKey({
    recordFamily: related.targetRecordFamily,
    recordId: related.targetRecordId,
  });
  const onSource = (MOCK_WORK_GRAPH.linksByEndpoint[sourceKey] ?? []).find(
    (v) => v.linkId === related.id,
  );
  const onTarget = (MOCK_WORK_GRAPH.linksByEndpoint[targetKey] ?? []).find(
    (v) => v.linkId === related.id,
  );
  assert.ok(onSource, 'related_to row should produce a view on the source endpoint');
  assert.ok(onTarget, 'related_to row should produce a view on the target endpoint');
  assert.equal(onSource.kind, 'related_to');
  assert.equal(onTarget.kind, 'related_to');
});

test('duplicate_of and follows produce a view on the source side only at v1', () => {
  for (const kind of ['duplicate_of', 'follows'] as const) {
    const row = MOCK_WORK_GRAPH.links.find((l) => l.kind === kind);
    assert.ok(row, `fixture should seed at least one ${kind} row`);
    const sourceKey = endpointKey({
      recordFamily: row.sourceRecordFamily,
      recordId: row.sourceRecordId,
    });
    const targetKey = endpointKey({
      recordFamily: row.targetRecordFamily,
      recordId: row.targetRecordId,
    });
    const sourceViews = (MOCK_WORK_GRAPH.linksByEndpoint[sourceKey] ?? []).filter(
      (v) => v.linkId === row.id,
    );
    const targetViews = (MOCK_WORK_GRAPH.linksByEndpoint[targetKey] ?? []).filter(
      (v) => v.linkId === row.id,
    );
    assert.equal(sourceViews.length, 1, `${kind} should produce one view on source`);
    assert.equal(sourceViews[0].kind, kind);
    assert.equal(targetViews.length, 0, `${kind} should produce no view on target at v1`);
  }
});

test('orphan rows are excluded from linksByEndpoint and surface as orphan_link diagnostics', () => {
  const indexes = buildIndexes(MOCK_WORK_GRAPH);
  const orphanRows = MOCK_WORK_GRAPH.links.filter((l) => {
    const sourceKey = `${l.sourceRecordFamily}:${l.sourceRecordId}`;
    const targetKey = `${l.targetRecordFamily}:${l.targetRecordId}`;
    return (
      !indexes.objectsByCoreRef.has(sourceKey) ||
      !indexes.objectsByCoreRef.has(targetKey)
    );
  });
  assert.ok(orphanRows.length > 0, 'fixture should seed at least one orphan row');

  for (const row of orphanRows) {
    for (const views of Object.values(MOCK_WORK_GRAPH.linksByEndpoint)) {
      const found = (views ?? []).find((v) => v.linkId === row.id);
      assert.equal(found, undefined, `orphan row ${row.id} should NOT appear in linksByEndpoint`);
    }
  }

  const orphanDiagnostics = MOCK_WORK_GRAPH.diagnostics.filter(
    (d): d is WorkGraphLinkOrphanDiagnostic => d.kind === 'orphan_link',
  );
  assert.equal(orphanDiagnostics.length, orphanRows.length);
  for (const orphan of orphanDiagnostics) {
    assert.ok(
      ['source', 'target', 'both'].includes(orphan.unresolvedSide),
      'unresolvedSide must be source / target / both',
    );
    assert.ok(orphan.linkId, 'diagnostic must carry the offending linkId');
  }
});

test('link_cycle diagnostic is emitted for the seeded blocks cycle', () => {
  const cycleDiagnostics = MOCK_WORK_GRAPH.diagnostics.filter(
    (d): d is WorkGraphLinkCycleDiagnostic => d.kind === 'link_cycle',
  );
  assert.ok(cycleDiagnostics.length > 0, 'fixture should produce at least one cycle diagnostic');
  for (const c of cycleDiagnostics) {
    assert.ok(c.cycleLinkIds.length >= 2, 'a cycle needs at least two edges');
    assert.equal(
      c.cycleLinkIds.length,
      c.cycleEndpoints.length,
      'cycleLinkIds count should match cycleEndpoints count (one edge per endpoint in the loop)',
    );
  }
});

test('cycle detection is deterministic regardless of stored row iteration order', () => {
  const indexes = buildIndexes(MOCK_WORK_GRAPH);
  const baseline = projectLinks(MOCK_WORK_GRAPH.links, indexes.objectsByCoreRef);
  const reversed = projectLinks(
    [...MOCK_WORK_GRAPH.links].reverse(),
    indexes.objectsByCoreRef,
  );
  const cycleIdsOf = (
    diagnostics: ReadonlyArray<{ kind: string }>,
  ): string[] =>
    diagnostics
      .filter((d): d is WorkGraphLinkCycleDiagnostic => d.kind === 'link_cycle')
      .map((d) => [...d.cycleLinkIds].sort().join(','))
      .sort();
  assert.deepEqual(cycleIdsOf(baseline.diagnostics), cycleIdsOf(reversed.diagnostics));
});

test('endpoint resolution matches WorkGraphObjectSummary.sourceRecordFamily / sourceRecordId', () => {
  const indexes = buildIndexes(MOCK_WORK_GRAPH);
  for (const link of MOCK_WORK_GRAPH.links) {
    const sourceKey = `${link.sourceRecordFamily}:${link.sourceRecordId}`;
    const summary: WorkGraphObjectSummary | undefined =
      indexes.objectsByCoreRef.get(sourceKey);
    if (summary) {
      assert.equal(summary.sourceRecordFamily, link.sourceRecordFamily);
      assert.equal(summary.sourceRecordId, link.sourceRecordId);
    }
  }
});
