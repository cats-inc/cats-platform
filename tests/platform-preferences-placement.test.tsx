import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePlatformPreferencesUpdate } from '../src/app/server/platformSetupRouteSupport.ts';
import type { PlatformPreferences } from '../src/shared/platformPreferences.ts';

function baselinePreferences(): PlatformPreferences {
  return {
    lastProductSurface: null,
    startAtLogin: true,
    openWindowOnStartup: false,
    systemTrayEnabled: true,
    lobbyAnimationMode: 'reduced',
  };
}

test('parsePlatformPreferencesUpdate accepts a valid lastProductSurface update', () => {
  const result = parsePlatformPreferencesUpdate(
    { lastProductSurface: 'work' },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.lastProductSurface, 'work');
  }
});

test('parsePlatformPreferencesUpdate rejects an unknown product surface', () => {
  const result = parsePlatformPreferencesUpdate(
    { lastProductSurface: 'invalid' },
    baselinePreferences(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /Invalid product surface/u);
  }
});

test('parsePlatformPreferencesUpdate accepts a valid lobby animation mode', () => {
  const result = parsePlatformPreferencesUpdate(
    { lobbyAnimationMode: 'full' },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.lobbyAnimationMode, 'full');
  }
});

test('parsePlatformPreferencesUpdate rejects an unknown lobby animation mode', () => {
  const result = parsePlatformPreferencesUpdate(
    { lobbyAnimationMode: 'max' },
    baselinePreferences(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /lobbyAnimationMode/u);
  }
});

test('parsePlatformPreferencesUpdate preserves omitted fields', () => {
  const current: PlatformPreferences = {
    ...baselinePreferences(),
    lastProductSurface: 'code',
    lobbyAnimationMode: 'off',
  };
  const result = parsePlatformPreferencesUpdate(
    { startAtLogin: false },
    current,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.startAtLogin, false);
    assert.equal(result.value.lastProductSurface, 'code');
    assert.equal(result.value.lobbyAnimationMode, 'off');
  }
});

test('parsePlatformPreferencesUpdate ignores legacy guide-cat keys without touching valid fields', () => {
  const current: PlatformPreferences = {
    ...baselinePreferences(),
    lastProductSurface: 'chat',
    lobbyAnimationMode: 'off',
  };
  const result = parsePlatformPreferencesUpdate(
    {
      startAtLogin: false,
      guideCatSidecarMode: 'bubble',
      guideCatPlacement: 'docked',
      guideCatFloatingAnchor: { x: 0.4, y: 0.6 },
      guideCatSidecarSeen: true,
    } as PlatformPreferences & Record<string, unknown>,
    current,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.startAtLogin, false);
    assert.equal(result.value.lastProductSurface, 'chat');
    assert.equal(result.value.lobbyAnimationMode, 'off');
    assert.equal('guideCatSidecarMode' in result.value, false);
    assert.equal('guideCatPlacement' in result.value, false);
    assert.equal('guideCatFloatingAnchor' in result.value, false);
    assert.equal('guideCatSidecarSeen' in result.value, false);
  }
});
