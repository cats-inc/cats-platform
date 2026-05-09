import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  buildArtifactCanvasPolicyVersion,
  canUseScriptedArtifactCanvasPreview,
  isSupervisorOwnedPreviewOrigin,
  matchesArtifactCanvasRuntimePreviewOrigin,
  normalizeArtifactCanvasHostname,
  rejectArtifactCanvasCredentialUrl,
  resolveArtifactCanvasIframePolicy,
  type ArtifactCanvasSupervisorPreviewLease,
  validateArtifactCanvasPolicyConfig,
  type ArtifactCanvasPolicyConfig,
} from '../src/products/shared/artifactCanvas/iframePolicy.ts';
import type { CoreArtifactRecord } from '../src/core/types.ts';

const EMPTY_CANONICAL_JSON =
  '{"algorithm":"artifact-canvas-policy-v1","catsShellOrigin":"http://127.0.0.1:5173","runtimePreviewOriginAllowlist":[],"scriptedPreviewProducerAllowlist":[]}';
const EMPTY_POLICY_VERSION = '9fd0daecceb94e0c';

const DEFAULT_CANONICAL_JSON =
  '{"algorithm":"artifact-canvas-policy-v1","catsShellOrigin":"http://127.0.0.1:5173","runtimePreviewOriginAllowlist":[{"hostname":"127.0.0.1","ports":"*","schemes":["http"]},{"hostname":"::1","ports":"*","schemes":["http"]},{"hostname":"localhost","ports":"*","schemes":["http"]}],"scriptedPreviewProducerAllowlist":[]}';
const DEFAULT_POLICY_VERSION = '924ecad525730480';

const PORT_REORDERED_CANONICAL_JSON =
  '{"algorithm":"artifact-canvas-policy-v1","catsShellOrigin":"http://127.0.0.1:5173","runtimePreviewOriginAllowlist":[{"hostname":"dev.local","ports":[4321,5173],"schemes":["http"]}],"scriptedPreviewProducerAllowlist":[]}';
const PORT_REORDERED_POLICY_VERSION = 'edb4acc5fe0498c7';

const PRODUCER_CANONICAL_JSON =
  '{"algorithm":"artifact-canvas-policy-v1","catsShellOrigin":"http://127.0.0.1:5173","runtimePreviewOriginAllowlist":[{"hostname":"127.0.0.1","ports":"*","schemes":["http"]},{"hostname":"::1","ports":"*","schemes":["http"]},{"hostname":"localhost","ports":"*","schemes":["http"]}],"scriptedPreviewProducerAllowlist":[{"producerIdentity":"tool:cats_runtime_preview_bridge","producerKind":"tool"}]}';
const PRODUCER_POLICY_VERSION = '99210a14a9fa3da3';

test('Artifact Canvas policyVersion canonicalizes empty allowlists', () => {
  assert.deepEqual(
    buildArtifactCanvasPolicyVersion({
      runtimePreviewOriginAllowlist: [],
      scriptedPreviewProducerAllowlist: [],
      catsShellOrigin: 'http://127.0.0.1:5173',
    }),
    {
      canonicalJson: EMPTY_CANONICAL_JSON,
      policyVersion: EMPTY_POLICY_VERSION,
    },
  );
});

test('Artifact Canvas policyVersion canonicalizes the default config', () => {
  assert.deepEqual(buildArtifactCanvasPolicyVersion(DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG), {
    canonicalJson: DEFAULT_CANONICAL_JSON,
    policyVersion: DEFAULT_POLICY_VERSION,
  });
});

test('Artifact Canvas policyVersion is stable across reordered allowlist entries', () => {
  const reordered = buildArtifactCanvasPolicyVersion({
    ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    runtimePreviewOriginAllowlist: [
      ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG.runtimePreviewOriginAllowlist,
    ].reverse(),
  });

  assert.deepEqual(reordered, {
    canonicalJson: DEFAULT_CANONICAL_JSON,
    policyVersion: DEFAULT_POLICY_VERSION,
  });
});

