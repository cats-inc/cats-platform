import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveLayoutMetrics } from '../src/design/chatLayout.ts';

test('resolveLayoutMetrics favors wider transcript and side secondary surface for wide multi-cat rooms', () => {
  const metrics = resolveLayoutMetrics('multi_cat', 1280);

  assert.equal(metrics.transcriptMaxWidth, '800px');
  assert.equal(metrics.secondarySurfacePosition, 'side');
  assert.equal(metrics.catStatusRowVisible, true);
  assert.equal(metrics.composerVariant, 'mention_enabled');
});

test('SidePanel exposes a shared bottom-position seam in design', () => {
  const source = readFileSync(
    new URL('../src/design/components/SidePanel.tsx', import.meta.url),
    'utf8',
  );
  const styles = readFileSync(
    new URL('../src/design/components/side-panel.css', import.meta.url),
    'utf8',
  );

  assert.match(source, /position\?: 'side' \| 'bottom'/u);
  assert.match(source, /position === 'bottom' \? 'sidePanelBottom'/u);
  assert.match(styles, /\.sidePanel\.sidePanelBottom/u);
});

test('ChatView consumes layout metrics for transcript sizing and secondary-surface position', () => {
  const chatSource = readFileSync(
    new URL('../src/products/chat/renderer/components/ChatView.tsx', import.meta.url),
    'utf8',
  );
  const workSource = readFileSync(
    new URL('../src/products/work/renderer/components/ChatView.tsx', import.meta.url),
    'utf8',
  );
  const codeSource = readFileSync(
    new URL('../src/products/code/renderer/components/ChatView.tsx', import.meta.url),
    'utf8',
  );

  for (const source of [chatSource, workSource, codeSource]) {
    assert.match(source, /design\/chatLayout/u);
    assert.match(source, /resolveLayoutMetrics\(layoutMode, viewportWidth\)/u);
    assert.match(source, /data-layout-mode=\{layoutMode\}/u);
    assert.match(source, /data-composer-variant=\{layoutMetrics\.composerVariant\}/u);
    assert.match(
      source,
      /position=\{layoutMetrics\.secondarySurfacePosition === 'bottom' \? 'bottom' : 'side'\}/u,
    );
    assert.match(source, /'--chat-transcript-max-width': layoutMetrics\.transcriptMaxWidth/u);
  }
});

test('legacy chat product-local layout normalization file has been removed', () => {
  assert.throws(
    () =>
      readFileSync(new URL('../src/products/chat/renderer/layoutNormalization.ts', import.meta.url)),
    /ENOENT/u,
  );
});
