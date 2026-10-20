import './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { HistoryActions } from '../src/products/work/renderer/components/runs/HistoryActions.tsx';

test('history actions preview exact expanded scope, reject stale apply, and discard an in-flight preview after selection changes', async t => {
  const oldReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  const oldFetch = globalThis.fetch;
  t.after(() => { cleanup(); globalThis.fetch = oldFetch; if (oldReact) Object.defineProperty(globalThis, 'React', oldReact); else Reflect.deleteProperty(globalThis, 'React'); });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  t.after(() => client.clear());
  const calls: Array<{ url: string; body: any }> = [];
  const preview = { subjects: [{ family: 'run', id: 'parent' }, { family: 'run', id: 'child' }], scope: 'logs', token: 'snapshot-token', detailRecords: 2, retainedResources: [], estimatedBytes: null,
    items: [{ family: 'run', id: 'parent', title: 'Parent', outcome: 'compacted', reasons: [] }, { family: 'run', id: 'child', title: 'Child', outcome: 'retained', reasons: ['Required output remains.'] }] };
  let delayed: ((response: Response) => void) | undefined;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    if (calls.length === 3) return new Promise<Response>(resolve => { delayed = resolve; });
    return new Response(JSON.stringify(String(url).endsWith('/apply') ? { error: { message: 'History changed. Preview again.' } } : preview), { status: String(url).endsWith('/apply') ? 409 : 200, headers: { 'content-type': 'application/json' } });
  };
  const tree = (id: string) => <QueryClientProvider client={client}><I18nProvider locale="en"><HistoryActions subjects={[{ family: 'run', id }]} revision={3} /></I18nProvider></QueryClientProvider>;
  const view = render(tree('parent'));
  assert.equal(view.queryByText('Apply this cleanup'), null);
  await act(async () => { fireEvent.click(view.getByText('Preview cleanup')); });
  assert.ok(view.getByText('Required output remains.'));
  assert.equal(document.activeElement?.getAttribute('aria-label'), 'Preview cleanup');
  await act(async () => { fireEvent.click(view.getByText('Apply this cleanup')); });
  assert.deepEqual(calls[1].body, preview);
  assert.ok(view.getByRole('alert').textContent?.includes('History changed'));
  assert.equal(view.queryByText('Apply this cleanup'), null);
  await act(async () => { fireEvent.click(view.getByText('Preview cleanup')); });
  view.rerender(tree('other'));
  await act(async () => { delayed!(new Response(JSON.stringify(preview), { status: 200 })); });
  assert.equal(view.queryByText('Apply this cleanup'), null);
});

