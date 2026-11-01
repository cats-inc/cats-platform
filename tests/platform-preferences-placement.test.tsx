import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePlatformPreferencesUpdate } from '../src/app/server/platformSetupRouteSupport.ts';
import {
  buildAssistantResponseLanguageInstruction,
  parseAssistantResponseLanguage,
  parseAssistantResponseLanguagePreference,
  resolveAssistantResponseLanguage,
} from '../src/shared/assistantResponseLanguage.ts';
import {
  normalizePlatformLobbyAnimationMode,
  readPlatformPreferences,
  writePlatformPreferences,
  type PlatformPreferences,
} from '../src/shared/platformPreferences.ts';
import type { PlatformPreferencesUpdateBody } from '../src/app/server/platformSetupRouteSupport.ts';

function baselinePreferences(): PlatformPreferences {
  return {
    lastProductSurface: null,
    startAtLogin: true,
    openWindowOnStartup: false,
    systemTrayEnabled: true,
    lobbyAnimationMode: 'reduced',
    assistantResponseLanguage: 'unspecified',
    uiLanguagePreference: 'auto',
    codePreviewServersEnabled: false,
    claudeInChromeEnabled: false,
    desktopControlEnabled: false,
    desktopControlConversations: [],
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

test('parsePlatformPreferencesUpdate accepts a valid UI language preference', () => {
  const result = parsePlatformPreferencesUpdate(
    { uiLanguagePreference: 'zh-TW' },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.uiLanguagePreference, 'zh-TW');
  }
});

test('parsePlatformPreferencesUpdate accepts a valid assistant response language', () => {
  const result = parsePlatformPreferencesUpdate(
    { assistantResponseLanguage: 'ja' },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.assistantResponseLanguage, 'ja');
  }
});

test('parsePlatformPreferencesUpdate accepts following the display language', () => {
  const result = parsePlatformPreferencesUpdate(
    { assistantResponseLanguage: 'display' },
    baselinePreferences(),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.assistantResponseLanguage, 'display');
  }
});

test('parsePlatformPreferencesUpdate rejects an unknown assistant response language', () => {
  const result = parsePlatformPreferencesUpdate(
    { assistantResponseLanguage: 'debug' },
    baselinePreferences(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /assistantResponseLanguage/u);
  }
});

test('parsePlatformPreferencesUpdate rejects an unknown UI language preference', () => {
  const result = parsePlatformPreferencesUpdate(
    { uiLanguagePreference: 'debug' },
    baselinePreferences(),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /uiLanguagePreference/u);
  }
});

test('parsePlatformPreferencesUpdate preserves omitted fields', () => {
  const current: PlatformPreferences = {
    ...baselinePreferences(),
    lastProductSurface: 'code',
    lobbyAnimationMode: 'off',
    assistantResponseLanguage: 'ko',
    uiLanguagePreference: 'en',
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
    assert.equal(result.value.assistantResponseLanguage, 'ko');
    assert.equal(result.value.uiLanguagePreference, 'en');
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
    } as PlatformPreferencesUpdateBody & Record<string, unknown>,
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

test('normalizePlatformLobbyAnimationMode falls back when the value is invalid', () => {
  assert.equal(normalizePlatformLobbyAnimationMode('full'), 'full');
  assert.equal(normalizePlatformLobbyAnimationMode('max'), 'reduced');
  assert.equal(normalizePlatformLobbyAnimationMode('max', 'off'), 'off');
});

test('buildAssistantResponseLanguageInstruction emits prompt policy from stable codes', () => {
  assert.equal(buildAssistantResponseLanguageInstruction('unspecified'), null);
  assert.match(
    buildAssistantResponseLanguageInstruction('ja') ?? '',
    /Japanese/u,
  );
  assert.match(
    buildAssistantResponseLanguageInstruction('zh-TW') ?? '',
    /Traditional Chinese/u,
  );
  assert.match(
    buildAssistantResponseLanguageInstruction('zh-CN') ?? '',
    /Simplified Chinese/u,
  );
});

test('the display choice is a preference, never a language a chat carries', () => {
  assert.equal(parseAssistantResponseLanguagePreference('display'), 'display');
  assert.equal(parseAssistantResponseLanguagePreference('unspecified'), 'unspecified');
  assert.equal(parseAssistantResponseLanguagePreference('ja'), 'ja');
  assert.equal(parseAssistantResponseLanguagePreference('debug'), undefined);
  assert.equal(parseAssistantResponseLanguage('display'), undefined);
});

test('resolveAssistantResponseLanguage follows the resolved display language', () => {
  assert.equal(resolveAssistantResponseLanguage('display', 'zh-TW'), 'zh-TW');
  assert.equal(resolveAssistantResponseLanguage('display', 'en'), 'en');
  assert.equal(resolveAssistantResponseLanguage('ja', 'zh-TW'), 'ja');
  assert.equal(resolveAssistantResponseLanguage('unspecified', 'zh-TW'), 'unspecified');
  assert.equal(resolveAssistantResponseLanguage(undefined, 'zh-TW'), 'unspecified');
});

test('platform preferences keep the display choice across a reload', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-language-prefs-'));
  try {
    const chatStatePath = path.join(root, 'platform', 'state', 'chat-state.local.json');
    await writePlatformPreferences(chatStatePath, {
      ...baselinePreferences(),
      assistantResponseLanguage: 'display',
    });
    assert.equal(
      (await readPlatformPreferences(chatStatePath)).assistantResponseLanguage,
      'display',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
