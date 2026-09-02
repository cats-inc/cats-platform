import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveExecutionTargetLabel } from '../src/shared/executionLabel.ts';
import {
  clearLiveProviderModelLabels,
  recordLiveProviderModelLabels,
  resolveLiveProviderModelLabel,
} from '../src/shared/providerModelLabelRegistry.ts';

function target(model: string) {
  return { provider: 'claude', instance: 'native', model };
}

test('a runtime-served label wins over the static fallback table', (t) => {
  t.after(() => clearLiveProviderModelLabels());
  clearLiveProviderModelLabels();

  // What the static table alone produces.
  const staticLabel = resolveExecutionTargetLabel(target('opus'));
  assert.match(staticLabel, /Opus/u);

  // The runtime is the only thing that knows which version the alias points at,
  // so once it has said, that answer is used.
  recordLiveProviderModelLabels('claude', [
    { id: 'opus', label: 'Opus 6 (1M context)' },
  ]);

  const liveLabel = resolveExecutionTargetLabel(target('opus'));
  assert.match(liveLabel, /Opus 6/u);
  assert.equal(liveLabel.includes('Opus 5'), false);
});

test('the static fallback still names a target before any catalog has loaded', () => {
  clearLiveProviderModelLabels();

  // An offline shell has no runtime label, and must still show the version
  // rather than a bare alias.
  const label = resolveExecutionTargetLabel(target('opus'));
  assert.match(label, /Opus 5/u);
});

test('an alias resolves through normalization when the live label is keyed by alias', (t) => {
  t.after(() => clearLiveProviderModelLabels());
  clearLiveProviderModelLabels();
  recordLiveProviderModelLabels('claude', [
    { id: 'opus', label: 'Opus 6 (1M context)' },
  ]);

  // `claude-opus-4-6` normalizes to the `opus` alias, so it picks up the live
  // label recorded against that alias.
  assert.match(resolveExecutionTargetLabel(target('claude-opus-4-6')), /Opus 6/u);
});

test('a pinned model id keeps its own runtime label', (t) => {
  t.after(() => clearLiveProviderModelLabels());
  clearLiveProviderModelLabels();
  recordLiveProviderModelLabels('cursor', [
    { id: 'claude-opus-5-high', label: 'Claude Opus 5 High' },
  ]);

  assert.equal(
    resolveLiveProviderModelLabel('cursor', 'claude-opus-5-high'),
    'Claude Opus 5 High',
  );
});

test('a sparse catalog cannot erase a name the static table can supply', (t) => {
  t.after(() => clearLiveProviderModelLabels());
  clearLiveProviderModelLabels();
  recordLiveProviderModelLabels('claude', [
    { id: 'opus', label: '   ' },
    { id: 'sonnet' },
  ]);

  assert.equal(resolveLiveProviderModelLabel('claude', 'opus'), null);
  assert.equal(resolveLiveProviderModelLabel('claude', 'sonnet'), null);
  assert.match(resolveExecutionTargetLabel(target('opus')), /Opus 5/u);
});

test('label lookup is case and whitespace insensitive', (t) => {
  t.after(() => clearLiveProviderModelLabels());
  clearLiveProviderModelLabels();
  recordLiveProviderModelLabels('Claude', [
    { id: ' Opus ', label: 'Opus 6 (1M context)' },
  ]);

  assert.equal(
    resolveLiveProviderModelLabel('claude', 'opus'),
    'Opus 6 (1M context)',
  );
});
