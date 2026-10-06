import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProviderAdvancedModelCatalog } from '../src/shared/providerCatalog.ts';

test('the advanced catalog normalizer keeps a valid basis and drops empty or partial ones', () => {
  const read = (basis: unknown) => normalizeProviderAdvancedModelCatalog({ basis }, 'fixture').basis;
  assert.deepEqual(read({ channel: { id: 'openai-codex', label: 'openai-codex' } }), { channel: { id: 'openai-codex', label: 'openai-codex' } });
  assert.deepEqual(read({ plan: { label: 'Copilot Pro' }, extra: true }), { plan: { label: 'Copilot Pro' } });
  assert.equal(read(undefined), undefined);
  assert.equal(read({ channel: { id: 'x' } }), undefined);
  assert.equal(read({ plan: { label: '  ' } }), undefined);
});
