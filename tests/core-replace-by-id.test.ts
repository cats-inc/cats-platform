import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceById } from '../src/core/model/shared.ts';

interface Row {
  id: string;
  value: { label: string };
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, value: { label: `v${index}` } }));
}

test('replacing a record returns a new array and leaves the input untouched', () => {
  const input = rows(3);
  const snapshot = structuredClone(input);
  const replacement: Row = { id: 'row-1', value: { label: 'changed' } };

  const { records, created } = replaceById(input, replacement);

  assert.equal(created, false);
  assert.notEqual(records, input);
  assert.deepEqual(input, snapshot);
  assert.equal(records[1], replacement);
  assert.deepEqual(records.map((row) => row.id), ['row-0', 'row-1', 'row-2']);
});

test('records that were not replaced are shared, not deep-copied', () => {
  const input = rows(3);
  const { records } = replaceById(input, { id: 'row-2', value: { label: 'changed' } });

  assert.equal(records[0], input[0]);
  assert.equal(records[1], input[1]);
});

test('an unknown id appends the record', () => {
  const input = rows(2);
  const { records, created } = replaceById(input, { id: 'row-new', value: { label: 'new' } });

  assert.equal(created, true);
  assert.deepEqual(records.map((row) => row.id), ['row-0', 'row-1', 'row-new']);
  assert.equal(input.length, 2);
});

test('successive updates keep untouched records shared across the whole collection', () => {
  // Deep-cloning the collection on each update made projection passes quadratic:
  // 4,000 sequential updates cloned about 16 million records.
  const original = rows(4_000);
  let collection = original;
  for (const row of rows(4_000).slice(0, 2_000)) {
    collection = replaceById(collection, { ...row, value: { label: 'updated' } }).records;
  }

  assert.ok(collection.slice(0, 2_000).every((row) => row.value.label === 'updated'));
  assert.ok(collection.slice(2_000).every((row, index) => row === original[2_000 + index]));
});
