import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { BlockersRail } from '../src/products/work/renderer/components/topdown/BlockersRail.tsx';
import {
  buildIndexes,
  walkUpstreamBlockers,
} from '../src/products/work/renderer/components/topdown/shared.ts';
import { SAMPLE_WORK_GRAPH as MOCK_WORK_GRAPH } from './fixtures/sampleWorkGraph.ts';

const indexes = buildIndexes(MOCK_WORK_GRAPH);

test('walkUpstreamBlockers returns the immediate blocker for a target endpoint', () => {
  // task-hero-copy blocks task-deploy → upstream of task-deploy is task-hero-copy.
  const chain = walkUpstreamBlockers(
    { recordFamily: 'task', recordId: 'task-deploy' },
    MOCK_WORK_GRAPH.links,
    indexes.objectsByCoreRef,
    3,
  );
  const titles = chain.map((s) => s.title);
  assert.ok(titles.includes('Hero copy v3'));
});

test('walkUpstreamBlockers caps at the requested depth', () => {
  // Cycle: wi-bottleneck blocks wi-orphan AND wi-orphan blocks wi-bottleneck.
  // From wi-bottleneck, depth 1 reaches wi-orphan; depth 2 wraps back —
  // the visited set prevents revisits, so only wi-orphan appears.
  const chain = walkUpstreamBlockers(
    { recordFamily: 'work_item', recordId: 'wi-bottleneck' },
    MOCK_WORK_GRAPH.links,
    indexes.objectsByCoreRef,
    1,
  );
  assert.equal(chain.length, 1);
});

test('walkUpstreamBlockers does NOT walk other link kinds', () => {
  // task-read-transcripts is duplicate_of task-write-spec; that should
  // NOT contribute to a blockers chain.
  const chain = walkUpstreamBlockers(
    { recordFamily: 'task', recordId: 'task-write-spec' },
    MOCK_WORK_GRAPH.links,
    indexes.objectsByCoreRef,
    3,
  );
  const titles = chain.map((s) => s.title);
  assert.ok(!titles.includes('Read transcripts to find bottleneck'));
});

test('BlockersRail renders a section per row that has upstream blockers', () => {
  const objects = MOCK_WORK_GRAPH.objects.filter(
    (o) => o.kind === 'task' && (o.id === 'task-deploy' || o.id === 'task-hero-copy'),
  );
  const markup = renderToStaticMarkup(
    <BlockersRail
      rows={objects}
      links={MOCK_WORK_GRAPH.links}
      indexes={indexes}
      selectedId={null}
      onSelect={() => undefined}
    />,
  );
  // task-deploy has an upstream blocker (task-hero-copy);
  // task-hero-copy has none, so only one section appears.
  assert.match(markup, /Deploy landing page to staging/u);
  assert.match(markup, /Hero copy v3/u);
  // Both row title and blocker title share "Hero copy v3" — at minimum
  // confirm the rail is non-empty.
  assert.doesNotMatch(markup, /Nothing in this list has upstream blockers/u);
});

test('BlockersRail renders the empty state when no row has upstream blockers', () => {
  const objects = MOCK_WORK_GRAPH.objects.filter(
    (o) => o.kind === 'task' && o.id === 'task-hero-copy',
  );
  const markup = renderToStaticMarkup(
    <BlockersRail
      rows={objects}
      links={MOCK_WORK_GRAPH.links}
      indexes={indexes}
      selectedId={null}
      onSelect={() => undefined}
    />,
  );
  assert.match(markup, /Nothing in this list has upstream blockers/u);
});

test('BlockersRail skips rows that are not project / work_item / task', () => {
  // Synthesize a non-PWT row inline (the fixture is PWT-only since the
  // server projection only emits non-PWT rows when the underlying Core
  // populates them). The rail must filter it out and render the empty
  // state.
  const fakeConversation = {
    id: 'conv-fake',
    kind: 'conversation' as const,
    structuralLayer: 'interaction' as const,
    sourceRecordFamily: 'conversation' as const,
    sourceRecordId: 'conv-fake',
    title: 'Fake conversation row',
    status: 'active',
    summary: null,
    attention: 'none' as const,
    ownerRole: null,
    nextAction: null,
    linkedConversationId: null,
    linkedProjectId: null,
    linkedWorkItemId: null,
    linkedTaskId: null,
    linkedRunId: null,
    updatedAt: '2026-04-25T03:55:00Z',
  };
  const markup = renderToStaticMarkup(
    <BlockersRail
      rows={[fakeConversation]}
      links={MOCK_WORK_GRAPH.links}
      indexes={indexes}
      selectedId={null}
      onSelect={() => undefined}
    />,
  );
  assert.match(markup, /Nothing in this list has upstream blockers/u);
  assert.doesNotMatch(markup, /Fake conversation row/u);
});
