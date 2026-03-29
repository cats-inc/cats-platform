import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveLayoutMetrics } from '../src/products/chat/renderer/layoutNormalization.ts';

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
  const source = readFileSync(
    new URL('../src/products/chat/renderer/components/ChatView.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /resolveLayoutMetrics\(layoutMode, viewportWidth\)/u);
  assert.match(source, /data-layout-mode=\{layoutMode\}/u);
  assert.match(source, /data-composer-variant=\{layoutMetrics\.composerVariant\}/u);
  assert.match(
    source,
    /position=\{layoutMetrics\.secondarySurfacePosition === 'bottom' \? 'bottom' : 'side'\}/u,
  );
  assert.match(source, /'--chat-transcript-max-width': layoutMetrics\.transcriptMaxWidth/u);
});
