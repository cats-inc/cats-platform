import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { branchStatusLabel, runStatusLabel } from '../src/design/operatorFormatting.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

const RUNS = [
  {
    id: 'run-1',
    title: 'Workflow run',
    status: 'completed',
    startedAt: '2026-05-04T00:00:00.000Z',
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:01:00.000Z',
    summary: null,
  },
];

test('operator branch status labels localize workflow target statuses', () => {
  const zh = createTranslator('zh-TW');

  assert.equal(branchStatusLabel('pending', zh), '等待中');
  assert.equal(branchStatusLabel('running', zh), '執行中');
  assert.equal(branchStatusLabel('completed', zh), '已完成');
  assert.equal(branchStatusLabel('failed', zh), '失敗');
  assert.equal(branchStatusLabel('blocked', zh), '受阻');
  assert.equal(branchStatusLabel('cancelled', zh), '已取消');
  assert.equal(branchStatusLabel('waiting_for_converge', zh), '等待匯合');
});

test('run inspector renders localized tab and branch status metadata', async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { RunInspector } = await import('../src/design/components/operator/RunInspector.tsx');

  const markup = renderToStaticMarkup(
    <I18nProvider locale="zh-TW" languagePreference="zh-TW">
      <RunInspector
        runs={RUNS}
        actorNameById={{}}
        inspector={{
          run: RUNS[0],
          traces: [],
          checkpoints: [],
          branchStates: [
            {
              id: 'branch-1',
              participantName: 'Code Cat',
              status: 'waiting_for_converge',
              handoffReason: null,
              branchStrategy: null,
              parentCheckpointId: null,
              error: null,
            },
          ],
          outcomes: [],
          workflowStageId: null,
          workflowShape: null,
          reviewRequired: false,
          guardReason: null,
          cooldownLabel: null,
        }}
        onSelectRun={() => {}}
      />
    </I18nProvider>,
  );

  assert.match(markup, /<span>已完成<\/span>/u);
  assert.match(markup, /<span class="operatorMetaText">等待匯合<\/span>/u);
  assert.doesNotMatch(markup, /waiting_for_converge/u);
  assert.doesNotMatch(markup, /<span>Completed<\/span>/u);
});

test('operator status formatters retain English fallback labels', () => {
  assert.equal(runStatusLabel('completed'), 'Completed');
  assert.equal(branchStatusLabel('waiting_for_converge'), 'Waiting for converge');
});
