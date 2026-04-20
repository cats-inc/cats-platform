import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODE_PRODUCT_ID,
  CODE_PRODUCT_NAME,
  CODE_PRODUCT_ROUTE_BASE,
  createActiveCodeProductRef,
  createCodeProductRef,
} from '../src/products/code/shared/productMetadata.ts';

test('code product metadata helpers expose stable product descriptors', () => {
  assert.equal(CODE_PRODUCT_ID, 'code');
  assert.equal(CODE_PRODUCT_NAME, 'Cats Code');
  assert.equal(CODE_PRODUCT_ROUTE_BASE, '/code');
  assert.deepEqual(createCodeProductRef(), {
    id: 'code',
    name: 'Cats Code',
  });
  assert.deepEqual(createActiveCodeProductRef(), {
    id: 'code',
    name: 'Cats Code',
    status: 'active',
    routeBase: '/code',
    apiBase: '/api/code',
  });
});
