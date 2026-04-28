import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { BrokenLinksPage } from '../src/products/work/renderer/components/topdown/BrokenLinksPage.tsx';
import { MOCK_WORK_GRAPH } from '../src/products/work/renderer/components/topdown/mock.ts';

function renderPage(): string {
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

test('BrokenLinksPage renders the orphan_link Remove affordance disabled for demo-seed links', () => {
  const markup = renderPage();
  // The disabled remove button is the actionable affordance per
  // SPEC-090 §FR7. With Slice 5.5 it's enabled for producer-stored
  // links and disabled for renderer-only demo seeds.
  assert.match(markup, /<button[^>]*type="button"[^>]*class="brokenLinks__removeLink"[^>]*disabled/u);
  assert.match(markup, /Demo fixture — only producer-stored links can be removed via API/u);
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

test('BrokenLinksPage exposes one disabled Remove affordance per cycleLinkIds entry', () => {
  const markup = renderPage();
  // Cycle has 2 link IDs (link-cycle-a / link-cycle-b). Two distinct
  // disabled Remove buttons must render — one for each.
  assert.match(markup, /Remove\s*<code>link-cycle-a<\/code>/u);
  assert.match(markup, /Remove\s*<code>link-cycle-b<\/code>/u);
});

test('BrokenLinksPage continues to render existing SPEC-083 base diagnostics unchanged', () => {
  const markup = renderPage();
  // Base diagnostics use the existing kind label + objectId-based
  // "Open in drawer" affordance. Confirm they still appear.
  assert.match(markup, /missing_project_anchor/u);
  assert.match(markup, /unanchored_run/u);
  assert.match(markup, /Open in drawer/u);
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
