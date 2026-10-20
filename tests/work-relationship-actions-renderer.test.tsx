import './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { RelationshipActions, OrphanLinkActions } from '../src/products/work/renderer/components/topdown/RelationshipActions.tsx';

test('relationship repair requires a valid explicit target and orphan removal requires a selected-scope preview', async t => {
  const oldReact = Object.getOwnPropertyDescriptor(globalThis, 'React'), oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  t.after(() => { cleanup(); globalThis.fetch = oldFetch; if (oldReact) Object.defineProperty(globalThis, 'React', oldReact); else Reflect.deleteProperty(globalThis, 'React'); });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); t.after(() => client.clear());
  const view = { family: 'work_item', id: 'w', title: 'Work', token: 'anchor-token', blockers: [], fields: [{ field: 'projectId', targetFamily: 'project', current: 'missing', choices: [{ id: 'project', title: 'Replacement project' }] }] };
  const commands: Array<{ url: string; body: any }> = [];
  globalThis.fetch = async (url, options) => {
    if (options?.body) { const body = JSON.parse(String(options.body)); commands.push({ url: String(url), body }); if (body.action === 'preview') return new Response(JSON.stringify({ token: 'orphan-token', items: [{ id: 'orphan', kind: 'blocks', source: 'project:missing', target: 'task:task' }] }), { status: 200 }); }
    return new Response(JSON.stringify(view), { status: 200 });
  };
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><I18nProvider locale="en">{child}</I18nProvider></QueryClientProvider>;
  const ui = render(wrap(<RelationshipActions family="work_item" id="w" />));
  fireEvent.click(ui.getByText('Manage relationships'));
  // Native details toggle is explicit in DOM fixtures.
  const details = ui.getByText('Manage relationships').closest('details')!; details.open = true; fireEvent(details, new Event('toggle'));
  await waitFor(() => assert.ok(ui.getByLabelText('Target')));
  assert.equal((ui.getByText('Apply') as HTMLButtonElement).disabled, true);
  fireEvent.change(ui.getByLabelText('Target'), { target: { value: 'project' } });
  fireEvent.submit(ui.getByText('Apply').closest('form')!);
  await waitFor(() => assert.equal(commands.length, 1));
  assert.deepEqual(commands[0].body, { token: 'anchor-token', field: 'projectId', targetId: 'project' });
  ui.rerender(wrap(<OrphanLinkActions ids={['orphan']} onChanged={() => {}} />));
  assert.equal(ui.queryByText('Apply this cleanup'), null);
  fireEvent.click(ui.getByText('Preview selected orphan links'));
  await waitFor(() => assert.ok(ui.getByText(/project:missing/)));
  assert.match(ui.getByText(/project:missing/).textContent!, /task:task/);
  fireEvent.click(ui.getByText('Apply this cleanup'));
  await waitFor(() => assert.equal(commands.at(-1)?.body.action, 'apply'));
  assert.deepEqual(commands.at(-1)?.body, { action: 'apply', ids: ['orphan'], token: 'orphan-token' });
});
