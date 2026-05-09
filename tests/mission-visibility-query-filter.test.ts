import assert from 'node:assert/strict';
import test from 'node:test';

import { CORE_MISSION_VISIBILITIES } from '../src/core/api/constants.js';
import { readMissionRunProjectionQuery } from '../src/core/api/queryFilters.js';

test('CORE_MISSION_VISIBILITIES enum lists every MissionVisibility variant', () => {
  assert.deepEqual(
    [...CORE_MISSION_VISIBILITIES].sort(),
    ['internal', 'requires_review', 'work_facing'],
  );
});

test('readMissionRunProjectionQuery parses a single visibility filter', () => {
  const params = new URLSearchParams('visibility=work_facing');
  const query = readMissionRunProjectionQuery(params);
  assert.deepEqual(query.visibilities, ['work_facing']);
});

test('readMissionRunProjectionQuery parses multiple visibility filters as a list', () => {
  const params = new URLSearchParams('visibility=work_facing&visibility=requires_review');
  const query = readMissionRunProjectionQuery(params);
  assert.deepEqual(
    [...(query.visibilities ?? [])].sort(),
    ['requires_review', 'work_facing'],
  );
});

test('readMissionRunProjectionQuery rejects unknown visibility values via readEnumQueryValues', () => {
  const params = new URLSearchParams('visibility=nonsense');
  assert.throws(
    () => readMissionRunProjectionQuery(params),
    /visibility/,
  );
});

test('readMissionRunProjectionQuery omits visibilities when no visibility query is supplied', () => {
  const params = new URLSearchParams('hasRun=true');
  const query = readMissionRunProjectionQuery(params);
  assert.equal(query.visibilities, undefined);
  assert.equal(query.hasRun, true);
});
