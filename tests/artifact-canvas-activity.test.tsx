import assert from 'node:assert/strict';
import test from 'node:test';

import { CORE_ACTIVITY_KINDS } from '../src/core/api/constants.ts';
import { createDefaultCoreState, upsertCoreTask } from '../src/core/model/index.ts';
import type { CoreActivityRecord } from '../src/core/types.ts';
import { normalizeCoreActivity } from '../src/products/chat/state/core-snapshot/workflowRecords.ts';
import {
  appendArtifactCanvasIntentActivity,
  resolveArtifactCanvasActivityAnchor,
} from '../src/products/shared/artifactCanvas/activity.ts';
import type {
  ArtifactCanvasIframeSandboxProfile,
  CanvasSurfaceAnchorSource,
  CanvasSurfaceRef,
} from '../src/products/shared/artifactCanvas/contracts.ts';
import { writeTaskPlanningMetadata } from '../src/shared/taskPlanning.ts';

const IFRAME_PROFILE: ArtifactCanvasIframeSandboxProfile = {
  name: 'static',
  sandbox: '',
  referrerPolicy: 'no-referrer',
  allow: '',
};

const SURFACE_CASES: Array<{
  surface: CanvasSurfaceRef;
  expectedSource: CanvasSurfaceAnchorSource['source'];
  anchors: Pick<
    CoreActivityRecord,
    'projectId' | 'workItemId' | 'conversationId' | 'taskId'
  >;
}> = [
  {
    surface: { kind: 'code_task', surfaceId: 'task-code' },
    expectedSource: 'activity_task_anchor',
    anchors: {
      projectId: null,
      workItemId: null,
      conversationId: null,
      taskId: 'task-code',
    },
  },
  {
    surface: { kind: 'work_task', surfaceId: 'task-work' },
    expectedSource: 'activity_task_anchor',
    anchors: {
      projectId: null,
      workItemId: null,
      conversationId: null,
      taskId: 'task-work',
    },
  },
  {
    surface: { kind: 'work_item', surfaceId: 'work-item-1' },
    expectedSource: 'activity_work_item_anchor',
    anchors: {
      projectId: null,
      workItemId: 'work-item-1',
      conversationId: null,
      taskId: null,
    },
  },
  {
    surface: { kind: 'work_project', surfaceId: 'project-1' },
    expectedSource: 'activity_project_anchor',
    anchors: {
      projectId: 'project-1',
      workItemId: null,
      conversationId: null,
      taskId: null,
    },
  },
  {
    surface: { kind: 'chat_conversation', surfaceId: 'conversation-1' },
    expectedSource: 'activity_conversation_anchor',
    anchors: {
      projectId: null,
      workItemId: null,
      conversationId: 'conversation-1',
      taskId: null,
    },
  },
  {
    surface: { kind: 'code_codespace', surfaceId: 'codespace-1' },
    expectedSource: 'activity_metadata_anchor',
    anchors: {
      projectId: null,
      workItemId: null,
      conversationId: null,
      taskId: null,
    },
  },
];

test('Artifact Canvas activity kinds are first-class Core activity kinds', () => {
  assert.equal(CORE_ACTIVITY_KINDS.includes('artifact_canvas_show_intent'), true);
  assert.equal(CORE_ACTIVITY_KINDS.includes('artifact_canvas_clear_intent'), true);

  const normalized = normalizeCoreActivity({
    id: 'activity-canvas-normalized',
    kind: 'artifact_canvas_show_intent',
    actorId: null,
    projectId: null,
    workItemId: null,
    conversationId: null,
    taskId: 'task-code',
    runId: null,
    artifactId: 'artifact-1',
    message: 'Show artifact in canvas.',
    createdAt: '2026-05-09T01:00:00.000Z',
    metadata: {
      artifactCanvas: {
        surfaceKind: 'code_task',
        surfaceId: 'task-code',
        surfaceAnchorSource: 'activity_task_anchor',
      },
    },
  });

  assert.equal(normalized?.kind, 'artifact_canvas_show_intent');
  assert.deepEqual(readCanvasMetadata(normalized).artifactCanvas, {
    surfaceKind: 'code_task',
    surfaceId: 'task-code',
    surfaceAnchorSource: 'activity_task_anchor',
  });
});

