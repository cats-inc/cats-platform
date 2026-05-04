import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { Route, Routes, StaticRouter } from 'react-router-dom';

import { EntityComingSoon } from '../src/app/renderer/entities/EntityComingSoon.tsx';
import { I18nProvider } from '../src/app/renderer/i18n/I18nProvider.tsx';

function renderEntityRoute(pathname: string): string {
  return renderToStaticMarkup(
    <I18nProvider locale="en">
      <StaticRouter location={pathname}>
        <Routes>
          <Route
            path="/clowders/:clowderId"
            element={<EntityComingSoon kind="clowder" />}
          />
          <Route
            path="/clowders/:clowderId/:tab"
            element={<EntityComingSoon kind="clowder" />}
          />
          <Route
            path="/catteries/:catteryId"
            element={<EntityComingSoon kind="cattery" />}
          />
          <Route
            path="/catteries/:catteryId/:tab"
            element={<EntityComingSoon kind="cattery" />}
          />
        </Routes>
      </StaticRouter>
    </I18nProvider>,
  );
}

test('canonical /clowders/:clowderId route renders the Clowder stub', () => {
  const markup = renderEntityRoute('/clowders/clw-1');

  assert.match(markup, />Clowder home</u);
  assert.match(markup, />Coming soon</u);
  assert.match(markup, />clw-1</u);
  assert.match(markup, />Back to Lobby</u);
});

test('/clowders/:clowderId/:tab deep-link still renders the Clowder stub', () => {
  const markup = renderEntityRoute('/clowders/clw-1/cats');

  assert.match(markup, />Clowder home</u);
  assert.match(markup, />clw-1</u);
});

test('canonical /catteries/:catteryId route renders the Cattery stub', () => {
  const markup = renderEntityRoute('/catteries/acme');

  assert.match(markup, />Cattery home</u);
  assert.match(markup, />Coming soon</u);
  assert.match(markup, />acme</u);
});

test('/catteries/:catteryId/:tab deep-link still renders the Cattery stub', () => {
  const markup = renderEntityRoute('/catteries/acme/members');

  assert.match(markup, />Cattery home</u);
  assert.match(markup, />acme</u);
});
