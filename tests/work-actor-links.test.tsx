import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listCatActorLinks,
  readCatIdFromActorId,
} from '../src/products/work/renderer/actorLinks.ts';

test('readCatIdFromActorId only resolves cat-backed actor ids', () => {
  assert.equal(readCatIdFromActorId('actor-cat-reviewer'), 'reviewer');
  assert.equal(readCatIdFromActorId('actor-human-reviewer'), null);
  assert.equal(readCatIdFromActorId('actor-cat-'), null);
  assert.equal(readCatIdFromActorId(null), null);
});

test('listCatActorLinks keeps display names only for cat-backed actors', () => {
  assert.deepEqual(
    listCatActorLinks([
      { actorId: 'actor-cat-reviewer', displayName: 'Reviewer Cat' },
      { actorId: 'actor-human-analyst', displayName: 'Analyst' },
      { actorId: 'actor-cat-planner', displayName: 'Planner Cat' },
    ]),
    [
      { actorId: 'actor-cat-reviewer', displayName: 'Reviewer Cat', catId: 'reviewer' },
      { actorId: 'actor-cat-planner', displayName: 'Planner Cat', catId: 'planner' },
    ],
  );
});
