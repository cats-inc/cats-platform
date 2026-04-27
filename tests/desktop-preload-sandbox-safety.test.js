import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PRELOAD_BUNDLE = './build/desktop/preload.cjs';
const CONTRACTS_BUNDLE = './build/desktop/contracts.js';

const SANDBOX_SAFE_BUILTINS = new Set([
  'electron',
  'events',
  'timers',
  'url',
]);

test('contracts module is sandbox-safe — must not import node:* builtins', () => {
  const source = readFileSync(CONTRACTS_BUNDLE, 'utf8');
  const matches = [...source.matchAll(/from\s+["'](node:[^"']+)["']/gu)].map((m) => m[1]);
  assert.deepEqual(
    matches,
    [],
    'contracts.ts is imported by the sandboxed Electron preload, so it must stay purely declarative. '
      + 'Move any node:* I/O to a sibling module that only the main process imports.',
  );
});

test('preload bundle only requires sandbox-safe modules', () => {
  const source = readFileSync(PRELOAD_BUNDLE, 'utf8');
  const requires = [...source.matchAll(/require\(["']([^"']+)["']\)/gu)].map((m) => m[1]);
  assert.ok(requires.length > 0, 'expected the preload bundle to require at least one module');
  for (const moduleId of requires) {
    if (SANDBOX_SAFE_BUILTINS.has(moduleId)) {
      continue;
    }
    if (moduleId.startsWith('./') || moduleId.startsWith('../')) {
      continue;
    }
    assert.fail(
      `preload bundle requires "${moduleId}", which is not on the sandbox-safe allowlist `
        + `[${[...SANDBOX_SAFE_BUILTINS].join(', ')}]. Inline the value or move it behind an IPC call.`,
    );
  }
});
