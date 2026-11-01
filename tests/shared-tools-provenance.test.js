import test from 'node:test';
import { syncSharedTools } from '../scripts/sync-shared-tools.mjs';
test('vendored repository tools and their producer license match all pinned hashes/modes without siblings', async () => {
  await syncSharedTools({ root: process.cwd() });
});
