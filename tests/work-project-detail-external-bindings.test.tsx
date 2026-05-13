import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import {
  ProjectExternalBindingsSection,
} from '../src/products/work/renderer/components/projects/ProjectExternalBindingsSection.tsx';
import type { WorkGraphExternalBindingSummary } from '../src/products/work/shared/workGraphTypes.ts';

const redmineBinding: WorkGraphExternalBindingSummary = {
  provider: 'redmine',
  externalType: 'project',
  externalId: 'cats-platform',
  externalUrl: 'https://redmine.example.test/projects/cats-platform',
  syncDirection: 'pull',
  lastSyncedAt: null,
  externalUpdatedAt: null,
  linkedAt: '2026-05-13T09:55:00.000Z',
  linkedByActorRef: 'cat:boss',
};

test('Project detail renders safe external tracker bindings', () => {
  const html = renderToStaticMarkup(
    <ProjectExternalBindingsSection bindings={[
      redmineBinding,
      {
        ...redmineBinding,
        provider: 'bugzilla',
        externalType: 'ticket',
        externalId: '77',
        externalUrl: 'file:///tmp/bug',
      },
    ]}
    />,
  );

  assert.match(html, /External/u);
  assert.match(html, /Redmine project cats-platform/u);
  assert.match(html, /Bugzilla ticket 77/u);
  assert.match(
    html,
    /href="https:\/\/redmine\.example\.test\/projects\/cats-platform"/u,
  );
  assert.doesNotMatch(html, /href="file:\/\/\/tmp\/bug"/u);
  assert.match(html, /sync: pull/u);
});

test('Project detail omits empty external tracker bindings section', () => {
  const html = renderToStaticMarkup(
    <ProjectExternalBindingsSection bindings={[]} />,
  );

  assert.equal(html, '');
});

test('Project detail can render empty external tracker binding actions', () => {
  const html = renderToStaticMarkup(
    <ProjectExternalBindingsSection
      bindings={[]}
      onAddClick={() => {
        // Static render only verifies the action is exposed.
      }}
    />,
  );

  assert.match(html, /Link tracker/u);
  assert.match(html, /No external tracker links yet\./u);
});

test('Project detail can render external tracker unlink actions', () => {
  const html = renderToStaticMarkup(
    <ProjectExternalBindingsSection
      bindings={[redmineBinding]}
      onRemoveBinding={() => {
        // Static render only verifies the action is exposed.
      }}
    />,
  );

  assert.match(html, /Unlink/u);
  assert.match(html, /aria-label="Unlink Redmine project cats-platform"/u);
});
