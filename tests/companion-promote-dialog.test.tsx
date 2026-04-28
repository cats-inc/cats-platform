import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server.browser';

import { CompanionPromoteDialog } from '../src/products/chat/renderer/components/companion/CompanionPromoteDialog.tsx';

test('CompanionPromoteDialog renders nothing when closed', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionPromoteDialog, {
      open: false,
      defaultTitle: 'Whatever',
      mediaCandidates: [],
      onClose: () => {},
      onSubmit: async () => {},
    }),
  );
  assert.equal(markup, '');
});

test('CompanionPromoteDialog renders the prefilled title input and Promote button when open', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionPromoteDialog, {
      open: true,
      defaultTitle: 'Two days at the dome',
      defaultBody: 'concert recap',
      defaultTags: ['#concert'],
      mediaCandidates: [
        {
          ref: { kind: 'source', id: 's-photo' },
          label: 'beach.jpg',
          defaultChecked: true,
        },
      ],
      onClose: () => {},
      onSubmit: async () => {},
    }),
  );
  assert.match(markup, /Promote to post/u);
  assert.match(markup, /value="Two days at the dome"/u);
  assert.match(markup, /concert recap/u);
  assert.match(markup, /#concert/u);
  assert.match(markup, /beach\.jpg/u);
  assert.match(markup, /role="dialog"/u);
  assert.match(markup, /aria-modal="true"/u);
});

test('CompanionPromoteDialog disables Promote when title is empty (server-rendered initial state)', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionPromoteDialog, {
      open: true,
      defaultTitle: '   ',
      mediaCandidates: [],
      onClose: () => {},
      onSubmit: async () => {},
    }),
  );
  // Promote button is disabled because trimmedTitle is empty.
  assert.match(markup, /type="submit"[^>]*disabled/u);
});

test('CompanionPromoteDialog renders the busy label and disables both buttons when busy', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionPromoteDialog, {
      open: true,
      defaultTitle: 'Has title',
      mediaCandidates: [],
      busy: true,
      onClose: () => {},
      onSubmit: async () => {},
    }),
  );
  assert.match(markup, /Promoting\.\.\./u);
  // Both Cancel and Promote disabled while a write is in flight.
  const disabledCount = (markup.match(/disabled/gu) ?? []).length;
  assert.ok(disabledCount >= 2, `expected at least two disabled attrs, got ${disabledCount}`);
});

test('CompanionPromoteDialog surfaces an errorMessage in the alert region', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionPromoteDialog, {
      open: true,
      defaultTitle: 'Has title',
      mediaCandidates: [],
      errorMessage: 'title_required',
      onClose: () => {},
      onSubmit: async () => {},
    }),
  );
  assert.match(markup, /role="alert"/u);
  assert.match(markup, /title_required/u);
});

test('CompanionPromoteDialog hides the media fieldset when no candidates are provided', () => {
  const markup = renderToStaticMarkup(
    React.createElement(CompanionPromoteDialog, {
      open: true,
      defaultTitle: 'Has title',
      mediaCandidates: [],
      onClose: () => {},
      onSubmit: async () => {},
    }),
  );
  assert.doesNotMatch(markup, /companionPromoteMediaFieldset/u);
});
