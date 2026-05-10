import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
import { GoogleIdentityServicesButton } from '../src/app/renderer/auth/GoogleIdentityServicesButton.tsx';
import {
  GOOGLE_IDENTITY_SERVICES_SRC,
  resetGoogleIdentityServicesForTests,
  type GoogleCredentialResponse,
  type GoogleIdentityServicesApi,
} from '../src/app/renderer/auth/googleIdentityServices.ts';
import { PlatformLoginScreen } from '../src/app/renderer/auth/PlatformLoginScreen.tsx';

test('PlatformLoginScreen renders local admin login form', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="en">
      <PlatformLoginScreen onAuthenticated={() => {}} />
    </I18nProvider>,
  );

  assert.match(markup, /Sign in to Cats/u);
  assert.match(markup, /Use the local admin credentials created during setup/u);
  assert.match(markup, /Email/u);
  assert.match(markup, /Password/u);
  assert.match(markup, /autoComplete="username"/u);
  assert.match(markup, /autoComplete="current-password"/u);
});

test('GoogleIdentityServicesButton loads GIS, writes csrf cookie, and returns credentials', async (t) => {
  const restoreDom = installDom();
  resetGoogleIdentityServicesForTests();
  t.after(() => {
    cleanup();
    resetGoogleIdentityServicesForTests();
    restoreDom();
  });

  let callback: ((response: GoogleCredentialResponse) => void) | null = null;
  let received: { credential: string; csrfToken: string } | null = null;
  render(
    <GoogleIdentityServicesButton
      clientId="google-client-id"
      onCredential={(credential) => {
        received = credential;
      }}
      onError={(error) => {
        throw error;
      }}
    />,
  );

  const script = document.querySelector<HTMLScriptElement>(
    `script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`,
  );
  assert.ok(script);
  window.google = {
    accounts: {
      id: {
        initialize(config) {
          assert.equal(config.client_id, 'google-client-id');
          callback = config.callback;
        },
        renderButton(parent) {
          parent.textContent = 'Google rendered';
        },
      },
    },
  } satisfies GoogleIdentityServicesApi;
  script.onload?.(new window.Event('load'));

  await waitFor(() => {
    assert.equal(document.body.textContent?.includes('Google rendered'), true);
    assert.ok(callback);
  });
  callback?.({ credential: 'id-token' });

  assert.equal(received?.credential, 'id-token');
  assert.equal(typeof received?.csrfToken, 'string');
  assert.match(document.cookie, /g_csrf_token=/u);
});

test('PlatformLoginScreen shows Google origin fallback hint when provider is configured', async (t) => {
  const restoreDom = installDom();
  resetGoogleIdentityServicesForTests();
  const originalFetch = globalThis.fetch;
  t.after(() => {
    cleanup();
    resetGoogleIdentityServicesForTests();
    globalThis.fetch = originalFetch;
    restoreDom();
  });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(String(input), '/api/auth/status');
    return new Response(JSON.stringify({
      authenticated: false,
      principal: null,
      csrfToken: null,
      providers: { google: { enabled: true, clientId: 'google-client-id' } },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  render(
    <I18nProvider locale="en">
      <PlatformLoginScreen onAuthenticated={() => {}} />
    </I18nProvider>,
  );

  await waitFor(() => {
    assert.match(
      document.body.textContent ?? '',
      /Google sign-in only works on authorized Google JavaScript origins/u,
    );
  });
});

function installDom(): () => void {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/login',
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'attachEvent', {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'detachEvent', {
    configurable: true,
    value: () => {},
  });
  const previousDescriptors = new Map<PropertyKey, PropertyDescriptor | undefined>();
  const globals: Array<[PropertyKey, unknown]> = [
    ['window', dom.window],
    ['document', dom.window.document],
    ['HTMLElement', dom.window.HTMLElement],
    ['Node', dom.window.Node],
    ['Event', dom.window.Event],
    ['MouseEvent', dom.window.MouseEvent],
    ['MutationObserver', dom.window.MutationObserver],
    ['navigator', dom.window.navigator],
    ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
  ];
  for (const [key, value] of globals) {
    previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
  return () => {
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete (globalThis as Record<PropertyKey, unknown>)[key];
      }
    }
    dom.window.close();
  };
}
