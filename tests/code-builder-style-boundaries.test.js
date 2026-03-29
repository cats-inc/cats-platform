import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('code builder styles extend operator chrome without redefining shared operator class names locally', async () => {
  const source = await readFile(
    new URL('../src/products/code/renderer/styles/code-builder.css', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /^\.operatorAction\b/mu);
  assert.doesNotMatch(source, /^\.operatorBadge\b/mu);
  assert.doesNotMatch(source, /^\.operatorCardMeta\b/mu);
  assert.doesNotMatch(source, /^\.operatorPanelFooter\b/mu);
  assert.match(source, /\.codeBuilderActionButtonDanger\b/u);
  assert.match(source, /\.codeBuilderStatusBadgePublished\b/u);
});
