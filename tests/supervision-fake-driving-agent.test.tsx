import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  createInMemoryToolEvidenceSink,
  createInMemoryWorkSupervisedTools,
  createSupervisionPolicySnapshotRef,
  createSupervisedToolRegistry,
  createToolBoundary,
  type SupervisionPolicySnapshot,
} from '../src/platform/supervision/index.ts';
import {
  createScriptedFakeDrivingAgent,
  runFakeDrivingAgentHarness,
  type FakeAgentInput,
  type SemanticPlan,
  type UnknownToolExecutor,
} from './fakeDrivingAgentHarness.ts';

function createHarness() {
  const registry = createSupervisedToolRegistry();
  const evidenceSink = createInMemoryToolEvidenceSink();
  const tools = createInMemoryWorkSupervisedTools({
    context: {
      goal: 'Ship fake agent harness',
    },
  });
  tools.register(registry);
  const boundary = createToolBoundary({
    registry,
    evidenceSink,
    now: () => '2026-04-25T07:00:00.000Z',
  });
  const executors: Record<string, UnknownToolExecutor> = {
    'work.context.lookup': tools.executors['work.context.lookup'] as UnknownToolExecutor,
    'work.local_note.apply': tools.executors['work.local_note.apply'] as UnknownToolExecutor,
    'work.approval_gated.apply': tools.executors['work.approval_gated.apply'] as UnknownToolExecutor,
    'work.sop.classify_text_batch': tools.executors[
      'work.sop.classify_text_batch'
    ] as UnknownToolExecutor,
  };

  return { registry, evidenceSink, tools, boundary, executors };
}

function fakeAgentInput(): FakeAgentInput {
  return {
    runId: 'run-fake-1',
    workItemId: 'work-1',
    goal: 'Ship fake agent harness',
    availableTools: [],
    policySnapshot: fakePolicySnapshot(),
    contextRefs: ['goal'],
    budget: {
      maxDurationMs: 1000,
      hardStop: true,
    },
  };
}

function fakePolicySnapshot(): SupervisionPolicySnapshot {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    policyBundleVersion: 'test-policy@1',
    evaluatedAt: '2026-04-25T07:00:00.000Z',
    actionId: 'policy-action',
    runId: 'run-fake-1',
    actorRef: 'fake-agent',
    policy: {
      autonomy: 'outcome_delegation',
      taskGranularity: 'outcome',
      toolScope: 'broad_write',
      scaffolding: 'few_shot',
      validation: 'schema_required',
      checkpointCadence: 'milestone',
      approvalThreshold: 'high',
      fallbackPolicy: 'delegate_other',
    },
    contextSummary: {
      actorRef: 'fake-agent',
      targetRef: 'work-1',
      actionType: 'fake_run',
      sideEffect: 'none',
      bootstrapTreatment: 'default',
      capabilityConfidence: 'evaluated',
    },
    reasons: ['test fixture'],
  };
}

function plan(input: {
  planId: string;
  stepId: string;
  toolName: string;
  args: unknown;
  revisionOf?: string;
}): SemanticPlan {
  return {
    planId: input.planId,
    revisionOf: input.revisionOf,
    steps: [
      {
        stepId: input.stepId,
        target: {
          kind: 'worker_tool',
          toolName: input.toolName,
        },
        toolName: input.toolName,
        args: input.args,
      },
    ],
    stopCondition: 'after_steps',
  };
}

test('fake driving agent owns semantic plan selection and observed step order', async () => {
  const { boundary, executors, tools, evidenceSink } = createHarness();
  const input = fakeAgentInput();
  const initialPlan = plan({
    planId: 'agent-plan-note',
    stepId: 'agent-step-note',
    toolName: 'work.local_note.apply',
    args: {
      noteId: 'note-1',
      body: 'Chosen by fake agent',
    },
  });
  const agent = createScriptedFakeDrivingAgent({
    initialPlan,
    revisions: [],
  });

  const result = await runFakeDrivingAgentHarness({
    agent,
    input,
    boundary,
    executors,
    grantForStep: () => ({
      parentToolScope: 'narrow_write',
      policyToolScope: 'narrow_write',
    }),
  });

  assert.equal(result.finalState, 'completed');
  assert.deepEqual(result.traces[0]?.observedStepIds, ['agent-step-note']);
  assert.equal(result.traces[0]?.planId, 'agent-plan-note');
  assert.equal(tools.state.notes.get('note-1')?.body, 'Chosen by fake agent');
  assert.deepEqual(
    evidenceSink.read()[0]?.policySnapshotRef,
    createSupervisionPolicySnapshotRef(input.policySnapshot),
  );
});

