import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformSettingsRemoteAccess } from '../src/app/renderer/settings/PlatformSettingsRemoteAccess.tsx';

const initial = { provider: 'ngrok', state: 'off', configured: false, enabled: false,
  autoConnect: false, url: null, configuredOrigin: '', listenPort: 0, errorCode: null,
  publicVerification: { state: 'unknown', observedAt: null } };
const connected = { ...initial, state: 'connected', configured: true, enabled: true,
  url: 'https://fixture.example', configuredOrigin: 'https://fixture.example' };
function install(t: test.TestContext, post: (body: Record<string, unknown>) => Promise<unknown>,
  status: Omit<typeof initial, 'url' | 'errorCode'> & {
    url: string | null; errorCode: string | null; legacySources?: string[];
  } = initial) {
  resetTestDom();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'catsDesktopHost');
  // Deliberately partial native bridge: this page only uses requestApp.
  Object.defineProperty(globalThis, 'catsDesktopHost', { configurable: true, value: {
    requestApp: async (input: { method: string; body?: Record<string, unknown> }) => ({ status: 200,
      body: { remoteAccess: input.method === 'POST' ? await post(input.body!) : status } }),
  } });
  t.after(() => { cleanup(); resetTestDom();
    if (previous) Object.defineProperty(globalThis, 'catsDesktopHost', previous);
    else Reflect.deleteProperty(globalThis, 'catsDesktopHost'); });
  return render(<I18nProvider locale="en"><PlatformSettingsRemoteAccess /></I18nProvider>);
}

test('remote access saves explicit auto-connect intent, masks and clears the credential, and separates public readiness', async t => {
  const calls: Record<string, unknown>[] = [];
  const view = install(t, async body => { calls.push(body); return { ...connected, autoConnect: true }; });
  await waitFor(() => view.getByLabelText('ngrok authtoken'));
  const token = view.getByLabelText('ngrok authtoken') as HTMLInputElement;
  assert.equal(token.type, 'password');
  fireEvent.change(token, { target: { value: 'fixture-token-private-12345' } });
  fireEvent.click(view.getByLabelText('Connect automatically when Cats starts'));
  fireEvent.click(view.getByRole('button', { name: 'Save and connect' }));
  await waitFor(() => assert.equal(calls.length, 1));
  await waitFor(() => assert.equal(token.value, ''));
  assert.equal(calls[0].autoConnect, true); assert.equal(calls[0].listenPort, 0);
  assert.equal(calls[0].authtoken, 'fixture-token-private-12345');
  assert.ok(view.getByText('The connection is configured; access from an external device has not been verified.'));
});

test('disconnect remains available during connect and ignores a superseded late response', async t => {
  let complete!: (value: unknown) => void;
  const enabling = new Promise(resolve => { complete = resolve; });
  const calls: Record<string, unknown>[] = [];
  const view = install(t, async body => { calls.push(body); return body.enabled ? enabling : initial; });
  await waitFor(() => view.getByLabelText('ngrok authtoken'));
  fireEvent.change(view.getByLabelText('ngrok authtoken'), { target: { value: 'fixture-token-private-12345' } });
  fireEvent.click(view.getByRole('button', { name: 'Save and connect' }));
  await waitFor(() => assert.equal(calls.length, 1));
  const disconnect = view.getByRole('button', { name: 'Disconnect remote access' }) as HTMLButtonElement;
  assert.equal(disconnect.disabled, false); fireEvent.click(disconnect);
  await waitFor(() => assert.equal(calls.length, 2));
  assert.deepEqual(calls[1], { enabled: false });
  complete(connected);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Save and connect' })));
  assert.ok(view.getByText('Remote access is not connected.'));
  assert.equal(view.queryByText('The Cats endpoint is connected.'), null);
});

test('an incomplete cleanup can be retried even after remote access was disabled', async t => {
  const calls: Record<string, unknown>[] = [];
  const view = install(t, async body => { calls.push(body); return initial; }, { ...initial, state: 'cleanup_pending' });
  await waitFor(() => view.getByText('Connection cleanup is not confirmed. Retry disconnect before connecting again.'));
  const disconnect = view.getByRole('button', { name: 'Disconnect remote access' }) as HTMLButtonElement;
  assert.equal(disconnect.disabled, false); fireEvent.click(disconnect);
  await waitFor(() => assert.deepEqual(calls, [{ enabled: false }]));
});

test('saving automatic assignment does not pin the observed URL and announces a changed public URL', async t => {
  const calls: Record<string, unknown>[] = [];
  const view = install(t, async body => { calls.push(body); return {
    ...connected, configuredOrigin: '', url: 'https://new-assigned.example',
  }; }, { ...connected, configuredOrigin: '' });
  await waitFor(() => view.getByRole('button', { name: 'Save and reconnect' }));
  assert.equal((view.getByLabelText('Requested ngrok HTTPS address (blank for automatic assignment)') as HTMLInputElement).value, '');
  fireEvent.click(view.getByRole('button', { name: 'Save and reconnect' }));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0].publicOrigin, '');
  await waitFor(() => assert.ok(view.getByText('https://new-assigned.example')));
  assert.equal((view.getByLabelText('Requested ngrok HTTPS address (blank for automatic assignment)') as HTMLInputElement).value, '');
  await waitFor(() => assert.ok(view.getByText('The public address changed. Update your Mobile pairing and Bot connection.')));
});

test('a completed legacy migration does not prevent switching to automatic assignment before remount', async t => {
  const calls: Record<string, unknown>[] = [];
  const view = install(t, async body => { calls.push(body); return connected; },
    { ...initial, state: 'migration_required', legacySources: ['test.old'] });
  await waitFor(() => view.getByRole('option', { name: 'test.old' }));
  fireEvent.change(view.getByRole('option', { name: 'test.old' }).closest('select')!, { target: { value: 'test.old' } });
  fireEvent.click(view.getByRole('button', { name: 'Save and connect' }));
  await waitFor(() => view.getByRole('button', { name: 'Save and reconnect' }));
  assert.equal(calls[0].migrationSource, 'test.old');
  fireEvent.change(view.getByLabelText('Requested ngrok HTTPS address (blank for automatic assignment)'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: 'Save and reconnect' }));
  await waitFor(() => assert.equal(calls.length, 2));
  assert.equal(calls[1].publicOrigin, ''); assert.equal(calls[1].migrationSource, undefined);
});

test('a rejected requested domain does not announce a changed public URL', async t => {
  const view = install(t, async () => ({ ...connected, state: 'needs_action', url: null,
    configuredOrigin: 'https://denied.example', errorCode: 'ERR_NGROK_313' }), connected);
  await waitFor(() => view.getByRole('button', { name: 'Save and reconnect' }));
  fireEvent.change(view.getByLabelText('Requested ngrok HTTPS address (blank for automatic assignment)'),
    { target: { value: 'https://denied.example' } });
  fireEvent.click(view.getByRole('button', { name: 'Save and reconnect' }));
  await waitFor(() => view.getByText('Check your sign-in and connection settings, then reconnect.'));
  assert.equal(view.queryByText('The public address changed. Update your Mobile pairing and Bot connection.'), null);
});
