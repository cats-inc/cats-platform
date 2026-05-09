import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { buildArtifactCanvasProjection } from '../src/products/shared/artifactCanvas/projection.ts';
import { DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG } from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import type { ArtifactCanvasNavigateIntent } from '../src/products/shared/artifactCanvas/contracts.ts';
import { ArtifactCanvasRenderIntentHub } from '../src/products/shared/artifactCanvas/renderIntent.ts';
import {
  CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
  materializeLivePreviewArtifactAndShowInCanvas,
  materializeLivePreviewArtifact,
} from '../src/products/code/livePreview/artifactMaterialization.ts';
import type { LivePreviewLease } from '../src/products/code/livePreview/contracts.ts';
import { InMemoryLivePreviewLeaseStore } from '../src/products/code/livePreview/leaseStore.ts';

test('live-preview materialization creates a ready preview artifact for Code tasks', () => {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-live',
    title: 'Live preview conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-live',
    title: 'Live preview task',
    status: 'in_progress',
    conversationId: 'conversation-live',
  }).core;

  const lease = createLease({
    previewId: 'preview-task',
    surface: { kind: 'code_task', surfaceId: 'task-live' },
  });
  const result = materializeLivePreviewArtifact(core, lease, {
    now: new Date('2026-05-09T00:00:02.000Z'),
  });

  assert.equal(result.status, 'materialized');
  if (result.status !== 'materialized') {
    return;
  }
  assert.equal(result.created, true);
  assert.equal(result.artifact.kind, 'preview');
  assert.equal(result.artifact.status, 'ready');
  assert.equal(result.artifact.taskId, 'task-live');
  assert.equal(result.artifact.conversationId, 'conversation-live');
  assert.equal(result.artifact.path, 'http://127.0.0.1:47100');
  assert.equal(result.lease.artifactId, result.artifact.id);

  const declaration = result.artifact.metadata.codeArtifactDeclaration as Record<string, unknown>;
  const livePreview = result.artifact.metadata.codeLivePreview as Record<string, unknown>;
  assert.equal(declaration.producerKind, 'tool');
  assert.equal(declaration.producerIdentity, CODE_LIVE_PREVIEW_PRODUCER_IDENTITY);
  assert.equal(livePreview.previewId, 'preview-task');
  assert.deepEqual(livePreview.sourceSurface, { kind: 'code_task', surfaceId: 'task-live' });

  const second = materializeLivePreviewArtifact(result.core, result.lease, {
    now: new Date('2026-05-09T00:00:03.000Z'),
  });
  assert.equal(second.status, 'materialized');
  if (second.status === 'materialized') {
    assert.equal(second.created, false);
    assert.equal(second.artifact.id, result.artifact.id);
  }
});

test('materialized live-preview artifacts close the Artifact Canvas lease gate', () => {
  const workspacePath = 'C:/repo/live-preview';
  const codespaceId = createCodespaceId(workspacePath);
  const lease = createLease({
    previewId: 'preview-codespace',
    surface: { kind: 'code_codespace', surfaceId: codespaceId },
    workspaceRef: {
      kind: 'code_workspace',
      id: 'workspace-live',
      rootPath: workspacePath,
    },
  });
  const result = materializeLivePreviewArtifact(createDefaultCoreState(), lease, {
    now: new Date('2026-05-09T00:00:02.000Z'),
  });
  assert.equal(result.status, 'materialized');
  if (result.status !== 'materialized') {
    return;
  }

  const store = new InMemoryLivePreviewLeaseStore();
  store.upsertLease(result.lease);
  const projection = buildArtifactCanvasProjection({
    core: result.core,
    surface: { kind: 'code_codespace', surfaceId: codespaceId },
    artifactId: result.artifact.id,
    policyConfig: {
      ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
      scriptedPreviewProducerAllowlist: [
        { producerKind: 'tool', producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY },
      ],
    },
    supervisorPreviewLeaseStore: store,
  });

  assert.equal(projection.status, 'ok');
  if (projection.status === 'ok') {
    assert.equal(projection.projection.presentationResolved, 'iframe');
    assert.equal(projection.projection.iframeSandboxProfile?.name, 'scripted-cross-origin');
  }
});

