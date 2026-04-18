import assert from 'node:assert/strict';
import { mkdir, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePlatformPreferencesUpdate } from '../src/app/server/platformSetupRouteSupport.ts';
import {
  readLegacyGuideCatUiPrefs,
  resolvePlatformPreferencesPath,
  writePlatformPreferences,
  type PlatformPreferences,
} from '../src/shared/platformPreferences.ts';

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

test('parsePlatformPreferencesUpdate ignores deprecated guide cat ui fields from older clients', () => {
  const originalWrite = process.stderr.write.bind(process.stderr);
  let warning = '';
  process.stderr.write = ((chunk: string | Uint8Array) => {
    warning += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    return true;
  }) as typeof process.stderr.write;

  try {
    const result = parsePlatformPreferencesUpdate(
      {
        lastProductSurface: 'work',
        guideCatSidecarSeen: true,
        guideCatSidecarMode: 'bubble',
        guideCatPlacement: 'docked',
        guideCatFloatingAnchor: { x: 0.2, y: 0.8 },
      },
      baselinePreferences(),
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.lastProductSurface, 'work');
      assert.equal(result.value.startAtLogin, true);
      assert.equal(result.value.lobbyAnimationMode, 'reduced');
    }
    assert.match(warning, /Ignoring deprecated guide-cat UI preference fields/u);
  } finally {
    process.stderr.write = originalWrite;
  }
});

test('writePlatformPreferences preserves legacy guide cat fields for migration retries', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cats-platform-prefs-'));
  const chatStatePath = path.join(tempDir, 'platform', 'state', 'chat-state.local.json');
  const prefsPath = resolvePlatformPreferencesPath(chatStatePath);

  try {
    await mkdir(path.dirname(prefsPath), { recursive: true });
    await writeFile(
      prefsPath,
      JSON.stringify({
        lastProductSurface: 'chat',
        startAtLogin: true,
        openWindowOnStartup: false,
        systemTrayEnabled: true,
        lobbyAnimationMode: 'reduced',
        guideCatSidecarSeen: true,
        guideCatSidecarMode: 'bubble',
        guideCatPlacement: 'docked',
        guideCatFloatingAnchor: { x: 0.25, y: 0.75 },
      }, null, 2),
      'utf-8',
    );

    await writePlatformPreferences(chatStatePath, {
      lastProductSurface: 'work',
      startAtLogin: false,
      openWindowOnStartup: true,
      systemTrayEnabled: false,
      lobbyAnimationMode: 'full',
    });

    assert.deepEqual(await readLegacyGuideCatUiPrefs(chatStatePath), {
      sidecarSeen: true,
      sidecarMode: 'bubble',
      placement: 'docked',
      floatingAnchor: { x: 0.25, y: 0.75 },
    });

    const written = JSON.parse(await readFile(prefsPath, 'utf-8')) as Record<string, unknown>;
    assert.equal(written.lastProductSurface, 'work');
    assert.equal(written.startAtLogin, false);
    assert.equal(written.openWindowOnStartup, true);
    assert.equal(written.systemTrayEnabled, false);
    assert.equal(written.lobbyAnimationMode, 'full');
    assert.equal(written.guideCatSidecarSeen, true);
    assert.equal(written.guideCatSidecarMode, 'bubble');
    assert.equal(written.guideCatPlacement, 'docked');
    assert.deepEqual(written.guideCatFloatingAnchor, { x: 0.25, y: 0.75 });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