test('Artifact Canvas policyVersion sorts ports and detects producer allowlist changes', () => {
  const left = buildArtifactCanvasPolicyVersion({
    runtimePreviewOriginAllowlist: [
      { hostname: 'dev.local', schemes: ['http'], ports: [5173, 4321] },
    ],
    scriptedPreviewProducerAllowlist: [],
    catsShellOrigin: 'http://127.0.0.1:5173',
  });
  const right = buildArtifactCanvasPolicyVersion({
    runtimePreviewOriginAllowlist: [
      { hostname: 'dev.local', schemes: ['http'], ports: [4321, 5173] },
    ],
    scriptedPreviewProducerAllowlist: [],
    catsShellOrigin: 'http://127.0.0.1:5173',
  });
  const producer = buildArtifactCanvasPolicyVersion({
    ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    scriptedPreviewProducerAllowlist: [
      {
        producerKind: 'tool',
        producerIdentity: 'tool:cats_runtime_preview_bridge',
      },
    ],
  });

  assert.deepEqual(left, {
    canonicalJson: PORT_REORDERED_CANONICAL_JSON,
    policyVersion: PORT_REORDERED_POLICY_VERSION,
  });
  assert.deepEqual(right, left);
  assert.deepEqual(producer, {
    canonicalJson: PRODUCER_CANONICAL_JSON,
    policyVersion: PRODUCER_POLICY_VERSION,
  });
  assert.notEqual(producer.policyVersion, DEFAULT_POLICY_VERSION);
});

test('Artifact Canvas runtime preview origin allowlist matches loopback and IPv6 safely', () => {
  assert.equal(normalizeArtifactCanvasHostname('[::1]'), '::1');
  assert.equal(
    matchesArtifactCanvasRuntimePreviewOrigin('http://127.0.0.1:4321/preview'),
    true,
  );
  assert.equal(
    matchesArtifactCanvasRuntimePreviewOrigin('http://[::1]:5173/preview'),
    true,
  );
  assert.equal(
    matchesArtifactCanvasRuntimePreviewOrigin('https://example.com/preview'),
    false,
  );
  assert.equal(
    matchesArtifactCanvasRuntimePreviewOrigin('http://127.0.0.1:5173'),
    false,
    'Cats shell origin must demote even when it otherwise matches loopback.',
  );
});

