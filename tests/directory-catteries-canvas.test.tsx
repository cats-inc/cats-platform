import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { CatteriesCanvasPage } from '../src/app/renderer/entities/CatteriesCanvas.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import type {
  PlatformDirectoryView,
  PlatformHostEnvelope,
  PlatformLobbyCatSummary,
} from '../src/shared/platform-contract.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

function cat(id: string, name: string): PlatformLobbyCatSummary {
  return {
    id, name, avatarColor: null, avatarUrl: null, isBoss: false, createdAt: '2026-11-01T00:00:00.000Z',
    defaultExecutionTarget: null, executionLabel: null,
  };
}

const CATS = [cat('mochi', 'Mochi'), cat('tiger', 'Tiger'), cat('tofu', 'Tofu'), cat('lynx', 'Lynx')];
const T = '2026-11-02T00:00:00.000Z';

function seed(): PlatformDirectoryView {
  return {
    catteries: [{
      id: 'acme', name: 'Acme', description: null, domain: 'acme.com', createdAt: T, updatedAt: T,
      members: [
        { catId: 'mochi', role: 'owner', status: 'formal', joinedAt: T },
        { catId: 'tofu', role: 'member', status: 'external', joinedAt: T },
        { catId: 'lynx', role: 'member', status: 'formal', joinedAt: T },
      ],
    }],
    clowders: [
      {
        id: 'dev', name: 'Dev', description: null, parentCatteryId: 'acme', createdAt: T, updatedAt: T,
        members: [
          { catId: 'mochi', role: 'lead', status: 'formal', expiresAt: null, joinedAt: T },
          { catId: 'tiger', role: 'member', status: 'temp', expiresAt: '2026-12-31T00:00:00.000Z', joinedAt: T },
        ],
      },
      {
        id: 'ops', name: 'Ops', description: null, parentCatteryId: 'acme', createdAt: '2026-11-03T00:00:00.000Z', updatedAt: T,
        members: [{ catId: 'mochi', role: 'member', status: 'formal', expiresAt: null, joinedAt: T }],
      },
    ],
  };
}

/** Answers every call with the seeded directory and records the changes asked for. */
function installFakeApi(t: TestContext) {
  const directory = seed();
  const writes: Array<{ method: string; url: string; body: unknown }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') writes.push({ method, url: input, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify({ directory }));
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  return writes;
}

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderCanvas(t: TestContext, path = '/entities/catteries') {
  resetTestDom();
  // jsdom has no DragEvent; a MouseEvent carries the modifier keys a drag reads.
  (window as unknown as { DragEvent: typeof MouseEvent }).DragEvent = window.MouseEvent;
  t.after(() => { cleanup(); resetTestDom(); });
  // Deliberately partial: the canvas reads only the lobby's Cats from the envelope.
  const envelope = { lobby: { animationMode: 'reduced', cats: CATS } } as unknown as PlatformHostEnvelope;
  const page = <CatteriesCanvasPage envelope={envelope} />;
  return render(
    <I18nProvider locale="en">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/entities/catteries" element={page} />
          <Route path="/entities/catteries/new" element={page} />
          <Route path="/entities/catteries/:catteryId/settings" element={page} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    </I18nProvider>,
  );
}

function dataTransfer() {
  return { setData() {}, getData() { return ''; }, effectAllowed: 'all', dropEffect: 'none' };
}

function cardIn(view: ReturnType<typeof render>, column: string, name: string): HTMLElement {
  const columnElement = view.getByLabelText(column, { selector: '.directoryBoardColumn' });
  return within(columnElement).getByText(name, { selector: '.directoryBoardCardName' }).closest('.directoryBoardCard') as HTMLElement;
}

function drag(view: ReturnType<typeof render>, from: [string, string], to: string, init: { ctrlKey?: boolean } = {}) {
  const transfer = dataTransfer();
  const target = view.getByLabelText(to, { selector: '.directoryBoardColumn' });
  fireEvent.dragStart(cardIn(view, from[0], from[1]), { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer, ...init });
  fireEvent.drop(target, { dataTransfer: transfer, ...init });
}

