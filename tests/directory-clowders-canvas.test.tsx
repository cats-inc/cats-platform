import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { ClowdersCanvasPage } from '../src/app/renderer/entities/ClowdersCanvas.tsx';
import { MembershipStatusChip } from '../src/app/renderer/entities/directoryParts.tsx';
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

const CATS = [cat('mochi', 'Mochi'), cat('tiger', 'Tiger'), cat('tofu', 'Tofu')];

function seed(): PlatformDirectoryView {
  return {
    catteries: [{
      id: 'acme', name: 'Acme', description: null, domain: null,
      createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', members: [],
    }],
    clowders: [
      {
        id: 'dev', name: 'Dev', description: null, parentCatteryId: 'acme',
        createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z',
        members: [
          { catId: 'mochi', role: 'lead', status: 'formal', expiresAt: null, joinedAt: '2026-11-02T00:00:00.000Z' },
          { catId: 'tiger', role: 'member', status: 'temp', expiresAt: '2026-12-31T00:00:00.000Z', joinedAt: '2026-11-02T00:00:00.000Z' },
        ],
      },
      {
        id: 'phoenix', name: 'Phoenix', description: null, parentCatteryId: null,
        createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z', members: [],
      },
    ],
  };
}

interface Recorded { method: string; url: string; body: unknown }

/** A stand-in for the Directory API that applies the few changes these tests make. */
function installFakeApi(t: TestContext, options: { failRead?: boolean } = {}) {
  let directory = seed();
  const requests: Recorded[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, url: input, body });
    if (options.failRead && method === 'GET') {
      return new Response(JSON.stringify({ error: { code: 'directory_unreadable', message: 'broken' } }), { status: 500 });
    }
    const memberMatch = /\/api\/platform\/clowders\/([^/]+)\/members\/([^/]+)(\/move)?$/u.exec(input);
    if (method === 'POST' && input === '/api/platform/clowders') {
      directory = { ...directory, clowders: [...directory.clowders, {
        id: 'clowder-new', name: body.name, description: body.description, parentCatteryId: body.parentCatteryId,
        createdAt: '2026-11-04T00:00:00.000Z', updatedAt: '2026-11-04T00:00:00.000Z',
        members: body.members.map((member: { catId: string }) => ({
          catId: member.catId, role: 'member', status: 'formal', expiresAt: null, joinedAt: '2026-11-04T00:00:00.000Z',
        })),
      }] };
    } else if (memberMatch?.[3] && method === 'POST') {
      const [, from, catId] = memberMatch;
      const moved = directory.clowders.find((clowder) => clowder.id === from)!.members.find((member) => member.catId === catId)!;
      directory = { ...directory, clowders: directory.clowders.map((clowder) => clowder.id === from
        ? { ...clowder, members: clowder.members.filter((member) => member.catId !== catId) }
        : clowder.id === body.toClowderId ? { ...clowder, members: [...clowder.members, { ...moved, role: 'member' }] } : clowder) };
    } else if (memberMatch && method === 'PATCH') {
      const [, clowderId, catId] = memberMatch;
      directory = { ...directory, clowders: directory.clowders.map((clowder) => clowder.id !== clowderId ? clowder : {
        ...clowder, members: clowder.members.map((member) => member.catId === catId ? { ...member, ...body } : member),
      }) };
    } else if (method === 'DELETE' && /\/api\/platform\/clowders\/[^/]+$/u.test(input)) {
      const id = decodeURIComponent(input.split('/').pop()!);
      directory = { ...directory, clowders: directory.clowders.filter((clowder) => clowder.id !== id) };
    }
    return new Response(JSON.stringify({ directory }), { status: method === 'POST' && input === '/api/platform/clowders' ? 201 : 200 });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  return { requests, writes: () => requests.filter((request) => request.method !== 'GET') };
}

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="path">{location.pathname}</output>;
}

function renderCanvas(t: TestContext, path: string) {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  // Deliberately partial: the canvas reads only the lobby's Cats from the envelope.
  const envelope = { lobby: { animationMode: 'reduced', cats: CATS } } as unknown as PlatformHostEnvelope;
  const page = <ClowdersCanvasPage envelope={envelope} />;
  return render(
    <I18nProvider locale="en">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/entities/clowders" element={page} />
          <Route path="/entities/clowders/new" element={page} />
          <Route path="/entities/clowders/:clowderId/settings" element={page} />
        </Routes>
        <CurrentPath />
      </MemoryRouter>
    </I18nProvider>,
  );
}

test('the canvas opens the first Clowder and groups the strip by Cattery', async (t) => {
  installFakeApi(t);
  const view = renderCanvas(t, '/entities/clowders');
  await waitFor(() => assert.equal(view.getByTestId('path').textContent, '/entities/clowders/dev/settings'));
  await waitFor(() => view.getByText('Part of Acme'));
  const strip = view.getByRole('navigation', { name: 'Choose a Clowder' });
  assert.ok(within(strip).getByText('Acme'));
  assert.ok(within(strip).getByText('Cross-unit task force'));
  assert.ok(view.getByText('Temporary until 12/31/2026'));
  assert.equal(view.getByDisplayValue('Dev').tagName, 'INPUT');
});

