import assert from 'node:assert/strict';
import test from 'node:test';

import { readStylesheetSync } from './helpers/readStylesheet.js';

test('chat composer stack avatars preserve cat-driven fill colors', () => {
  const stylesheet = readStylesheetSync(
    new URL('../src/products/chat/renderer/styles/chat.css', import.meta.url),
  );

  const stackAvatarRule =
    stylesheet.match(/\.composerCatStack\s+\.composerStackAvatar\s*\{[^}]+\}/u)?.[0] ?? '';

  assert.match(stackAvatarRule, /border:\s*1px solid rgba\(0,\s*0,\s*0,\s*0\.15\);/u);
  assert.doesNotMatch(stackAvatarRule, /background\s*:/u);
  assert.doesNotMatch(stackAvatarRule, /color\s*:/u);
});