test('rejection recovery plan comes from reviseAfterRejection', async () => {
  const { boundary, executors } = createHarness();
  const initialPlan = plan({
    planId: 'agent-plan-denied-write',
    stepId: 'agent-step-denied-write',
    toolName: 'work.local_note.apply',
    args: {
      noteId: 'note-denied',
      body: 'Should not land',
    },
  });
  const recoveryPlan = plan({
    planId: 'agent-plan-recovery-read',
    revisionOf: 'agent-plan-denied-write',
    stepId: 'agent-step-recovery-read',
    toolName: 'work.context.lookup',
    args: {
      key: 'goal',
    },
  });
  const agent = createScriptedFakeDrivingAgent({
    initialPlan,
    revisions: [recoveryPlan],
  });

  const result = await runFakeDrivingAgentHarness({
    agent,
    input: fakeAgentInput(),
    boundary,
    executors,
    grantForStep: (step) =>
      step.toolName === 'work.local_note.apply'
        ? { parentToolScope: 'read_only', policyToolScope: 'read_only' }
        : { parentToolScope: 'read_only', policyToolScope: 'read_only' },
  });

  assert.equal(result.finalState, 'completed');
  assert.equal(agent.revisionCalls[0]?.code, 'E_TOOL_SCOPE_DENIED');
  assert.deepEqual(result.traces.map((trace) => trace.planId), [
    'agent-plan-denied-write',
    'agent-plan-recovery-read',
  ]);
  assert.deepEqual(result.traces[1]?.observedStepIds, ['agent-step-recovery-read']);
});

test('fake harness caps rejection recovery depth', async () => {
  const { boundary, executors } = createHarness();
  const initialPlan = plan({
    planId: 'agent-plan-denied-1',
    stepId: 'agent-step-denied-1',
    toolName: 'work.local_note.apply',
    args: {
      noteId: 'note-denied-1',
      body: 'Denied 1',
    },
  });
  const revisionPlan = plan({
    planId: 'agent-plan-denied-2',
    revisionOf: 'agent-plan-denied-1',
    stepId: 'agent-step-denied-2',
    toolName: 'work.local_note.apply',
    args: {
      noteId: 'note-denied-2',
      body: 'Denied 2',
    },
  });
  const agent = createScriptedFakeDrivingAgent({
    initialPlan,
    revisions: [revisionPlan],
  });

  const result = await runFakeDrivingAgentHarness({
    agent,
    input: fakeAgentInput(),
    boundary,
    executors,
    maxRecoveryDepth: 1,
    grantForStep: () => ({
      parentToolScope: 'read_only',
      policyToolScope: 'read_only',
    }),
  });

  assert.equal(result.finalState, 'failed');
  assert.equal(result.recoveryCount, 1);
  assert.equal(result.failureReason, 'recovery depth cap exceeded: 1');
  assert.deepEqual(result.traces.map((trace) => trace.planId), [
    'agent-plan-denied-1',
    'agent-plan-denied-2',
  ]);
});

