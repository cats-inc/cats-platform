import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { StaticRouter } from 'react-router-dom';

import { LinkageSection } from '../src/products/work/renderer/components/topdown/LinkageSection.tsx';
import { NewLinkDialog } from '../src/products/work/renderer/components/topdown/NewLinkDialog.tsx';
import { buildIndexes } from '../src/products/work/renderer/components/topdown/shared.ts';
import { SAMPLE_WORK_GRAPH as MOCK_WORK_GRAPH } from './fixtures/sampleWorkGraph.ts';

const indexes = buildIndexes(MOCK_WORK_GRAPH);

test('LinkageSection renders an Add link button alongside the count', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/work/projects/proj-bf">
      <LinkageSection
        selfRef={{ recordFamily: 'project', recordId: 'proj-bf' }}
        graph={MOCK_WORK_GRAPH}
        indexes={indexes}
      />
    </StaticRouter>,
  );
  assert.match(markup, /\+ Add link/u);
});

test('NewLinkDialog seeds the source line from selfRef and lists PWT candidates only', () => {
  const markup = renderToStaticMarkup(
    <NewLinkDialog
      selfRef={{ recordFamily: 'project', recordId: 'proj-bf' }}
      graph={MOCK_WORK_GRAPH}
      onClose={() => undefined}
    />,
  );
  assert.match(markup, /Project[^<]*<\/strong>\s*<code>proj-bf<\/code>/u);
  // Conversation / Run / Mission / Agent / Artifact rows should NOT
  // appear as candidates (the dialog filters to PWT only).
  assert.doesNotMatch(markup, /class="newLinkDialog__candidateTitle">[^<]*Marketing Agent/u);
  assert.doesNotMatch(markup, /class="newLinkDialog__candidateTitle">[^<]*Hero copy v3 generation/u);
  // PWT rows should appear (e.g. another project + work items + tasks).
  assert.match(markup, /class="newLinkDialog__candidateTitle">CS queue investigation</u);
});

test('NewLinkDialog excludes the source endpoint itself from the candidate list', () => {
  const markup = renderToStaticMarkup(
    <NewLinkDialog
      selfRef={{ recordFamily: 'project', recordId: 'proj-bf' }}
      graph={MOCK_WORK_GRAPH}
      onClose={() => undefined}
    />,
  );
  // The source itself ("Black Friday landing page" project) must not
  // appear as a self-link candidate.
  assert.doesNotMatch(
    markup,
    /class="newLinkDialog__candidate"[^>]*>\s*<span class="newLinkDialog__candidateKind">Project<\/span>\s*<span class="newLinkDialog__candidateTitle">Black Friday landing page</u,
  );
});

test('NewLinkDialog renders all five SPEC-090 v1 relation kinds in the relation picker', () => {
  const markup = renderToStaticMarkup(
    <NewLinkDialog
      selfRef={{ recordFamily: 'task', recordId: 'task-deploy' }}
      graph={MOCK_WORK_GRAPH}
      onClose={() => undefined}
    />,
  );
  for (const label of ['Blocking', 'Blocked by', 'Related', 'Duplicate of', 'Follows']) {
    assert.match(markup, new RegExp(`<option[^>]*>${label}</option>`, 'u'));
  }
});

test('NewLinkDialog renders the 280-char note count indicator', () => {
  const markup = renderToStaticMarkup(
    <NewLinkDialog
      selfRef={{ recordFamily: 'task', recordId: 'task-deploy' }}
      graph={MOCK_WORK_GRAPH}
      onClose={() => undefined}
    />,
  );
  assert.match(markup, /0\/280/u);
});
