import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { buildArtifactCanvasProjection } from '../src/products/shared/artifactCanvas/projection.ts';
import { DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG } from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import {
  CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
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
    expiresAt: '2026-05-09T00:30:00.000Z',
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
