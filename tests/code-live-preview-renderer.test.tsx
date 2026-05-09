import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { fetchCodeLivePreviews } from '../src/products/code/renderer/api/codeTask.ts';

test('Code task and codespace surfaces mount the live-preview affordance panel', () => {
  const taskPage = readFileSync(
    new URL('../src/products/code/renderer/components/CodeTaskDetailPage.tsx', import.meta.url),
    'utf8',
  );
  const workspacePage = readFileSync(
    new URL(
      '../src/products/code/renderer/components/workspaces/WorkspaceDetailPage.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(taskPage, /import \{ LivePreviewPanel \} from '\.\/LivePreviewPanel\.js';/u);
  assert.match(taskPage, /<LivePreviewPanel surfaceKind="code_task" surfaceId=\{detail\.taskId\} \/>/u);
  assert.match(workspacePage, /import \{ LivePreviewPanel \} from '\.\.\/LivePreviewPanel\.js';/u);
  assert.match(
    workspacePage,
    /<LivePreviewPanel surfaceKind="code_codespace" surfaceId=\{workspace\.id\} \/>/u,
  );
});

test('LivePreviewPanel exposes status, stop, retry, and log controls', () => {
  const panel = readFileSync(
    new URL('../src/products/code/renderer/components/LivePreviewPanel.tsx', import.meta.url),
    'utf8',
  );

  assert.match(panel, /fetchCodeLivePreviews/u);
  assert.match(panel, /stopCodeLivePreview/u);
  assert.match(panel, /fetchCodeLivePreviewLogs/u);
  assert.match(panel, /codeLivePreviewRetryUnavailable/u);
  assert.match(panel, /codeLivePreviewStatusReady/u);
  assert.match(panel, /codeLivePreviewLogsEmpty/u);
});

test('LivePreviewPanel guards async stop and logs updates against stale surfaces', () => {
  const panel = readFileSync(
    new URL('../src/products/code/renderer/components/LivePreviewPanel.tsx', import.meta.url),
    'utf8',
  );

  assert.match(panel, /requestVersionRef/u);
  assert.match(panel, /mountedRef/u);
  assert.match(panel, /surfaceIdentityRef/u);
  assert.match(panel, /createLivePreviewSurfaceIdentity/u);
  assert.match(panel, /if \(surfaceChanged\) \{\s*setLogsByPreviewId\(\{\}\);\s*setLogsLoadingId\(null\);\s*setStoppingId\(null\);\s*setActionFeedback\(null\);\s*\}/u);
  assert.match(panel, /isCurrentLivePreviewRequest/u);
  assert.match(panel, /expireLivePreviewRequest/u);
  assert.match(panel, /refreshPreviews\(\{\s*requestVersion,\s*surfaceKind: currentSurfaceKind,\s*surfaceId: currentSurfaceId,\s*\}\);/u);
  assert.match(panel, /if \(!isCurrentLivePreviewRequest\(mountedRef, requestVersionRef, requestVersion\)\) \{\s*return;\s*\}/u);
});

test('live-preview renderer API treats unavailable supervisor as empty previews', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let capturedUrl = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return new Response(JSON.stringify({ previews: [] }), { status: 200 });
  }) as typeof fetch;

  const response = await fetchCodeLivePreviews('code_task', 'task/1', 'load failed');
  assert.deepEqual(response, { previews: [] });
  assert.equal(
    capturedUrl,
    '/api/code/live-previews?surfaceKind=code_task&surfaceId=task%2F1',
  );

  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: { code: 'live_preview_unavailable' } }),
    { status: 503 },
  )) as typeof fetch;

  const unavailable = await fetchCodeLivePreviews('code_codespace', 'space-1', 'load failed');
  assert.deepEqual(unavailable, { previews: [] });
});
