import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createExternalDesktopOpenDeduper,
} from '../build/desktop/externalOpenGate.js';

test('desktop external open gate collapses duplicate URL opens in a short window', () => {
  const deduper = createExternalDesktopOpenDeduper(1_500);

  assert.equal(deduper.shouldOpen('http://127.0.0.1:3110/setup', 10_000), true);
  assert.equal(deduper.shouldOpen('http://127.0.0.1:3110/setup', 10_100), false);
  assert.equal(deduper.shouldOpen('http://127.0.0.1:3110/setup', 11_600), true);
});

test('desktop external open gate allows distinct URLs immediately', () => {
  const deduper = createExternalDesktopOpenDeduper(1_500);

  assert.equal(deduper.shouldOpen('http://127.0.0.1:3110/setup', 10_000), true);
  assert.equal(deduper.shouldOpen('http://127.0.0.1:3110/diagnostics/health', 10_100), true);
});
