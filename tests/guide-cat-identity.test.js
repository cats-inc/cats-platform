import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GUIDE_CAT_SYSTEM_NAME,
  isGuideCatEnabledStatus,
  resolveGuideCatSystemName,
} from '../build/server/shared/guideCatIdentity.js';

test('resolveGuideCatSystemName defaults to the shipped English name', () => {
  assert.equal(resolveGuideCatSystemName(undefined), GUIDE_CAT_SYSTEM_NAME);
  assert.equal(resolveGuideCatSystemName('en-US,en;q=0.8'), GUIDE_CAT_SYSTEM_NAME);
});

test('resolveGuideCatSystemName keeps the shipped English name until locale-specific copies ship', () => {
  assert.equal(resolveGuideCatSystemName('zh-TW,zh;q=0.9,en;q=0.8'), GUIDE_CAT_SYSTEM_NAME);
  assert.equal(resolveGuideCatSystemName('zh-CN,zh;q=0.9,en;q=0.8'), GUIDE_CAT_SYSTEM_NAME);
});

test('isGuideCatEnabledStatus only treats active-or-empty statuses as enabled', () => {
  assert.equal(isGuideCatEnabledStatus(undefined), true);
  assert.equal(isGuideCatEnabledStatus('active'), true);
  assert.equal(isGuideCatEnabledStatus('dismissed'), false);
  assert.equal(isGuideCatEnabledStatus('disabled'), false);
});
