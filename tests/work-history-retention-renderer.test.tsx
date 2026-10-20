import './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { HistoryRetentionControls } from '../src/products/work/renderer/components/runs/HistoryRetentionControls.tsx';

test('retention UI requires explicit opt-in and age save, names protection and shows stale failure', async t => {
  const oldReact = Object.getOwnPropertyDescriptor(globalThis, 'React'), oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  t.after(() => { cleanup(); client.clear(); globalThis.fetch = oldFetch; if (oldReact) Object.defineProperty(globalThis, 'React', oldReact); else Reflect.deleteProperty(globalThis, 'React'); });
  const requests: unknown[] = [];
  globalThis.fetch = async (_url, options) => {
    if (options?.method === 'PATCH') { requests.push(JSON.parse(String(options.body))); return new Response(JSON.stringify({ error: { message: 'Policy changed. Reload.' } }), { status: 409 }); }
    return new Response(JSON.stringify({ revision: 7, policy: { enabled: false, days: 30, lastCleanupAt: null, lastError: null }, nextCleanupAt: null, batchLimit: 100, intervalMs: 3_600_000 }));
  };
  const ui = render(<QueryClientProvider client={client}><I18nProvider locale="en"><HistoryRetentionControls /></I18nProvider></QueryClientProvider>);
  await waitFor(() => assert.equal((ui.getByRole('checkbox', { hidden: true }) as HTMLInputElement).disabled, false));
  assert.equal((ui.getByRole('checkbox', { hidden: true }) as HTMLInputElement).checked, false); assert.equal(requests.length, 0);
  assert.match(ui.container.textContent!, /provider-native logs are kept/);
  fireEvent.click(ui.getByRole('checkbox', { hidden: true })); fireEvent.change(ui.getByRole('spinbutton', { hidden: true }), { target: { value: '14' } });
  fireEvent.click(ui.getByText('Save'));
  await waitFor(() => assert.match(ui.getByRole('alert', { hidden: true }).textContent!, /changed/));
  assert.deepEqual(requests, [{ enabled: true, days: 14, revision: 7 }]); assert.match(ui.getByRole('alert', { hidden: true }).textContent!, /changed/);
});
