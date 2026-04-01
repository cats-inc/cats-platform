import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('renderer selected-channel client coalesces concurrent requests for the same channel', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/chat/renderer/api/appShell.ts'),
    'utf8',
  );

  assert.match(source, /const pendingSelectedChannelUpdates = new Map<string, Promise<AppShellPayload>>\(\);/u);
  assert.match(source, /const existing = pendingSelectedChannelUpdates\.get\(selectedChannelId\);/u);
  assert.match(source, /return raceWithAbort\(existing, signal\);/u);
  assert.match(source, /pendingSelectedChannelUpdates\.set\(selectedChannelId, request\);/u);
  assert.match(source, /pendingSelectedChannelUpdates\.delete\(selectedChannelId\);/u);
});
