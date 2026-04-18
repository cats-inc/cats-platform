import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { ConfirmDialog } from '../src/design/components/ConfirmDialog.tsx';

test('ConfirmDialog renders an auxiliary action when provided', () => {
  const markup = renderToStaticMarkup(
    <ConfirmDialog
      dialog={{
        options: {
          title: 'Disable Catlas?',
          message: 'This turns off Catlas help in Cats.',
          cancelLabel: 'Keep enabled',
          auxiliaryLabel: 'Dock now',
          confirmLabel: 'Disable',
          defaultAction: 'auxiliary',
        },
      }}
      onClose={() => {}}
    />,
  );

  assert.match(markup, /Keep enabled/u);
  assert.match(markup, /Dock now/u);
  assert.match(markup, /Disable/u);
  assert.match(
    markup,
    /confirmCancelButton[\s\S]*confirmAuxiliaryButton[\s\S]*confirmDestructiveButton/u,
  );
});
