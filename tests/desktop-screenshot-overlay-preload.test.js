import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('desktop screenshot overlay preload stays sandbox-compatible', async () => {
  const source = await readFile(
    join(process.cwd(), 'desktop', 'host', 'screenshotOverlayPreload.cts'),
    'utf8',
  );
  const built = await readFile(
    join(process.cwd(), 'build', 'desktop', 'screenshotOverlayPreload.cjs'),
    'utf8',
  );

  assert.doesNotMatch(source, /from\s+['"]\.\//u);
  assert.doesNotMatch(built, /require\(['"]\.\//u);
  assert.match(built, /cats-host:screenshot-overlay:complete-selection/u);
  assert.match(built, /cats-host:screenshot-overlay:cancel/u);
});
