import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveLayoutMetrics } from '../src/design/chatLayout.ts';
import { resolveProjectPath } from './helpers/projectRoot.js';
import { readProductChatViewSource } from './helpers/readProductChatViewSource.js';

test('resolveLayoutMetrics keeps the unified 720px transcript width and surfaces the side secondary panel for wide participant chat rooms', () => {
  const metrics = resolveLayoutMetrics('participant_chat', 1280);

  // Owner directive (2026-05-01): unify transcript width to 720px across
  // every layout mode so the composer no longer jumps when the user
  // switches between default/direct/companion/participant_chat or sends the first
  // message in a draft.
  assert.equal(metrics.transcriptMaxWidth, '720px');
  assert.equal(metrics.secondarySurfacePosition, 'side');
  assert.equal(metrics.catStatusRowVisible, true);
  assert.equal(metrics.composerVariant, 'mention_enabled');
});

test('SidePanel exposes a shared bottom-position seam in design', () => {
  const source = readFileSync(
    resolveProjectPath(import.meta.url, 'src/design/components/SidePanel.tsx'),
    'utf8',
  );
  const styles = readFileSync(
    resolveProjectPath(import.meta.url, 'src/design/components/side-panel.css'),
    'utf8',
  );

  assert.match(source, /position\?: 'side' \| 'bottom'/u);
  assert.match(source, /position === 'bottom' \? 'sidePanelBottom'/u);
  assert.match(styles, /\.sidePanel\.sidePanelBottom/u);
});

test('ChatView consumes layout metrics for transcript sizing and secondary-surface position', async () => {
  const sources = await Promise.all([
    readProductChatViewSource('chat'),
    readProductChatViewSource('work'),
    readProductChatViewSource('code'),
  ]);

  for (const source of sources) {
    assert.match(source, /design\/chatLayout/u);
    assert.match(source, /resolveLayoutMetrics\(layoutMode, viewportWidth\)/u);
    assert.match(source, /data-layout-mode=\{layoutMode\}/u);
    assert.match(source, /data-composer-variant=\{composerVariant\}/u);
    assert.match(
      source,
      /(?:position=\{sidePanelPosition\}|sidePanelPosition=\{layoutMetrics\.secondarySurfacePosition === 'bottom' \? 'bottom' : 'side'\})/u,
    );
    assert.match(source, /'--chat-transcript-max-width': layoutMetrics\.transcriptMaxWidth/u);
  }
});

test('legacy chat product-local layout normalization file has been removed', () => {
  assert.throws(
    () =>
      readFileSync(resolveProjectPath(import.meta.url, 'src/products/chat/renderer/layoutNormalization.ts')),
    /ENOENT/u,
  );
});
