import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { I18nProvider } from '../src/app/renderer/i18n/index.ts';
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

test('ConfirmDialog localizes default fallback actions', () => {
  const markup = renderToStaticMarkup(
    <I18nProvider locale="zh-TW">
      <ConfirmDialog
        dialog={{
          options: {
            title: '刪除？',
            message: '這個動作不能復原。',
          },
        }}
        onClose={() => {}}
      />
    </I18nProvider>,
  );

  assert.match(markup, /取消/u);
  assert.match(markup, /刪除/u);
  assert.doesNotMatch(markup, />Cancel</u);
  assert.doesNotMatch(markup, />Delete</u);
});
