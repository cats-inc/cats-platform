import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  createInMemoryToolEvidenceSink,
  createInMemoryWorkSupervisedTools,
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
  const { boundary, executors, tools } = createHarness();
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
    input: fakeAgentInput(),
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
