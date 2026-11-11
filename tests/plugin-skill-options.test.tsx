import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PluginSkillOptions } from '../src/app/renderer/settings/PluginSkillOptions.tsx';
import { PlatformSettingsPlugins } from '../src/app/renderer/settings/PlatformSettingsPlugins.tsx';
import { AGENCY_PLUGIN, type PluginInventory } from '../src/shared/managedPlugins.ts';

function setup(t: TestContext, phase: 'absent' | 'installed' | 'enabled') {
  resetTestDom();
  const inventory: PluginInventory = {
    policyEnabled: true, revision: 1, installed: phase !== 'absent', phase,
    desired: phase === 'enabled' ? 'enabled' : phase === 'installed' ? 'disabled' : 'removed',
    observation: null,
    availableSkills: phase === 'enabled' ? [...AGENCY_PLUGIN.skills] : [],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(inventory);
  t.after(() => { cleanup(); resetTestDom(); globalThis.fetch = originalFetch; });
  return inventory;
}

for (const phase of ['absent', 'installed'] as const) {
  test(`Directory cannot select Agency skills while the package is ${phase}`, async (t) => {
    setup(t, phase);
    const changes: string[] = [];
    const view = render(<PluginSkillOptions value={AGENCY_PLUGIN.skills[0].id} provider="codex"
      disabled={false} onChange={id => changes.push(id)} />);
    // Drain the inventory response before a negative assertion. Async act leaks
    // MessageChannel ports in this repo's React 18 ESM test bundles.
    for (let turn = 0; turn < 5; turn++) await nextTurn();
    act(() => {});
    if (phase === 'absent') assert.equal(view.container.textContent, '');
    else await waitFor(() => assert.match(view.container.textContent ?? '', /Plugin is unavailable/));
    assert.equal(view.queryAllByRole('button').length, 0);
    assert.deepEqual(changes, []);
  });
}

test('Directory offers the enabled package skills for explicit per-Cat selection', async (t) => {
  setup(t, 'enabled');
  const changes: string[] = [];
  const view = render(<PluginSkillOptions provider="codex" disabled={false} onChange={id => changes.push(id)} />);
  const reviewer = await view.findByRole('button', { name: 'Agency Code Reviewer' });
  fireEvent.click(reviewer);
  fireEvent.click(view.getByRole('button', { name: 'Agency UX Researcher' }));
  assert.deepEqual(changes, AGENCY_PLUGIN.skills.map(skill => skill.id) as string[]);
  assert.match(view.container.textContent ?? '', /supplied as instructions/);
  view.rerender(<PluginSkillOptions provider="codex" value={AGENCY_PLUGIN.skills[1].id}
    disabled={false} onChange={id => changes.push(id)} />);
  const researcher = view.getByRole('button', { name: 'Agency UX Researcher' });
  assert.equal(researcher.getAttribute('aria-pressed'), 'true');
  fireEvent.click(researcher);
  assert.equal(changes.at(-1), 'chat-default');
});

test('installed Agency skills cannot be selected for an unsupported provider', async (t) => {
  setup(t, 'enabled');
  const view = render(<PluginSkillOptions provider="gemini" disabled={false} onChange={() => assert.fail()} />);
  await waitFor(() => assert.match(view.container.textContent ?? '', /Codex and Claude/));
  assert.equal(view.queryAllByRole('button').length, 0);
});

test('preview Settings installs its bundled package with one click before offering Cat selection', async (t) => {
  const inventory = setup(t, 'absent');
  inventory.bundledInstallAvailable = true;
  const calls: Array<{ path: string; body: unknown }> = [];
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'POST') {
      calls.push({ path: String(url), body: JSON.parse(String(init.body)) });
      Object.assign(inventory, { installed: true, desired: 'enabled', phase: 'enabled', revision: 3,
        availableSkills: [...AGENCY_PLUGIN.skills] });
    }
    return Response.json(inventory);
  };
  const view = render(<MemoryRouter><PlatformSettingsPlugins /></MemoryRouter>);
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled, false));
  assert.equal(view.container.querySelector('input[type="file"]'), null);
  assert.equal(view.queryByText('Agency Code Reviewer'), null);
  fireEvent.click(view.getByRole('button', { name: 'Install' }));
  assert.ok(await view.findByRole('link', { name: 'Choose skills for a Cat' }));
  assert.deepEqual(calls, [{ path: '/api/plugins/install-bundled', body: { revision: 1, confirmedSessions: [], confirmedRuns: [] } }]);
});

test('Settings describes an uninstalled package without advertising assignable skills', async (t) => {
  setup(t, 'absent');
  const view = render(<MemoryRouter><PlatformSettingsPlugins /></MemoryRouter>);
  await waitFor(() => assert.match(view.container.textContent ?? '', /Status: Not installed/));
  assert.match(view.container.textContent ?? '', /Plugins are not installed by default/);
  assert.equal(view.queryByText('Agency Code Reviewer'), null);
  assert.equal(view.queryByRole('link', { name: 'Choose skills for a Cat' }), null);
  assert.ok((view.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled);
});

test('Settings links to per-Cat selection after the package is enabled', async (t) => {
  setup(t, 'enabled');
  const view = render(<MemoryRouter><PlatformSettingsPlugins /></MemoryRouter>);
  assert.ok(await view.findByRole('link', { name: 'Choose skills for a Cat' }));
  assert.ok(view.getByText('Agency Code Reviewer'));
  assert.ok(view.getByText('Agency UX Researcher'));
});
