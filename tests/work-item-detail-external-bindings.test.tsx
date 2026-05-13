import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import {
  WorkItemExternalBindingsSection,
} from '../src/products/work/renderer/components/work-items/WorkItemExternalBindingsSection.tsx';
import type { WorkGraphExternalBindingSummary } from '../src/products/work/shared/workGraphTypes.ts';

const githubBinding: WorkGraphExternalBindingSummary = {
  provider: 'github',
  externalType: 'issue',
  externalId: '123',
  externalUrl: 'https://github.com/cats-inc/cats-platform/issues/123',
  syncDirection: 'pull',
  lastSyncedAt: null,
  externalUpdatedAt: '2026-05-13T10:00:00.000Z',
  linkedAt: '2026-05-13T09:55:00.000Z',
  linkedByActorRef: 'cat:boss',
};

test('Work Item detail renders safe external tracker bindings', () => {
  const html = renderToStaticMarkup(
    <WorkItemExternalBindingsSection bindings={[
      githubBinding,
      {
        ...githubBinding,
        provider: 'redmine',
        externalType: 'ticket',
        externalId: 'RM-42',
        externalUrl: 'javascript:alert(1)',
      },
    ]}
    />,
  );

  assert.match(html, /External/u);
  assert.match(html, /GitHub #123/u);
  assert.match(html, /Redmine ticket RM-42/u);
  assert.match(
    html,
    /href="https:\/\/github\.com\/cats-inc\/cats-platform\/issues\/123"/u,
  );
  assert.doesNotMatch(html, /href="javascript:alert\(1\)"/u);
  assert.match(html, /sync: pull/u);
});

test('Work Item detail omits empty external tracker bindings section', () => {
  const html = renderToStaticMarkup(
    <WorkItemExternalBindingsSection bindings={[]} />,
  );

  assert.equal(html, '');
});
