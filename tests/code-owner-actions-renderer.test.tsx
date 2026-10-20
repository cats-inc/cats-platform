import './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { RunExecutionActions } from '../src/products/shared/renderer/RunExecutionActions.tsx';
import { CodespaceActions } from '../src/products/code/renderer/components/workspaces/CodespaceActions.tsx';

test('Code context stops the canonical selected Run and surfaces a provider refusal without hiding it', async t => {
  const oldReact = Object.getOwnPropertyDescriptor(globalThis, 'React'), oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  t.after(() => { cleanup(); globalThis.fetch = oldFetch; if (oldReact) Object.defineProperty(globalThis, 'React', oldReact); else Reflect.deleteProperty(globalThis, 'React'); });
  const client = new QueryClient(); t.after(() => client.clear());
  const calls: Array<{ url: string; body: any }> = [];
  let changed = false;
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), body: JSON.parse(String(options?.body)) }); return new Response(JSON.stringify({ error: { message: 'Runtime cancellation was refused.' } }), { status: 409 }); };
  const view = render(<QueryClientProvider client={client}><MemoryRouter><I18nProvider locale="en"><RunExecutionActions runId="selected-run" status="running" onChanged={() => { changed = true; }} /></I18nProvider></MemoryRouter></QueryClientProvider>);
  await act(async () => { fireEvent.click(view.getByText('Stop')); });
  assert.equal(calls[0].url, '/api/work/runs/selected-run/stop');
  assert.ok(calls[0].body.idempotencyKey);
  assert.ok(view.getByRole('alert').textContent?.includes('refused'));
  assert.equal(changed, false);
  assert.equal(view.getByRole('link').getAttribute('href'), '/work/tasks/orphan/runs/selected-run');
});

test('Codespace removal requires the shared confirmation; Escape cancels and confirmed scope preserves the folder', async t => {
  const oldReact = Object.getOwnPropertyDescriptor(globalThis, 'React'), oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  t.after(() => { cleanup(); globalThis.fetch = oldFetch; if (oldReact) Object.defineProperty(globalThis, 'React', oldReact); else Reflect.deleteProperty(globalThis, 'React'); });
  const commands: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    if (options?.body) commands.push(JSON.parse(String(options.body)));
    return new Response(JSON.stringify(options?.body ? { workspace: { id: 'folder' }, conversations: [], tasks: [], artifacts: [] } : { revision: 3, workspaces: [] }));
  };
  const workspace = { id: 'folder', title: 'Selected folder', path: 'C:/keep', summary: null, status: 'ready' as const, source: 'owner_selected' as const, conversationCount: 0, taskCount: 0, artifactCount: 0, lastActiveAt: '2026-10-20T00:00:00Z', management: { listing: 'visible' as const, pinned: false, revision: 2 } };
  const view = render(<MemoryRouter><I18nProvider locale="en"><CodespaceActions workspace={workspace} /></I18nProvider></MemoryRouter>);
  const remove = 'Remove from Cats · keep folder';
  await act(async () => { fireEvent.click(view.getByText(remove)); });
  assert.equal(commands.length, 0); assert.equal(document.activeElement?.textContent, 'Cancel');
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }); });
  assert.equal(commands.length, 0);
  await act(async () => { fireEvent.click(view.getByText(remove)); });
  await act(async () => { fireEvent.click(view.getAllByText(remove).find(element => element.className === 'confirmDestructiveButton')!); });
  assert.equal(commands.length, 1); assert.equal((commands[0] as { action: string }).action, 'remove');
});
