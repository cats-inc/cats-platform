import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { LinkageSection } from '../src/products/work/renderer/components/topdown/LinkageSection.tsx';
import { MOCK_WORK_GRAPH } from '../src/products/work/renderer/components/topdown/mock.ts';
import { buildIndexes } from '../src/products/work/renderer/components/topdown/shared.ts';

function renderForRef(recordFamily: 'project' | 'work_item' | 'task', recordId: string): string {
  const indexes = buildIndexes(MOCK_WORK_GRAPH);
  return renderToStaticMarkup(
    <StaticRouter location={`/work/${recordFamily}s/${recordId}`}>
      <LinkageSection
        selfRef={{ recordFamily, recordId }}
        graph={MOCK_WORK_GRAPH}
        indexes={indexes}
      />
    </StaticRouter>,
  );
}

test('LinkageSection renders Blocked by group on the target of a blocks row (derived view)', () => {
  // task-deploy is the target of `task-hero-copy blocks task-deploy`,
  // so the projection emits a `blocked_by` view on task-deploy.
  const markup = renderForRef('task', 'task-deploy');
  assert.match(markup, /<h3[^>]*>Blocked by<\/h3>/u);
  assert.match(markup, /Hero copy v3/u);
});

test('LinkageSection renders Blocking group on the source of a blocks row', () => {
  // task-hero-copy is the source of `task-hero-copy blocks task-deploy`.
  const markup = renderForRef('task', 'task-hero-copy');
  assert.match(markup, /<h3[^>]*>Blocking<\/h3>/u);
  assert.match(markup, /Deploy landing page to staging/u);
});

test('LinkageSection renders Related on both endpoints of a related_to row', () => {
  const sourceMarkup = renderForRef('project', 'proj-bf');
  const targetMarkup = renderForRef('project', 'proj-cs');
  assert.match(sourceMarkup, /<h3[^>]*>Related<\/h3>/u);
  assert.match(targetMarkup, /<h3[^>]*>Related<\/h3>/u);
  assert.match(sourceMarkup, /CS queue investigation/u);
  assert.match(targetMarkup, /Black Friday landing page/u);
});

test('LinkageSection renders Duplicate of on the source side only', () => {
  // task-read-transcripts is duplicate_of task-write-spec at v1.
  const sourceMarkup = renderForRef('task', 'task-read-transcripts');
  const targetMarkup = renderForRef('task', 'task-write-spec');
  assert.match(sourceMarkup, /<h3[^>]*>Duplicate of<\/h3>/u);
  assert.doesNotMatch(targetMarkup, /<h3[^>]*>Duplicate of<\/h3>/u);
});

test('LinkageSection renders Follows on the source side only', () => {
  // proj-rd-hire follows proj-bf at v1.
  const sourceMarkup = renderForRef('project', 'proj-rd-hire');
  assert.match(sourceMarkup, /<h3[^>]*>Follows<\/h3>/u);
});

test('LinkageSection renders the empty-state copy when the self endpoint has no views', () => {
  const markup = renderForRef('project', 'nonexistent-project');
  assert.match(markup, /No links yet/u);
});

test('LinkageSection link target points at the resolved object detail page route', () => {
  const markup = renderForRef('task', 'task-deploy');
  // The blocked_by view's other endpoint is task-hero-copy →
  // /work/tasks/task-hero-copy
  assert.match(markup, /href="\/work\/tasks\/task-hero-copy"/u);
});

test('LinkageSection does NOT render orphan link rows in the per-endpoint section', () => {
  // wi-landing has an orphan blocks → task-deleted-fixture row. The
  // projection excludes orphans from linksByEndpoint, so the Linkage
  // section MUST not surface "task-deleted-fixture" anywhere.
  const markup = renderForRef('work_item', 'wi-landing');
  assert.doesNotMatch(markup, /task-deleted-fixture/u);
});
