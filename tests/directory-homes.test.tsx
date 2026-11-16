import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { CatteryHome } from '../src/app/renderer/entities/CatteryHome.tsx';
import { ClowderHome } from '../src/app/renderer/entities/ClowderHome.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import type {
  PlatformDirectoryView,
  PlatformHostEnvelope,
  PlatformLobbyCatSummary,
} from '../src/shared/platform-contract.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const T = '2026-11-02T00:00:00.000Z';

function cat(id: string, name: string): PlatformLobbyCatSummary {
  return { id, name, avatarColor: null, avatarUrl: null, isBoss: false, createdAt: T, defaultExecutionTarget: null, executionLabel: null };
}

const CATS = [cat('mochi', 'Mochi'), cat('tiger', 'Tiger'), cat('tofu', 'Tofu')];

const DIRECTORY: PlatformDirectoryView = {
  catteries: [{
    id: 'acme', name: 'Acme', description: null, domain: null, createdAt: T, updatedAt: T,
    members: [
      { catId: 'mochi', role: 'owner', status: 'formal', joinedAt: T },
      { catId: 'tofu', role: 'member', status: 'external', joinedAt: T },
    ],
  }],
  clowders: [{
    id: 'dev', name: 'Dev', description: null, parentCatteryId: 'acme', createdAt: T, updatedAt: T,
    members: [
      { catId: 'mochi', role: 'lead', status: 'formal', expiresAt: null, joinedAt: T },
      { catId: 'tiger', role: 'member', status: 'temp', expiresAt: '2026-12-31T00:00:00.000Z', joinedAt: T },
    ],
  }],
};

function renderHome(t: TestContext, path: string) {
  resetTestDom();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ directory: DIRECTORY }))) as typeof fetch;
  t.after(() => { cleanup(); resetTestDom(); globalThis.fetch = originalFetch; });
  // Deliberately partial: the homes read the lobby's Cats and group summaries only.
  const envelope = {
    lobby: {
      animationMode: 'reduced',
      cats: CATS,
      clowders: [{ id: 'dev', name: 'Dev', avatarUrl: null, createdAt: T, parentCatteryId: 'acme', catCount: 2, memberCount: 2 }],
      catteries: [{ id: 'acme', name: 'Acme', avatarUrl: null, createdAt: T, memberCount: 2, clowderCount: 1, catCount: 3 }],
    },
  } as unknown as PlatformHostEnvelope;
  return render(
    <I18nProvider locale="en">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/entities/clowders/:clowderId" element={<ClowderHome envelope={envelope} />} />
          <Route path="/entities/catteries/:catteryId" element={<CatteryHome envelope={envelope} />} />
          <Route path="/entities/catteries/:catteryId/:tab" element={<CatteryHome envelope={envelope} />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

test('a Clowder home lists its Cats with their role and any non-formal status', async (t) => {
  const view = renderHome(t, '/entities/clowders/dev');
  await waitFor(() => view.getByText('Tiger'));
  assert.ok(view.getByText('Lead'));
  assert.ok(view.getByText('Temporary until 12/31/2026'));
  assert.equal(view.queryByText('Formal'), null);
});

test('a Cattery home lists direct members, its Clowders, and every Cat once with where it comes from', async (t) => {
  const members = renderHome(t, '/entities/catteries/acme');
  await waitFor(() => members.getByText('Owner'));
  assert.ok(members.getByText('External'));
  assert.equal(members.queryByText('Tiger'), null);
  cleanup();

  const clowders = renderHome(t, '/entities/catteries/acme/clowders');
  const link = await waitFor(() => clowders.getByRole('link', { name: /Dev/u }));
  assert.equal(link.getAttribute('href'), '/entities/clowders/dev');
  assert.ok(clowders.getByText('2 cats'));
  cleanup();

  const cats = renderHome(t, '/entities/catteries/acme/cats');
  await waitFor(() => cats.getByText('Through Dev'));
  assert.deepEqual(
    [...cats.container.querySelectorAll('.directoryMemberName')].map((node) => node.textContent),
    ['Mochi', 'Tofu', 'Tiger'],
  );
  assert.equal(cats.getAllByText('Direct member').length, 2);
});
