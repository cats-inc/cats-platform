// PLAN-134 Phase 4 (ADR-149 D5, SPEC-141 FR-9): a conversation with Code's tools opens its canvas
// beside it on the product where it lives. The surface kind stays `code_conversation`; only the
// route changes, so previews and artifacts recorded under it keep working.
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Routes, StaticRouter } from 'react-router-dom';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import {
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  type CanvasSurfaceRef,
} from '../src/products/shared/artifactCanvas/contracts.ts';
import { resolveCanvasRouteOptions } from '../src/products/shared/artifactCanvas/conversationRoute.ts';
import { routeIntentTarget } from '../src/products/shared/renderer/useCanvasNavigateIntent.ts';
import { withSharedViewerRoutes } from '../src/products/shared/renderer/withSharedViewerRoutes.tsx';
import { buildChatTaskId } from '../src/shared/chatCoreIds.ts';

const SURFACE: CanvasSurfaceRef = { kind: 'code_conversation', surfaceId: 'channel-7' };
const ON_WORK = { conversationProduct: 'work' } as const;

test('a code_conversation canvas composes and parses under Work as well as Code', () => {
  assert.equal(canvasSurfaceRouteRegistry.parentUrl(SURFACE), '/code/chats/channel-7');
  assert.equal(canvasSurfaceRouteRegistry.parentUrl(SURFACE, ON_WORK), '/work/chats/channel-7');
  assert.equal(canvasSurfaceRouteRegistry.parentUrl(SURFACE, { conversationProduct: 'code' }), '/code/chats/channel-7');

  for (const presentation of ['auto', 'markdown'] as const) {
    const onWork = canvasSurfaceRouteRegistry.canvasUrl(SURFACE, 'artifact-1', presentation, ON_WORK);
    assert.equal(onWork, presentation === 'auto'
      ? '/work/chats/channel-7/canvas/artifact-1'
      : '/work/chats/channel-7/canvas/artifact-1/view/markdown');
    // Parsing gives the same surface, and composing again gives the same Work route.
    assert.deepEqual(canvasSurfaceRouteRegistry.parse(onWork), {
      kind: 'canvas',
      surface: SURFACE,
      parentUrl: '/work/chats/channel-7',
      canvasUrl: onWork,
      artifactId: 'artifact-1',
      presentationRequested: presentation,
    });
  }
  assert.deepEqual(canvasSurfaceRouteRegistry.parse('/work/chats/channel-7'), {
    kind: 'parent', surface: SURFACE, parentUrl: '/work/chats/channel-7',
  });
  // The API path does not depend on the product.
  assert.equal(canvasSurfaceRouteRegistry.projectionApiUrl(SURFACE, 'artifact-1'),
    '/api/canvas/code_conversation/channel-7/artifacts/artifact-1');

  // Work's own surfaces are unchanged, and other kinds ignore the option.
  assert.deepEqual(canvasSurfaceRouteRegistry.parse('/work/work-items/item-1')?.surface,
    { kind: 'work_item', surfaceId: 'item-1' });
  assert.equal(canvasSurfaceRouteRegistry.parentUrl({ kind: 'work_task', surfaceId: 't' }, ON_WORK), '/work/tasks/t');
  assert.equal(canvasSurfaceRouteRegistry.parentUrl({ kind: 'chat_conversation', surfaceId: 'c' }, ON_WORK), '/chat/chats/c');
});

test('a navigate intent carries the route it was composed with', () => {
  const intent = (route?: typeof ON_WORK) => composeArtifactCanvasNavigateIntent({
    intentId: 'intent-1', activityId: 'activity-1', surface: SURFACE, artifactId: 'artifact-1',
    presentationRequested: 'auto', policyVersion: 'policy-v1', triggeredAt: '2026-11-11T00:00:00.000Z', route,
  });
  assert.equal(intent().targetUrl, '/code/chats/channel-7/canvas/artifact-1');
  assert.equal(intent(ON_WORK).targetUrl, '/work/chats/channel-7/canvas/artifact-1');
  const clear = composeArtifactCanvasNavigateIntent({
    intentId: 'intent-2', activityId: 'activity-2', surface: SURFACE, artifactId: null,
    presentationRequested: null, policyVersion: 'policy-v1', triggeredAt: '2026-11-11T00:00:00.000Z', route: ON_WORK,
  });
  assert.equal(clear.targetUrl, '/work/chats/channel-7');
});

