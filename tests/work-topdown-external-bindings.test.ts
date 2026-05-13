import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWorkExternalBindingLabel,
  isSafeExternalBindingUrl,
} from '../src/products/work/renderer/components/topdown/shared.js';
import type { WorkGraphExternalBindingSummary } from '../src/products/work/shared/workGraphTypes.js';

const baseBinding: WorkGraphExternalBindingSummary = {
  provider: 'github',
  externalType: 'issue',
  externalId: '123',
  externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
  syncDirection: 'pull',
  lastSyncedAt: null,
  externalUpdatedAt: '2026-05-13T10:00:00.000Z',
  linkedAt: '2026-05-13T09:55:00.000Z',
  linkedByActorRef: 'cat:boss',
};

test('Work top-down external binding labels keep issue IDs compact', () => {
  assert.equal(formatWorkExternalBindingLabel(baseBinding), 'GitHub #123');
  assert.equal(formatWorkExternalBindingLabel({
    ...baseBinding,
    provider: 'redmine',
    externalType: 'project',
    externalId: 'cats-platform',
  }), 'Redmine project cats-platform');
});

test('Work top-down external binding URLs allow only http and https links', () => {
  assert.equal(isSafeExternalBindingUrl(baseBinding.externalUrl), true);
  assert.equal(isSafeExternalBindingUrl('http://redmine.example.test/issues/42'), true);
  assert.equal(isSafeExternalBindingUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalBindingUrl('file:///tmp/issue.txt'), false);
  assert.equal(isSafeExternalBindingUrl(null), false);
});
