import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCatlasChip, captureCatlasDraftSelection, clearCatlasDraftSelection,
  acceptCatlasDraftSelection } from '../src/products/shared/renderer/components/catlasChipActions.js';
import type { GuideCatAssistEntryChip } from '../src/shared/guideCatAssist.js';

test('open chips navigate without reading a prompt or changing the composer', () => {
  const navigated: string[] = [];
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (_url, init) => { requests.push(String(init?.body)); return new Response('{}'); };
  try {
    const chip: GuideCatAssistEntryChip = { id: 'open', action: 'open', label: 'Open roadmap',
      basis: ['project'], target: { kind: 'project', id: 'project' }, href: '/work/projects/project' };
    Object.defineProperty(chip, 'prompt', { get() { throw new Error('open has no prompt'); } });
    selectCatlasChip(chip, 'code:new:default:default', {
      onComposerChange: () => assert.fail('open must not change draft'),
      navigate: path => { navigated.push(path); },
    });
    assert.deepEqual(navigated, ['/work/projects/project']);
    assert.equal(JSON.parse(requests[0]).event, 'accepted');
  } finally { globalThis.fetch = original; }
});

test('prefill uses its explicit product, fills only, and reports acceptance only after a successful send', () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (_url, init) => { requests.push(String(init?.body)); return new Response('{}'); };
  try {
    clearCatlasDraftSelection();
    selectCatlasChip({ id: 'recommendation', action: 'prefill', surface: 'work', label: 'Plan roadmap',
      prompt: 'Plan the next release', basis: ['project'] }, 'code:new:default:default', {
      onComposerChange: value => { calls.push(value); },
      onDraftSurfaceChange: value => { calls.push(value); },
      navigate: () => assert.fail('prefill does not navigate to a record'),
    });
    assert.deepEqual(calls, ['Plan the next release', 'work']);
    assert.deepEqual(requests, [], 'selection alone is not acceptance');
    const captured = captureCatlasDraftSelection();
    assert.ok(captured);
    acceptCatlasDraftSelection(captured);
    assert.equal(JSON.parse(requests[0]).event, 'accepted');
    assert.equal(captureCatlasDraftSelection(), null);
  } finally { globalThis.fetch = original; clearCatlasDraftSelection(); }
});