test('creating a Clowder sends its Cattery and first members, then selects it', async (t) => {
  const api = installFakeApi(t);
  const view = renderCanvas(t, '/entities/clowders/new');
  const name = await waitFor(() => view.getByLabelText('Name') as HTMLInputElement);
  fireEvent.change(name, { target: { value: 'Design' } });
  fireEvent.click(view.getByRole('radio', { name: /Acme/u }));
  fireEvent.click(view.getByRole('button', { name: 'Tofu' }));
  fireEvent.click(view.getByRole('button', { name: 'Save Clowder' }));
  await waitFor(() => assert.equal(view.getByTestId('path').textContent, '/entities/clowders/clowder-new/settings'));
  assert.deepEqual(api.writes(), [{
    method: 'POST', url: '/api/platform/clowders',
    body: { name: 'Design', description: null, parentCatteryId: 'acme', members: [{ catId: 'tofu' }] },
  }]);
});

test('a member menu changes the status and moves the Cat in one request', async (t) => {
  const api = installFakeApi(t);
  const view = renderCanvas(t, '/entities/clowders/dev/settings');
  fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'More actions for Tiger' })));
  fireEvent.click(view.getByRole('button', { name: 'External' }));
  await waitFor(() => view.getByText('External', { selector: '.directoryStatusChip' }));

  // The menu stays open after a status change.
  fireEvent.click(view.getByRole('menuitem', { name: 'Move to another Clowder…' }));
  const dialog = view.getByRole('dialog', { name: 'Move Tiger' });
  fireEvent.click(within(dialog).getByRole('radio', { name: /Phoenix/u }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Move to “Phoenix”' }));
  await waitFor(() => view.getByText('Moved Tiger to “Phoenix”'));
  assert.deepEqual(api.writes(), [
    { method: 'PATCH', url: '/api/platform/clowders/dev/members/tiger', body: { status: 'external' } },
    { method: 'POST', url: '/api/platform/clowders/dev/members/tiger/move', body: { toClowderId: 'phoenix' } },
  ]);
  assert.equal(view.queryByRole('button', { name: 'More actions for Tiger' }), null);
});

test('deleting a Clowder says its Cats stay, then opens the next Clowder', async (t) => {
  const api = installFakeApi(t);
  const view = renderCanvas(t, '/entities/clowders/dev/settings');
  fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'Delete' })));
  const dialog = view.getByRole('dialog');
  assert.ok(within(dialog).getByText('Its 2 cats stay; they just leave this Clowder.'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Clowder' }));
  await waitFor(() => assert.equal(view.getByTestId('path').textContent, '/entities/clowders/phoenix/settings'));
  assert.deepEqual(api.writes(), [{ method: 'DELETE', url: '/api/platform/clowders/dev', body: undefined }]);
});

test('an unreadable directory file is reported with a retry, not shown as empty', async (t) => {
  installFakeApi(t, { failRead: true });
  const view = renderCanvas(t, '/entities/clowders');
  await waitFor(() => view.getByText('The Clowder and Cattery file could not be read. It was left unchanged.'));
  assert.ok(view.getByRole('button', { name: 'Try again' }));
  assert.equal(view.queryByRole('navigation', { name: 'Choose a Clowder' }), null);
});

test('typing an end date saves nothing until the field is left, then saves the whole date once', async (t) => {
  const api = installFakeApi(t);
  const view = renderCanvas(t, '/entities/clowders/dev/settings');
  fireEvent.click(await waitFor(() => view.getByRole('button', { name: 'More actions for Tiger' })));
  const field = view.getByLabelText('End date') as HTMLInputElement;
  assert.equal(field.value, '2026-12-31');
  fireEvent.change(field, { target: { value: '2027-01-15' } });
  assert.deepEqual(api.writes(), []);
  assert.equal(field.disabled, false);
  fireEvent.blur(field);
  await waitFor(() => assert.equal(api.writes().length, 1));
  assert.deepEqual(api.writes(), [
    { method: 'PATCH', url: '/api/platform/clowders/dev/members/tiger', body: { expiresAt: '2027-01-15' } },
  ]);
});

test('a temporary member is still in on their end date and ends the day after', (t) => {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  const chip = (now: string) => render(
    <I18nProvider locale="en">
      <MembershipStatusChip status="temp" expiresAt="2026-12-31T00:00:00.000Z" now={new Date(now)} />
    </I18nProvider>,
  ).container.textContent;
  assert.equal(chip('2026-12-31T20:00:00.000Z'), 'Temporary until 12/31/2026');
  assert.equal(chip('2027-01-01T00:00:00.000Z'), 'Temporary, ended 12/31/2026');
});