test('live-preview materialization skips non-ready leases and non-Code surfaces', () => {
  const notReady = materializeLivePreviewArtifact(
    createDefaultCoreState(),
    createLease({ status: 'starting' }),
  );
  assert.deepEqual(
    { status: notReady.status, reason: notReady.status === 'skipped' ? notReady.reason : null },
    { status: 'skipped', reason: 'lease_not_ready' },
  );

  const unsupported = materializeLivePreviewArtifact(
    createDefaultCoreState(),
    createLease({ surface: { kind: 'chat_conversation', surfaceId: 'chat-1' } }),
  );
  assert.deepEqual(
    { status: unsupported.status, reason: unsupported.status === 'skipped' ? unsupported.reason : null },
    { status: 'skipped', reason: 'unsupported_surface' },
  );
});

test('live-preview materialization rejects stale and non-loopback leases before writing artifacts', () => {
  const expired = materializeLivePreviewArtifact(
    createDefaultCoreState(),
    createLease({ expiresAt: '2000-01-01T00:00:00.000Z' }),
    { now: new Date('2026-05-09T00:00:02.000Z') },
  );
  assert.deepEqual(
    { status: expired.status, reason: expired.status === 'skipped' ? expired.reason : null },
    { status: 'skipped', reason: 'lease_expired' },
  );

  const nonLoopback = materializeLivePreviewArtifact(
    createDefaultCoreState(),
    createLease({ origin: 'http://192.168.1.10:47100' }),
  );
  assert.deepEqual(
    {
      status: nonLoopback.status,
      reason: nonLoopback.status === 'skipped' ? nonLoopback.reason : null,
    },
    { status: 'skipped', reason: 'lease_origin_not_loopback' },
  );

  const malformed = materializeLivePreviewArtifact(
    createDefaultCoreState(),
    createLease({ origin: 'http://127.0.0.1:47100/preview' }),
  );
  assert.deepEqual(
    { status: malformed.status, reason: malformed.status === 'skipped' ? malformed.reason : null },
    { status: 'skipped', reason: 'lease_origin_invalid' },
  );
});

test('live-preview materialization requires codespace leases to match workspace scope', () => {
  const result = materializeLivePreviewArtifact(
    createDefaultCoreState(),
    createLease({
      previewId: 'preview-codespace-mismatch',
      surface: { kind: 'code_codespace', surfaceId: 'codespace-other' },
      workspaceRef: {
        kind: 'code_workspace',
        id: 'workspace-live',
        rootPath: 'C:/repo/live-preview',
      },
    }),
  );
  assert.deepEqual(
    { status: result.status, reason: result.status === 'skipped' ? result.reason : null },
    { status: 'skipped', reason: 'workspace_anchor_unresolved' },
  );
});

test('live-preview materialization can trigger the shared Artifact Canvas show intent path', () => {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-live',
    title: 'Live preview conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-live',
    title: 'Live preview task',
    status: 'in_progress',
    conversationId: 'conversation-live',
  }).core;

  const hub = new ArtifactCanvasRenderIntentHub();
  const deliveries: ArtifactCanvasNavigateIntent[] = [];
  const unsubscribe = hub.subscribe({
    surface: { kind: 'code_task', surfaceId: 'task-live' },
    sessionId: 'session-owner',
    send: (intent) => deliveries.push(intent),
    now: new Date('2026-05-09T00:00:00.000Z'),
  });
  try {
    const result = materializeLivePreviewArtifactAndShowInCanvas(
      core,
      createLease({
        previewId: 'preview-show',
        surface: { kind: 'code_task', surfaceId: 'task-live' },
      }),
      {
        now: new Date('2026-05-09T00:00:02.000Z'),
        intentIdFactory: () => 'intent-live-preview',
        renderIntentHub: hub,
        targetSessionId: 'session-owner',
        policyConfig: {
          ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
          scriptedPreviewProducerAllowlist: [
            { producerKind: 'tool', producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY },
          ],
        },
      },
    );

    assert.equal(result.status, 'shown');
    if (result.status !== 'shown') {
      return;
    }
    assert.equal(result.delivery.delivered, true);
    assert.equal(result.activity.kind, 'artifact_canvas_show_intent');
    assert.equal(result.activity.artifactId, result.artifact.id);
    assert.equal(result.intent.intentId, 'intent-live-preview');
    assert.equal(result.intent.activityId, result.activity.id);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0]?.intentId, 'intent-live-preview');
    assert.match(
      result.intent.targetUrl,
      new RegExp(`/code/tasks/task-live/canvas/${result.artifact.id}`, 'u'),
    );
    assert.equal(result.core.activities.at(-1)?.id, result.activity.id);
    assert.equal(
      ((result.activity.metadata.artifactCanvas as Record<string, unknown>)
        .iframeSandboxProfile as { name?: string } | null)?.name,
      'scripted-cross-origin',
    );
  } finally {
    unsubscribe();
  }
});

