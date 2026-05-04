import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { operatorActivityLabel } from '../src/design/operatorFormatting.ts';
import { ActivityFeed as LegacyChatActivityFeed } from '../src/products/chat/renderer/components/ActivityFeed.tsx';
import type { ChatOperatorActivityItem as LegacyChatOperatorActivityItem } from '../src/products/chat/shared/operator-loop/index.ts';
import { ActivityFeed as SharedActivityFeed } from '../src/products/shared/renderer/components/ActivityFeed.tsx';
import type { ChatOperatorActivityItem } from '../src/products/shared/operator-loop/index.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

const ACTIVITY_ITEMS: ChatOperatorActivityItem[] = [
  {
    id: 'checkpoint:1',
    label: 'Checkpoint',
    message: 'Checkpoint recorded.',
    createdAt: '2026-05-04T00:00:00.000Z',
    actorId: null,
    actorName: null,
    runId: 'run-1',
    taskId: 'task-1',
    severity: 'success',
    source: 'checkpoint',
  },
  {
    id: 'activity:replay',
    label: 'Replay',
    message: 'Replay started.',
    createdAt: '2026-05-04T00:01:00.000Z',
    actorId: 'actor-owner',
    actorName: 'Ken',
    runId: 'run-1',
    taskId: 'task-1',
    severity: 'progress',
    source: 'activity',
  },
  {
    id: 'trace:custom',
    label: 'External Event',
    message: 'Provider supplied activity.',
    createdAt: '2026-05-04T00:02:00.000Z',
    actorId: null,
    actorName: null,
    runId: 'run-1',
    taskId: 'task-1',
    severity: 'muted',
    source: 'trace',
  },
];

function renderSharedActivityFeed(items: ChatOperatorActivityItem[]): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh-TW" languagePreference="zh-TW">
      <SharedActivityFeed items={items} />
    </I18nProvider>,
  );
}

function renderLegacyChatActivityFeed(items: LegacyChatOperatorActivityItem[]): string {
  return renderToStaticMarkup(
    <I18nProvider locale="zh-TW" languagePreference="zh-TW">
      <LegacyChatActivityFeed items={items} />
    </I18nProvider>,
  );
}

test('operator activity labels localize deterministic Cats-owned labels', () => {
  const zh = createTranslator('zh-TW');

  assert.equal(operatorActivityLabel('Checkpoint', zh), '檢查點');
  assert.equal(operatorActivityLabel('Replay', zh), '重放');
  assert.equal(operatorActivityLabel('Artifact', zh), '成果物');
  assert.equal(operatorActivityLabel('External Event', zh), 'External Event');
});

test('shared activity feed renders localized deterministic activity labels', () => {
  const markup = renderSharedActivityFeed(ACTIVITY_ITEMS);

  assert.match(markup, /<strong>檢查點<\/strong>/u);
  assert.match(markup, /<strong>重放<\/strong>/u);
  assert.doesNotMatch(markup, /<strong>Checkpoint<\/strong>/u);
  assert.doesNotMatch(markup, /<strong>Replay<\/strong>/u);
  assert.match(markup, /<strong>External Event<\/strong>/u);
});

test('legacy chat activity feed uses the same localized deterministic labels', () => {
  const markup = renderLegacyChatActivityFeed(
    ACTIVITY_ITEMS as LegacyChatOperatorActivityItem[],
  );

  assert.match(markup, /<strong>檢查點<\/strong>/u);
  assert.match(markup, /<strong>重放<\/strong>/u);
  assert.doesNotMatch(markup, /<strong>Checkpoint<\/strong>/u);
  assert.doesNotMatch(markup, /<strong>Replay<\/strong>/u);
});
