import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { BrokenLinksPage } from '../src/products/work/renderer/components/topdown/BrokenLinksPage.tsx';
import {
  WORK_GRAPH_QUERY_KEY,
} from '../src/products/work/renderer/state/queries/workGraphQuery.ts';
import { sharedQueryClient } from '../src/products/shared/renderer/queryClient.ts';
import { SAMPLE_WORK_GRAPH } from './fixtures/sampleWorkGraph.ts';

function renderPage(): string {
  sharedQueryClient.removeQueries({ queryKey: WORK_GRAPH_QUERY_KEY });
  sharedQueryClient.setQueryData(WORK_GRAPH_QUERY_KEY, SAMPLE_WORK_GRAPH);
  return renderToStaticMarkup(
    <QueryClientProvider client={sharedQueryClient}>
      <StaticRouter location="/work/broken-links">
        <BrokenLinksPage />
      </StaticRouter>
    </QueryClientProvider>,
  );
}

test('BrokenLinksPage renders an orphan_link row with both endpoints and a deleted marker', () => {
  const markup = renderPage();
  assert.match(markup, /Orphan link/u);
  assert.match(markup, /Landing page rev 3/u);
  assert.match(markup, /task-deleted-fixture/u);
  assert.match(markup, /\(deleted\)/u);
});

test('BrokenLinksPage renders the orphan_link Remove affordance enabled for producer-stored links', () => {
  const markup = renderPage();
  assert.match(markup, /<button[^>]*type="button"[^>]*class="brokenLinks__removeLink"[^>]*title="Remove this link via the producer pipeline\."/u);
});

test('BrokenLinksPage renders a link_cycle row with cycle endpoints in traversal order', () => {
  const markup = renderPage();
  assert.match(markup, /Link cycle/u);
  assert.match(markup, /Identify CS response-time bottleneck/u);
  assert.match(markup, /\[orphan\] Forgotten retention email idea/u);
  assert.match(markup, /↺/u);
});

test('BrokenLinksPage exposes one Remove affordance per cycleLinkIds entry', () => {
  const markup = renderPage();
  assert.match(markup, /Remove this link\s*<code>link-cycle-a<\/code>/u);
  assert.match(markup, /Remove this link\s*<code>link-cycle-b<\/code>/u);
});

test('BrokenLinksPage does not surface orphan link rows under linksByEndpoint anywhere on the page', () => {
  const markup = renderPage();
  assert.doesNotMatch(markup, /selectedId=task-deleted-fixture/u);
});
