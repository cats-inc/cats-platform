import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyInspectorSelectionToSearch,
  inspectorSelectionsEqual,
  nextInspectorSnapshotState,
  parseInspectorSelectionParam,
  readInspectorSelectionFromSearch,
  serializeInspectorSelection,
  type InspectorSelection,
  type InspectorSnapshotState,
} from '../src/products/chat/companion/inspectorSelection.ts';

test('absent inspector param resolves to absent / null selection', () => {
  assert.deepEqual(parseInspectorSelectionParam(null), {
    selection: null,
    reason: 'absent',
  });
  assert.deepEqual(parseInspectorSelectionParam(''), {
    selection: null,
    reason: 'absent',
  });
});

test('valid type:id parses cleanly', () => {
  const result = parseInspectorSelectionParam('source:s-photo');
  assert.equal(result.reason, 'parsed');
  assert.deepEqual(result.selection, { type: 'source', id: 's-photo' });
});

test('unknown type rejects as malformed', () => {
  const result = parseInspectorSelectionParam('mystery:s-photo');
  assert.equal(result.reason, 'malformed');
  assert.equal(result.selection, null);
});

test('missing id or missing colon rejects as malformed', () => {
  for (const raw of ['source', 'source:', ':id-only', ':']) {
    const result = parseInspectorSelectionParam(raw);
    assert.equal(result.reason, 'malformed', raw);
    assert.equal(result.selection, null);
  }
});

test('id with shell-special characters rejects as malformed', () => {
  const result = parseInspectorSelectionParam('source:has space');
  assert.equal(result.reason, 'malformed');
});

test('readInspectorSelectionFromSearch handles URLSearchParams and raw query strings', () => {
  const fromString = readInspectorSelectionFromSearch('?inspector=post:p-1&other=42');
  assert.deepEqual(fromString.selection, { type: 'post', id: 'p-1' });
  const params = new URLSearchParams('inspector=memory:m-1');
  const fromParams = readInspectorSelectionFromSearch(params);
  assert.deepEqual(fromParams.selection, { type: 'memory', id: 'm-1' });
});

test('applyInspectorSelectionToSearch round-trips through serialize/parse', () => {
  const updated = applyInspectorSelectionToSearch('?other=42', {
    type: 'photo',
    id: 'snap-01',
  });
  const parsedBack = readInspectorSelectionFromSearch(updated);
  assert.deepEqual(parsedBack.selection, { type: 'photo', id: 'snap-01' });
});

test('applyInspectorSelectionToSearch with null selection deletes the param', () => {
  const updated = applyInspectorSelectionToSearch(
    '?other=42&inspector=post:p-1',
    null,
  );
  const params = new URLSearchParams(updated);
  assert.equal(params.has('inspector'), false);
  assert.equal(params.get('other'), '42');
});

test('serializeInspectorSelection rejects malformed structural values', () => {
  assert.equal(serializeInspectorSelection(null), null);
  // @ts-expect-error — runtime shape forced for the negative case
  assert.equal(serializeInspectorSelection({ type: 'mystery', id: 'x' }), null);
  assert.equal(serializeInspectorSelection({ type: 'source', id: 'has space' }), null);
});

test('inspectorSelectionsEqual compares structural equality, including null', () => {
  assert.equal(inspectorSelectionsEqual(null, null), true);
  assert.equal(inspectorSelectionsEqual(null, { type: 'source', id: 's-1' }), false);
  assert.equal(
    inspectorSelectionsEqual(
      { type: 'source', id: 's-1' },
      { type: 'source', id: 's-1' },
    ),
    true,
  );
  assert.equal(
    inspectorSelectionsEqual(
      { type: 'source', id: 's-1' },
      { type: 'source', id: 's-2' },
    ),
    false,
  );
});

test('snapshot transitions: a fresh available resolve becomes the snapshot', () => {
  const next = nextInspectorSnapshotState({
    previous: { selection: null, status: null, snapshot: null },
    selection: { type: 'source', id: 's-1' },
    status: 'available',
    data: { title: 'Snap 1' },
    resolvedAt: '2026-04-28T01:00:00.000Z',
  });
  assert.equal(next.status, 'available');
  assert.deepEqual(next.snapshot?.data, { title: 'Snap 1' });
});

test('snapshot transitions: a deleted resolve keeps the prior snapshot frozen', () => {
  const previous: InspectorSnapshotState<{ title: string }> = {
    selection: { type: 'source', id: 's-1' },
    status: 'available',
    snapshot: {
      selection: { type: 'source', id: 's-1' },
      data: { title: 'Snap 1 (good)' },
      resolvedAt: '2026-04-28T01:00:00.000Z',
    },
  };
  const next = nextInspectorSnapshotState({
    previous,
    selection: { type: 'source', id: 's-1' },
    status: 'deleted',
    data: null,
    resolvedAt: '2026-04-28T02:00:00.000Z',
  });
  assert.equal(next.status, 'deleted');
  assert.deepEqual(next.snapshot?.data, { title: 'Snap 1 (good)' });
});

test('snapshot transitions: switching to a new selection drops the stale snapshot', () => {
  const previous: InspectorSnapshotState<{ title: string }> = {
    selection: { type: 'source', id: 's-1' },
    status: 'available',
    snapshot: {
      selection: { type: 'source', id: 's-1' },
      data: { title: 'Snap 1' },
      resolvedAt: '2026-04-28T01:00:00.000Z',
    },
  };
  const next = nextInspectorSnapshotState({
    previous,
    selection: { type: 'source', id: 's-2' },
    status: 'available',
    data: { title: 'Snap 2' },
    resolvedAt: '2026-04-28T02:00:00.000Z',
  });
  assert.deepEqual(next.snapshot?.selection, { type: 'source', id: 's-2' });
  assert.deepEqual(next.snapshot?.data, { title: 'Snap 2' });
});

test('snapshot transitions: clearing the selection drops the snapshot entirely', () => {
  const previous: InspectorSnapshotState<{ title: string }> = {
    selection: { type: 'source', id: 's-1' },
    status: 'available',
    snapshot: {
      selection: { type: 'source', id: 's-1' },
      data: { title: 'Snap 1' },
      resolvedAt: '2026-04-28T01:00:00.000Z',
    },
  };
  const next = nextInspectorSnapshotState({
    previous,
    selection: null,
    status: null,
    data: null,
    resolvedAt: '2026-04-28T02:00:00.000Z',
  });
  assert.deepEqual(next, { selection: null, status: null, snapshot: null });
});
