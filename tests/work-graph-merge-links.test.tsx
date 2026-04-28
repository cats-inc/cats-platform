import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeWorkGraphLinks } from '../src/products/work/renderer/components/topdown/mergeLinks.ts';
import { MOCK_WORK_GRAPH } from '../src/products/work/renderer/components/topdown/mock.ts';
import type {
  WorkGraphLink,
  WorkGraphLinkOrphanDiagnostic,
} from '../src/products/work/renderer/components/topdown/types.ts';

test('mergeWorkGraphLinks with empty fetched returns the same projection contents as the base mock', () => {
  const merged = mergeWorkGraphLinks(MOCK_WORK_GRAPH, []);
  // Same number of stored link rows.
  assert.equal(merged.links.length, MOCK_WORK_GRAPH.links.length);
  // Same orphan_link diagnostic count (one in the seeded fixture).
  const baseOrphans = MOCK_WORK_GRAPH.diagnostics.filter((d) => d.kind === 'orphan_link');
  const mergedOrphans = merged.diagnostics.filter((d) => d.kind === 'orphan_link');
  assert.equal(mergedOrphans.length, baseOrphans.length);
});

test('mergeWorkGraphLinks layers a new fetched link onto the projection', () => {
  // task-write-spec → blocked_by something is not in the seed; a new
  // fetched blocks row whose target is task-write-spec must produce a
  // blocked_by view on task-write-spec post-merge.
  const fetched: WorkGraphLink[] = [
    {
      id: 'fetched-blocks-1',
      kind: 'blocks',
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-hero-copy',
      targetRecordFamily: 'task',
      targetRecordId: 'task-write-spec',
      createdAt: '2026-04-28T10:00:00.000Z',
      createdByActorId: null,
      note: null,
    },
  ];
  const merged = mergeWorkGraphLinks(MOCK_WORK_GRAPH, fetched);
  const taskWriteSpecViews = merged.linksByEndpoint['task:task-write-spec'] ?? [];
  const blockedByView = taskWriteSpecViews.find((v) => v.linkId === 'fetched-blocks-1');
  assert.ok(blockedByView, 'fetched blocks row should produce a blocked_by view on the target');
  assert.equal(blockedByView.kind, 'blocked_by');
});

test('mergeWorkGraphLinks dedupes by id when fetched contains a row with the same id as base', () => {
  // Base has link-block-1 (task-hero-copy blocks task-deploy). Provide a
  // fetched row with the same id but different target — fetched wins.
  const fetched: WorkGraphLink[] = [
    {
      id: 'link-block-1',
      kind: 'blocks',
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-hero-copy',
      targetRecordFamily: 'task',
      targetRecordId: 'task-write-spec',
      createdAt: '2026-04-28T10:00:00.000Z',
      createdByActorId: null,
      note: 'updated by producer',
    },
  ];
  const merged = mergeWorkGraphLinks(MOCK_WORK_GRAPH, fetched);
  const overwritten = merged.links.find((l) => l.id === 'link-block-1');
  assert.ok(overwritten);
  assert.equal(overwritten.targetRecordId, 'task-write-spec');
  // The base target task-deploy should no longer carry a blocked_by
  // view from this link id.
  const taskDeployViews = merged.linksByEndpoint['task:task-deploy'] ?? [];
  assert.ok(!taskDeployViews.some((v) => v.linkId === 'link-block-1'));
});

test('mergeWorkGraphLinks emits orphan_link for a fetched row whose endpoint is not in the projection', () => {
  const fetched: WorkGraphLink[] = [
    {
      id: 'fetched-orphan-1',
      kind: 'blocks',
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-hero-copy',
      targetRecordFamily: 'task',
      targetRecordId: 'task-totally-deleted',
      createdAt: '2026-04-28T10:00:00.000Z',
      createdByActorId: null,
      note: null,
    },
  ];
  const merged = mergeWorkGraphLinks(MOCK_WORK_GRAPH, fetched);
  const orphan = merged.diagnostics.find(
    (d): d is WorkGraphLinkOrphanDiagnostic =>
      d.kind === 'orphan_link' && d.linkId === 'fetched-orphan-1',
  );
  assert.ok(orphan, 'fetched row with unresolved target should produce orphan_link diagnostic');
  assert.equal(orphan.unresolvedSide, 'target');
});

test('mergeWorkGraphLinks preserves base SPEC-083 diagnostics', () => {
  const merged = mergeWorkGraphLinks(MOCK_WORK_GRAPH, []);
  const baseKeptKinds = ['broken_fk', 'missing_project_anchor'];
  for (const kind of baseKeptKinds) {
    const present = merged.diagnostics.some((d) => d.kind === kind);
    const wasInBase = MOCK_WORK_GRAPH.diagnostics.some((d) => d.kind === kind);
    assert.equal(present, wasInBase, `${kind} should pass through merge unchanged`);
  }
});

test('mergeWorkGraphLinks does not mutate the base projection', () => {
  const initialLinkCount = MOCK_WORK_GRAPH.links.length;
  const initialDiagCount = MOCK_WORK_GRAPH.diagnostics.length;
  mergeWorkGraphLinks(MOCK_WORK_GRAPH, [
    {
      id: 'fetched-no-mutate',
      kind: 'blocks',
      sourceRecordFamily: 'task',
      sourceRecordId: 'task-hero-copy',
      targetRecordFamily: 'task',
      targetRecordId: 'task-write-spec',
      createdAt: '2026-04-28T10:00:00.000Z',
      createdByActorId: null,
      note: null,
    },
  ]);
  assert.equal(MOCK_WORK_GRAPH.links.length, initialLinkCount);
  assert.equal(MOCK_WORK_GRAPH.diagnostics.length, initialDiagCount);
});
