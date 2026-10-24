import { resetTestDom } from './helpers/installDomBeforeReact.ts';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { PlatformSetupWizard } from '../src/app/renderer/setup/PlatformSetupWizard.tsx';
import { PlatformLoginScreen } from '../src/app/renderer/auth/PlatformLoginScreen.tsx';
import { PlatformSettingsAccountSection } from '../src/app/renderer/settings/PlatformSettingsAccountSection.tsx';
import type { DesktopGoogleAuthBridge, DesktopGoogleAuthStartInput } from '../src/shared/nativeGoogleAuth.ts';
import type { PlatformHostEnvelope } from '../src/shared/platform-contract.ts';

function fixture(t: TestContext, available = true) {
  resetTestDom();
  const originalFetch = globalThis.fetch;
  const previousBridge = Object.getOwnPropertyDescriptor(globalThis, 'catsDesktopHost');
  const starts: DesktopGoogleAuthStartInput[] = [];
  const submits: Parameters<DesktopGoogleAuthBridge['submit']>[0][] = [];
  const cancels: Array<string | undefined> = [];
  const requests: string[] = [];
  const toasts: string[] = [];
  let localPassword = false, googleLinked = true;
  const status = () => ({
    authenticated: true, csrfToken: 'current-csrf',
    principal: { accountId: 'account', sessionId: 'session', email: 'owner@example.test',
      displayName: 'Owner', roles: ['owner', 'admin'], coreActorId: 'actor-owner' },
    providers: { google: { enabled: false, clientId: null } },
    loginMethods: { localPassword: { linked: localPassword },
      google: { linked: googleLinked, email: googleLinked ? 'owner@example.test' : null } },
  });
  const snapshot = { transactionId: 'native-transaction', phase: 'verified' as const,
    expiresAt: new Date(Date.now() + 300_000).toISOString() };
  const bridge: DesktopGoogleAuthBridge = {
    availability: async () => ({ available, reason: available ? 'ready' : 'not_configured' }),
    start: async (input) => { starts.push(input); if (input.purpose === 'link_google') googleLinked = true; return snapshot; },
    status: async () => snapshot,
    cancel: async (id) => { cancels.push(id); return null; },
    submit: async (input) => { submits.push(input); localPassword = true;
      return { status: 200, body: input.setup ? envelope() : status() }; },
  };
  Object.defineProperty(globalThis, 'catsDesktopHost', { configurable: true, value: { googleAuth: bridge } });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input); requests.push(url);
    if (url === '/api/auth/status') return Response.json(status());
    if (url === '/api/auth/reauth') return Response.json({ actionToken: 'password-step-up' });
    if (url === '/api/app-shell') return Response.json(envelope());
    return Response.json({});
  }) as typeof fetch;
  t.after(() => {
    cleanup(); globalThis.fetch = originalFetch;
    if (previousBridge) Object.defineProperty(globalThis, 'catsDesktopHost', previousBridge);
    else Reflect.deleteProperty(globalThis, 'catsDesktopHost');
    resetTestDom();
  });
  return { bridge, starts, submits, cancels, requests, toasts,
    localAccount() { localPassword = true; googleLinked = false; } };
}

test('native onboarding submits a provisional transaction without password or renderer Google credentials', async (t) => {
  const f = fixture(t); let completed = false;
  const view = render(<I18nProvider locale="en"><PlatformSetupWizard envelope={envelope()}
    onComplete={() => { completed = true; }} /></I18nProvider>);
  fireEvent.change(view.getByLabelText('Your name'), { target: { value: 'Owner' } });
  fireEvent.click(view.getByRole('button', { name: /^Google$/u }));
  const google = view.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement;
  await waitFor(() => assert.equal(google.disabled, false));
  fireEvent.click(google);
  await waitFor(() => assert.match(view.container.textContent ?? '', /Google verified/u));
  assert.deepEqual(f.starts, [{ purpose: 'bootstrap', attemptId: 'native-setup' }]);
  assert.equal(view.queryByLabelText('Admin password'), null);
  fireEvent.click(view.container.querySelector('.setupPrimaryButton')!);
  fireEvent.click(view.container.querySelector('.setupPrimaryButton')!);
  await waitFor(() => assert.equal(completed, true));
  assert.equal(f.submits[0]?.transactionId, 'native-transaction');
  assert.equal(f.submits[0]?.setup?.adminMethod, 'google');
  assert.equal(f.submits[0]?.setup?.adminPassword, undefined);
  assert.equal(f.requests.includes('/api/platform/setup/complete'), false);
});

