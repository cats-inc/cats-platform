import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  normalizeArtifactCanvasClearToolInput,
  normalizeArtifactCanvasShowToolInput,
  type CanvasSurfaceRef,
} from '../src/products/shared/artifactCanvas/contracts.ts';

const SURFACE: CanvasSurfaceRef = {
  kind: 'code_task',
  surfaceId: 'task-abc',
};

test('Artifact Canvas registry round-trips parent and auto canvas URLs', () => {
  const parentUrl = canvasSurfaceRouteRegistry.parentUrl(SURFACE);
  assert.equal(parentUrl, '/code/tasks/task-abc');
  assert.deepEqual(canvasSurfaceRouteRegistry.parse(parentUrl), {
    kind: 'parent',
    surface: SURFACE,
    parentUrl,
  });

  const canvasUrl = canvasSurfaceRouteRegistry.canvasUrl(
    SURFACE,
    'artifact-123',
    'auto',
  );
  assert.equal(canvasUrl, '/code/tasks/task-abc/canvas/artifact-123');
  assert.deepEqual(canvasSurfaceRouteRegistry.parse(canvasUrl), {
    kind: 'canvas',
    surface: SURFACE,
    parentUrl,
    canvasUrl,
    artifactId: 'artifact-123',
    presentationRequested: 'auto',
  });
});

test('Artifact Canvas registry preserves explicit presentation in route and API URLs', () => {
  const canvasUrl = canvasSurfaceRouteRegistry.canvasUrl(
    SURFACE,
    'artifact-123',
    'iframe',
  );
  assert.equal(canvasUrl, '/code/tasks/task-abc/canvas/artifact-123/view/iframe');
  assert.deepEqual(canvasSurfaceRouteRegistry.parse(canvasUrl), {
    kind: 'canvas',
    surface: SURFACE,
    parentUrl: '/code/tasks/task-abc',
    canvasUrl,
    artifactId: 'artifact-123',
    presentationRequested: 'iframe',
  });

  const apiUrl = canvasSurfaceRouteRegistry.projectionApiUrl(
    SURFACE,
    'artifact-123',
    'iframe',
  );
  assert.equal(apiUrl, '/api/canvas/code_task/task-abc/artifacts/artifact-123/view/iframe');
  assert.deepEqual(canvasSurfaceRouteRegistry.parseProjectionApiPath(apiUrl), {
    kind: 'canvas',
    surface: SURFACE,
    parentUrl: '/code/tasks/task-abc',
    canvasUrl: apiUrl,
    artifactId: 'artifact-123',
    presentationRequested: 'iframe',
  });
});

test('Artifact Canvas navigate intents use registry-composed URLs', () => {
  const intent = composeArtifactCanvasNavigateIntent({
    intentId: 'secret-intent',
    activityId: 'activity-1',
    surface: SURFACE,
    artifactId: 'artifact-123',
    presentationRequested: 'pdf',
    policyVersion: 'policy-1',
    triggeredAt: '2026-05-09T00:00:00.000Z',
  });
  const parsed = canvasSurfaceRouteRegistry.parse(intent.targetUrl);

  assert.equal(intent.targetUrl, '/code/tasks/task-abc/canvas/artifact-123/view/pdf');
  assert.equal(parsed?.kind, 'canvas');
  if (parsed?.kind === 'canvas') {
    assert.deepEqual(parsed.surface, intent.surface);
    assert.equal(parsed.artifactId, intent.artifactId);
    assert.equal(parsed.presentationRequested, intent.presentationRequested);
  }
});

test('Artifact Canvas tool shape validation enforces one identity and active surface', () => {
  assert.equal(
    normalizeArtifactCanvasShowToolInput({ artifactId: 'artifact-1' }, null).status,
    'rejected',
  );
  assert.deepEqual(
    normalizeArtifactCanvasShowToolInput({
      artifactId: ' artifact-1 ',
      presentation: 'code',
    }, SURFACE),
    {
      status: 'shape_ok',
      input: {
        identity: { kind: 'artifact', artifactId: 'artifact-1' },
        presentation: 'code',
      },
    },
  );
  assert.equal(
    normalizeArtifactCanvasShowToolInput({
      artifactId: 'artifact-1',
      declarationId: 'declaration-1',
    }, SURFACE).status,
    'rejected',
  );
  assert.equal(
    normalizeArtifactCanvasShowToolInput({
      artifactId: 'artifact-1',
      presentation: 'unsupported',
    }, SURFACE).status,
    'rejected',
  );
  assert.deepEqual(
    normalizeArtifactCanvasClearToolInput({}, SURFACE),
    {
      status: 'shape_ok',
      input: { action: 'clear_canvas' },
    },
  );
});
