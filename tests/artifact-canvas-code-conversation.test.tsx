import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Route, Routes, StaticRouter } from 'react-router-dom';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import type { CoreArtifactRecord } from '../src/core/types.ts';
import {
  appendArtifactCanvasIntentActivity,
  resolveArtifactCanvasActivityAnchor,
} from '../src/products/shared/artifactCanvas/activity.ts';
import {
  canvasSurfaceRouteRegistry,
  type CanvasSurfaceRef,
} from '../src/products/shared/artifactCanvas/contracts.ts';
import { isArtifactAnchoredToSurface } from '../src/products/shared/artifactCanvas/projection.ts';
import { useWorkspaceLocationState } from '../src/products/shared/renderer/hooks/useWorkspaceLocationState.ts';
import { withSharedViewerRoutes } from '../src/products/shared/renderer/withSharedViewerRoutes.tsx';
import { buildChatConversationId } from '../src/shared/chatCoreIds.ts';

const SURFACE: CanvasSurfaceRef = { kind: 'code_conversation', surfaceId: 'channel-7' };

test('code_conversation round-trips /code/chats URLs without shadowing other Code surfaces', () => {
  assert.equal(canvasSurfaceRouteRegistry.parentUrl(SURFACE), '/code/chats/channel-7');
  const canvasUrl = canvasSurfaceRouteRegistry.canvasUrl(SURFACE, 'artifact-1');
  assert.equal(canvasUrl, '/code/chats/channel-7/canvas/artifact-1');
  assert.deepEqual(canvasSurfaceRouteRegistry.parse(canvasUrl), {
    kind: 'canvas',
    surface: SURFACE,
    parentUrl: '/code/chats/channel-7',
    canvasUrl,
    artifactId: 'artifact-1',
    presentationRequested: 'auto',
  });
  assert.deepEqual(canvasSurfaceRouteRegistry.parse('/code/codespaces/codespace-1')?.surface, {
    kind: 'code_codespace',
    surfaceId: 'codespace-1',
  });
  assert.deepEqual(canvasSurfaceRouteRegistry.parse('/chat/chats/channel-7')?.surface, {
    kind: 'chat_conversation',
    surfaceId: 'channel-7',
  });
});

test('code_conversation anchors Activity and artifacts on the Core conversation id', () => {
  const conversationId = buildChatConversationId('channel-7');
  assert.deepEqual(resolveArtifactCanvasActivityAnchor(SURFACE), {
    source: 'activity_conversation_anchor',
    surfaceKind: 'code_conversation',
    conversationId,
  });

  const write = appendArtifactCanvasIntentActivity({
    core: createDefaultCoreState(),
    kind: 'artifact_canvas_clear_intent',
    surface: SURFACE,
    targetUrl: '/code/chats/channel-7',
    policyVersion: 'policy-v1',
    now: new Date('2026-09-29T03:00:00.000Z'),
  });
  assert.equal(write.activity.conversationId, conversationId);
  assert.equal((write.activity.metadata.artifactCanvas as Record<string, unknown>).surfaceId, 'channel-7');

  const artifact = { conversationId } as CoreArtifactRecord;
  assert.equal(isArtifactAnchoredToSurface(artifact, SURFACE), true);
  assert.equal(isArtifactAnchoredToSurface(artifact, { kind: 'code_conversation', surfaceId: 'channel-8' }), false);
  assert.equal(isArtifactAnchoredToSurface({ conversationId: 'channel-7' } as CoreArtifactRecord, SURFACE), false);
});

test('Code mounts the Artifact Canvas beside its conversation route only', async () => {
  const codeRoutes = await readFile(path.join(process.cwd(), 'src/products/code/renderer/AppRoutes.tsx'), 'utf8');
  assert.match(codeRoutes, /chatCanvasSurfaceKind: 'code_conversation'/u);
  const workRoutes = await readFile(path.join(process.cwd(), 'src/products/work/renderer/AppRoutes.tsx'), 'utf8');
  assert.doesNotMatch(workRoutes, /chatCanvasSurfaceKind/u);

  const markup = renderToStaticMarkup(
    <StaticRouter location="/code/chats/channel-7/canvas/artifact-1">
      <Routes>
        {withSharedViewerRoutes({
          key: 'chat-conversation',
          path: '/code/chats/:channelId',
          surfaceKind: 'code_conversation',
          surfaceIdParam: 'channelId',
          element: <div className="fixtureConversation">Conversation</div>,
        })}
      </Routes>
    </StaticRouter>,
  );
  assert.match(markup, /fixtureConversation/u);
  assert.match(markup, /artifactCanvasSurfaceFrame/u);
  assert.match(markup, /artifactCanvasPane/u);
});

function RouteChannelProbe(): JSX.Element {
  const state = useWorkspaceLocationState('/code');
  return <span data-channel={state.routeChannelId ?? 'none'} />;
}

test('the selected channel survives a canvas child route', () => {
  for (const location of ['/code/chats/channel-7', '/code/chats/channel-7/canvas/artifact-1']) {
    const markup = renderToStaticMarkup(
      <StaticRouter location={location}>
        <Routes>
          <Route path="*" element={<RouteChannelProbe />} />
        </Routes>
      </StaticRouter>,
    );
    assert.match(markup, /data-channel="channel-7"/u, location);
  }
});
