import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXTERNAL_WORK_BINDING_METADATA_KEY,
  buildExternalWorkBinding,
  createExternalWorkBindingsMetadata,
  validateExternalWorkBinding,
} from '../src/products/work/shared/externalWorkBinding.js';

test('external Work binding normalizes the MVP issue metadata shape', () => {
  const binding = buildExternalWorkBinding({
    localKind: 'work_item',
    localId: ' work-item-1 ',
    provider: 'github',
    externalType: 'issue',
    externalId: ' 123 ',
    externalUrl: ' https://github.com/cats-inc/cats-platform/issues/123 ',
    linkedAt: '2026-05-13T10:00:00.000Z',
    linkedByActorRef: ' cat:boss ',
  });

  assert.deepEqual(binding, {
    schemaVersion: 1,
    localKind: 'work_item',
    localId: 'work-item-1',
    provider: 'github',
    externalType: 'issue',
    externalId: '123',
    externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
    syncDirection: 'pull',
    lastSyncedAt: null,
    externalUpdatedAt: null,
    linkedAt: '2026-05-13T10:00:00.000Z',
    linkedByActorRef: 'cat:boss',
  });
  assert.equal(EXTERNAL_WORK_BINDING_METADATA_KEY, 'externalWorkBindings');
  assert.deepEqual(createExternalWorkBindingsMetadata([binding]), {
    schemaVersion: 1,
    bindings: [binding],
  });
});

test('external Work binding validation rejects unsupported providers and unsafe URLs', () => {
  assert.deepEqual(
    validateExternalWorkBinding({
      localKind: 'task',
      localId: '',
      provider: 'jira',
      externalType: 'card',
      externalId: 'x'.repeat(201),
      externalUrl: 'javascript:alert(1)',
      syncDirection: 'mirror',
      lastSyncedAt: 'not-a-date',
      externalUpdatedAt: 42,
      linkedAt: '',
      linkedByActorRef: 'x'.repeat(161),
    }).map((entry) => [entry.field, entry.code]),
    [
      ['localKind', 'unsupported_value'],
      ['localId', 'blank'],
      ['provider', 'unsupported_value'],
      ['externalType', 'unsupported_value'],
      ['externalId', 'too_long'],
      ['externalUrl', 'invalid_url'],
      ['syncDirection', 'unsupported_value'],
      ['lastSyncedAt', 'invalid_timestamp'],
      ['externalUpdatedAt', 'type'],
      ['linkedAt', 'blank'],
      ['linkedByActorRef', 'too_long'],
    ],
  );
});
