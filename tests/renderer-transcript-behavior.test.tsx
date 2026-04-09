import assert from 'node:assert/strict';
import test from 'node:test';

import { isScrollNearBottom } from '../src/core/scrolling.ts';
import { resolveComposerWorkspacePath } from '../src/core/workspacePaths.ts';
import { readProductChatViewSource } from './helpers/readProductChatViewSource.js';
import { readProductTranscriptAutoScrollSource } from './helpers/readProductTranscriptAutoScrollSource.js';

const PRODUCT_SURFACES = ['chat', 'work', 'code'];

test('resolveComposerWorkspacePath keeps assigned chat folders visible in the composer chip', () => {
  assert.equal(
    resolveComposerWorkspacePath(
      'C:\\Users\\kenne\\Source\\cats',
      'C:\\Users\\kenne\\.cats\\runtime\\sessions\\abc123',
    ),
    'C:\\Users\\kenne\\Source\\cats',
  );
  assert.equal(
    resolveComposerWorkspacePath(
      null,
      'C:\\Users\\kenne\\.cats\\runtime\\sessions\\abc123',
    ),
    'C:\\Users\\kenne\\.cats\\runtime\\sessions\\abc123',
  );
  assert.equal(
    resolveComposerWorkspacePath(
      null,
      'C:\\Users\\kenne\\Documents\\notes',
    ),
    'C:\\Users\\kenne\\Documents\\notes',
  );
});

test('isScrollNearBottom treats near-bottom positions as auto-follow eligible', () => {
  assert.equal(
    isScrollNearBottom({
      scrollTop: 880,
      clientHeight: 120,
      scrollHeight: 1040,
      threshold: 40,
    }),
    true,
  );
  assert.equal(
    isScrollNearBottom({
      scrollTop: 760,
      clientHeight: 120,
      scrollHeight: 1040,
      threshold: 40,
    }),
    false,
  );
});

for (const product of PRODUCT_SURFACES) {
  test(`${product} ChatView uses transcript auto-follow and keeps assigned workspace chips visible`, async () => {
    const source = await readProductChatViewSource(product);

    assert.match(source, /useTranscriptAutoScroll/u);
    assert.match(source, /resolveComposerWorkspacePath/u);
    assert.match(source, /ref=\{transcriptListRef\}/u);
    assert.match(source, /ref=\{composerCardRef\}/u);
    assert.match(source, /(?:ref|bottomSentinelRef)=\{bottomSentinelRef\}/u);
    assert.match(source, /if \(!composerWorkspacePath\) return null;/u);
    assert.match(source, /liveIndicator\.previewText \?\? ''/u);
    assert.doesNotMatch(source, /const cwd = selectedChannel\.repoPath \?\? selectedChannel\.chatCwd;\s*if \(!cwd\) return null;/u);
  });

  test(`${product} transcript auto-scroll hook follows the canvas only while near the bottom`, async () => {
    const source = await readProductTranscriptAutoScrollSource(product);

    assert.match(source, /addEventListener\('scroll'/u);
    assert.match(source, /ResizeObserver/u);
    assert.match(source, /composerCardRef: RefCallback<HTMLElement>/u);
    assert.match(source, /bottomSentinelRef: RefCallback<HTMLDivElement>/u);
    assert.match(source, /getComputedStyle\(composerCardElement\)\.bottom/u);
    assert.match(source, /NEAR_BOTTOM_PX \+ composerCardElement\.getBoundingClientRect\(\)\.height/u);
    assert.match(source, /style\.paddingBottom = nextBottomInset > 0/u);
    assert.match(source, /style\.marginTop = nextComposerFlowOffset > 0/u);
    assert.match(source, /bottomSentinelElement\.style\.height = `\$\{nextBottomSentinelHeight\}px`/u);
    assert.match(source, /observer\.observe\(composerCardElement\)/u);
    assert.match(source, /shouldAutoScrollRef/u);
    assert.match(source, /isScrollNearBottom/u);
    assert.match(source, /scrollIntoView\(\{ block: 'end' \}\)/u);
    assert.match(source, /pendingScrollFrameRef/u);
  });
}
