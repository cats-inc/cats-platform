import assert from 'node:assert/strict';
import test from 'node:test';
import { readStylesheetSync } from './helpers/readStylesheet.js';

for (const product of ['chat', 'work', 'code']) {
  test(`${product} transcript mention pills inherit the surrounding font size`, () => {
    const stylesheet = readStylesheetSync(
      new URL(`../src/products/${product}/renderer/styles/chat-thread.css`, import.meta.url),
    );

    const mentionRule = stylesheet.match(/\.messageBodyMention\s*\{[^}]+\}/u)?.[0] ?? '';
    assert.match(mentionRule, /font-size:\s*inherit;/u);
    assert.match(mentionRule, /line-height:\s*inherit;/u);
    assert.doesNotMatch(mentionRule, /font-size:\s*0\.85em;/u);
  });
}
