import assert from 'node:assert/strict';
import test from 'node:test';

import { openBrowserUrl } from '../src/shared/catsRuntimeLink.ts';

test('openBrowserUrl opens the provided URL in a new browser context', () => {
  const opened: Array<[string | undefined, string | undefined, string | undefined]> = [];

  openBrowserUrl(
    'http://127.0.0.1:3110/',
    ((url?: string, target?: string, features?: string) => {
      opened.push([url, target, features]);
      return null;
    }) as Window['open'],
  );

  assert.deepEqual(opened, [
    ['http://127.0.0.1:3110/', '_blank', 'noopener,noreferrer'],
  ]);
});