test("the server reads a conversation's route from the scope copy on its Core task", () => {
  const withTask = (metadata: Record<string, unknown> | null) => {
    const core = createDefaultCoreState();
    return metadata === null ? core : {
      ...core,
      tasks: [{ id: buildChatTaskId('channel-7'), metadata } as (typeof core.tasks)[number]],
    };
  };
  const cases: Array<[Record<string, unknown> | null, string]> = [
    [{ originSurface: 'work' }, 'work'],
    [{ originSurface: 'chat', productScope: 'work' }, 'work'],
    [{ originSurface: 'code', productScope: 'code' }, 'code'],
    [{ originSurface: 'code', productScope: 'work' }, 'work'],
    // A direct lane is chat whatever it stores; it has no Code canvas, and the default stays.
    [{ originSurface: 'work', productScope: 'work', roomRoutingMode: 'direct_message' }, 'code'],
    // No Core task yet: Code's route, as before this change.
    [null, 'code'],
  ];
  for (const [metadata, expected] of cases) {
    const route = resolveCanvasRouteOptions(withTask(metadata), SURFACE);
    assert.equal(canvasSurfaceRouteRegistry.parentUrl(SURFACE, route), `/${expected}/chats/channel-7`,
      JSON.stringify(metadata));
  }
  // Other kinds never take a conversation route.
  assert.deepEqual(resolveCanvasRouteOptions(withTask({ originSurface: 'work' }), { kind: 'work_item', surfaceId: 'channel-7' }), {});
});

test('a frame opens an intent for its own surface under its own route', () => {
  const codeUrl = { targetUrl: '/code/chats/channel-7/canvas/artifact-1/view/markdown' };
  // On Work, an intent made under Code's route (for example before the conversation moved)
  // opens beside the conversation where it is shown.
  assert.equal(routeIntentTarget(codeUrl, SURFACE, ON_WORK), '/work/chats/channel-7/canvas/artifact-1/view/markdown');
  assert.equal(routeIntentTarget({ targetUrl: '/code/chats/channel-7' }, SURFACE, ON_WORK), '/work/chats/channel-7');
  // On Code it is unchanged.
  assert.equal(routeIntentTarget(codeUrl, SURFACE, {}), codeUrl.targetUrl);
  // A URL for another surface, or one that is not a canvas URL, is followed as given.
  assert.equal(routeIntentTarget({ targetUrl: '/code/chats/channel-8/canvas/a' }, SURFACE, ON_WORK), '/code/chats/channel-8/canvas/a');
  assert.equal(routeIntentTarget({ targetUrl: '/work/overview' }, SURFACE, ON_WORK), '/work/overview');
});

test("Work's conversation route shows the canvas pane beside the conversation", () => {
  const render = (location: string) => renderToStaticMarkup(
    <StaticRouter location={location}>
      <Routes>
        {withSharedViewerRoutes({
          key: 'chat-conversation',
          path: '/work/chats/:channelId',
          surfaceKind: 'code_conversation',
          surfaceIdParam: 'channelId',
          element: <div className="fixtureConversation">Conversation</div>,
          canvasRoute: ON_WORK,
        })}
      </Routes>
    </StaticRouter>,
  );
  const canvas = render('/work/chats/channel-7/canvas/artifact-1');
  assert.match(canvas, /fixtureConversation/u);
  assert.match(canvas, /artifactCanvasSurfaceFrame/u);
  assert.match(canvas, /artifactCanvasPane/u);
  const parent = render('/work/chats/channel-7');
  assert.match(parent, /fixtureConversation/u);
  assert.doesNotMatch(parent, /artifactCanvasPane/u);
});
