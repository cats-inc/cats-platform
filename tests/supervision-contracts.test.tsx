import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ADDRESSABLE_TARGET_KIND_VALUES,
  CAPABILITY_AGGREGATE_METHOD,
  CAPABILITY_SOURCE_VALUES,
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  SUPERVISED_TOOL_CANCELLATION_VALUES,
  TOOL_RESULT_STATUS_VALUES,
  createProviderCapabilityBootstrapDiagnosticSink,
  type AddressableTarget,
  type AsyncLifecycleRequestResult,
  type CancellationContext,
  type CapabilityAssessment,
  type RunRef,
  type SupervisedToolManifest,
  type SupervisionDiagnosticRecord,
  type SupervisionPolicySnapshot,
  type ToolResult,
} from '../src/platform/supervision/index.ts';
import {
  SUPERVISION_REJECTION_CODES,
  type SupervisionRejectionCode,
} from '../src/platform/supervision/errors.ts';

test('ToolResult is discriminated by status', () => {
  assert.deepEqual(TOOL_RESULT_STATUS_VALUES, [
    'applied',
    'pending_approval',
    'rejected',
  ]);

  const results: Array<ToolResult<{ ok: true }>> = [
    { status: 'applied', result: { ok: true } },
    { status: 'pending_approval', requestId: 'approval-1', summary: 'Needs approval' },
    {
      status: 'rejected',
      error: { code: 'E_TOOL_SCOPE_DENIED', message: 'Denied by policy' },
    },
  ];

  assert.deepEqual(
    results.map((result) => {
      switch (result.status) {
        case 'applied':
          return result.result.ok;
        case 'pending_approval':
          return result.requestId;
        case 'rejected':
          return result.error.code;
        default: {
          const exhaustive: never = result;
          return exhaustive;
        }
      }
    }),
    [true, 'approval-1', 'E_TOOL_SCOPE_DENIED'],
  );
});

test('async lifecycle requests return refs through normal ToolResult states', () => {
  const runRef: RunRef = {
    kind: 'run',
    runId: 'run-child-1',
    parentRunId: 'run-parent-1',
  };
  const results: AsyncLifecycleRequestResult[] = [
    { status: 'applied', result: runRef },
    { status: 'pending_approval', requestId: 'approval-run-1', summary: 'Spawn child run.' },
    {
      status: 'rejected',
      error: { code: 'E_TOOL_SCOPE_DENIED', message: 'Child run denied.' },
    },
  ];

  assert.deepEqual(results.map((result) => result.status), [
    'applied',
    'pending_approval',
    'rejected',
  ]);
  assert.deepEqual(results[0], {
    status: 'applied',
    result: {
      kind: 'run',
      runId: 'run-child-1',
      parentRunId: 'run-parent-1',
    },
  });
});

test('AddressableTarget excludes human operators from executable targets', () => {
  assert.deepEqual(ADDRESSABLE_TARGET_KIND_VALUES, [
    'durable_agent',
    'execution_target',
    'temporary_participant',
    'worker_tool',
  ]);
  assert.equal((ADDRESSABLE_TARGET_KIND_VALUES as readonly string[]).includes('human_operator'), false);

  const target: AddressableTarget = {
    kind: 'worker_tool',
    toolName: 'work.sop.classify_text_batch',
  };
  assert.equal(target.kind, 'worker_tool');
});

test('SupervisedToolManifest requires cancellation and schema version fields', () => {
  assert.deepEqual(SUPERVISED_TOOL_CANCELLATION_VALUES, [
    'cooperative',
    'best_effort',
    'not_supported',
  ]);

  const manifest: SupervisedToolManifest = {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: 'work.context.lookup',
    manifestVersion: '1.0',
    description: 'Read Work context',
    sideEffect: 'none',
    preflight: 'available',
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: 'never',
    evidence: 'summary',
    failureCodes: [],
    inputSchema: {
      id: 'work.context.lookup.input',
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: 'work.context.lookup.output',
      version: '1.0',
      format: 'json_schema',
    },
  };

  assert.equal(manifest.cancellation, 'cooperative');
  assert.deepEqual(manifest.schemaVersion, { major: 1, minor: 0 });
});

test('CancellationContext requires reasonCode and manifest-derived cancellation context', () => {
  const context: CancellationContext = {
    requestedAt: '2026-04-25T00:00:00.000Z',
    requestedBy: 'operator:owner',
    runStateAtRequest: 'running',
    toolCancellation: 'best_effort_requested',
    effectLanded: 'after_cancel_request',
    reasonCode: 'operator_decision',
  };

  assert.equal(context.reasonCode, 'operator_decision');
  assert.equal(context.toolCancellation, 'best_effort_requested');
});

