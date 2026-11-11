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
    const view = render(<PluginSkillOptions value={AGENCY_PLUGIN.skills[0].id}
      disabled={false} onChange={id => changes.push(id)} />);
    // Drain the inventory response before a negative assertion. Async act leaks
    // MessageChannel ports in this repo's React 18 ESM test bundles.
    for (let turn = 0; turn < 5; turn++) await nextTurn();
    act(() => {});
    await waitFor(() => assert.match(view.container.textContent ?? '', /Plugin is unavailable/));
    assert.equal(view.queryAllByRole('button').length, 0);
    assert.deepEqual(changes, []);
  });
}

test('Directory offers the enabled package skills for explicit per-Cat selection', async (t) => {
  setup(t, 'enabled');
  const changes: string[] = [];
  const view = render(<PluginSkillOptions disabled={false} onChange={id => changes.push(id)} />);
  const reviewer = await view.findByRole('button', { name: 'Agency Code Reviewer' });
  fireEvent.click(reviewer);
  fireEvent.click(view.getByRole('button', { name: 'Agency UX Researcher' }));
  assert.deepEqual(changes, AGENCY_PLUGIN.skills.map(skill => skill.id));
  assert.match(view.container.textContent ?? '', /supplied as instructions/);
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
