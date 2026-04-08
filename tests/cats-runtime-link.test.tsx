import assert from 'node:assert/strict';
import test from 'node:test';

import {
  openCatsRuntimeRoot,
  resolveCatsRuntimeRootUrl,
} from '../src/shared/catsRuntimeLink.ts';

test('resolveCatsRuntimeRootUrl normalizes any runtime entrypoint to the runtime root', () => {
  assert.equal(
    resolveCatsRuntimeRootUrl('http://127.0.0.1:3110/setup'),
    'http://127.0.0.1:3110/',
  );
  assert.equal(
    resolveCatsRuntimeRootUrl('http://127.0.0.1:3110/dashboard?tab=providers#status'),
    'http://127.0.0.1:3110/',
  );
});

test('openCatsRuntimeRoot opens the runtime root in a new browser context', () => {
  const opened: Array<[string | undefined, string | undefined, string | undefined]> = [];

  openCatsRuntimeRoot(
    'http://127.0.0.1:3110/dashboard',
    ((url?: string, target?: string, features?: string) => {
      opened.push([url, target, features]);
      return null;
    }) as Window['open'],
  );

  assert.deepEqual(opened, [
    ['http://127.0.0.1:3110/', '_blank', 'noopener,noreferrer'],
  ]);
});
