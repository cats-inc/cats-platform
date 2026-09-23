import assert from 'node:assert/strict';
import test from 'node:test';
import { findCatalogBoundaryViolations } from '../scripts/check-provider-catalog-boundaries.mjs';

test('catalog guard rejects production model tables and default/alias branches', () => {
  for (const source of ["return 'gpt-9-test';", "const models = [{ id: 'Opaque', label: 'Future' }];",
    "const options = { defaultModel: 'Opaque' };", "const reasoningEfforts = ['low', 'high'];", "if (value.model === 'Opaque') return 'renamed';"])
    assert.ok(findCatalogBoundaryViolations('source.ts', source).length, source);
  assert.deepEqual(findCatalogBoundaryViolations('source.ts',
    "const models = []; const value = { model: data.model }; if (typeof value.model === 'string') save(value.model);"), []);
});
