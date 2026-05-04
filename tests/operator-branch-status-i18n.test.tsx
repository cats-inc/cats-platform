import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  branchStatusLabel,
  operatorBranchHandoffReasonLabel,
  operatorBranchStrategyLabel,
  operatorBudgetAlertLevelLabel,
  operatorCooldownLabel,
  operatorDeliveryGateLabel,
  operatorDeliveryModeLabel,
  operatorGuardReasonLabel,
  operatorWorkflowShapeLabel,
  operatorWorkflowStageLabel,
  runStatusLabel,
} from '../src/design/operatorFormatting.ts';
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

test('operator policy metadata labels localize known policy tokens', () => {
  const zh = createTranslator('zh-TW');

  assert.equal(operatorDeliveryModeLabel('commit_only', zh), '僅提交');
  assert.equal(
    operatorDeliveryGateLabel('owner_approval_required', zh),
    '需要擁有者核准',
  );
  assert.equal(
    operatorDeliveryGateLabel('publish_artifact_required', zh),
    '需要發布成果物',
  );
  assert.equal(operatorBudgetAlertLevelLabel('blocked', zh), '受阻');
  assert.equal(operatorWorkflowShapeLabel('converge', zh), '匯合');
  assert.equal(operatorWorkflowShapeLabel('parallel', zh), '並行');
  assert.equal(operatorWorkflowStageLabel('concurrent_fan_out', zh), '並行展開');
  assert.equal(operatorWorkflowStageLabel('continuation_handoff', zh), '續接交接');
  assert.equal(
    operatorBranchStrategyLabel('transplant_context', zh),
    '沿用上下文',
  );
  assert.equal(
    operatorBranchStrategyLabel('fresh_no_parent', zh),
    '新分支無父層',
  );
  assert.equal(operatorGuardReasonLabel('anti_ping_pong', zh), '防止來回轉派');
  assert.equal(operatorGuardReasonLabel('max_dispatches', zh), '達到最大派工次數');
  assert.equal(operatorCooldownLabel('Cooldown active', zh), '冷卻中');
  assert.equal(operatorCooldownLabel('Retry after owner review', zh), 'Retry after owner review');
  assert.equal(operatorBranchHandoffReasonLabel('explicit_mention', zh), '明確提及');
  assert.equal(
    operatorBranchHandoffReasonLabel('workflow_continuation', zh),
    '工作流程續接',
  );
});

test('progress summary renders localized policy metadata tokens', async () => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { ProgressSummaryPanel } = await import(
    '../src/design/components/operator/ProgressSummaryPanel.tsx'
  );

  const markup = renderToStaticMarkup(
    <I18nProvider locale="zh-TW" languagePreference="zh-TW">
      <ProgressSummaryPanel
        inspector={{
          run: RUNS[0],
          metrics: {
            dispatchCount: 1,
            continuationCount: 0,
            targetCount: 1,
          },
          workflowStageId: 'concurrent_fan_out',
          workflowShape: 'converge',
          reviewRequired: false,
        }}
        effectivePolicy={{
          deliveryMode: 'commit_only',
          deliveryGates: ['owner_approval_required', 'publish_artifact_required'],
          budgetAlertLevel: 'blocked',
        }}
        incidentActions={[]}
        pendingApprovalCount={0}
        guardReason="anti_ping_pong"
        cooldownLabel="Cooldown active"
        onInspectRun={() => {}}
        onOperatorAction={() => {}}
      />
    </I18nProvider>,
  );

  assert.match(markup, /交付：僅提交/u);
  assert.match(markup, /階段：並行展開/u);
  assert.match(markup, /形態：匯合/u);
  assert.match(markup, /門檻：需要擁有者核准, 需要發布成果物/u);
  assert.match(markup, /預算：受阻/u);
  assert.match(markup, /保護條件：防止來回轉派/u);
  assert.match(markup, /冷卻：冷卻中/u);
  assert.doesNotMatch(markup, /commit_only/u);
  assert.doesNotMatch(markup, /concurrent_fan_out/u);
  assert.doesNotMatch(markup, /converge/u);
  assert.doesNotMatch(markup, /anti_ping_pong/u);
  assert.doesNotMatch(markup, /Cooldown active/u);
  assert.doesNotMatch(markup, /owner_approval_required/u);
  assert.doesNotMatch(markup, /publish_artifact_required/u);
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
              handoffReason: 'explicit_mention',
              branchStrategy: 'transplant_context',
              parentCheckpointId: null,
              error: null,
            },
          ],
          outcomes: [],
          workflowStageId: 'continuation_handoff',
          workflowShape: 'converge',
          reviewRequired: false,
          guardReason: 'max_dispatches',
          cooldownLabel: 'Cooldown active',
        }}
        onSelectRun={() => {}}
      />
    </I18nProvider>,
  );

  assert.match(markup, /<span>已完成<\/span>/u);
  assert.match(markup, /階段：續接交接/u);
  assert.match(markup, /形態：匯合/u);
  assert.match(markup, /交接：明確提及/u);
  assert.match(markup, /策略：沿用上下文/u);
  assert.match(markup, /保護條件：達到最大派工次數/u);
  assert.match(markup, /冷卻：冷卻中/u);
  assert.match(markup, /<span class="operatorMetaText">等待匯合<\/span>/u);
  assert.doesNotMatch(markup, /waiting_for_converge/u);
  assert.doesNotMatch(markup, /explicit_mention/u);
  assert.doesNotMatch(markup, /continuation_handoff/u);
  assert.doesNotMatch(markup, /transplant_context/u);
  assert.doesNotMatch(markup, /converge/u);
  assert.doesNotMatch(markup, /max_dispatches/u);
  assert.doesNotMatch(markup, /Cooldown active/u);
  assert.doesNotMatch(markup, /<span>Completed<\/span>/u);
});

test('operator status formatters retain English fallback labels', () => {
  assert.equal(runStatusLabel('completed'), 'Completed');
  assert.equal(branchStatusLabel('waiting_for_converge'), 'Waiting for converge');
});
