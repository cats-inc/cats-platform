import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTINGS_PATH, isSettingsPath } from '../src/shared/settingsRoute.ts';

test('settings route helper recognizes only canonical settings paths', () => {
  assert.equal(SETTINGS_PATH, '/settings');
  assert.equal(isSettingsPath('/settings'), true);
  assert.equal(isSettingsPath('/settings/general'), true);
  assert.equal(isSettingsPath('/settings/cats/my-cats'), true);
  assert.equal(isSettingsPath('/settingsbar'), false);
  assert.equal(isSettingsPath('/chat'), false);
  assert.equal(isSettingsPath('/'), false);
});
