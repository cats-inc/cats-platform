import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  isDesktopHostActionId,
  validateDesktopUrl,
} from '../dist-electron/security.js';

test('validateDesktopUrl only accepts http/https URLs from allow-listed hosts', () => {
  assert.equal(
    validateDesktopUrl('http://127.0.0.1:3110/diagnostics/health', {
      allowedHosts: ['127.0.0.1'],
    }),
    'http://127.0.0.1:3110/diagnostics/health',
  );

  assert.throws(() => validateDesktopUrl('file:///C:/Windows/system32/cmd.exe'), /Unsupported/);
  assert.throws(() => validateDesktopUrl('https://evil.example.com/test', {
    allowedHosts: ['updates.example.com'],
  }), /allow-listed/);
});

test('isDesktopHostActionId rejects unknown IPC action ids', () => {
  assert.equal(isDesktopHostActionId('retry'), true);
  assert.equal(isDesktopHostActionId('quit'), true);
  assert.equal(isDesktopHostActionId('delete_everything'), false);
  assert.equal(isDesktopHostActionId(42), false);
});

test('desktop main process keeps Electron sandboxing enabled and validates IPC actions', async () => {
  const source = await readFile(join(process.cwd(), 'electron', 'main.ts'), 'utf8');

  assert.match(source, /sandbox: true/);
  assert.match(source, /isDesktopHostActionId/);
  assert.match(source, /validateDesktopUrl/);
});
