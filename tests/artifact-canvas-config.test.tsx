import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.ts';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  buildArtifactCanvasPolicyVersion,
} from '../src/products/shared/artifactCanvas/iframePolicy.ts';

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: 'C:/Users/tester',
    ...overrides,
  };
}

test('loadConfig exposes the default Artifact Canvas viewer policy', () => {
  const config = loadConfig(baseEnv());

  assert.deepEqual(config.artifactCanvas, DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG);
  assert.equal(
    buildArtifactCanvasPolicyVersion(config.artifactCanvas).policyVersion,
    '924ecad525730480',
  );
});

test('loadConfig accepts flat Artifact Canvas allowlist JSON overrides', () => {
  const config = loadConfig(baseEnv({
    CATS_ARTIFACT_CANVAS_RUNTIME_PREVIEW_ORIGIN_ALLOWLIST: JSON.stringify([
      { hostname: 'dev.local', schemes: ['http'], ports: [5173, 4321] },
    ]),
    CATS_ARTIFACT_CANVAS_SCRIPTED_PREVIEW_PRODUCER_ALLOWLIST: JSON.stringify([
      {
        producerKind: 'tool',
        producerIdentity: 'tool:cats_runtime_preview_bridge',
      },
    ]),
    CATS_ARTIFACT_CANVAS_SHELL_ORIGIN: 'http://localhost:5173',
  }));

  assert.deepEqual(config.artifactCanvas.runtimePreviewOriginAllowlist, [
    { hostname: 'dev.local', schemes: ['http'], ports: [5173, 4321] },
  ]);
  assert.deepEqual(config.artifactCanvas.scriptedPreviewProducerAllowlist, [
    {
      producerKind: 'tool',
      producerIdentity: 'tool:cats_runtime_preview_bridge',
    },
  ]);
  assert.equal(config.artifactCanvas.catsShellOrigin, 'http://localhost:5173');
});

test('loadConfig validates Artifact Canvas allowlist values at boot', () => {
  assert.throws(
    () =>
      loadConfig(baseEnv({
        CATS_ARTIFACT_CANVAS_RUNTIME_PREVIEW_ORIGIN_ALLOWLIST: JSON.stringify([
          { hostname: '', schemes: ['http'], ports: '*' },
        ]),
      })),
    /hostname is required/u,
  );
  assert.throws(
    () =>
      loadConfig(baseEnv({
        CATS_ARTIFACT_CANVAS_SCRIPTED_PREVIEW_PRODUCER_ALLOWLIST: JSON.stringify([
          { producerKind: 'tool', producerIdentity: '   ' },
        ]),
      })),
    /producerIdentity is required/u,
  );
  assert.throws(
    () =>
      loadConfig(baseEnv({
        CATS_ARTIFACT_CANVAS_RUNTIME_PREVIEW_ORIGIN_ALLOWLIST: JSON.stringify({
          hostname: 'localhost',
        }),
      })),
    /JSON array/u,
  );
});
