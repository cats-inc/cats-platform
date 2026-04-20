import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createActiveWorkProductRef,
  createWorkProductRef,
  WORK_PRODUCT_ID,
  WORK_PRODUCT_NAME,
  WORK_PRODUCT_ROUTE_BASE,
} from '../src/products/work/shared/productMetadata.ts';

test('work product metadata helpers expose stable product descriptors', () => {
  assert.equal(WORK_PRODUCT_ID, 'work');
  assert.equal(WORK_PRODUCT_NAME, 'Cats Work');
  assert.equal(WORK_PRODUCT_ROUTE_BASE, '/work');
  assert.deepEqual(createWorkProductRef(), {
    id: 'work',
    name: 'Cats Work',
  });
  assert.deepEqual(createActiveWorkProductRef(), {
    id: 'work',
    name: 'Cats Work',
    status: 'active',
    routeBase: '/work',
    apiBase: '/api/work',
  });
});
