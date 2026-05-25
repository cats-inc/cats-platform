import assert from 'node:assert/strict';
import test from 'node:test';

import {
  act,
  cleanup,
  render,
  waitFor,
} from '@testing-library/react';
import { JSDOM } from 'jsdom';
import React from 'react';
import {
  MemoryRouter,
  Routes,
} from 'react-router-dom';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import type {
  ArtifactCanvasProjection,
} from '../src/products/shared/artifactCanvas/contracts.ts';

class FakeEventSource {
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  closed = false;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly url: string) {}

  addEventListener(event: string, listener: (event: MessageEvent) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  removeEventListener(event: string, listener: (event: MessageEvent) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter((candidate) => candidate !== listener),
    );
  }

  emit(event: string, data: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  close(): void {
    this.closed = true;
  }
}

test('Artifact Canvas refreshes a mounted projection after two artifact subscription patches', async () => {
  const eventSources: FakeEventSource[] = [];
  const restoreDom = installDom(eventSources);
  const originalFetch = globalThis.fetch;
  const projectionFetches: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    projectionFetches.push(url);
    const title = `Artifact version ${projectionFetches.length}`;
    return jsonResponse(createProjection(title, `content ${projectionFetches.length}`));
  }) as typeof fetch;

  const { withSharedViewerRoutes } = await import(
    '../src/products/shared/renderer/withSharedViewerRoutes.tsx'
  );

  try {
    const view = render(
      <I18nProvider locale="en">
        <MemoryRouter initialEntries={['/code/tasks/task-canvas/canvas/artifact-1']}>
          <Routes>
            {withSharedViewerRoutes({
              key: 'task-detail',
              path: '/code/tasks/:taskId',
              surfaceKind: 'code_task',
              surfaceIdParam: 'taskId',
              element: <div>Parent task surface</div>,
            })}
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    assert.equal(await view.findByText('Artifact version 1'), view.getByText('Artifact version 1'));
    await waitFor(() => {
      assert.ok(eventSources.some((source) =>
        source.url === '/api/subscribe?kind=artifact&id=artifact-1'));
    });
    const artifactSource = eventSources.find((source) =>
      source.url === '/api/subscribe?kind=artifact&id=artifact-1');
    assert.ok(artifactSource);

    act(() => {
      artifactSource.emit('snapshot', createArtifactSnapshot('artifact-1'));
    });
    assert.deepEqual(projectionFetches, [
      '/api/canvas/code_task/task-canvas/artifacts/artifact-1',
    ]);

    act(() => {
      artifactSource.emit('patch', createArtifactUpdatedPatch('artifact-1'));
    });
    assert.equal(await view.findByText('Artifact version 2'), view.getByText('Artifact version 2'));

    act(() => {
      artifactSource.emit('patch', createArtifactUpdatedPatch('artifact-1'));
    });
    assert.equal(await view.findByText('Artifact version 3'), view.getByText('Artifact version 3'));
    assert.deepEqual(projectionFetches, [
      '/api/canvas/code_task/task-canvas/artifacts/artifact-1',
      '/api/canvas/code_task/task-canvas/artifacts/artifact-1',
      '/api/canvas/code_task/task-canvas/artifacts/artifact-1',
    ]);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
    restoreDom();
  }
});

function installDom(eventSources: FakeEventSource[]): () => void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  const EventSourceCtor = class extends FakeEventSource {
    constructor(url: string) {
      super(url);
      eventSources.push(this);
    }
  };
  const previousDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const globals: Array<[PropertyKey, unknown]> = [
    ['window', dom.window],
    ['document', dom.window.document],
    ['HTMLElement', dom.window.HTMLElement],
    ['Node', dom.window.Node],
    ['Event', dom.window.Event],
    ['MessageEvent', dom.window.MessageEvent],
    ['MouseEvent', dom.window.MouseEvent],
    ['KeyboardEvent', dom.window.KeyboardEvent],
    ['MutationObserver', dom.window.MutationObserver],
    ['navigator', dom.window.navigator],
    ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
    ['EventSource', EventSourceCtor],
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

function createArtifactSnapshot(artifactId: string) {
  const artifact = createProjection('Snapshot artifact', 'snapshot content').artifact;
  return {
    kind: 'artifact',
    id: artifactId,
    version: 1,
    state: { artifact },
  };
}

function createArtifactUpdatedPatch(artifactId: string) {
  return {
    kind: 'artifact',
    id: artifactId,
    version: 1,
    patch: {
      kind: 'artifact.updated',
      artifactId,
    },
  };
}

function createProjection(title: string, textContent: string): ArtifactCanvasProjection {
  return {
    surface: { kind: 'code_task', surfaceId: 'task-canvas' },
    artifact: {
      id: 'artifact-1',
      title,
      kind: 'document',
      status: 'ready',
      summary: null,
      path: null,
      mimeType: 'text/plain',
      sizeBytes: null,
      updatedAt: '2026-05-09T00:00:00.000Z',
    },
    presentationRequested: 'auto',
    presentationResolved: 'code',
    iframeSandboxProfile: {
      name: 'static',
      sandbox: '',
      referrerPolicy: 'no-referrer',
      allow: '',
    },
    safeUrl: null,
    externalUrl: null,
    textContent,
    policyVersion: 'policy-v1',
    error: null,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}
