import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMyCatPathForPrefix } from '../src/products/shared/renderer/myCatNavigation.ts';
import { resolveMyCatNavigationTarget as resolveCodeMyCatNavigationTarget } from '../src/products/code/renderer/myCatNavigation.ts';
import { resolveMyCatNavigationTarget as resolveWorkMyCatNavigationTarget } from '../src/products/work/renderer/myCatNavigation.ts';

test('buildMyCatPathForPrefix trims and encodes cat ids without leaking the chat prefix', () => {
  assert.equal(
    buildMyCatPathForPrefix('/work', '  companion/cat  '),
    '/work/my-cats/companion%2Fcat',
  );
  assert.equal(buildMyCatPathForPrefix('/code', '   '), '/code/my-cats');
});

test('workspace My Cats navigation targets stay product-local for work and code', () => {
  assert.deepEqual(resolveWorkMyCatNavigationTarget([], 'companion-cat'), {
    kind: 'direct_lane',
    path: '/work/my-cats/companion-cat',
  });
  assert.deepEqual(resolveCodeMyCatNavigationTarget([], 'companion-cat'), {
    kind: 'direct_lane',
    path: '/code/my-cats/companion-cat',
  });
});
