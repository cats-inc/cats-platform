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
    guideCatSidecarSeen: false,
    guideCatSidecarMode: 'auto',
    guideCatPlacement: 'floating',
    guideCatFloatingAnchor: null,
  };
}

test('parsePlatformPreferencesUpdate accepts a valid floating placement update', () => {
  const result = parsePlatformPreferencesUpdate(
    { guideCatPlacement: 'floating' },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.guideCatPlacement, 'floating');
  }
});

test('parsePlatformPreferencesUpdate accepts a valid docked placement update', () => {
  const result = parsePlatformPreferencesUpdate(
    { guideCatPlacement: 'docked' },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.guideCatPlacement, 'docked');
  }
});

test('parsePlatformPreferencesUpdate rejects an unknown placement value', () => {
  const result = parsePlatformPreferencesUpdate(
    { guideCatPlacement: 'hidden' },
    baselinePreferences(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /guideCatPlacement/u);
  }
});

test('parsePlatformPreferencesUpdate clamps floating anchor coordinates into [0,1]', () => {
  const result = parsePlatformPreferencesUpdate(
    { guideCatFloatingAnchor: { x: -0.5, y: 1.8 } },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.guideCatFloatingAnchor, { x: 0, y: 1 });
  }
});

test('parsePlatformPreferencesUpdate accepts a null floating anchor to reset to default', () => {
  const result = parsePlatformPreferencesUpdate(
    { guideCatFloatingAnchor: null },
    { ...baselinePreferences(), guideCatFloatingAnchor: { x: 0.5, y: 0.5 } },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.guideCatFloatingAnchor, null);
  }
});

test('parsePlatformPreferencesUpdate rejects floating anchor with non-number coordinates', () => {
  const result = parsePlatformPreferencesUpdate(
    { guideCatFloatingAnchor: { x: '0.5', y: 0.5 } as { x?: unknown; y?: unknown } },
    baselinePreferences(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /guideCatFloatingAnchor/u);
  }
});

test('parsePlatformPreferencesUpdate rejects floating anchor with NaN coordinates', () => {
  const result = parsePlatformPreferencesUpdate(
    { guideCatFloatingAnchor: { x: Number.NaN, y: 0.5 } },
    baselinePreferences(),
  );
  assert.equal(result.ok, false);
});

test('parsePlatformPreferencesUpdate preserves current placement/anchor when omitted from body', () => {
  const current: PlatformPreferences = {
    ...baselinePreferences(),
    guideCatPlacement: 'docked',
    guideCatFloatingAnchor: { x: 0.1, y: 0.2 },
  };
  const result = parsePlatformPreferencesUpdate(
    { guideCatSidecarSeen: true },
    current,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.guideCatPlacement, 'docked');
    assert.deepEqual(result.value.guideCatFloatingAnchor, { x: 0.1, y: 0.2 });
  }
});