test('policy snapshots carry bundle version and schema version', () => {
  const snapshot: SupervisionPolicySnapshot = {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    policyBundleVersion: 'supervision-policy@1',
    dialVersions: {
      toolScope: 'tool-scope@1',
    },
    evaluatedAt: '2026-04-25T00:00:00.000Z',
    actionId: 'action-1',
    runId: 'run-1',
    actorRef: 'agent:boss',
    policy: {
      autonomy: 'single_step',
      taskGranularity: 'step',
      toolScope: 'read_only',
      scaffolding: 'few_shot',
      validation: 'schema_required',
      checkpointCadence: 'every_step',
      approvalThreshold: 'medium',
      fallbackPolicy: 'retry',
    },
    contextSummary: {
      actorRef: 'agent:boss',
      targetRef: 'worker:context',
      actionType: 'lookup',
      sideEffect: 'none',
      bootstrapTreatment: 'default',
      capabilityConfidence: 'catalog_only',
    },
    reasons: ['catalog_only capability starts conservative'],
  };

  assert.equal(snapshot.policyBundleVersion, 'supervision-policy@1');
  assert.equal(snapshot.dialVersions?.toolScope, 'tool-scope@1');
  assert.deepEqual(snapshot.schemaVersion, { major: 1, minor: 0 });
});

test('capability assessments tie aggregate method to schema version', () => {
  const assessment: CapabilityAssessment = {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    assessedAt: '2026-04-25T00:00:00.000Z',
    bootstrapTreatment: 'default',
    confidenceLevel: 'catalog_only',
    confidenceSources: [
      {
        evidenceId: 'provider-catalog:demo:1',
        source: 'provider_catalog',
        observedAt: '2026-04-25T00:00:00.000Z',
        claims: {
          tool_use_accuracy: {
            level: 'catalog_only',
            summary: 'Provider catalog advertises tool support.',
          },
        },
        metadata: {
          catalogVersion: '1',
        },
      },
    ],
    aggregateMethod: CAPABILITY_AGGREGATE_METHOD,
    conflicts: [],
  };

  assert.equal(assessment.aggregateMethod, 'conservative_per_dimension');
  assert.deepEqual(assessment.schemaVersion, { major: 1, minor: 0 });
});

test('capability sources include bootstrap config as startup attestation', () => {
  assert.equal(CAPABILITY_SOURCE_VALUES.includes('bootstrap_config'), true);
});

test('supervision diagnostic records carry provider bootstrap diagnostics outside evidence', () => {
  const diagnostic: SupervisionDiagnosticRecord = {
    id: 'provider-capability-bootstrap:missing-config:config:2026-04-28',
    kind: 'provider_capability_bootstrap_config',
    severity: 'warning',
    code: 'missing_config',
    observedAt: '2026-04-28T00:00:00.000Z',
    configPath: 'config/provider-capability-bootstrap.yaml',
    message: 'No provider capability bootstrap config was found.',
  };

  assert.equal(diagnostic.kind, 'provider_capability_bootstrap_config');
  assert.equal(diagnostic.code, 'missing_config');
});

test('provider bootstrap diagnostic sink emits structured logs and persists records', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-supervision-diagnostics-'));
  const persistPath = path.join(tempDir, 'diagnostics.json');
  const logEvents: unknown[] = [];
  const diagnostic: SupervisionDiagnosticRecord = {
    id: 'provider-capability-bootstrap:matched-rule:rule-a:2026-04-28',
    kind: 'provider_capability_bootstrap_config',
    severity: 'info',
    code: 'matched_rule',
    observedAt: '2026-04-28T00:00:00.000Z',
    configPath: 'config/provider-capability-bootstrap.yaml',
    ruleIds: ['rule-a'],
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'sonnet',
      control: 'default',
    },
    message: 'Matched provider capability bootstrap rule rule-a as strong_agent.',
  };

  try {
    const sink = createProviderCapabilityBootstrapDiagnosticSink({
      persistPath,
      logEvent: (event) => logEvents.push(event),
    });
    sink.emit(diagnostic);

    const persisted = JSON.parse(await readFile(persistPath, 'utf8')) as {
      records: SupervisionDiagnosticRecord[];
    };
    assert.equal(logEvents.length, 1);
    assert.equal((logEvents[0] as { code?: string }).code, 'matched_rule');
    assert.deepEqual(sink.list(), [diagnostic]);
    assert.deepEqual(persisted.records, [diagnostic]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('stable supervision rejection codes include approval, cancellation, and scope failures', () => {
  const codes = new Set<SupervisionRejectionCode>(SUPERVISION_REJECTION_CODES);

  assert.equal(codes.has('E_APPROVAL_DENIED'), true);
  assert.equal(codes.has('E_RUN_CANCELLED'), true);
  assert.equal(codes.has('E_TOOL_SCOPE_DENIED'), true);
});