test('live-preview canvas show uses canonical supervisor lease state before synthetic lease state', () => {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-live',
    title: 'Live preview conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-live',
    title: 'Live preview task',
    status: 'in_progress',
    conversationId: 'conversation-live',
  }).core;

  const fallbackStore = new InMemoryLivePreviewLeaseStore();
  fallbackStore.upsertLease(createLease({
    previewId: 'preview-show-static',
    status: 'stopped',
    artifactId: null,
    stoppedAt: '2026-05-09T00:00:02.000Z',
    stopReason: 'operator',
  }));
  const result = materializeLivePreviewArtifactAndShowInCanvas(
    core,
    createLease({
      previewId: 'preview-show-static',
      surface: { kind: 'code_task', surfaceId: 'task-live' },
    }),
    {
      now: new Date('2026-05-09T00:00:03.000Z'),
      policyConfig: {
        ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
        scriptedPreviewProducerAllowlist: [
          { producerKind: 'tool', producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY },
        ],
      },
      renderIntentHub: new ArtifactCanvasRenderIntentHub(),
      supervisorPreviewLeaseStore: fallbackStore,
    },
  );

  assert.equal(result.status, 'shown');
  if (result.status === 'shown') {
    assert.equal(
      ((result.activity.metadata.artifactCanvas as Record<string, unknown>)
        .iframeSandboxProfile as { name?: string } | null)?.name,
      'static',
    );
  }
});

test('live-preview canvas show leaves core and lease untouched when projection rejects', () => {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-live',
    title: 'Live preview conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: 'task-live',
    title: 'Live preview task',
    status: 'in_progress',
    conversationId: 'conversation-live',
  }).core;
  const lease = createLease({
    previewId: 'preview-rejected',
    surface: { kind: 'code_task', surfaceId: 'task-live' },
  });

  const result = materializeLivePreviewArtifactAndShowInCanvas(core, lease, {
    now: new Date('2026-05-09T00:00:03.000Z'),
    presentationRequested: 'pdf',
    renderIntentHub: new ArtifactCanvasRenderIntentHub(),
  });

  assert.equal(result.status, 'rejected');
  if (result.status === 'rejected') {
    assert.equal(result.lease.artifactId, null);
    assert.equal(result.core.artifacts.length, core.artifacts.length);
    assert.equal(result.core.activities.length, core.activities.length);
  }
});

function createLease(overrides: Partial<LivePreviewLease> = {}): LivePreviewLease {
  return {
    previewId: 'preview-live',
    commandProfileId: 'vite',
    surface: { kind: 'code_task', surfaceId: 'task-live' },
    workspaceRef: {
      kind: 'code_workspace',
      id: 'workspace-live',
      rootPath: 'C:/repo/live-preview',
    },
    origin: 'http://127.0.0.1:47100',
    host: '127.0.0.1',
    port: 47_100,
    processId: 12_345,
    status: 'ready',
    logPath: 'live-preview/preview-live.log',
    artifactId: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    readyAt: '2026-05-09T00:00:01.000Z',
    expiresAt: '2999-05-09T00:30:00.000Z',
    stoppedAt: null,
    stopReason: null,
    ...overrides,
  };
}

function createCodespaceId(workspacePath: string): string {
  const normalized = workspacePath.trim().replace(/\\/g, '/');
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return `codespace-${digest}`;
}
