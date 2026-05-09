import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { upsertCoreArtifact } from '../src/core/model/planningRecords.ts';
import { upsertCoreConversation } from '../src/core/model/structuralRecords.ts';
import { upsertCoreTask } from '../src/core/model/taskControls.ts';
import { buildArtifactCanvasProjection } from '../src/products/shared/artifactCanvas/projection.ts';
import type { ArtifactCanvasPolicyConfig } from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import { DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG } from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import type { LivePreviewLease } from '../src/products/code/livePreview/contracts.ts';
import { InMemoryLivePreviewLeaseStore } from '../src/products/code/livePreview/leaseStore.ts';

const SURFACE = { kind: 'code_task', surfaceId: 'task-live-preview' } as const;
const PREVIEW_ORIGIN = 'http://127.0.0.1:47100';
const PREVIEW_URL = `${PREVIEW_ORIGIN}/`;
const PRODUCER_IDENTITY = 'tool:cats_code_live_preview_supervisor';

test('Artifact Canvas grants scripted preview only to supervisor-owned live preview leases', () => {
  const core = createCoreWithLivePreviewArtifact();
  const policyConfig = createPolicyConfig();
  const leaseStore = new InMemoryLivePreviewLeaseStore();
  leaseStore.upsertLease(createLease());

  const withLease = buildArtifactCanvasProjection({
    core,
    surface: SURFACE,
    artifactId: 'artifact-live-preview',
    policyConfig,
    supervisorPreviewLeaseStore: leaseStore,
  });
  assert.equal(withLease.status, 'ok');
  if (withLease.status === 'ok') {
    assert.equal(withLease.projection.presentationResolved, 'iframe');
    assert.equal(withLease.projection.iframeSandboxProfile?.name, 'scripted-cross-origin');
  }

  const withoutLease = buildArtifactCanvasProjection({
    core,
    surface: SURFACE,
    artifactId: 'artifact-live-preview',
    policyConfig,
  });
  assert.equal(withoutLease.status, 'ok');
  if (withoutLease.status === 'ok') {
    assert.equal(withoutLease.projection.iframeSandboxProfile?.name, 'static');
  }

  const staleLeaseStore = new InMemoryLivePreviewLeaseStore();
  staleLeaseStore.upsertLease(createLease({ status: 'stopped' }));
  const staleLease = buildArtifactCanvasProjection({
    core,
    surface: SURFACE,
    artifactId: 'artifact-live-preview',
    policyConfig,
    supervisorPreviewLeaseStore: staleLeaseStore,
  });
  assert.equal(staleLease.status, 'ok');
  if (staleLease.status === 'ok') {
    assert.equal(staleLease.projection.iframeSandboxProfile?.name, 'static');
  }
});

test('Artifact Canvas demotes live preview leases with mismatched artifact or surface scope', () => {
  const core = createCoreWithLivePreviewArtifact();
  const policyConfig = createPolicyConfig();
  const mismatchedArtifactStore = new InMemoryLivePreviewLeaseStore();
  mismatchedArtifactStore.upsertLease(createLease({ artifactId: 'artifact-other' }));
  const mismatchedSurfaceStore = new InMemoryLivePreviewLeaseStore();
  mismatchedSurfaceStore.upsertLease(createLease({
    surface: { kind: 'code_task', surfaceId: 'task-other' },
  }));

  const artifactMismatch = buildArtifactCanvasProjection({
    core,
    surface: SURFACE,
    artifactId: 'artifact-live-preview',
    policyConfig,
    supervisorPreviewLeaseStore: mismatchedArtifactStore,
  });
  assert.equal(artifactMismatch.status, 'ok');
  if (artifactMismatch.status === 'ok') {
    assert.equal(artifactMismatch.projection.iframeSandboxProfile?.name, 'static');
  }

  const surfaceMismatch = buildArtifactCanvasProjection({
    core,
    surface: SURFACE,
    artifactId: 'artifact-live-preview',
    policyConfig,
    supervisorPreviewLeaseStore: mismatchedSurfaceStore,
  });
  assert.equal(surfaceMismatch.status, 'ok');
  if (surfaceMismatch.status === 'ok') {
    assert.equal(surfaceMismatch.projection.iframeSandboxProfile?.name, 'static');
  }
});

function createCoreWithLivePreviewArtifact() {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(core, {
    id: 'conversation-live-preview',
    title: 'Live preview conversation',
    kind: 'code_thread',
    status: 'active',
  }).core;
  core = upsertCoreTask(core, {
    id: SURFACE.surfaceId,
    title: 'Live preview task',
    status: 'in_progress',
    conversationId: 'conversation-live-preview',
  }).core;
  core = upsertCoreArtifact(core, {
    id: 'artifact-live-preview',
    title: 'Live Preview',
    kind: 'preview',
    status: 'ready',
    conversationId: 'conversation-live-preview',
    taskId: SURFACE.surfaceId,
    path: PREVIEW_URL,
    metadata: {
      codeArtifactDeclaration: {
        producerKind: 'tool',
        producerIdentity: PRODUCER_IDENTITY,
        location: { kind: 'url', value: PREVIEW_URL },
        idempotency: {
          producerKind: 'tool',
          producerIdentity: PRODUCER_IDENTITY,
        },
      },
      codeLivePreview: {
        schemaVersion: '1.0',
        previewId: 'preview-live',
        commandProfileId: 'vite',
        workspace: {
          id: 'workspace-live',
          rootPath: 'C:/repo/live-preview',
        },
        sourceSurface: SURFACE,
      },
    },
  }).core;
  return core;
}

function createPolicyConfig(): ArtifactCanvasPolicyConfig {
  return {
    ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    scriptedPreviewProducerAllowlist: [
      { producerKind: 'tool', producerIdentity: PRODUCER_IDENTITY },
    ],
  };
}

function createLease(overrides: Partial<LivePreviewLease> = {}): LivePreviewLease {
  return {
    previewId: 'preview-live',
    commandProfileId: 'vite',
    surface: SURFACE,
    workspaceRef: {
      kind: 'code_workspace',
      id: 'workspace-live',
      rootPath: 'C:/repo/live-preview',
    },
    origin: PREVIEW_ORIGIN,
    host: '127.0.0.1',
    port: 47_100,
    processId: 12_345,
    status: 'ready',
    logPath: 'live-preview/preview-live.log',
    artifactId: 'artifact-live-preview',
    createdAt: '2026-05-09T00:00:00.000Z',
    readyAt: '2026-05-09T00:00:01.000Z',
    expiresAt: '2026-05-09T00:30:00.000Z',
    stoppedAt: null,
    stopReason: null,
    ...overrides,
  };
}