test('unconfigured native onboarding explains availability and keeps email/password usable', async (t) => {
  fixture(t, false);
  const view = render(<I18nProvider locale="en"><PlatformSetupWizard envelope={envelope()} onComplete={() => {}} /></I18nProvider>);
  fireEvent.click(view.getByRole('button', { name: /^Google$/u }));
  assert.match(view.container.textContent ?? '', /not configured for this Cats distribution/u);
  assert.equal((view.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Email and password' }));
  fireEvent.change(view.getByLabelText('Your name'), { target: { value: 'Owner' } });
  fireEvent.change(view.getByLabelText('Admin password'), { target: { value: 'fixture-password' } });
  fireEvent.change(view.getByLabelText('Admin login email'), { target: { value: 'old-handle' } });
  assert.equal((view.container.querySelector('.setupPrimaryButton') as HTMLButtonElement).disabled, true);
  fireEvent.change(view.getByLabelText('Admin login email'), { target: { value: 'owner@example.test' } });
  assert.equal((view.container.querySelector('.setupPrimaryButton') as HTMLButtonElement).disabled, false);
});

test('native login refreshes Cats session status and enters the ordinary app shell without GIS', async (t) => {
  const f = fixture(t); let entered = false;
  const view = render(<I18nProvider locale="en"><PlatformLoginScreen onAuthenticated={() => { entered = true; }} /></I18nProvider>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Continue with Google' })));
  fireEvent.click(view.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => assert.equal(entered, true));
  assert.deepEqual(f.starts, [{ purpose: 'login' }]);
  assert.ok(f.requests.includes('/api/app-shell'));
  assert.equal(document.querySelector('script[src*="accounts.google.com"]'), null);
});

test('Google-only account adds its first password through fresh native verification and Toast feedback', async (t) => {
  const f = fixture(t);
  const view = render(<I18nProvider locale="en"><PlatformSettingsAccountSection showToast={(text) => f.toasts.push(text)} /></I18nProvider>);
  await waitFor(() => assert.equal((view.getByRole('button', { name: 'Set password' }) as HTMLButtonElement).disabled, false));
  assert.equal((view.getByRole('button', { name: 'Unlink Google account' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Set password' }));
  await waitFor(() => assert.ok(view.getByLabelText('Confirm new password')));
  assert.deepEqual(f.starts, [{ purpose: 'set_password', csrfToken: 'current-csrf' }]);
  assert.equal(view.queryByRole('textbox'), null);
  fireEvent.change(view.getByLabelText('Password'), { target: { value: 'new-password' } });
  fireEvent.change(view.getByLabelText('Confirm new password'), { target: { value: 'different-password' } });
  const save = () => view.getAllByRole('button', { name: 'Set password' }).at(-1)!;
  fireEvent.click(save());
  assert.equal(f.submits.length, 0);
  assert.equal(f.toasts.length, 1);
  fireEvent.change(view.getByLabelText('Confirm new password'), { target: { value: 'new-password' } });
  fireEvent.click(save());
  await waitFor(() => assert.equal(f.submits.length, 1));
  assert.deepEqual(f.submits[0], { transactionId: 'native-transaction', password: 'new-password', csrfToken: 'current-csrf' });
  await waitFor(() => assert.ok(f.toasts.some((toast) => /Password added/u.test(toast))));
  assert.equal(view.queryByLabelText('Confirm new password'), null);
});

test('password account still requires password step-up before native Google linking', async (t) => {
  const f = fixture(t); f.localAccount();
  const view = render(<I18nProvider locale="en"><PlatformSettingsAccountSection showToast={(text) => f.toasts.push(text)} /></I18nProvider>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Link Google account' })));
  fireEvent.click(view.getByRole('button', { name: 'Link Google account' }));
  assert.equal(f.starts.length, 0);
  const dialog = view.getByRole('dialog');
  fireEvent.change(dialog.querySelector('input')!, { target: { value: 'current-password' } });
  fireEvent.submit(dialog.querySelector('form')!);
  await waitFor(() => assert.equal(f.starts.length, 1));
  assert.deepEqual(f.starts[0], { purpose: 'link_google', actionToken: 'password-step-up', csrfToken: 'current-csrf' });
  await waitFor(() => assert.ok(view.getByText('Linked · owner@example.test')));
  assert.equal(document.querySelector('script[src*="accounts.google.com"]'), null);
});

test('unmount cancels a native start even before a transaction ID reaches the renderer', async (t) => {
  const f = fixture(t);
  let release!: (value: Awaited<ReturnType<DesktopGoogleAuthBridge['start']>>) => void;
  f.bridge.start = async () => new Promise((resolve) => { release = resolve; });
  const view = render(<I18nProvider locale="en"><PlatformLoginScreen onAuthenticated={() => assert.fail('cancelled login entered shell')} /></I18nProvider>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Continue with Google' })));
  fireEvent.click(view.getByRole('button', { name: 'Continue with Google' }));
  view.unmount();
  await waitFor(() => assert.ok(f.cancels.includes(undefined)));
  release({ transactionId: 'late', phase: 'verified', expiresAt: new Date().toISOString() });
  await waitFor(() => assert.ok(f.cancels.includes('late')));
});

test('native link refreshes server-owned methods after a committed link loses its reply', async (t) => {
  const f = fixture(t); f.localAccount();
  const original = f.bridge.start;
  f.bridge.start = async (input) => { await original(input); throw new Error('lost response'); };
  const view = render(<I18nProvider locale="en"><PlatformSettingsAccountSection showToast={(text) => f.toasts.push(text)} /></I18nProvider>);
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Link Google account' })));
  fireEvent.click(view.getByRole('button', { name: 'Link Google account' }));
  const dialog = view.getByRole('dialog');
  fireEvent.change(dialog.querySelector('input')!, { target: { value: 'current-password' } });
  fireEvent.submit(dialog.querySelector('form')!);
  await waitFor(() => assert.ok(view.getByText('Linked · owner@example.test')));
  assert.equal(f.toasts.length, 1);
});

function envelope(): PlatformHostEnvelope {
  // Deliberately minimal: these journeys read only setup identity fields.
  return {
    bootstrapAttemptId: 'native-setup', setupCompleteAt: null,
  } as PlatformHostEnvelope;
}
