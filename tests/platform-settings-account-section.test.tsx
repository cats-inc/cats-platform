// Must come first: React captures `canUseDOM` when its module body runs.
import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import {
  PlatformSettingsAccountSection,
} from '../src/app/renderer/settings/PlatformSettingsAccountSection.tsx';
import {
  GOOGLE_IDENTITY_SERVICES_SRC,
  resetGoogleIdentityServicesForTests,
  type GoogleCredentialResponse,
  type GoogleIdentityServicesApi,
} from '../src/app/renderer/auth/googleIdentityServices.ts';

interface StatusOverrides {
  googleEnabled?: boolean;
  googleLinked?: boolean;
  googleEmail?: string | null;
  localPasswordLinked?: boolean;
}

function statusPayload(overrides: StatusOverrides = {}) {
  const googleEnabled = overrides.googleEnabled ?? true;
  return {
    authenticated: true,
    principal: {
      accountId: 'account-1',
      displayName: 'Owner',
      email: 'owner@example.test',
      roles: ['owner', 'admin'],
      coreActorId: 'actor-owner',
      sessionId: 'session-1',
    },
    csrfToken: 'cats-csrf-token',
    providers: {
      google: {
        enabled: googleEnabled,
        clientId: googleEnabled ? 'google-client-id' : null,
      },
    },
    loginMethods: {
      localPassword: { linked: overrides.localPasswordLinked ?? true },
      google: {
        linked: overrides.googleLinked ?? false,
        email: overrides.googleEmail ?? null,
      },
    },
  };
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function installFetch(
  handlers: Record<string, (init?: RequestInit) => { status?: number; body: unknown }>,
  calls: FetchCall[],
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push({ url, init });
    const handler = handlers[url];
    if (!handler) {
      throw new Error(`unexpected fetch to ${url}`);
    }
    const result = handler(init);
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('account section renders unavailable Google state without a link action', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );

  // Before the status resolves the section still names both methods and never
  // claims Google is linked.
  assert.match(markup, /Local password/u);
  assert.match(markup, /Google/u);
  assert.equal(markup.includes('Link Google account'), false);
});

test('account section shows not-linked Google state and offers linking', async (t) => {
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({ body: statusPayload({ googleLinked: false }) }),
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );

  await waitFor(() => {
    assert.ok(view.getByText('Not linked'));
  });
  assert.ok(view.getByText('Set up'));
  assert.ok(view.getByRole('button', { name: 'Link Google account' }));
  assert.equal(view.queryByRole('button', { name: 'Unlink Google account' }), null);
});

test('account section shows the linked Google email and offers unlinking', async (t) => {
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({
      body: statusPayload({ googleLinked: true, googleEmail: 'owner@example.test' }),
    }),
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );

  await waitFor(() => {
    assert.ok(view.getByText('Linked · owner@example.test'));
  });
  assert.ok(view.getByRole('button', { name: 'Unlink Google account' }));
  assert.equal(view.queryByRole('button', { name: 'Link Google account' }), null);
});

test('account section explains an unauthorized origin instead of offering GIS', async (t) => {
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({ body: statusPayload({ googleEnabled: false }) }),
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );

  await waitFor(() => {
    assert.ok(view.getByText('Unavailable'));
  });
  // Local status stays visible and no link entry point is offered.
  assert.ok(view.getByText('Set up'));
  assert.match(
    view.container.textContent ?? '',
    /Google sign-in is not configured for this address/u,
  );
  assert.equal(view.queryByRole('button', { name: 'Link Google account' }), null);
});

test('account section requires the password step-up before initializing GIS', async (t) => {
  resetGoogleIdentityServicesForTests();
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({ body: statusPayload({ googleLinked: false }) }),
    '/api/auth/reauth': () => ({
      body: {
        purpose: 'link_google',
        actionToken: 'granted-action-token',
        expiresAt: '2026-09-02T00:05:00.000Z',
      },
    }),
  }, calls);
  t.after(() => {
    cleanup();
    resetGoogleIdentityServicesForTests();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );
  await waitFor(() => view.getByRole('button', { name: 'Link Google account' }));

  // No GIS script is requested before the password modal is satisfied.
  assert.equal(
    document.querySelector(`script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`),
    null,
  );

  fireEvent.click(view.getByRole('button', { name: 'Link Google account' }));
  await waitFor(() => view.getByRole('dialog'));
  assert.equal(
    document.querySelector(`script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`),
    null,
    'GIS must not load until the server issues the action grant',
  );

  const password = view.getByLabelText('Password');
  fireEvent.change(password, { target: { value: 'correct horse battery staple' } });
  fireEvent.click(view.getByRole('button', { name: 'Confirm' }));

  await waitFor(() => {
    assert.ok(document.querySelector(`script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`));
  });
  const reauthCall = calls.find((call) => call.url === '/api/auth/reauth');
  assert.ok(reauthCall);
  assert.deepEqual(JSON.parse(String(reauthCall?.init?.body)), {
    password: 'correct horse battery staple',
    purpose: 'link_google',
  });
});

