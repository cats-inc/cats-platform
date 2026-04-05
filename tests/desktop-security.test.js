import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  isDesktopHostActionId,
  validateDesktopUrl,
} from '../build/desktop/security.js';

function extractActionIds(source, constantName) {
  const anchor = source.indexOf(constantName);
  assert.notEqual(anchor, -1, `Could not find ${constantName}.`);

  const listStart = source.indexOf('[', anchor);
  const listEnd = source.indexOf(']', listStart);
  assert.notEqual(listStart, -1, `Could not find opening list for ${constantName}.`);
  assert.notEqual(listEnd, -1, `Could not find closing list for ${constantName}.`);

  return Array.from(
    source.slice(listStart, listEnd).matchAll(/'([^']+)'/g),
    (match) => match[1],
  );
}

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
  assert.match(source, /setWindowOpenHandler/);
  assert.match(source, /will-navigate/);
  assert.match(source, /openExternalDesktopUrl/);
});

test('preload and contracts keep the same desktop host action ids', async () => {
  const preloadSource = await readFile(join(process.cwd(), 'electron', 'preload.cts'), 'utf8');
  const contractsSource = await readFile(join(process.cwd(), 'electron', 'contracts.ts'), 'utf8');

  const preloadActions = extractActionIds(preloadSource, 'DESKTOP_HOST_ACTION_IDS');
  const contractActions = extractActionIds(contractsSource, 'DESKTOP_HOST_ACTION_IDS');

  assert.deepEqual(preloadActions, contractActions);
});