test('observed trace captures main FR-29 rejection codes', async () => {
  const cases = [
    {
      code: 'E_TOOL_SCOPE_DENIED',
      create: () => {
        const harness = createHarness();
        return {
          ...harness,
          semanticPlan: plan({
            planId: 'plan-scope-denied',
            stepId: 'step-scope-denied',
            toolName: 'work.local_note.apply',
            args: {
              noteId: 'scope-denied',
              body: 'Should not land',
            },
          }),
          grant: {
            parentToolScope: 'read_only' as const,
            policyToolScope: 'read_only' as const,
          },
        };
      },
    },
    {
      code: 'E_APPROVAL_DENIED',
      create: async () => {
        const harness = createHarness();
        await harness.boundary.invoke({
          toolName: 'work.approval_gated.apply',
          input: {
            requestId: 'approval-denied',
            value: 'denied-change',
          },
          actionId: 'seed-denied-approval',
          runId: 'run-fake-1',
          actorRef: 'agent:boss',
          grant: {
            parentToolScope: 'broad_write',
            policyToolScope: 'broad_write',
          },
          execute: harness.tools.executors['work.approval_gated.apply'],
        });
        harness.tools.deny('approval-denied');

        return {
          ...harness,
          semanticPlan: plan({
            planId: 'plan-approval-denied',
            stepId: 'step-approval-denied',
            toolName: 'work.approval_gated.apply',
            args: {
              requestId: 'approval-denied',
              value: 'denied-change',
            },
          }),
          grant: {
            parentToolScope: 'broad_write' as const,
            policyToolScope: 'broad_write' as const,
          },
        };
      },
    },
    {
      code: 'E_RUN_CANCELLED',
      create: () => {
        const harness = createHarness();
        harness.tools.cancelRun('run-fake-1');

        return {
          ...harness,
          semanticPlan: plan({
            planId: 'plan-run-cancelled',
            stepId: 'step-run-cancelled',
            toolName: 'work.approval_gated.apply',
            args: {
              value: 'cancelled-change',
            },
          }),
          grant: {
            parentToolScope: 'broad_write' as const,
            policyToolScope: 'broad_write' as const,
          },
        };
      },
    },
    {
      code: 'E_BUDGET_EXCEEDED',
      create: () => {
        const harness = createHarness();
        return {
          ...harness,
          executors: {
            ...harness.executors,
            'work.context.lookup': (() => ({
              status: 'rejected',
              error: {
                code: 'E_BUDGET_EXCEEDED',
                message: 'Budget exhausted before lookup.',
              },
            })) as UnknownToolExecutor,
          },
          semanticPlan: plan({
            planId: 'plan-budget-exceeded',
            stepId: 'step-budget-exceeded',
            toolName: 'work.context.lookup',
            args: {
              key: 'goal',
            },
          }),
          grant: {
            parentToolScope: 'read_only' as const,
            policyToolScope: 'read_only' as const,
          },
        };
      },
    },
    {
      code: 'E_SCHEMA_INVALID',
      create: () => {
        const harness = createHarness();
        return {
          ...harness,
          semanticPlan: plan({
            planId: 'plan-schema-invalid',
            stepId: 'step-schema-invalid',
            toolName: 'work.sop.classify_text_batch',
            args: {
              items: [{ id: '', text: 'bad' }],
              labels: [],
            },
          }),
          grant: {
            parentToolScope: 'read_only' as const,
            policyToolScope: 'read_only' as const,
          },
        };
      },
    },
  ];

  for (const testCase of cases) {
    const harness = await testCase.create();
    const agent = createScriptedFakeDrivingAgent({
      initialPlan: harness.semanticPlan,
      revisions: [],
    });
    const result = await runFakeDrivingAgentHarness({
      agent,
      input: fakeAgentInput(),
      boundary: harness.boundary,
      executors: harness.executors,
      maxRecoveryDepth: 0,
      grantForStep: () => harness.grant,
    });

    assert.equal(result.finalState, 'failed');
    assert.equal(result.traces[0]?.toolCalls[0]?.error?.code, testCase.code);
  }
});

test('fake Work run fixture combines lookup, weak worker, local mutation, and approval gate', async () => {
  const { boundary, executors, tools } = createHarness();
  const initialPlan: SemanticPlan = {
    planId: 'agent-plan-vertical',
    steps: [
      {
        stepId: 'step-lookup',
        target: { kind: 'worker_tool', toolName: 'work.context.lookup' },
        toolName: 'work.context.lookup',
        args: { key: 'goal' },
      },
      {
        stepId: 'step-classify',
        target: { kind: 'worker_tool', toolName: 'work.sop.classify_text_batch' },
        toolName: 'work.sop.classify_text_batch',
        args: {
          items: [{ id: 'goal', text: 'Engineering should ship the harness.' }],
          labels: ['engineering', 'legal'],
        },
      },
      {
        stepId: 'step-local-note',
        target: { kind: 'worker_tool', toolName: 'work.local_note.apply' },
        toolName: 'work.local_note.apply',
        args: {
          noteId: 'vertical-note',
          body: 'Local note from fake agent plan.',
        },
      },
      {
        stepId: 'step-approval',
        target: { kind: 'worker_tool', toolName: 'work.approval_gated.apply' },
        toolName: 'work.approval_gated.apply',
        args: {
          value: 'approval-gated vertical change',
        },
        expectation: 'pending_approval',
      },
    ],
    stopCondition: 'after_approval',
  };
  const agent = createScriptedFakeDrivingAgent({
    initialPlan,
    revisions: [],
  });

  const result = await runFakeDrivingAgentHarness({
    agent,
    input: fakeAgentInput(),
    boundary,
    executors,
    grantForStep: (step) =>
      step.toolName === 'work.local_note.apply'
        ? { parentToolScope: 'narrow_write', policyToolScope: 'narrow_write' }
        : step.toolName === 'work.approval_gated.apply'
          ? { parentToolScope: 'broad_write', policyToolScope: 'broad_write' }
          : { parentToolScope: 'read_only', policyToolScope: 'read_only' },
  });

  assert.equal(result.finalState, 'completed');
  assert.deepEqual(result.traces[0]?.observedStepIds, [
    'step-lookup',
    'step-classify',
    'step-local-note',
    'step-approval',
  ]);
  assert.deepEqual(result.traces[0]?.toolCalls.map((call) => call.status), [
    'applied',
    'applied',
    'applied',
    'pending_approval',
  ]);
  assert.equal(tools.state.notes.get('vertical-note')?.body, 'Local note from fake agent plan.');
  assert.deepEqual(tools.state.approvalMutations, []);
});