test('account section links with the action grant header and refreshes status', async (t) => {
  resetGoogleIdentityServicesForTests();
  const calls: FetchCall[] = [];
  let linked = false;
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({
      body: statusPayload({
        googleLinked: linked,
        googleEmail: linked ? 'owner@example.test' : null,
      }),
    }),
    '/api/auth/reauth': () => ({
      body: {
        purpose: 'link_google',
        actionToken: 'granted-action-token',
        expiresAt: '2026-09-02T00:05:00.000Z',
      },
    }),
    '/api/auth/google/link': () => {
      linked = true;
      return {
        body: statusPayload({ googleLinked: true, googleEmail: 'owner@example.test' }),
      };
    },
  }, calls);
  t.after(() => {
    cleanup();
    resetGoogleIdentityServicesForTests();
    Reflect.deleteProperty(window, 'google');
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );
  await waitFor(() => view.getByRole('button', { name: 'Link Google account' }));
  fireEvent.click(view.getByRole('button', { name: 'Link Google account' }));
  await waitFor(() => view.getByRole('dialog'));
  fireEvent.change(view.getByLabelText('Password'), { target: { value: 'a-password' } });
  fireEvent.click(view.getByRole('button', { name: 'Confirm' }));

  const script = await waitFor(() => {
    const found = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`,
    );
    assert.ok(found);
    return found;
  });

  let credentialCallback: ((response: GoogleCredentialResponse) => void) | null = null;
  window.google = {
    accounts: {
      id: {
        initialize(config) {
          credentialCallback = config.callback;
        },
        renderButton(parent) {
          parent.textContent = 'Google rendered';
        },
      },
    },
  } satisfies GoogleIdentityServicesApi;
  script.onload?.(new window.Event('load'));

  await waitFor(() => assert.ok(credentialCallback));
  (credentialCallback as unknown as (response: GoogleCredentialResponse) => void)({
    credential: 'google-id-token',
  });

  await waitFor(() => {
    assert.ok(view.getByText('Linked · owner@example.test'));
  });

  const linkCall = calls.find((call) => call.url === '/api/auth/google/link');
  assert.ok(linkCall);
  const headers = linkCall?.init?.headers as Record<string, string>;
  assert.equal(headers['x-cats-auth-action'], 'granted-action-token');
  assert.equal(headers['x-cats-csrf-token'], 'cats-csrf-token');
  // Requirement 21: the grant never appears in the request URL.
  assert.equal(linkCall?.url.includes('granted-action-token'), false);
});

test('account section discards the action grant when the dialog is cancelled', async (t) => {
  resetGoogleIdentityServicesForTests();
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({ body: statusPayload({ googleLinked: false }) }),
    '/api/auth/reauth': () => ({
      body: {
        purpose: 'link_google',
        actionToken: 'granted-action-token',
        expiresAt: '2026-09-02T00:05:00.000Z',
      },
    }),
  }, calls);
  t.after(() => {
    cleanup();
    resetGoogleIdentityServicesForTests();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );
  await waitFor(() => view.getByRole('button', { name: 'Link Google account' }));
  fireEvent.click(view.getByRole('button', { name: 'Link Google account' }));
  await waitFor(() => view.getByRole('dialog'));
  fireEvent.change(view.getByLabelText('Password'), { target: { value: 'a-password' } });
  fireEvent.click(view.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => {
    assert.ok(view.getByText('Continue with Google'));
  });

  fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

  await waitFor(() => {
    assert.ok(view.getByRole('button', { name: 'Link Google account' }));
  });
  // The grant is memory-only and never persisted for a later attempt.
  assert.equal(window.localStorage.getItem('granted-action-token'), null);
  assert.equal(
    JSON.stringify(window.localStorage).includes('granted-action-token'),
    false,
  );
  assert.equal(document.cookie.includes('granted-action-token'), false);
});

test('account section reports step-up failures through toast only', async (t) => {
  const calls: FetchCall[] = [];
  const toasts: string[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({ body: statusPayload({ googleLinked: false }) }),
    '/api/auth/reauth': () => ({
      status: 401,
      body: { error: { code: 'E_UNAUTHENTICATED', message: 'Invalid credentials.' } },
    }),
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection
        showToast={(message) => {
          toasts.push(message);
        }}
      />
    </I18nProvider>,
  );
  await waitFor(() => view.getByRole('button', { name: 'Link Google account' }));
  fireEvent.click(view.getByRole('button', { name: 'Link Google account' }));
  await waitFor(() => view.getByRole('dialog'));
  fireEvent.change(view.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.click(view.getByRole('button', { name: 'Confirm' }));

  await waitFor(() => {
    assert.equal(toasts.length, 1);
  });
  assert.equal(toasts[0], 'That password is incorrect.');
  // Settings must not grow inline feedback text for the failure.
  assert.equal(
    (view.container.textContent ?? '').includes('That password is incorrect.'),
    false,
  );
});

test('account section deduplicates step-up submissions', async (t) => {
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({ body: statusPayload({ googleLinked: false }) }),
    '/api/auth/reauth': () => ({
      body: {
        purpose: 'link_google',
        actionToken: 'granted-action-token',
        expiresAt: '2026-09-02T00:05:00.000Z',
      },
    }),
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );
  await waitFor(() => view.getByRole('button', { name: 'Link Google account' }));
  fireEvent.click(view.getByRole('button', { name: 'Link Google account' }));
  await waitFor(() => view.getByRole('dialog'));
  fireEvent.change(view.getByLabelText('Password'), { target: { value: 'a-password' } });

  const confirm = view.getByRole('button', { name: 'Confirm' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  fireEvent.click(confirm);

  await waitFor(() => {
    assert.equal(calls.some((call) => call.url === '/api/auth/reauth'), true);
  });
  assert.equal(calls.filter((call) => call.url === '/api/auth/reauth').length, 1);
});

test('account section unlinks after a fresh step-up and warns about other devices', async (t) => {
  const calls: FetchCall[] = [];
  let linked = true;
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({
      body: statusPayload({
        googleLinked: linked,
        googleEmail: linked ? 'owner@example.test' : null,
      }),
    }),
    '/api/auth/reauth': () => ({
      body: {
        purpose: 'unlink_google',
        actionToken: 'unlink-action-token',
        expiresAt: '2026-09-02T00:05:00.000Z',
      },
    }),
    '/api/auth/google/unlink': () => {
      linked = false;
      return { body: statusPayload({ googleLinked: false }) };
    },
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );
  await waitFor(() => view.getByRole('button', { name: 'Unlink Google account' }));
  fireEvent.click(view.getByRole('button', { name: 'Unlink Google account' }));
  await waitFor(() => view.getByRole('dialog'));

  assert.match(
    view.getByRole('dialog').textContent ?? '',
    /signs out your other browsers and mobile devices/u,
  );

  fireEvent.change(view.getByLabelText('Password'), { target: { value: 'a-password' } });
  fireEvent.click(view.getByRole('button', { name: 'Confirm' }));

  await waitFor(() => {
    assert.ok(view.getByText('Not linked'));
  });
  const unlinkCall = calls.find((call) => call.url === '/api/auth/google/unlink');
  assert.ok(unlinkCall);
  assert.equal(
    (unlinkCall?.init?.headers as Record<string, string>)['x-cats-auth-action'],
    'unlink-action-token',
  );
  const reauthCall = calls.find((call) => call.url === '/api/auth/reauth');
  assert.deepEqual(JSON.parse(String(reauthCall?.init?.body)).purpose, 'unlink_google');
});

test('account section keeps unlinking unavailable without a local password fallback', async (t) => {
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({
      body: statusPayload({
        googleLinked: true,
        googleEmail: 'owner@example.test',
        localPasswordLinked: false,
      }),
    }),
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="en">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );

  await waitFor(() => view.getByRole('button', { name: 'Unlink Google account' }));
  assert.equal(
    view.getByRole('button', { name: 'Unlink Google account' }).hasAttribute('disabled'),
    true,
  );
  assert.ok(view.getByText('Not set up'));
});

test('account section renders Traditional Chinese copy', async (t) => {
  const calls: FetchCall[] = [];
  const restoreFetch = installFetch({
    '/api/auth/status': () => ({
      body: statusPayload({ googleLinked: true, googleEmail: 'owner@example.test' }),
    }),
  }, calls);
  t.after(() => {
    cleanup();
    restoreFetch();
    resetTestDom();
  });

  const view = render(
    <I18nProvider locale="zh-TW">
      <PlatformSettingsAccountSection showToast={() => {}} />
    </I18nProvider>,
  );

  await waitFor(() => {
    assert.ok(view.getByText('已綁定 · owner@example.test'));
  });
  assert.ok(view.getByText('本機密碼'));
  assert.ok(view.getByRole('button', { name: '解除綁定 Google 帳號' }));
});
