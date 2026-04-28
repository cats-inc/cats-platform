import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { BrokenLinksPage } from '../src/products/work/renderer/components/topdown/BrokenLinksPage.tsx';
import {
  __seedWorkGraphForTest,
  __resetWorkGraphStoreForTest,
} from '../src/products/work/renderer/state/workGraphStore.ts';
import { SAMPLE_WORK_GRAPH } from './fixtures/sampleWorkGraph.ts';

function renderPage(): string {
  __resetWorkGraphStoreForTest();
  __seedWorkGraphForTest(SAMPLE_WORK_GRAPH);
  return renderToStaticMarkup(
    <StaticRouter location="/work/broken-links">
      <BrokenLinksPage />
    </StaticRouter>,
  );
}

test('BrokenLinksPage renders an orphan_link row with both endpoints and a deleted marker', () => {
  const markup = renderPage();
  // The seeded orphan link points wi-landing → task-deleted-fixture.
  // The source endpoint resolves to "Landing page rev 3"; the target
  // endpoint shows the raw record id as code and a "(deleted)" marker.
  assert.match(markup, /orphan_link/u);
  assert.match(markup, /Landing page rev 3/u);
  assert.match(markup, /task-deleted-fixture/u);
  assert.match(markup, /\(deleted\)/u);
});

test('BrokenLinksPage renders the orphan_link Remove affordance enabled for producer-stored links', () => {
  const markup = renderPage();
  // Server projection now treats every link as producer-stored — there
  // is no renderer-side mock fallback — so Remove buttons enable.
  assert.match(markup, /<button[^>]*type="button"[^>]*class="brokenLinks__removeLink"[^>]*title="Remove this link via the producer pipeline\."/u);
});

test('BrokenLinksPage renders a link_cycle row with cycle endpoints in traversal order', () => {
  const markup = renderPage();
  // Seeded cycle: wi-bottleneck blocks wi-orphan AND wi-orphan blocks
  // wi-bottleneck. Both titles must appear in the cycle ordered list.
  assert.match(markup, /link_cycle/u);
  assert.match(markup, /Identify CS response-time bottleneck/u);
  assert.match(markup, /\[orphan\] Forgotten retention email idea/u);
  // The closing arrow is ↺ for the loop close.
  assert.match(markup, /↺/u);
});

test('BrokenLinksPage exposes one Remove affordance per cycleLinkIds entry', () => {
  const markup = renderPage();
  // Cycle has 2 link IDs (link-cycle-a / link-cycle-b). Two distinct
  // Remove buttons must render — one for each.
  assert.match(markup, /Remove\s*<code>link-cycle-a<\/code>/u);
  assert.match(markup, /Remove\s*<code>link-cycle-b<\/code>/u);
});

test('BrokenLinksPage does not surface orphan link rows under linksByEndpoint anywhere on the page', () => {
  const markup = renderPage();
  // The orphan_link diagnostic shows the deleted-fixture id as code.
  // Outside the diagnostic surface, the renderer must not render the
  // missing target as a real linked row title — but since it never had
  // a title, just confirm there is no spurious "Open in drawer" affordance
  // wired to that id.
  assert.doesNotMatch(markup, /selectedId=task-deleted-fixture/u);
});