test('the Cattery canvas lists formal direct members first and lays out the org chart', async (t) => {
  installFakeApi(t);
  const view = renderCanvas(t);
  await waitFor(() => assert.equal(view.getByTestId('path').textContent, '/entities/catteries/acme/settings'));
  await waitFor(() => view.getByText('acme.com', { selector: '.directoryChip' }));
  const members = view.getByText('Direct members').closest('.directoryMembersCard') as HTMLElement;
  assert.ok(within(members).getByText('Mochi'));
  assert.equal(within(members).queryByText('Tofu'), null);
  fireEvent.click(within(members).getByRole('button', { name: /^External/u }));
  assert.ok(within(members).getByText('Tofu'));

  const lane = view.getByLabelText('Not in a Clowder', { selector: '.directoryBoardColumn' });
  assert.deepEqual(within(lane).getAllByText(/./u, { selector: '.directoryBoardCardName' }).map((node) => node.textContent), ['Tofu', 'Lynx']);
  assert.ok(cardIn(view, 'Dev', 'Tiger'));
  assert.ok(view.getByRole('link', { name: 'New Clowder in Acme' }));
});

test('dragging moves, the copy key also adds, the lane takes a Cat out, and a duplicate drop asks nothing', async (t) => {
  const writes = installFakeApi(t);
  const view = renderCanvas(t, '/entities/catteries/acme/settings');
  await waitFor(() => cardIn(view, 'Dev', 'Tiger'));

  drag(view, ['Dev', 'Tiger'], 'Ops');
  await waitFor(() => assert.equal(writes.length, 1));
  drag(view, ['Dev', 'Tiger'], 'Ops', { ctrlKey: true });
  await waitFor(() => assert.equal(writes.length, 2));
  drag(view, ['Dev', 'Tiger'], 'Not in a Clowder');
  await waitFor(() => assert.equal(writes.length, 3));
  drag(view, ['Not in a Clowder', 'Tofu'], 'Dev');
  await waitFor(() => assert.equal(writes.length, 4));
  drag(view, ['Dev', 'Mochi'], 'Ops');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.deepEqual(writes, [
    { method: 'POST', url: '/api/platform/clowders/dev/members/tiger/move', body: { toClowderId: 'ops' } },
    { method: 'POST', url: '/api/platform/clowders/ops/members', body: { catId: 'tiger', status: 'temp', expiresAt: '2026-12-31T00:00:00.000Z' } },
    { method: 'DELETE', url: '/api/platform/clowders/dev/members/tiger', body: undefined },
    { method: 'POST', url: '/api/platform/clowders/dev/members', body: { catId: 'tofu', status: 'external', expiresAt: null } },
  ]);
});

test('a card’s ⋯ adds a Cat in no Clowder through a dialog', async (t) => {
  const writes = installFakeApi(t);
  const view = renderCanvas(t, '/entities/catteries/acme/settings');
  fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'Move Lynx' })));
  const dialog = view.getByRole('dialog', { name: 'Add Lynx to a Clowder' });
  assert.equal(within(dialog).queryByRole('group', { name: 'How to move' }), null);
  fireEvent.click(within(dialog).getByRole('radio', { name: /Ops/u }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add to “Ops”' }));
  await waitFor(() => assert.equal(writes.length, 1));
  assert.deepEqual(writes[0], {
    method: 'POST', url: '/api/platform/clowders/ops/members', body: { catId: 'lynx', status: 'formal', expiresAt: null },
  });
});

test('deleting a Cattery says its Cats and Clowders stay', async (t) => {
  const writes = installFakeApi(t);
  const view = renderCanvas(t, '/entities/catteries/acme/settings');
  fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'Delete' })));
  const dialog = view.getByRole('dialog');
  assert.ok(within(dialog).getByText('Its 4 cats and 2 Clowders stay; they just no longer belong to Acme.'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Cattery' }));
  await waitFor(() => assert.equal(writes.length, 1));
  assert.deepEqual(writes[0], { method: 'DELETE', url: '/api/platform/catteries/acme', body: undefined });
});
