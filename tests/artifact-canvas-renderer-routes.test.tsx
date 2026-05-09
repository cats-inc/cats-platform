import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Routes, StaticRouter } from 'react-router-dom';

import { withSharedViewerRoutes } from '../src/products/shared/renderer/withSharedViewerRoutes.tsx';

test('Code routes register Artifact Canvas child routes for task and codespace surfaces', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/code/renderer/AppRoutes.tsx'),
    'utf8',
  );

  assert.match(
    source,
    /withSharedViewerRoutes\(\{\s+key: 'codespace-detail',\s+path: 'codespaces\/:codespaceId',\s+surfaceKind: 'code_codespace',/u,
  );
  assert.match(
    source,
    /withSharedViewerRoutes\(\{\s+key: 'task-detail',\s+path: 'tasks\/:taskId',\s+surfaceKind: 'code_task',/u,
  );
});

test('shared viewer route renders parent and Artifact Canvas pane on nested canvas URL', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/code/codespaces/codespace-1/canvas/artifact-1">
      <Routes>
        {withSharedViewerRoutes({
          key: 'codespace-detail',
          path: '/code/codespaces/:codespaceId',
          surfaceKind: 'code_codespace',
          surfaceIdParam: 'codespaceId',
          element: <div className="fixtureParent">Parent surface</div>,
        })}
      </Routes>
    </StaticRouter>,
  );

  assert.match(markup, /fixtureParent/u);
  assert.match(markup, /artifactCanvasSurfaceFrame/u);
  assert.match(markup, /artifactCanvasPane/u);
});
