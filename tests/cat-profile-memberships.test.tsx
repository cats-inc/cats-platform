import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { CatMemberships } from '../src/app/renderer/entities/CatMemberships.tsx';
import { DirectoryRequestError, type DirectoryLoadState } from '../src/app/renderer/entities/directoryApi.ts';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';
import type { PlatformDirectoryView } from '../src/shared/platform-contract.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const T = '2026-11-02T00:00:00.000Z';
const NOW = new Date('2026-11-16T12:00:00.000Z');

const DIRECTORY: PlatformDirectoryView = {
  catteries: [
    {
      id: 'acme', name: 'Acme', description: null, domain: null, createdAt: T, updatedAt: T,
      members: [{ catId: 'tofu', role: 'member', status: 'formal', joinedAt: T }],
    },
    {
      id: 'beta', name: 'Beta', description: null, domain: null, createdAt: T, updatedAt: T,
      members: [{ catId: 'mochi', role: 'admin', status: 'external', joinedAt: T }],
    },
  ],
  clowders: [
    {
      id: 'dev', name: 'Dev', description: null, parentCatteryId: 'acme', createdAt: T, updatedAt: T,
      members: [{ catId: 'mochi', role: 'lead', status: 'formal', expiresAt: null, joinedAt: T }],
    },
    {
      id: 'night', name: 'Night shift', description: null, parentCatteryId: null, createdAt: T, updatedAt: T,
      members: [{ catId: 'mochi', role: 'member', status: 'temp', expiresAt: '2026-11-10T00:00:00.000Z', joinedAt: T }],
    },
    {
      id: 'ops', name: 'Ops', description: null, parentCatteryId: null, createdAt: T, updatedAt: T,
      members: [{ catId: 'tofu', role: 'member', status: 'formal', expiresAt: null, joinedAt: T }],
    },
  ],
};

function renderTags(t: TestContext, state: DirectoryLoadState, catId = 'mochi', onRetry = () => {}) {
  resetTestDom();
  t.after(() => { cleanup(); resetTestDom(); });
  return render(
    <I18nProvider locale="en">
      <MemoryRouter>
        <CatMemberships state={state} catId={catId} onRetry={onRetry} now={NOW} />
      </MemoryRouter>
    </I18nProvider>,
  );
}

test('a Cat profile lists its Catteries, then its Clowders, each with its role and status, linking to the group', (t) => {
  const view = renderTags(t, { status: 'ready', directory: DIRECTORY });
  const links = view.getAllByRole('link');
  assert.deepEqual(links.map((link) => link.getAttribute('aria-label')), [
    'Cattery Beta: Admin, External',
    'Clowder Dev in Acme: Lead, Formal',
    'Clowder Night shift: Member, Temporary, ended 11/10/2026',
  ]);
  assert.deepEqual(links.map((link) => link.getAttribute('href')), [
    '/entities/catteries/beta',
    '/entities/clowders/dev',
    '/entities/clowders/night',
  ]);
  // A passed end date stays visible (SPEC-103 FR-23); a formal status gets no chip.
  assert.ok(view.getByText('Temporary, ended 11/10/2026'));
  assert.ok(view.getByText('External'));
  assert.equal(view.queryByText('Formal'), null);
  assert.ok(view.getByText('Lead'));
});

test('a Cattery is listed only for its own membership, not because the Cat is in one of its Clowders', (t) => {
  const view = renderTags(t, { status: 'ready', directory: DIRECTORY });
  // Mochi leads Dev, which is in Acme, but is not a member of Acme (SPEC-103 FR-16).
  assert.equal(view.queryByRole('link', { name: /^Cattery Acme/ }), null);
  assert.equal(view.queryByText('Ops'), null);
});

test('a Cat in no group shows nothing, and so does a directory still loading', (t) => {
  const none = renderTags(t, { status: 'ready', directory: DIRECTORY }, 'nobody');
  assert.equal(none.container.innerHTML, '');
  cleanup();
  const loading = renderTags(t, { status: 'loading' });
  assert.equal(loading.container.innerHTML, '');
});

test('a failed read says so and offers a retry, so it never reads as being in no group', (t) => {
  let retries = 0;
  const view = renderTags(
    t,
    { status: 'error', error: new DirectoryRequestError('request_failed', 'offline', 0) },
    'mochi',
    () => { retries += 1; },
  );
  assert.match(view.getByRole('alert').textContent ?? '', /Clowders and Catteries could not be loaded: offline/);
  fireEvent.click(view.getByRole('button', { name: 'Try again' }));
  assert.equal(retries, 1);
});
