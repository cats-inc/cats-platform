import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
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
