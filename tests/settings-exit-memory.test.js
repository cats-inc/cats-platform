import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetSettingsExitMemoryForTests,
  getSettingsExitDelta,
  isSettingsPath,
  recordSettingsRouteTransition,
} from '../build/server/app/renderer/settings/settingsExitMemory.js';

test.beforeEach(() => {
  __resetSettingsExitMemoryForTests();
});

test('isSettingsPath recognises /settings root and subpaths', () => {
  assert.equal(isSettingsPath('/settings'), true);
  assert.equal(isSettingsPath('/settings/general'), true);
  assert.equal(isSettingsPath('/settings/cats'), true);
  assert.equal(isSettingsPath('/settingsbar'), false);
  assert.equal(isSettingsPath('/chat'), false);
  assert.equal(isSettingsPath('/'), false);
});

test('entering /settings from a non-settings surface remembers the return delta', () => {
  recordSettingsRouteTransition('/chat/foo', 0);
  recordSettingsRouteTransition('/settings/general', 1);
  assert.equal(getSettingsExitDelta(1), -1);
});

test('settings-tab navigations keep the original return target stable', () => {
  recordSettingsRouteTransition('/chat/foo', 5);
  recordSettingsRouteTransition('/settings/general', 6);
  recordSettingsRouteTransition('/settings/cats', 7);
  recordSettingsRouteTransition('/settings/runtime', 8);
  assert.equal(getSettingsExitDelta(8), -3);
});

test('browser back/forward inside settings does not drift the return target', () => {
  recordSettingsRouteTransition('/chat/foo', 5);
  recordSettingsRouteTransition('/settings/general', 6);
  recordSettingsRouteTransition('/settings/runtime', 7);
  // browser back to /settings/general (idx=6), still inside settings
  recordSettingsRouteTransition('/settings/general', 6);
  assert.equal(getSettingsExitDelta(6), -1);
  // forward again to /settings/runtime
  recordSettingsRouteTransition('/settings/runtime', 7);
  assert.equal(getSettingsExitDelta(7), -2);
});

test('leaving settings then re-entering captures the new origin', () => {
  recordSettingsRouteTransition('/chat/foo', 5);
  recordSettingsRouteTransition('/settings/general', 6);
  recordSettingsRouteTransition('/chat/foo', 5);
  recordSettingsRouteTransition('/settings/general', 6);
  assert.equal(getSettingsExitDelta(6), -1);
});

test('mounting fresh at a deep /settings url (hard reload) returns null so caller can fall back', () => {
  // Reviewer scenario: /chat(5) -> /settings/general(6) -> /settings/runtime(7),
  // then a hard reload lands us back at /settings/runtime with idx=7 but a
  // fresh module. idx-1 heuristic alone would wrongly point at /settings/
  // general (idx=6); the hasSeenNonSettings gate must return null instead.
  recordSettingsRouteTransition('/settings/runtime', 7);
  assert.equal(getSettingsExitDelta(7), null);
});

test('fresh mount at /settings with idx=0 (tray direct) returns null', () => {
  recordSettingsRouteTransition('/settings/general', 0);
  assert.equal(getSettingsExitDelta(0), null);
});

test('missing idx is handled defensively', () => {
  recordSettingsRouteTransition('/chat/foo', 0);
  recordSettingsRouteTransition('/settings/general', undefined);
  assert.equal(getSettingsExitDelta(undefined), null);
});