test('Artifact Canvas activity writer derives source anchors from every surface', () => {
  let core = createDefaultCoreState();

  for (const { surface, expectedSource, anchors } of SURFACE_CASES) {
    const targetUrl = `/canvas-test/${surface.kind}/${surface.surfaceId}`;
    const write = appendArtifactCanvasIntentActivity({
      core,
      kind: 'artifact_canvas_show_intent',
      surface,
      actorId: 'actor-cat-canvas',
      artifactId: 'artifact-1',
      targetUrl,
      policyVersion: 'policy-v1',
      presentationRequested: 'iframe',
      presentationResolved: 'iframe',
      iframeSandboxProfile: IFRAME_PROFILE,
      navigateIntent: {
        activityId: `activity-${surface.kind}`,
        targetUrl,
      },
      now: new Date('2026-05-09T02:00:00.000Z'),
    });
    core = write.core;

    const activity = write.activity;
    assert.equal(activity.id, `activity-${surface.kind}`);
    assert.equal(activity.kind, 'artifact_canvas_show_intent');
    assert.equal(activity.projectId, anchors.projectId);
    assert.equal(activity.workItemId, anchors.workItemId);
    assert.equal(activity.conversationId, anchors.conversationId);
    assert.equal(activity.taskId, anchors.taskId);
    assert.equal(activity.artifactId, 'artifact-1');

    const anchor = resolveArtifactCanvasActivityAnchor(surface);
    assert.equal(anchor.source, expectedSource);

    assert.deepEqual(readCanvasMetadata(activity).artifactCanvas, {
      surfaceKind: surface.kind,
      surfaceId: surface.surfaceId,
      surfaceAnchorSource: expectedSource,
      targetUrl,
      policyVersion: 'policy-v1',
      presentationRequested: 'iframe',
      presentationResolved: 'iframe',
      iframeSandboxProfile: IFRAME_PROFILE,
    });
  }
});

test('Artifact Canvas clear activity records parent navigation without artifact focus', () => {
  const write = appendArtifactCanvasIntentActivity({
    core: createDefaultCoreState(),
    kind: 'artifact_canvas_clear_intent',
    surface: { kind: 'chat_conversation', surfaceId: 'conversation-1' },
    targetUrl: '/chat/conversations/conversation-1',
    policyVersion: 'policy-v1',
    now: new Date('2026-05-09T03:00:00.000Z'),
  });

  assert.equal(write.activity.kind, 'artifact_canvas_clear_intent');
  assert.equal(write.activity.artifactId, null);
  assert.equal(write.activity.conversationId, 'conversation-1');
  assert.equal(write.activity.message, 'Artifact Canvas clear intent recorded.');
  assert.deepEqual(readCanvasMetadata(write.activity).artifactCanvas, {
    surfaceKind: 'chat_conversation',
    surfaceId: 'conversation-1',
    surfaceAnchorSource: 'activity_conversation_anchor',
    targetUrl: '/chat/conversations/conversation-1',
    policyVersion: 'policy-v1',
    presentationRequested: null,
    presentationResolved: null,
    iframeSandboxProfile: null,
  });
});

test('Artifact Canvas activity writer rejects conflicting metadata before write', () => {
  const core = createDefaultCoreState();

  assert.throws(
    () =>
      appendArtifactCanvasIntentActivity({
        core,
        kind: 'artifact_canvas_show_intent',
        surface: { kind: 'work_item', surfaceId: 'work-item-1' },
        artifactId: 'artifact-1',
        targetUrl: '/work/items/work-item-1/canvas/artifact-1',
        policyVersion: 'policy-v1',
        metadata: {
          artifactCanvas: {
            surfaceId: 'work-item-other',
          },
        },
      }),
    /metadata\.surfaceId conflicts/u,
  );
  assert.equal(core.activities.length, 0);

  assert.throws(
    () =>
      appendArtifactCanvasIntentActivity({
        core,
        kind: 'artifact_canvas_show_intent',
        surface: { kind: 'work_task', surfaceId: 'task-work' },
        artifactId: 'artifact-1',
        targetUrl: '/work/tasks/task-work/canvas/artifact-1',
        policyVersion: 'policy-v1',
        metadata: {
          artifactCanvas: {
            surfaceKind: 'code_task',
          },
        },
      }),
    /metadata\.surfaceKind conflicts/u,
  );
  assert.equal(core.activities.length, 0);
});

