import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PRELOAD_BUNDLE = './build/desktop/preload.cjs';
const CONTRACTS_BUNDLE = './build/desktop/contracts.js';
const PRELOAD_SOURCE = './desktop/host/preload.cts';
const CONTRACTS_SOURCE = './desktop/host/contracts.ts';

const SANDBOX_SAFE_BUILTINS = new Set([
  'electron',
  'events',
  'timers',
  'url',
]);

test('preload bundle requires only sandbox-safe built-in modules', () => {
  const source = readFileSync(PRELOAD_BUNDLE, 'utf8');
  const requires = [...source.matchAll(/require\(["']([^"']+)["']\)/gu)].map((m) => m[1]);
  assert.ok(requires.length > 0, 'expected the preload bundle to require at least one module');
  for (const moduleId of requires) {
    if (SANDBOX_SAFE_BUILTINS.has(moduleId)) {
      continue;
    }
    assert.fail(
      `preload.cjs requires "${moduleId}", which is not on the Electron sandbox-safe allowlist `
        + `[${[...SANDBOX_SAFE_BUILTINS].join(', ')}]. Sandboxed preload scripts cannot require `
        + 'local modules without a bundler — inline the value into preload.cts or move it behind '
        + 'an IPC call. See https://www.electronjs.org/docs/latest/tutorial/sandbox.',
    );
  }
});

test('contracts module stays sandbox-safe — no node:* imports allowed', () => {
  const source = readFileSync(CONTRACTS_BUNDLE, 'utf8');
  const matches = [...source.matchAll(/from\s+["'](node:[^"']+)["']/gu)].map((m) => m[1]);
  assert.deepEqual(
    matches,
    [],
    'contracts.ts is a shared declarative module that may be re-imported by other '
      + 'sandbox-bound code in the future. Move any node:* I/O into a sibling module '
      + '(e.g. hostVersion.ts) that only main-process callers import.',
  );
});

test('voice capture channel names stay aligned between preload and contracts', () => {
  const preloadSource = readFileSync(PRELOAD_SOURCE, 'utf8');
  const contractsSource = readFileSync(CONTRACTS_SOURCE, 'utf8');

  const channelNames = [
    'DESKTOP_VOICE_CAPTURE_START_CHANNEL',
    'DESKTOP_VOICE_CAPTURE_STOP_CHANNEL',
    'DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL',
    'DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL',
  ];

  for (const name of channelNames) {
    const pattern = new RegExp(`${name}\\s*=\\s*['"]([^'"]+)['"]`, 'u');
    const preloadMatch = preloadSource.match(pattern);
    const contractsMatch = contractsSource.match(pattern);
    assert.ok(preloadMatch, `${name} must be defined as an inline literal in preload.cts`);
    assert.ok(contractsMatch, `${name} must be defined in contracts.ts as the canonical copy`);
    assert.equal(
      preloadMatch[1],
      contractsMatch[1],
      `${name} drifted between preload.cts (${preloadMatch[1]}) and contracts.ts (${contractsMatch[1]}). `
        + 'Update both copies together — preload cannot import contracts at runtime in sandbox mode.',
    );
  }
});
