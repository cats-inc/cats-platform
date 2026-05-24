import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopCliInventoryFromRuntime } from '../build/desktop/cliInventoryProbe.js';

test('buildDesktopCliInventoryFromRuntime returns unknown source when runtime probe is null', () => {
  const inventory = buildDesktopCliInventoryFromRuntime(null, 'win32');

  assert.equal(inventory.source, 'unknown');
  assert.equal(inventory.total, 0);
  assert.deepEqual(inventory.installed, []);
  assert.equal(inventory.scannedAt, null);
  assert.equal(inventory.candidates.length, 13);
  for (const candidate of inventory.candidates) {
    assert.equal(candidate.installed, false);
  }
});

test('buildDesktopCliInventoryFromRuntime returns unknown source when probe scan is null', () => {
  const inventory = buildDesktopCliInventoryFromRuntime({ scan: null }, 'win32');

  assert.equal(inventory.source, 'unknown');
  assert.equal(inventory.total, 0);
});

test('buildDesktopCliInventoryFromRuntime maps runtime providers to platform-specific helper ids', () => {
  const inventory = buildDesktopCliInventoryFromRuntime({
    scan: {
      scannedAt: '2026-04-30T10:00:00.000Z',
      providers: [
        { provider: 'claude', available: true },
        { provider: 'codex', available: true },
        { provider: 'antigravity', available: false },
        { provider: 'cursor', available: true },
        { provider: 'kiro', available: false },
      ],
    },
  }, 'win32');

  assert.equal(inventory.source, 'runtime');
  assert.equal(inventory.scannedAt, '2026-04-30T10:00:00.000Z');
  assert.equal(inventory.total, 3);
  assert.deepEqual(
    inventory.installed.sort(),
    [
      'windows-claude-native-installer',
      'windows-codex-native-installer',
      'windows-cursor-native-installer',
    ].sort(),
  );

  const claudeEntry = inventory.candidates.find((c) => c.providerId === 'claude_code');
  assert.ok(claudeEntry);
  assert.equal(claudeEntry?.installed, true);
  assert.equal(claudeEntry?.helperId, 'windows-claude-native-installer');

  const cursorEntry = inventory.candidates.find((c) => c.providerId === 'cursor_agent');
  assert.equal(cursorEntry?.installed, true);
  assert.equal(cursorEntry?.helperId, 'windows-cursor-native-installer');

  const antigravityEntry = inventory.candidates.find((c) => c.providerId === 'antigravity');
  assert.equal(antigravityEntry?.installed, false);
});

test('buildDesktopCliInventoryFromRuntime never marks ollama as installed (not in runtime KNOWN_PROVIDERS)', () => {
  const inventory = buildDesktopCliInventoryFromRuntime({
    scan: {
      scannedAt: '2026-04-30T10:00:00.000Z',
      providers: [
        { provider: 'claude', available: true },
        { provider: 'ollama', available: true },
      ],
    },
  }, 'win32');

  const ollamaEntry = inventory.candidates.find((c) => c.providerId === 'ollama');
  assert.ok(ollamaEntry);
  assert.equal(ollamaEntry?.installed, false);
});

test('buildDesktopCliInventoryFromRuntime emits linux helper ids on linux', () => {
  const inventory = buildDesktopCliInventoryFromRuntime({
    scan: {
      scannedAt: '2026-04-30T10:00:00.000Z',
      providers: [{ provider: 'claude', available: true }],
    },
  }, 'linux');

  assert.deepEqual(inventory.installed, ['linux-claude-native-installer']);
});

test('buildDesktopCliInventoryFromRuntime emits macos helper ids on darwin', () => {
  const inventory = buildDesktopCliInventoryFromRuntime({
    scan: {
      scannedAt: '2026-04-30T10:00:00.000Z',
      providers: [{ provider: 'codex', available: true }],
    },
  }, 'darwin');

  assert.deepEqual(inventory.installed, ['macos-codex-native-installer']);
});
