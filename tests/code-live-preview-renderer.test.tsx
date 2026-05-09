import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { JSDOM } from 'jsdom';
import React from 'react';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type { CodeLivePreviewSummary } from '../src/products/code/renderer/api/codeTask.ts';
import { fetchCodeLivePreviews } from '../src/products/code/renderer/api/codeTask.ts';
import { LivePreviewPanel } from '../src/products/code/renderer/components/LivePreviewPanel.tsx';

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

test('LivePreviewPanel exposes status, stop, retry, and log controls', async (t) => {
  const restoreDom = installDom();
  const originalFetch = globalThis.fetch;
  t.after(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    restoreDom();
  });

  globalThis.fetch = (async () => jsonResponse({
    previews: [createPreviewSummary({ previewId: 'preview-a', surfaceId: 'task-a' })],
  })) as typeof fetch;

  const view = renderLivePreviewPanel({ surfaceKind: 'code_task', surfaceId: 'task-a' });

  assert.equal(await view.findByText('preview-a'), view.getByText('preview-a'));
  assert.equal(view.getByText('Ready').textContent, 'Ready');
  assert.equal(view.getByRole('button', { name: 'Stop' }).textContent, 'Stop');
  assert.equal(view.getByRole('button', { name: 'Retry' }).textContent, 'Retry');
  assert.equal(view.getByRole('button', { name: 'Logs' }).textContent, 'Logs');
});

test('LivePreviewPanel ignores stale stop refreshes after switching surfaces', async (t) => {
  const restoreDom = installDom();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string }> = [];
  let resolveStop: (() => void) | null = null;
  t.after(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    restoreDom();
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ method, url });
    if (url.startsWith('/api/code/live-previews?')) {
      const surfaceId = new URL(`http://localhost${url}`).searchParams.get('surfaceId');
      return jsonResponse({
        previews: surfaceId === 'task-a'
          ? [createPreviewSummary({ previewId: 'preview-a', surfaceId: 'task-a' })]
          : [createPreviewSummary({ previewId: 'preview-b', surfaceId: 'task-b' })],
      });
    }
    if (url === '/api/code/live-previews/preview-a/stop') {
      return new Promise<Response>((resolve) => {
        resolveStop = () => resolve(jsonResponse({
          status: 'accepted',
          previewId: 'preview-a',
          stopReason: 'operator',
        }));
      });
    }
    return jsonResponse({ error: { code: 'not_found' } }, { status: 404 });
  }) as typeof fetch;

  const view = renderLivePreviewPanel({ surfaceKind: 'code_task', surfaceId: 'task-a' });
  assert.equal(await view.findByText('preview-a'), view.getByText('preview-a'));

  await act(async () => {
    fireEvent.click(view.getByRole('button', { name: 'Stop' }));
  });
  await waitFor(() => assert.ok(resolveStop));

  view.rerender(
    <I18nProvider locale="en">
      <LivePreviewPanel surfaceKind="code_task" surfaceId="task-b" />
    </I18nProvider>,
  );
  assert.equal(await view.findByText('preview-b'), view.getByText('preview-b'));

  await act(async () => {
    resolveStop?.();
  });
  await waitFor(() =>
    assert.equal(
      requests.filter((request) =>
        request.method === 'GET'
        && request.url.includes('surfaceId=task-a')).length,
      1,
    ));
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

function installDom(): () => void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  const previousDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const globals: Array<[PropertyKey, unknown]> = [
    ['window', dom.window],
    ['document', dom.window.document],
    ['HTMLElement', dom.window.HTMLElement],
    ['Node', dom.window.Node],
    ['Event', dom.window.Event],
    ['MouseEvent', dom.window.MouseEvent],
    ['KeyboardEvent', dom.window.KeyboardEvent],
    ['MutationObserver', dom.window.MutationObserver],
    ['navigator', dom.window.navigator],
    ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
  ];
  for (const [key, value] of globals) {
    previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
  return () => {
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete (globalThis as Record<PropertyKey, unknown>)[key];
      }
    }
    dom.window.close();
  };
}

function renderLivePreviewPanel(input: {
  surfaceKind: 'code_task' | 'code_codespace';
  surfaceId: string;
}) {
  return render(
    <I18nProvider locale="en">
      <LivePreviewPanel surfaceKind={input.surfaceKind} surfaceId={input.surfaceId} />
    </I18nProvider>,
  );
}

function createPreviewSummary(input: {
  previewId: string;
  surfaceId: string;
}): CodeLivePreviewSummary {
  return {
    previewId: input.previewId,
    commandProfileId: 'vite',
    surface: {
      kind: 'code_task',
      surfaceId: input.surfaceId,
    },
    workspace: {
      id: 'workspace-live',
      rootPath: 'C:/repo/live-preview',
    },
    origin: 'http://127.0.0.1:47100',
    status: 'ready',
    artifactId: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    readyAt: '2026-05-09T00:00:01.000Z',
    expiresAt: '2999-05-09T00:30:00.000Z',
    stoppedAt: null,
    stopReason: null,
    diagnostic: null,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}
