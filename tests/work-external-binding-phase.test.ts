import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveWorkExternalBindingPhase,
} from '../src/products/work/shared/workExternalBindingPhase.ts';

test('external binding phase resolver matches explicit Work Item link requests', () => {
  const result = resolveWorkExternalBindingPhase({
    rawText: 'Boss Cat link work-item-intake to https://github.com/cats-inc/cats-platform/issues/123',
  });

  assert.equal(result.kind, 'matched');
  assert.equal(result.phase, 'external_tracker_binding');
  assert.equal(result.operation, 'link');
  assert.equal(result.localKind, 'work_item');
  assert.equal(result.localId, 'work-item-intake');
  assert.equal(result.external.provider, 'github');
  assert.equal(result.external.externalId, '123');
});

test('external binding phase resolver matches explicit Project unlink requests', () => {
  const result = resolveWorkExternalBindingPhase({
    rawText: '請解除連結 project-cats-platform 和 https://redmine.example.test/projects/cats-platform。',
  });

  assert.equal(result.kind, 'matched');
  assert.equal(result.operation, 'unlink');
  assert.equal(result.localKind, 'project');
  assert.equal(result.localId, 'project-cats-platform');
  assert.equal(result.external.provider, 'redmine');
  assert.equal(result.external.externalType, 'project');
  assert.equal(result.externalUrl, 'https://redmine.example.test/projects/cats-platform');
});

test('external binding phase resolver rejects ambiguous or slash-command requests', () => {
  assert.deepEqual(resolveWorkExternalBindingPhase({
    rawText: 'Please look at this GitHub issue later.',
  }), {
    kind: 'none',
    phase: null,
    reasonCode: 'missing_external_binding_action_cue',
    normalizedText: 'please look at this github issue later.',
  });

  assert.deepEqual(resolveWorkExternalBindingPhase({
    rawText: '/work link work-item-intake https://github.com/cats-inc/cats-platform/issues/123',
  }), {
    kind: 'none',
    phase: null,
    reasonCode: 'slash_command',
    normalizedText: '/work link work-item-intake https://github.com/cats-inc/cats-platform/issues/123',
  });

  assert.deepEqual(resolveWorkExternalBindingPhase({
    rawText: 'Link https://github.com/cats-inc/cats-platform/issues/123',
  }), {
    kind: 'none',
    phase: null,
    reasonCode: 'missing_local_work_ref',
    normalizedText: 'link https://github.com/cats-inc/cats-platform/issues/123',
  });
});