test('Artifact Canvas policy validates ports, schemes, credentials, and producer allowlist', () => {
  assert.throws(
    () =>
      validateArtifactCanvasPolicyConfig({
        ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
        runtimePreviewOriginAllowlist: [{ hostname: '', schemes: ['http'], ports: '*' }],
      }),
    /hostname is required/u,
  );
  assert.throws(
    () =>
      validateArtifactCanvasPolicyConfig({
        ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
        runtimePreviewOriginAllowlist: [
          { hostname: 'localhost', schemes: ['ftp' as 'http'], ports: '*' },
        ],
      }),
    /Unsupported Artifact Canvas runtime preview scheme/u,
  );
  assert.throws(
    () =>
      validateArtifactCanvasPolicyConfig({
        ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
        runtimePreviewOriginAllowlist: [
          { hostname: 'localhost', schemes: ['http'], ports: [0] },
        ],
      }),
    /Invalid Artifact Canvas runtime preview port/u,
  );

  assert.equal(
    rejectArtifactCanvasCredentialUrl('https://user:pass@example.com/')?.code,
    'artifact_canvas_url_credentials_not_allowed',
  );
  assert.equal(
    canUseScriptedArtifactCanvasPreview({
      producer: { kind: 'agent', producerIdentity: 'actor:cat-1' },
    }),
    false,
  );

  const allowlisted: ArtifactCanvasPolicyConfig = {
    ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    scriptedPreviewProducerAllowlist: [
      { producerKind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' },
    ],
  };
  assert.equal(
    canUseScriptedArtifactCanvasPreview({
      producer: { kind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' },
      config: allowlisted,
    }),
    true,
  );
});

test('Artifact Canvas iframe policy rejects unsafe schemes and demotes default producers', () => {
  const rejected = resolveArtifactCanvasIframePolicy({
    url: 'javascript:alert(1)',
    artifactKind: 'preview',
    producer: { kind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' },
  });
  assert.equal(rejected.status, 'rejected');
  if (rejected.status === 'rejected') {
    assert.equal(rejected.error.code, 'artifact_canvas_iframe_scheme_rejected');
  }

  const demoted = resolveArtifactCanvasIframePolicy({
    url: 'http://127.0.0.1:4321/preview',
    artifactKind: 'preview',
    producer: { kind: 'agent', producerIdentity: 'actor:cat-1' },
  });
  assert.equal(demoted.status, 'accepted');
  if (demoted.status === 'accepted') {
    assert.equal(demoted.profile.name, 'static');
  }

  const allowlistedWithoutLease = resolveArtifactCanvasIframePolicy({
    url: 'http://127.0.0.1:4321/preview',
    artifactKind: 'preview',
    producer: { kind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' },
    config: {
      ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
      scriptedPreviewProducerAllowlist: [
        { producerKind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' },
      ],
    },
  });
  assert.equal(allowlistedWithoutLease.status, 'accepted');
  if (allowlistedWithoutLease.status === 'accepted') {
    assert.equal(allowlistedWithoutLease.profile.name, 'static');
  }

  const artifact = createLivePreviewArtifact();
  const leaseStore = createPreviewLeaseStore(createLivePreviewLease());
  assert.equal(
    isSupervisorOwnedPreviewOrigin({
      url: 'http://127.0.0.1:4321/preview',
      artifact,
      leaseStore,
      now: new Date('2026-05-09T00:01:00.000Z'),
    }),
    true,
  );
  assert.equal(
    isSupervisorOwnedPreviewOrigin({
      url: 'http://127.0.0.1:4321/preview',
      artifact,
      leaseStore: createPreviewLeaseStore(createLivePreviewLease({
        expiresAt: '2026-05-09T00:00:00.000Z',
      })),
      now: new Date('2026-05-09T00:01:00.000Z'),
    }),
    false,
    'expired ready leases must not authorize scripted iframe privileges.',
  );

  const scripted = resolveArtifactCanvasIframePolicy({
    url: 'http://127.0.0.1:4321/preview',
    artifact,
    producer: { kind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' },
    config: {
      ...DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
      scriptedPreviewProducerAllowlist: [
        { producerKind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' },
      ],
    },
    supervisorPreviewLeaseStore: leaseStore,
  });
  assert.equal(scripted.status, 'accepted');
  if (scripted.status === 'accepted') {
    assert.equal(scripted.profile.name, 'scripted-cross-origin');
  }
});

function createLivePreviewArtifact(): CoreArtifactRecord {
  return {
    id: 'artifact-live-preview',
    title: 'Live preview',
    kind: 'preview',
    status: 'ready',
    projectId: null,
    workItemId: null,
    conversationId: 'conversation-canvas',
    taskId: 'task-canvas',
    runId: null,
    path: 'http://127.0.0.1:4321/preview',
    mimeType: null,
    sizeBytes: null,
    summary: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    metadata: {
      codeArtifactDeclaration: {
        producerKind: 'tool',
        producerIdentity: 'tool:cats_runtime_preview_bridge',
        location: { kind: 'url', value: 'http://127.0.0.1:4321/preview' },
        idempotency: {
          producerKind: 'tool',
          producerIdentity: 'tool:cats_runtime_preview_bridge',
        },
      },
      codeLivePreview: {
        schemaVersion: '1.0',
        previewId: 'preview-live',
        commandProfileId: 'vite',
        workspace: {
          id: 'workspace-1',
          rootPath: 'C:/repo/app',
        },
        sourceSurface: {
          kind: 'code_task',
          surfaceId: 'task-canvas',
        },
      },
    },
  };
}

function createLivePreviewLease(
  overrides: Partial<ArtifactCanvasSupervisorPreviewLease> = {},
): ArtifactCanvasSupervisorPreviewLease {
  return {
    previewId: 'preview-live',
    origin: 'http://127.0.0.1:4321',
    status: 'ready',
    surface: {
      kind: 'code_task',
      surfaceId: 'task-canvas',
    },
    workspaceRef: {
      id: 'workspace-1',
      rootPath: 'C:/repo/app',
    },
    artifactId: 'artifact-live-preview',
    expiresAt: '2999-05-09T00:30:00.000Z',
    ...overrides,
  };
}

function createPreviewLeaseStore(lease: ArtifactCanvasSupervisorPreviewLease) {
  return {
    getLease(previewId: string): ArtifactCanvasSupervisorPreviewLease | null {
      return previewId === lease.previewId ? lease : null;
    },
  };
}