test('Artifact Canvas activity keeps task surfaceKind as a historical snapshot', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTask(core, {
    id: 'task-product-binding',
    title: 'Product binding can change',
    status: 'in_progress',
    metadata: writeTaskPlanningMetadata({}, { productHint: 'code' }),
  }).core;

  core = appendArtifactCanvasIntentActivity({
    core,
    kind: 'artifact_canvas_show_intent',
    surface: { kind: 'code_task', surfaceId: 'task-product-binding' },
    artifactId: 'artifact-1',
    targetUrl: '/code/tasks/task-product-binding/canvas/artifact-1',
    policyVersion: 'policy-v1',
    presentationRequested: 'auto',
    presentationResolved: 'unsupported',
    now: new Date('2026-05-09T04:00:00.000Z'),
  }).core;

  core = upsertCoreTask(core, {
    id: 'task-product-binding',
    title: 'Product binding can change',
    status: 'in_progress',
    metadata: writeTaskPlanningMetadata({}, { productHint: 'work' }),
  }).core;

  const activity = core.activities.find((candidate) =>
    candidate.kind === 'artifact_canvas_show_intent');
  assert.equal(readCanvasMetadata(activity).artifactCanvas.surfaceKind, 'code_task');
  assert.equal(readCanvasMetadata(activity).artifactCanvas.surfaceId, 'task-product-binding');
});

test('Artifact Canvas audit never persists the private navigate intent id', () => {
  const navigateIntent = {
    intentId: 'secret-intent-token',
    activityId: 'activity-public',
    surface: { kind: 'code_task', surfaceId: 'task-code' },
    targetUrl: '/code/tasks/task-code/canvas/artifact-1',
    artifactId: 'artifact-1',
    presentationRequested: 'auto',
    policyVersion: 'policy-v1',
    triggeredAt: '2026-05-09T05:00:00.000Z',
    expiresAt: '2026-05-09T05:00:30.000Z',
  } as const;

  const write = appendArtifactCanvasIntentActivity({
    core: createDefaultCoreState(),
    kind: 'artifact_canvas_show_intent',
    surface: { kind: 'code_task', surfaceId: 'task-code' },
    artifactId: 'artifact-1',
    targetUrl: '/code/tasks/task-code/canvas/artifact-1',
    policyVersion: 'policy-v1',
    navigateIntent,
  });

  assert.equal(write.activity.id, 'activity-public');
  assert.doesNotMatch(JSON.stringify(write.activity), /secret-intent-token/u);
});

test('Artifact Canvas activity rejects divergent navigate target correlation', () => {
  assert.throws(
    () =>
      appendArtifactCanvasIntentActivity({
        core: createDefaultCoreState(),
        kind: 'artifact_canvas_show_intent',
        surface: { kind: 'code_task', surfaceId: 'task-code' },
        artifactId: 'artifact-1',
        targetUrl: '/code/tasks/task-code/canvas/artifact-1',
        policyVersion: 'policy-v1',
        navigateIntent: {
          activityId: 'activity-public',
          targetUrl: '/code/tasks/task-code/canvas/artifact-other',
        },
      }),
    /targetUrl conflicts/u,
  );
});

function readCanvasMetadata(
  activity: CoreActivityRecord | null | undefined,
): { artifactCanvas: Record<string, unknown> } {
  assert.ok(activity, 'Expected activity to exist.');
  const artifactCanvas = activity.metadata.artifactCanvas;
  assert.ok(
    artifactCanvas && typeof artifactCanvas === 'object' && !Array.isArray(artifactCanvas),
    'Expected artifactCanvas metadata.',
  );
  return { artifactCanvas: artifactCanvas as Record<string, unknown> };
}
