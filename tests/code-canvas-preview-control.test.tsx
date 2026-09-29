import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { MemoryRouter, Route, Routes, StaticRouter, useLocation } from 'react-router-dom';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import type { CoreActivityKind, CoreActivityRecord } from '../src/core/types.ts';
import { CodeCanvasPreviewButton } from '../src/products/code/renderer/components/CodeCanvasPreviewButton.tsx';
import { buildChatOperatorView } from '../src/products/shared/operator-loop/index.ts';
import { canvasSurfaceRouteRegistry } from '../src/products/shared/artifactCanvas/contracts.ts';
import { ChatViewTopBar } from '../src/products/shared/renderer/components/chat-view/ChatViewTopBar.tsx';
import { buildChatConversationId } from '../src/shared/chatCoreIds.ts';

function activity(id: string, kind: CoreActivityKind, channelId: string, artifactId: string | null, createdAt: string): CoreActivityRecord {
  return {
    id,
    kind,
    actorId: null,
    projectId: null,
    workItemId: null,
    conversationId: buildChatConversationId(channelId),
    taskId: null,
    runId: null,
    artifactId,
    message: kind,
    createdAt,
    metadata: {},
  };
}

test('the operator view exposes the newest show intent of its own conversation, ignoring clears', () => {
  const core = createDefaultCoreState();
  core.activities.push(
    activity('a1', 'artifact_canvas_show_intent', 'channel-7', 'artifact-old', '2026-09-29T10:00:00.000Z'),
    activity('a2', 'artifact_canvas_show_intent', 'channel-7', 'artifact-new', '2026-09-29T10:05:00.000Z'),
    activity('a3', 'artifact_canvas_clear_intent', 'channel-7', null, '2026-09-29T10:06:00.000Z'),
    activity('a4', 'artifact_canvas_show_intent', 'channel-8', 'artifact-other', '2026-09-29T10:07:00.000Z'),
  );
  const view = buildChatOperatorView({ core, approvals: [] }, 'channel-7');
  assert.equal(view?.latestCanvasArtifactId, 'artifact-new');
  assert.equal(buildChatOperatorView({ core, approvals: [] }, 'channel-9')?.latestCanvasArtifactId, null);
});

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

test('Preview opens the latest artifact beside the conversation', (t) => {
  t.after(() => { cleanup(); resetTestDom(); });
  const view = render(
    <MemoryRouter initialEntries={['/code/chats/channel-7']}>
      <Routes>
        <Route
          path="/code/chats/:channelId/*"
          element={<><CodeCanvasPreviewButton channelId="channel-7" artifactId="artifact-new" /><LocationProbe /></>}
        />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(view.getByRole('button', { name: 'Open preview' }));
  assert.equal(
    view.getByTestId('location').textContent,
    canvasSurfaceRouteRegistry.canvasUrl({ kind: 'code_conversation', surfaceId: 'channel-7' }, 'artifact-new'),
  );
  assert.equal(view.queryByRole('button', { name: 'Open preview' }), null, 'hidden once the canvas is open');
});

test('Preview is absent without a shown artifact or while that canvas is open', () => {
  const at = (location: string, artifactId: string | null) => renderToStaticMarkup(
    <StaticRouter location={location}>
      <CodeCanvasPreviewButton channelId="channel-7" artifactId={artifactId} />
    </StaticRouter>,
  );
  assert.equal(at('/code/chats/channel-7', null), '');
  assert.equal(at('/code/chats/channel-7/canvas/artifact-1', 'artifact-1'), '');
  assert.match(at('/code/chats/channel-7/canvas/artifact-1/view/iframe', 'artifact-1'), /^$/u);
  assert.match(at('/code/chats/channel-8/canvas/artifact-9', 'artifact-1'), /aria-label="Open preview"/u);
});

test('the chat top bar renders extra actions before the side-panel toggle', () => {
  const markup = renderToStaticMarkup(
    <ChatViewTopBar
      avatars={[]}
      showRosterAvatars={false}
      isDirectLane={false}
      topBarTitle="Calculator"
      sidePanelOpen={false}
      approvalCount={0}
      extraActions={<button type="button" className="fixtureExtraAction">Extra</button>}
      onToggleSidePanel={() => {}}
    />,
  );
  assert.ok(markup.indexOf('fixtureExtraAction') > -1);
  assert.ok(markup.indexOf('fixtureExtraAction') < markup.indexOf('sidePanelToggle'));
});

test('canvas routes span main.canvas and give the page column the shell gutter', async () => {
  const css = await readFile(path.join(process.cwd(), 'src/products/shared/renderer/styles/artifact-canvas.css'), 'utf8');
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`);
    assert.ok(start >= 0, `${selector} rule exists`);
    return css.slice(start, css.indexOf('}', start));
  };
  const canvas = rule('main.canvas:has(> .artifactCanvasSurfaceFrame)');
  assert.match(canvas, /justify-items: stretch;/u);
  assert.match(canvas, /padding: 0;/u);
  assert.match(canvas, /scrollbar-gutter: auto;/u);
  assert.match(rule('.artifactCanvasSurfaceFrame'), /width: 100%;/u);
  assert.match(rule('.artifactCanvasSurfaceMain'), /padding: 0 28px;/u);

  const codeRoutes = await readFile(path.join(process.cwd(), 'src/products/code/renderer/AppRoutes.tsx'), 'utf8');
  assert.match(codeRoutes, /renderTopBarExtraActions=\{\(ctx\) => \(\s*<CodeCanvasPreviewButton/u);
});
