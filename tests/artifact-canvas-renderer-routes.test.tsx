import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Routes, StaticRouter } from 'react-router-dom';

import type {
  ArtifactCanvasProjection,
} from '../src/products/shared/artifactCanvas/contracts.ts';
import { CodeViewer } from '../src/products/shared/renderer/viewers/CodeViewer.tsx';
import { ImageViewer } from '../src/products/shared/renderer/viewers/ImageViewer.tsx';
import { PdfViewer } from '../src/products/shared/renderer/viewers/PdfViewer.tsx';
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

test('Work routes register Artifact Canvas child routes for project, task, and work item surfaces', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/AppRoutes.tsx'),
    'utf8',
  );

  assert.match(
    source,
    /withSharedViewerRoutes\(\{\s+key: 'project-detail',\s+path: 'projects\/:projectId',\s+surfaceKind: 'work_project',/u,
  );
  assert.match(
    source,
    /withSharedViewerRoutes\(\{\s+key: 'task-detail',\s+path: 'tasks\/:taskId',\s+surfaceKind: 'work_task',/u,
  );
  assert.match(
    source,
    /withSharedViewerRoutes\(\{\s+key: 'work-item-detail',\s+path: 'work-items\/:workItemId',\s+surfaceKind: 'work_item',/u,
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
  assert.match(markup, /artifactCanvasResizeHandle/u);
  assert.match(markup, /role="separator"/u);
  assert.match(markup, /aria-orientation="vertical"/u);
  assert.match(markup, /artifactCanvasPane/u);
});

test('shared viewer route does not reserve pane width on parent URL', () => {
  const markup = renderToStaticMarkup(
    <StaticRouter location="/code/codespaces/codespace-1">
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
  assert.doesNotMatch(markup, /artifactCanvasSurfaceFrame/u);
  assert.doesNotMatch(markup, /artifactCanvasResizeHandle/u);
});

test('Artifact Canvas resize handle persists width and supports keyboard controls', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/withSharedViewerRoutes.tsx'),
    'utf8',
  );

  assert.match(source, /cats\.artifactCanvas\.paneWidth/u);
  assert.match(source, /localStorage\.getItem/u);
  assert.match(source, /localStorage\.setItem/u);
  assert.match(source, /event\.key === 'ArrowLeft'/u);
  assert.match(source, /event\.key === 'ArrowRight'/u);
  assert.match(source, /event\.key === 'Home'/u);
  assert.match(source, /event\.key === 'End'/u);
});

test('Artifact Canvas materialized viewers render without iframe', async () => {
  const canvasPaneSource = await readFile(
    path.join(process.cwd(), 'src/products/shared/renderer/CanvasPane.tsx'),
    'utf8',
  );
  const imageMarkup = renderToStaticMarkup(
    <ImageViewer
      projection={createProjection('image', 'http://127.0.0.1:4321/artifact.png')}
    />,
  );
  const pdfMarkup = renderToStaticMarkup(
    <PdfViewer
      projection={createProjection('pdf', 'http://127.0.0.1:4321/artifact.pdf')}
    />,
  );
  const codeMarkup = renderToStaticMarkup(
    <CodeViewer
      projection={createProjection('code', null, 'const answer = 42;')}
    />,
  );

  assert.match(canvasPaneSource, /ImageViewer/u);
  assert.match(canvasPaneSource, /PdfViewer/u);
  assert.match(canvasPaneSource, /CodeViewer/u);
  assert.match(imageMarkup, /<img/u);
  assert.doesNotMatch(imageMarkup, /<iframe/u);
  assert.match(pdfMarkup, /<object/u);
  assert.match(pdfMarkup, /type="application\/pdf"/u);
  assert.doesNotMatch(pdfMarkup, /<iframe/u);
  assert.match(codeMarkup, /<pre/u);
  assert.match(codeMarkup, /const answer = 42;/u);
  assert.doesNotMatch(codeMarkup, /<iframe/u);
});

function createProjection(
  presentationResolved: 'image' | 'pdf' | 'code',
  safeUrl: string | null,
  textContent: string | null = null,
): ArtifactCanvasProjection {
  return {
    surface: { kind: 'code_task', surfaceId: 'task-canvas' },
    artifact: {
      id: `artifact-${presentationResolved}`,
      title: `Artifact ${presentationResolved}`,
      kind: 'attachment',
      status: 'ready',
      summary: null,
      path: safeUrl,
      mimeType: resolveMimeType(presentationResolved),
      sizeBytes: null,
      updatedAt: '2026-05-09T00:00:00.000Z',
    },
    presentationRequested: 'auto',
    presentationResolved,
    iframeSandboxProfile: {
      name: 'static',
      sandbox: '',
      referrerPolicy: 'no-referrer',
      allow: '',
    },
    safeUrl,
    externalUrl: safeUrl,
    textContent,
    policyVersion: 'policy-v1',
    error: null,
  };
}

function resolveMimeType(
  presentationResolved: 'image' | 'pdf' | 'code',
): string {
  if (presentationResolved === 'image') {
    return 'image/png';
  }
  if (presentationResolved === 'pdf') {
    return 'application/pdf';
  }
  return 'text/plain';
}
