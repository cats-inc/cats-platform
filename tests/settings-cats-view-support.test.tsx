import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTransportTimestamp,
  MEMORY_CATEGORIES,
  SKILL_PROFILES,
} from '../src/products/shared/renderer/components/settings-cats/viewSupport.ts';

test('settings-cats view support keeps the curated skill profile and memory category lists', () => {
  assert.deepEqual(SKILL_PROFILES, [
    { value: 'chat-default', label: 'Default' },
    { value: 'companion', label: 'Companion' },
  ]);
  assert.deepEqual(MEMORY_CATEGORIES, [
    'preference',
    'fact',
    'policy',
    'style',
    'relationship',
    'lesson',
  ]);
});

test('formatTransportTimestamp returns an em dash for empty values and delegates to Date localization otherwise', () => {
  assert.equal(formatTransportTimestamp(null), '—');
  assert.equal(formatTransportTimestamp(undefined), '—');

  const originalToLocaleString = Date.prototype.toLocaleString;
  try {
    Date.prototype.toLocaleString = function toLocaleString() {
      return `localized:${this.toISOString()}`;
    };

    assert.equal(
      formatTransportTimestamp('2026-04-20T12:34:56.000Z'),
      'localized:2026-04-20T12:34:56.000Z',
    );
  } finally {
    Date.prototype.toLocaleString = originalToLocaleString;
  }
});
